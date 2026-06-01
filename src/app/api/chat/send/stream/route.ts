import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { aiConversation, aiMessage } from "@/db/schema";
import { generateAssistantReply } from "@/lib/server/ai";
import { markMessageRead, markMessageSent, setPresence } from "@/lib/server/chat-realtime";
import { getAuthenticatedUser } from "@/lib/server/session";

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

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 24) {
    chunks.push(text.slice(index, index + 24));
  }
  return chunks;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed || abortSignal.aborted) return;
        controller.enqueue(encoder.encode(encodeEvent(event, data)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const abort = () => close();
      abortSignal.addEventListener("abort", abort, { once: true });

      try {
        const user = await getAuthenticatedUser();
        if (!user) {
          send("error", { error: "Unauthorized" });
          close();
          return;
        }

        const body = await request.json().catch(() => null);
        const parsed = sendMessageSchema.safeParse(body);
        if (!parsed.success) {
          send("error", { error: "Invalid chat payload" });
          close();
          return;
        }

        let conversationId = parsed.data.conversationId;

        if (conversationId) {
          const [existing] = await db
            .select({ id: aiConversation.id })
            .from(aiConversation)
            .where(and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, user.id)))
            .limit(1);
          if (!existing) {
            send("error", { error: "Conversation not found" });
            close();
            return;
          }
        } else {
          const [created] = await db
            .insert(aiConversation)
            .values({
              id: crypto.randomUUID(),
              userId: user.id,
              title: buildConversationTitle(parsed.data.message),
            })
            .returning({ id: aiConversation.id, title: aiConversation.title, updatedAt: aiConversation.updatedAt });
          conversationId = created.id;
          send("conversation", { conversation: created });
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
        const userReceipt = await markMessageSent(userMessage.id, user.id);
        send("user-message", { userMessage, receipt: userReceipt });

        const aiResult = await generateAssistantReply({
          userId: user.id,
          userMessage: parsed.data.message,
          conversationId,
          assistant: parsed.data.assistant ?? "auto",
          imageDataUrl: parsed.data.imageDataUrl,
        });

        const assistantId = crypto.randomUUID();
        send("assistant-start", {
          assistantMessage: {
            id: assistantId,
            conversationId,
            userId: user.id,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
          },
        });

        for (const chunk of chunkText(aiResult.reply)) {
          if (abortSignal.aborted) return;
          send("assistant-delta", { id: assistantId, delta: chunk });
          await new Promise((resolve) => setTimeout(resolve, 12));
        }

        const [assistantMessage] = await db
          .insert(aiMessage)
          .values({
            id: assistantId,
            conversationId,
            userId: user.id,
            role: "assistant",
            content: aiResult.reply,
          })
          .returning();
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

        send("assistant-done", { assistantMessage, receipt: assistantReceipt });
        send("done", {
          conversationId,
          memorySummary: aiResult.memorySummary,
          metadata: aiResult.metadata ?? null,
        });
        close();
      } catch (error) {
        if (abortSignal.aborted) return;
        const message = error instanceof Error ? error.message : "Unexpected server error";
        send("error", { error: `Chat backend failed: ${message}` });
        close();
      } finally {
        abortSignal.removeEventListener("abort", abort);
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
