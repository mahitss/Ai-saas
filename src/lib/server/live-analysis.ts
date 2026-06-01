import { and, count, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { aiConversation, aiMessage, project, projectTask } from "@/db/schema";
import { getMcpContext } from "@/lib/server/mcp-context";

const injectionPatterns = /(ignore previous|system prompt|jailbreak|bypass|developer mode|act as|override rules)/i;

export type LiveAnalysisSnapshot = {
  generatedAt: string;
  systemStatus: "healthy" | "busy" | "needs_attention";
  confidence: number;
  metrics: {
    conversations: number;
    messages24h: number;
    assistantMessages24h: number;
    tasksTotal: number;
    tasksOpen: number;
    tasksDone: number;
    overdueTasks: number;
    promptInjectionAlerts: number;
  };
  recommendation: string;
  highlights: string[];
  mcpContext: {
    source: "google_drive" | "github" | "local_files" | "postgres";
    target: string;
    contextSummary: string;
    discoveredResources: string[];
    liveSignals: string[];
    secureSessionToken: string;
    lastUsedAt: string;
  } | null;
  source: "database" | "fallback_memory";
  weekly: {
    days: string[];
    messages: number[];
    tasks: number[];
    engagement: number[];
  };
};


export type SystemAgentRun = {
  analysis: LiveAnalysisSnapshot;
  activeProject: { id: string; name: string } | null;
  actionPlan: string[];
  executedTask?: {
    id: string;
    title: string;
    description: string | null;
    projectId: string;
  } | null;
};

function createFallbackAnalysis(): LiveAnalysisSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    systemStatus: "healthy",
    confidence: 72,
    metrics: {
      conversations: 0,
      messages24h: 0,
      assistantMessages24h: 0,
      tasksTotal: 0,
      tasksOpen: 0,
      tasksDone: 0,
      overdueTasks: 0,
      promptInjectionAlerts: 0,
    },
    recommendation: "Connect a conversation or MCP source to start live analysis.",
    highlights: ["No workspace data loaded yet."],
    mcpContext: null,
    source: "fallback_memory",
    weekly: { days: ["D1", "D2", "D3", "D4", "D5", "D6", "D7"], messages: [0, 0, 0, 0, 0, 0, 0], tasks: [0, 0, 0, 0, 0, 0, 0], engagement: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  };
}

