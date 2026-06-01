"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LiveAnalysisSnapshot = {
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

type McpContext = NonNullable<LiveAnalysisSnapshot["mcpContext"]>;

type SystemAgentRun = {
  analysis: LiveAnalysisSnapshot;
  activeProject: { id: string; name: string } | null;
  actionPlan: string[];
  executedTask?: { id: string; title: string; description: string | null; projectId: string } | null;
  systemAgent?: { identity: string; scope: string; goal: string };
  executed?: boolean;
};

function formatStatus(status: LiveAnalysisSnapshot["systemStatus"]) {
  if (status === "needs_attention") return "Needs attention";
  if (status === "busy") return "Busy";
  return "Healthy";
}

function formatContextSource(source: McpContext["source"]) {
  return source.replace("_", " ");
}

export function AnalyticsPage() {
  const [hourlyRate, setHourlyRate] = useState("35");
  const [subscriptionCost, setSubscriptionCost] = useState("49");
  const [taskPrice, setTaskPrice] = useState("1");
  const [systemGoal, setSystemGoal] = useState("Review live workspace activity and create the next best follow-up.");
  const [systemRun, setSystemRun] = useState<SystemAgentRun | null>(null);
  const [systemAgentBusy, setSystemAgentBusy] = useState(false);
  const [systemAgentError, setSystemAgentError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<"connecting" | "live" | "offline">("connecting");
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysisSnapshot | null>(null);
  const [roiData, setRoiData] = useState<{
    monthly?: {
      successfulTasks: number;
      outcomeBill: number;
      hoursSaved: number;
      totalSavings: number;
      payPerSuccess: number;
    };
    esg?: { carbonFootprintKgCo2e: number; badge: string };
  }>({});

  const weeklyData = liveAnalysis?.weekly ?? { days: ["D1", "D2", "D3", "D4", "D5", "D6", "D7"], messages: [2, 3, 4, 5, 6, 7, 8], tasks: [1, 0, 2, 1, 3, 2, 4], engagement: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.75] };
  const liveWeeklyHours = weeklyData.messages.map((m) => Math.min(12, Math.max(1, Math.round(m / 3 + 2))));
  const liveTokenUsage = weeklyData.messages.map((m, i) => Math.max(400, m * 180 + (i === 3 ? 2800 : 100)));
  const liveAnomalyDays = liveTokenUsage.map((value, index) => ({ value, index })).filter((item) => item.value > 3000);
  const liveTotalHours = liveWeeklyHours.reduce((sum, v) => sum + v, 0);
  const liveHeat = weeklyData.engagement.map((e) => [
    Math.max(0.2, Math.min(0.9, e * 0.65)),
    Math.max(0.2, Math.min(0.9, e * 0.85)),
    Math.max(0.2, Math.min(0.9, e)),
    Math.max(0.2, Math.min(0.95, e * 1.12)),
  ]);

  const loadRoi = useCallback(async () => {
    const response = await fetch("/api/business/roi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hourlyRate: Number(hourlyRate),
        subscriptionCost: Number(subscriptionCost),
        successfulTaskPrice: Number(taskPrice),
      }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      monthly: {
        successfulTasks: number;
        outcomeBill: number;
        hoursSaved: number;
        totalSavings: number;
        payPerSuccess: number;
      };
      esg: { carbonFootprintKgCo2e: number; badge: string };
    };
    setRoiData(payload);
  }, [hourlyRate, subscriptionCost, taskPrice]);

  useEffect(() => {
    void loadRoi();
  }, [loadRoi]);

  useEffect(() => {
    const source = new EventSource("/api/realtime/analysis");
    setStreamState("connecting");

    source.onopen = () => {
      setStreamState("live");
    };

    source.onmessage = (event) => {
      try {
        setLiveAnalysis(JSON.parse(event.data) as LiveAnalysisSnapshot);
      } catch {
        setLiveAnalysis(null);
      }
    };

    source.onerror = () => {
      setStreamState("offline");
    };

    return () => {
      source.close();
    };
  }, []);

  async function runSystemAgent(execute = false) {
    setSystemAgentBusy(true);
    setSystemAgentError(null);

    try {
      const response = await fetch("/api/system-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: systemGoal, execute }),
      });
      const payload = (await response.json()) as SystemAgentRun & { error?: string };
      if (!response.ok) {
        setSystemRun(null);
        setSystemAgentError(payload.error ?? "System agent request failed.");
        return;
      }
      setSystemRun(payload);
    } catch {
      setSystemAgentError("System agent is unavailable right now.");
      setSystemRun(null);
    } finally {
      setSystemAgentBusy(false);
    }
  }

  const liveStatus = liveAnalysis ? formatStatus(liveAnalysis.systemStatus) : streamState;
  const liveUpdatedAt = liveAnalysis
    ? new Date(liveAnalysis.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "Waiting";
  const contextSource = liveAnalysis?.mcpContext ? formatContextSource(liveAnalysis.mcpContext.source) : "No MCP source";

  return (
    <main className="min-h-svh bg-[linear-gradient(180deg,#020617_0%,#111827_100%)] p-4 text-slate-100 md:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <Card className="border-slate-700/70 bg-slate-950/80">
          <CardHeader>
            <CardTitle>Real-Time Analysis</CardTitle>
            <CardDescription className="text-slate-400">
              Streaming workspace telemetry that updates every few seconds from live app data.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                Stream: {streamState}
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                Analysis source: {liveAnalysis?.source ?? "stream"}
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                MCP: {contextSource}
              </span>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Status</p>
              <p className="mt-1 text-xl font-semibold text-cyan-100">{liveStatus}</p>
              <p className="mt-1 text-xs text-slate-500">Updated {liveUpdatedAt}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-fuchsia-300">Open tasks</p>
              <p className="mt-1 text-xl font-semibold text-fuchsia-100">{liveAnalysis?.metrics.tasksOpen ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-300">Alerts</p>
              <p className="mt-1 text-xl font-semibold text-amber-100">{liveAnalysis?.metrics.promptInjectionAlerts ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300">Confidence</p>
              <p className="mt-1 text-xl font-semibold text-emerald-100">{liveAnalysis?.confidence ?? 0}%</p>
            </div>
            <div className="md:col-span-4 rounded-md border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Recommendation</p>
              <p className="mt-2 text-sm text-slate-200">
                {liveAnalysis?.recommendation ?? "Waiting for the live stream..."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(liveAnalysis?.highlights ?? []).slice(0, 4).map((item) => (
                  <span key={item} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700/70 bg-slate-950/80">
          <CardHeader>
            <CardTitle>System Agent</CardTitle>
            <CardDescription className="text-slate-400">
              This agent reads live workspace data and can create the next follow-up task in your latest project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={systemGoal}
              onChange={(event) => setSystemGoal(event.target.value)}
              className="border-slate-700 bg-slate-900 text-slate-100"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"
                onClick={() => void runSystemAgent(false)}
                disabled={systemAgentBusy}
              >
                {systemAgentBusy && !systemRun ? "Running..." : "Analyze System"}
              </Button>
              <Button
                className="bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                onClick={() => void runSystemAgent(true)}
                disabled={systemAgentBusy}
              >
                {systemAgentBusy && systemRun ? "Applying..." : "Analyze + Create Task"}
              </Button>
            </div>
            {systemAgentError ? <p className="text-sm text-red-300">{systemAgentError}</p> : null}
            {systemRun ? (
              <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-cyan-300">
                  {systemRun.systemAgent?.identity ?? "system-agent"}
                </p>
                <p>{systemRun.analysis.recommendation}</p>
                <div className="flex flex-wrap gap-2">
                  {systemRun.actionPlan.map((item) => (
                    <span key={item} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                      {item}
                    </span>
                  ))}
                </div>
                {systemRun.executedTask ? (
                  <p className="text-emerald-200">
                    Created task: {systemRun.executedTask.title} in project {systemRun.activeProject?.name ?? systemRun.executedTask.projectId}
                  </p>
                ) : (
                  <p className="text-slate-400">
                    No task created yet. Run with &quot;Analyze + Create Task&quot; to apply the result.
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-slate-700/70 bg-slate-950/80">
          <CardHeader>
            <CardTitle>Analytics & Insights</CardTitle>
            <CardDescription className="text-slate-400">Chat activity, workflow efficiency, and usage trends.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Hours Saved</p>
              <p className="mt-1 text-3xl font-semibold text-cyan-100">{liveTotalHours}h</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-fuchsia-300">Workflow Score</p>
              <p className="mt-1 text-3xl font-semibold text-fuchsia-100">{Math.min(98, liveTotalHours * 3)}%</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-300">Usage Alerts</p>
              <p className="mt-1 text-3xl font-semibold text-amber-100">{liveAnomalyDays.length}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300">ROI Widget</p>
              <p className="mt-1 text-xl font-semibold text-emerald-100">${(roiData.monthly?.totalSavings ?? 0).toFixed(0)}</p>
              <p className="text-xs text-slate-400">
                Saved this month, with {roiData.monthly?.successfulTasks ?? 0} successful outcomes.
              </p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3 md:col-span-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Live Workspace Snapshot</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Conversations</p>
                  <p className="text-2xl font-semibold text-slate-100">{liveAnalysis?.metrics.conversations ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Messages / 24h</p>
                  <p className="text-2xl font-semibold text-slate-100">{liveAnalysis?.metrics.messages24h ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Assistant replies / 24h</p>
                  <p className="text-2xl font-semibold text-slate-100">{liveAnalysis?.metrics.assistantMessages24h ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tasks complete</p>
                  <p className="text-2xl font-semibold text-slate-100">{liveAnalysis?.metrics.tasksDone ?? 0}</p>
                </div>
              </div>
              {liveAnalysis?.mcpContext ? (
                <div className="mt-4 rounded-md border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <p className="text-xs uppercase tracking-wide text-cyan-200">Connected MCP Context</p>
                  <p className="mt-1 text-sm text-slate-200">{liveAnalysis.mcpContext.contextSummary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {liveAnalysis.mcpContext.discoveredResources.slice(0, 4).map((resource) => (
                      <span key={resource} className="rounded-full border border-cyan-500/20 bg-slate-950/60 px-2 py-1 text-[11px] text-cyan-100">
                        {resource}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">Connect MCP to unlock external context in live analysis.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-700/70 bg-slate-950/80">
            <CardHeader>
              <CardTitle>Efficiency Score (Hours Saved)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-end gap-2">
                {liveWeeklyHours.map((value, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-md bg-cyan-500/40" style={{ height: `${value * 16}px` }} />
                    <p className="text-[11px] text-slate-400">D{index + 1}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700/70 bg-slate-950/80">
            <CardHeader>
              <CardTitle>Usage Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {liveAnomalyDays.length === 0 ? (
                <p className="text-sm text-slate-400">No unusual usage spikes detected.</p>
              ) : (
                liveAnomalyDays.map((item) => (
                  <div key={item.index} className="rounded-md border border-amber-500/35 bg-amber-500/10 p-2 text-sm text-amber-100">
                    Day {item.index + 1}: unusual token spike ({item.value.toLocaleString()} tokens)
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-700/70 bg-slate-950/80">
          <CardHeader>
            <CardTitle>Conversation Trends Heat Map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {liveHeat.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-4 gap-2">
                {row.map((value, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className="h-10 rounded-md border border-slate-700"
                    style={{ background: `rgba(34,197,94,${Math.max(0.15, value)})` }}
                    title={`Week ${rowIndex + 1}, Segment ${colIndex + 1}: ${Math.round(value * 100)}% engagement`}
                  />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-700/70 bg-slate-950/80">
          <CardHeader>
            <CardTitle>Outcome Pricing + ROI</CardTitle>
            <CardDescription className="text-slate-400">
              Measure value from hours saved, task completion, and plan cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="Hourly rate" className="border-slate-700 bg-slate-900 text-slate-100" />
              <Input value={subscriptionCost} onChange={(event) => setSubscriptionCost(event.target.value)} placeholder="Subscription cost" className="border-slate-700 bg-slate-900 text-slate-100" />
              <Input value={taskPrice} onChange={(event) => setTaskPrice(event.target.value)} placeholder="Task success price" className="border-slate-700 bg-slate-900 text-slate-100" />
            </div>
            <Button className="bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25" onClick={() => void loadRoi()}>
              Recalculate ROI
            </Button>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-xs text-slate-400">Successful Tasks</p>
                <p className="text-xl font-semibold text-cyan-100">{roiData.monthly?.successfulTasks ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-xs text-slate-400">Pay-per-success</p>
                <p className="text-xl font-semibold text-fuchsia-100">${roiData.monthly?.payPerSuccess ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-xs text-slate-400">Total Savings</p>
                <p className="text-xl font-semibold text-fuchsia-100">${roiData.monthly?.totalSavings ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-xs text-slate-400">Impact Badge</p>
                <p className="text-xl font-semibold text-emerald-100">{roiData.esg?.badge ?? "N/A"}</p>
                <p className="text-xs text-slate-500">{roiData.esg?.carbonFootprintKgCo2e ?? 0} kg CO2e</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Outcome-based billing means the platform can charge $0 upfront and only bill on successful high-value tasks.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
