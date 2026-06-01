import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { project, projectTask } from "@/db/schema";
import { assertRateLimit, assertSameOrigin, validateJson, withApiHandler } from "@/lib/server/api-response";
import { sanitizeText } from "@/lib/server/sanitize";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const createTaskSchema = z.object({
  title: z.string().transform(sanitizeText).pipe(z.string().min(1).max(200)),
  description: z.string().transform(sanitizeText).pipe(z.string().max(2000)).optional().or(z.literal("")),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  starred: z.boolean().optional(),
  dueDate: z.string().datetime().optional().or(z.literal("")),
});

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

async function getOwnedProject(projectId: string, userId: string) {
  const [existingProject] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.ownerId, userId)))
    .limit(1);

  return existingProject ?? null;
}

export const GET = withApiHandler(async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return unauthorized();
  }
  await assertRateLimit(request, { keyPrefix: "project-tasks:get", userId: user.id, limit: 120, windowSeconds: 60 });

  const { projectId } = await context.params;

  if (!(await getOwnedProject(projectId, user.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tasks = await db
    .select()
    .from(projectTask)
    .where(and(eq(projectTask.projectId, projectId), eq(projectTask.ownerId, user.id)))
    .orderBy(desc(projectTask.updatedAt));

  return NextResponse.json({ tasks });
});

export const POST = withApiHandler(async function POST(request: Request, context: RouteContext) {
  assertSameOrigin(request);
  const user = await getAuthenticatedUser();

  if (!user) {
    return unauthorized();
  }
  await assertRateLimit(request, { keyPrefix: "project-tasks:post", userId: user.id, limit: 60, windowSeconds: 60 });

  const { projectId } = await context.params;

  if (!(await getOwnedProject(projectId, user.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const parsedBody = await validateJson(request, createTaskSchema);

  const [createdTask] = await db
    .insert(projectTask)
    .values({
      id: crypto.randomUUID(),
      projectId,
      ownerId: user.id,
      title: parsedBody.title,
      description: parsedBody.description || null,
      status: parsedBody.status ?? "todo",
      priority: parsedBody.priority ?? "medium",
      starred: parsedBody.starred ?? false,
      dueDate: parsedBody.dueDate ? new Date(parsedBody.dueDate) : null,
    })
    .returning();

  if (!createdTask) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
  return NextResponse.json({ task: createdTask }, { status: 201 });
});