export async function getLiveAnalysis(userId: string): Promise<LiveAnalysisSnapshot> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [conversationCountRows, taskRows, messageRows] = await Promise.all([
      db.select({ value: count() }).from(aiConversation).where(eq(aiConversation.userId, userId)),
      db
        .select({
          id: projectTask.id,
          title: projectTask.title,
          status: projectTask.status,
          priority: projectTask.priority,
          dueDate: projectTask.dueDate,
          updatedAt: projectTask.updatedAt,
        })
        .from(projectTask)
        .where(eq(projectTask.ownerId, userId))
        .orderBy(desc(projectTask.updatedAt)),
      db
        .select({ role: aiMessage.role, content: aiMessage.content, createdAt: aiMessage.createdAt })
        .from(aiMessage)
        .where(and(eq(aiMessage.userId, userId), gte(aiMessage.createdAt, since)))
        .orderBy(desc(aiMessage.createdAt))
        .limit(80),
    ]);

    const now = new Date();
    const conversations = Number(conversationCountRows[0]?.value ?? 0);
    const tasksTotal = taskRows.length;
    const tasksDone = taskRows.filter((task) => task.status === "done").length;
    const tasksOpen = taskRows.filter((task) => task.status !== "done").length;
    const overdueTasks = taskRows.filter(
      (task) => task.status !== "done" && task.dueDate && new Date(task.dueDate) < now,
    ).length;
    const messages24h = messageRows.length;
    const assistantMessages24h = messageRows.filter((message) => message.role === "assistant").length;
    const promptInjectionAlerts = messageRows.filter(
      (message) => message.role === "user" && injectionPatterns.test(message.content),
    ).length;
    const mcpContext = await getMcpContext(userId);

    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekMessageRows, weekTaskRows] = await Promise.all([
      db
        .select({ createdAt: aiMessage.createdAt })
        .from(aiMessage)
        .where(and(eq(aiMessage.userId, userId), gte(aiMessage.createdAt, weekStart)))
        .orderBy(desc(aiMessage.createdAt)),
      db
        .select({ updatedAt: projectTask.updatedAt })
        .from(projectTask)
        .where(and(eq(projectTask.ownerId, userId), gte(projectTask.updatedAt, weekStart))),
    ]);
    const days: string[] = [];
    const messagesPerDay: number[] = [];
    const tasksPerDay: number[] = [];
    const engagement: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const label = `D${7 - i}`;
      days.push(label);
      const dayMsgs = weekMessageRows.filter((m) => {
        const d = new Date(m.createdAt);
        return d >= dayStart && d < dayEnd;
      }).length;
      messagesPerDay.push(dayMsgs);
      const dayTasks = weekTaskRows.filter((t) => {
        const d = new Date(t.updatedAt);
        return d >= dayStart && d < dayEnd;
      }).length;
      tasksPerDay.push(dayTasks);
      const eng = Math.min(0.95, Math.max(0.1, (dayMsgs + dayTasks * 2) / 20));
      engagement.push(eng);
    }

    const highlights = [
      tasksOpen > 0 ? `${tasksOpen} open tasks` : "No open tasks",
      overdueTasks > 0 ? `${overdueTasks} overdue tasks` : "No overdue tasks",
      promptInjectionAlerts > 0 ? `${promptInjectionAlerts} prompt injection alerts` : "No prompt injection alerts",
      assistantMessages24h > 0 ? `${assistantMessages24h} assistant replies in the last 24h` : "No assistant replies in the last 24h",
      mcpContext ? `MCP: ${mcpContext.source} connected` : "No MCP context connected",
    ].slice(0, 4);

    let recommendation = "Your workspace is quiet. Start a chat or connect MCP to generate fresh signal.";
    let systemStatus: LiveAnalysisSnapshot["systemStatus"] = "healthy";

    if (promptInjectionAlerts > 0) {
      recommendation = "Open Safety & Security and review the flagged prompts before the next action.";
      systemStatus = "needs_attention";
    } else if (overdueTasks > 0) {
      recommendation = "Use the system agent to triage overdue work and create a follow-up task.";
      systemStatus = "busy";
    } else if (messages24h > 0) {
      recommendation = "Run the system agent on recent conversations to turn them into actionable follow-ups.";
      systemStatus = "busy";
    } else if (mcpContext) {
      recommendation = `Use the connected ${mcpContext.source.replace("_", " ")} context to generate a live follow-up from ${mcpContext.target}.`;
      systemStatus = "busy";
    }

    const confidence = Math.max(42, Math.min(98, 92 - promptInjectionAlerts * 8 - overdueTasks * 5 + (mcpContext ? 4 : 0)));

    return {
      generatedAt: new Date().toISOString(),
      systemStatus,
      confidence,
      metrics: {
        conversations,
        messages24h,
        assistantMessages24h,
        tasksTotal,
        tasksOpen,
        tasksDone,
        overdueTasks,
        promptInjectionAlerts,
      },
      recommendation,
      highlights,
      mcpContext: mcpContext
        ? {
            source: mcpContext.source,
            target: mcpContext.target,
            contextSummary: mcpContext.contextSummary,
            discoveredResources: mcpContext.discoveredResources,
            liveSignals: mcpContext.liveSignals,
            secureSessionToken: mcpContext.secureSessionToken,
            lastUsedAt: mcpContext.lastUsedAt,
          }
        : null,
      source: "database",
      weekly: { days, messages: messagesPerDay, tasks: tasksPerDay, engagement },
    };
  } catch {
    return createFallbackAnalysis();
  }
}

function clampText(text: string, maxLength: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

export async function runSystemAgent(userId: string, goal: string, execute: boolean) {
  const analysis = await getLiveAnalysis(userId);
  const mcpContext = analysis.mcpContext;

  const [latestProject] = await db
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(eq(project.ownerId, userId))
    .orderBy(desc(project.updatedAt))
    .limit(1);

  const actionPlan = [
    analysis.metrics.promptInjectionAlerts > 0
      ? "Audit flagged prompts and tighten the trust gateway."
      : "Keep the trust gateway active and verify recent outputs.",
    analysis.metrics.overdueTasks > 0
      ? "Create or reassign follow-up tasks for overdue work."
      : "Capture the next best task while the workspace is fresh.",
    mcpContext
      ? `Pull live context from ${mcpContext.source.replace("_", " ")} for ${mcpContext.target}.`
      : "Connect MCP to let the system agent read external context live.",
    latestProject
      ? `Attach the next action to project "${latestProject.name}".`
      : "Create a project to capture the next action.",
  ];

  let executedTask: SystemAgentRun["executedTask"] = null;
  if (execute && latestProject) {
    const title = clampText(`System agent: ${goal}`, 200);
    const description = clampText(
      `${analysis.recommendation} | Live status: ${analysis.systemStatus} | Confidence: ${analysis.confidence}%${
        mcpContext ? ` | MCP: ${mcpContext.contextSummary}` : ""
      }`,
      2000,
    );
    const [createdTask] = await db
      .insert(projectTask)
      .values({
        id: crypto.randomUUID(),
        projectId: latestProject.id,
        ownerId: userId,
        title,
        description,
        status: "todo",
        priority: analysis.metrics.overdueTasks > 0 ? "high" : "medium",
      })
      .returning({
        id: projectTask.id,
        title: projectTask.title,
        description: projectTask.description,
        projectId: projectTask.projectId,
      });

    executedTask = createdTask ?? null;
  }

  return {
    analysis,
    activeProject: latestProject ?? null,
    actionPlan,
    executedTask,
  } satisfies SystemAgentRun;
}
