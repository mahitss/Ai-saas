import { env } from "@/lib/env";

const memoryHits = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_KEYS = 5_000;

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

async function redisCommand(command: unknown[]) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as { result?: unknown };
}

export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions) {
  pruneMemoryHits();
  const redisKey = `rate:${key}`;
  const redisResult = await redisCommand(["INCR", redisKey]);

  if (typeof redisResult?.result === "number") {
    if (redisResult.result === 1) {
      await redisCommand(["EXPIRE", redisKey, windowSeconds]);
    }
    return {
      allowed: redisResult.result <= limit,
      remaining: Math.max(0, limit - redisResult.result),
      resetSeconds: windowSeconds,
    };
  }

  const now = Date.now();
  const resetAt = now + windowSeconds * 1000;
  const current = memoryHits.get(key);
  const next =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt };

  memoryHits.set(key, next);

  return {
    allowed: next.count <= limit,
    remaining: Math.max(0, limit - next.count),
    resetSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1000)),
  };
}

function pruneMemoryHits() {
  const now = Date.now();
  for (const [key, value] of memoryHits) {
    if (value.resetAt <= now) memoryHits.delete(key);
  }
  if (memoryHits.size <= MAX_MEMORY_KEYS) return;
  for (const key of memoryHits.keys()) {
    memoryHits.delete(key);
    if (memoryHits.size <= MAX_MEMORY_KEYS) break;
  }
}

export async function verifyTurnstile(token: string | null, ip?: string | null) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return process.env.NODE_ENV !== "production";
  }
  if (!token) {
    return false;
  }

  const formData = new FormData();
  formData.set("secret", env.TURNSTILE_SECRET_KEY);
  formData.set("response", token);
  if (ip) formData.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  if (!response.ok) {
    return false;
  }
  const payload = (await response.json()) as { success?: boolean };
  return payload.success === true;
}
