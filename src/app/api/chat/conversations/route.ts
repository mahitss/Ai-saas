import { and, desc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { aiConversation, aiMemory } from "@/db/schema";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30, 50);
  const cursorDate = cursor ? new Date(cursor) : null;

  const conversations = await db
    .select()
    .from(aiConversation)
    .where(
      cursorDate && !Number.isNaN(cursorDate.getTime())
        ? and(eq(aiConversation.userId, user.id), lt(aiConversation.updatedAt, cursorDate))
        : eq(aiConversation.userId, user.id),
    )
    .orderBy(desc(aiConversation.updatedAt))
    .limit(limit + 1);

  const [memory] = await db
    .select()
    .from(aiMemory)
    .where(eq(aiMemory.userId, user.id))
    .limit(1);

  const visibleConversations = conversations.slice(0, limit);

  return NextResponse.json({
    conversations: visibleConversations,
    nextCursor:
      conversations.length > limit
        ? visibleConversations.at(-1)?.updatedAt?.toISOString()
        : null,
    memory: memory?.summary ?? "",
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation payload" }, { status: 400 });
  }

  const [conversation] = await db
    .insert(aiConversation)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      title: parsed.data.title ?? "New Chat",
    })
    .returning();

  if (!conversation) {
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
