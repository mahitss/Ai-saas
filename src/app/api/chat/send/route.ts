import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { aiConversation, aiMessage } from "@/db/schema";
import { generateAssistantReply } from "@/lib/server/ai";
import { addAuditLog, addNotification, markMessageRead, markMessageSent, setPresence } from "@/lib/server/chat-realtime";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const sendMessageSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(4000),
  assistant: z.enum(["auto", "chatgpt", "gemini"]).optional(),
  imageDataUrl: z.string().max(3_000_000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        mimeType: z.string().trim().min(1).max(120),
        size: z.number().int().min(1).max(50_000_000),
        url: z.string().trim().max(5000).optional(),
      }),
    )
    .optional(),
});

function buildConversationTitle(message: string) {
  return message.slice(0, 60).trim() || "New Chat";
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const body = await request.json().catch(() => null);
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chat payload" }, { status: 400 });
    }

    let conversationId = parsed.data.conversationId;

    if (conversationId) {
      const [existing] = await db
        .select({ id: aiConversation.id })
        .from(aiConversation)
        .where(and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, user.id)))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      const [created] = await db
        .insert(aiConversation)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          title: buildConversationTitle(parsed.data.message),
        })
        .returning({ id: aiConversation.id });
      conversationId = created.id;
    }

    const [userMessage] = await db
      .insert(aiMessage)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        userId: user.id,
        role: "user",
        content: [
          parsed.data.message,
          parsed.data.attachments?.length
            ? `Attachments:\n${parsed.data.attachments
                .map((item) => `- ${item.name} (${item.mimeType}) ${item.url ? item.url : ""}`.trim())
                .join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      })
      .returning();
    if (!userMessage) {
      return NextResponse.json({ error: "Failed to persist user message" }, { status: 500 });
    }
    const userReceipt = await markMessageSent(userMessage.id, user.id);

    const aiResult = await generateAssistantReply({
      userId: user.id,
      userMessage: parsed.data.message,
      conversationId,
      assistant: parsed.data.assistant ?? "auto",
      imageDataUrl: parsed.data.imageDataUrl,
    });

    const [assistantMessage] = await db
      .insert(aiMessage)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        userId: user.id,
        role: "assistant",
        content: aiResult.reply,
      })
      .returning();
    if (!assistantMessage) {
      return NextResponse.json({ error: "Failed to persist assistant message" }, { status: 500 });
    }
    const assistantReceipt = await markMessageSent(assistantMessage.id, user.id);
    await markMessageRead(userMessage.id, user.id);
    await markMessageRead(assistantMessage.id, user.id);
    await setPresence(user.id, "online", conversationId, false);

    await db
      .update(aiConversation)
      .set({
        title: buildConversationTitle(parsed.data.message),
        updatedAt: new Date(),
      })
      .where(and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, user.id)));

    const firstThreeInputs = await db
      .select({ content: aiMessage.content })
      .from(aiMessage)
      .where(and(eq(aiMessage.userId, user.id), eq(aiMessage.role, "user")))
      .orderBy(asc(aiMessage.createdAt))
      .limit(3);

    let onboardingAha: string | null = null;
    if (firstThreeInputs.length === 3) {
      const joined = firstThreeInputs.map((row) => row.content).join(" ").toLowerCase();
      const focus = /budget|profit|cost|revenue/.test(joined)
        ? "finance planning"
        : /code|build|api|bug|deploy/.test(joined)
          ? "developer workflows"
          : "productivity automation";
      onboardingAha = `Value milestone reached: based on your first 3 prompts, your highest value path is ${focus}. Use a single file, MCP sync, or Workflow Builder to generate the next win.`;
    }

    const mentions = /@[\w.-]+/.test(parsed.data.message);
    const deadline = /\b(deadline|due|tomorrow|today|urgent)\b/i.test(parsed.data.message);
    if (mentions || deadline) {
      await addNotification(user.id, {
        kind: mentions ? "mention" : "deadline",
        title: mentions ? "Mention detected" : "Deadline reminder",
        body: mentions
          ? "A message mention was detected. The notification center is ready to notify collaborators."
          : "A deadline-sensitive message was detected. Review the workspace actions and follow-ups.",
        conversationId,
        messageId: userMessage.id,
      });
    }
    if (/ignore previous|system prompt|jailbreak|bypass|override rules/i.test(parsed.data.message)) {
      await addNotification(user.id, {
        kind: "security",
        title: "Prompt injection warning",
        body: "The latest message matched a high-risk safety pattern and was flagged for review.",
        conversationId,
        messageId: userMessage.id,
      });
      await addAuditLog(user.id, {
        action: "flag_message",
        targetType: "message",
        targetId: userMessage.id,
        detail: "Safety gateway detected a possible prompt injection attempt.",
      });
    }

    return NextResponse.json({
      conversationId,
      userMessage,
      assistantMessage,
      receipts: {
        user: userReceipt,
        assistant: assistantReceipt,
      },
      memorySummary: aiResult.memorySummary,
      metadata: aiResult.metadata ?? null,
      onboardingAha,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: `Chat backend failed: ${message}` }, { status: 500 });
  }
}
