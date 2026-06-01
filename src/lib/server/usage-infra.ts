type UsageSnapshot = {
  userId: string;
  periodStart: string;
  estimatedTokens: number;
  creditsRemaining: number;
};

const responseCache = new Map<string, { reply: string; model: string; createdAt: number }>();
const usageByUser = new Map<string, UsageSnapshot>();

const CACHE_TTL_MS = 1000 * 60 * 30;
const MAX_CACHE_ENTRIES = 500;
const MAX_USAGE_ENTRIES = 5_000;

export function buildCacheKey(input: {
  assistant: string;
  prompt: string;
  memory: string;
  imageDigest?: string;
}) {
  return [
    input.assistant,
    input.prompt.trim().toLowerCase(),
    input.memory.trim().toLowerCase().slice(-500),
    input.imageDigest ?? "",
  ].join("::");
}

export function readCachedReply(key: string) {
  pruneResponseCache();
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry;
}

export function writeCachedReply(key: string, reply: string, model: string) {
  pruneResponseCache();
  responseCache.set(key, { reply, model, createdAt: Date.now() });
}

function pruneResponseCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) responseCache.delete(key);
  }
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  for (const key of responseCache.keys()) {
    responseCache.delete(key);
    if (responseCache.size <= MAX_CACHE_ENTRIES) break;
  }
}

function pruneUsageSnapshots(currentPeriod: string) {
  for (const [userId, snapshot] of usageByUser) {
    if (snapshot.periodStart !== currentPeriod) usageByUser.delete(userId);
  }
  if (usageByUser.size <= MAX_USAGE_ENTRIES) return;
  for (const userId of usageByUser.keys()) {
    usageByUser.delete(userId);
    if (usageByUser.size <= MAX_USAGE_ENTRIES) break;
  }
}

export function chooseModelRoute(params: {
  requested: "auto" | "chatgpt" | "gemini";
  prompt: string;
}) {
  if (params.requested !== "auto") {
    return {
      provider: params.requested,
      strategy: "manual_override",
      complexity: "manual",
    } as const;
  }

  const prompt = params.prompt.toLowerCase();
  const complex =
    /(reason|explain deeply|architecture|compliance|legal|medical|finance|multi-step|strategy|forecast)/i.test(
      prompt,
    ) || prompt.length > 550;

  if (complex) {
    return {
      provider: "gemini",
      strategy: "complex_to_high_end",
      complexity: "high",
    } as const;
  }

  return {
    provider: "gemini",
    strategy: "simple_to_fast_model",
    complexity: "low",
  } as const;
}

export function trackUsage(params: { userId: string; prompt: string; reply: string }) {
  const estimatedTokens = Math.ceil((params.prompt.length + params.reply.length) / 4);
  const today = new Date().toISOString().slice(0, 10);
  pruneUsageSnapshots(today);
  const existing = usageByUser.get(params.userId);
  const base: UsageSnapshot =
    existing && existing.periodStart === today
      ? existing
      : { userId: params.userId, periodStart: today, estimatedTokens: 0, creditsRemaining: 120000 };
  base.estimatedTokens += estimatedTokens;
  base.creditsRemaining = Math.max(0, base.creditsRemaining - estimatedTokens);
  usageByUser.set(params.userId, base);
  return base;
}

export function getUsageForecast(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  pruneUsageSnapshots(today);
  const snap =
    usageByUser.get(userId) ??
    ({
      userId,
      periodStart: today,
      estimatedTokens: 0,
      creditsRemaining: 120000,
    } satisfies UsageSnapshot);
  usageByUser.set(userId, snap);

  const hoursPassed = Math.max(1, new Date().getHours() + 1);
  const dailyRate = Math.max(1, Math.round((snap.estimatedTokens / hoursPassed) * 24));
  const daysLeft = Math.max(0, Number((snap.creditsRemaining / dailyRate).toFixed(1)));

  return {
    ...snap,
    dailyRate,
    daysUntilExhausted: daysLeft,
    suggestion:
      daysLeft <= 4
        ? "Based on current usage, you may run out of credits soon. Consider upgrading."
        : "Usage is healthy. Current plan should sustain expected demand.",
  };
}
