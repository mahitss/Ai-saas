import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { promptTemplate } from "@/db/schema";
import { getErrorMessage, isMissingTableError } from "@/lib/server/db-resilience";
import { addFallbackPromptTemplate, listFallbackPromptTemplates } from "@/lib/server/fallback-persistence";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const templateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(60).default("general"),
  prompt: z.string().trim().min(10).max(5000),
  isPublic: z.boolean().default(true),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const templates = await db
      .select()
      .from(promptTemplate)
      .where(eq(promptTemplate.isPublic, true))
      .orderBy(desc(promptTemplate.uses), desc(promptTemplate.updatedAt))
      .limit(100);

    return NextResponse.json({ templates, storage: "database" });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
    return NextResponse.json({ templates: listFallbackPromptTemplates(), storage: "fallback_memory" });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid prompt template payload" }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(promptTemplate)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        title: parsed.data.title,
        category: parsed.data.category,
        prompt: parsed.data.prompt,
        isPublic: parsed.data.isPublic,
      })
      .returning();

    if (!created) {
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }
    return NextResponse.json({ template: created, storage: "database" }, { status: 201 });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    const now = new Date().toISOString();
    const created = addFallbackPromptTemplate({
      id: crypto.randomUUID(),
      userId: user.id,
      title: parsed.data.title,
      category: parsed.data.category,
      prompt: parsed.data.prompt,
      uses: 0,
      rewardCredits: 0,
      isPublic: parsed.data.isPublic,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ template: created, storage: "fallback_memory" }, { status: 201 });
  }
}
