import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { xaiLog } from "@/db/schema";
import { getErrorMessage, isMissingTableError } from "@/lib/server/db-resilience";
import { addFallbackXaiLog, getFallbackXaiLogs } from "@/lib/server/fallback-persistence";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const xaiSchema = z.object({
  taskId: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(4000),
  answer: z.string().trim().min(1).max(6000),
  reasoning: z.string().trim().min(1).max(3000),
  sources: z.array(z.string().trim().min(3).max(2000)).max(12).default([]),
  complianceFlags: z.array(z.string().trim().min(2).max(120)).max(12).default([]),
  modelVersion: z.string().trim().min(2).max(120),
});

function parseList(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const logs = await db
      .select()
      .from(xaiLog)
      .where(eq(xaiLog.userId, user.id))
      .orderBy(desc(xaiLog.createdAt))
      .limit(30);

    return NextResponse.json({
      logs: logs.map((log) => ({ ...log, sources: parseList(log.sources), complianceFlags: parseList(log.complianceFlags) })),
      storage: "database",
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
    return NextResponse.json({ logs: getFallbackXaiLogs(user.id), storage: "fallback_memory" });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = xaiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid XAI payload" }, { status: 400 });
  }

  try {
    const [log] = await db
      .insert(xaiLog)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        taskId: parsed.data.taskId,
        question: parsed.data.question,
        answer: parsed.data.answer,
        reasoning: parsed.data.reasoning,
        sources: JSON.stringify(parsed.data.sources),
        complianceFlags: JSON.stringify(parsed.data.complianceFlags),
        modelVersion: parsed.data.modelVersion,
      })
      .returning();

    if (!log) {
      return NextResponse.json({ error: "Failed to create xAI log" }, { status: 500 });
    }
    return NextResponse.json({ log: { ...log, sources: parsed.data.sources, complianceFlags: parsed.data.complianceFlags }, storage: "database" }, { status: 201 });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    const log = addFallbackXaiLog({
      id: crypto.randomUUID(),
      userId: user.id,
      taskId: parsed.data.taskId,
      question: parsed.data.question,
      answer: parsed.data.answer,
      reasoning: parsed.data.reasoning,
      sources: parsed.data.sources,
      complianceFlags: parsed.data.complianceFlags,
      modelVersion: parsed.data.modelVersion,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ log, storage: "fallback_memory" }, { status: 201 });
  }
}
