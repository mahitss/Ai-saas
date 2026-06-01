import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aiMemory, aiMessage } from "@/db/schema";
import { env } from "@/lib/env";
import { scrubSensitiveText, scrubTextBatch, unmaskSensitiveText } from "@/lib/server/data-scrubbing";
import { inspectForGovernance } from "@/lib/server/governance";
import {
  buildCacheKey,
  chooseModelRoute,
  readCachedReply,
  trackUsage,
  writeCachedReply,
} from "@/lib/server/usage-infra";

function extractFacts(input: string) {
  const lower = input.toLowerCase();
  const patterns = [
    "my name is",
    "i am",
    "i'm",
    "i like",
    "i love",
    "i work as",
    "my goal is",
  ];
  const found: string[] = [];

  for (const pattern of patterns) {
    const index = lower.indexOf(pattern);
    if (index >= 0) {
      const snippet = input.slice(index, Math.min(input.length, index + 90)).trim();
      if (snippet.length > pattern.length + 3) {
        found.push(snippet);
      }
    }
  }

  return found;
}

export async function updateUserMemory(userId: string, userMessage: string) {
  const newFacts = extractFacts(userMessage);
  if (newFacts.length === 0) {
    const [existingOnly] = await db.select().from(aiMemory).where(eq(aiMemory.userId, userId)).limit(1);
    return existingOnly?.summary ?? "";
  }

  const [existing] = await db.select().from(aiMemory).where(eq(aiMemory.userId, userId)).limit(1);
  const currentFacts = existing?.summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean) ?? [];

  const merged = Array.from(new Set([...currentFacts, ...newFacts])).slice(-20);
  const summary = merged.join("\n");

  if (existing) {
    await db
      .update(aiMemory)
      .set({ summary, updatedAt: new Date() })
      .where(eq(aiMemory.userId, userId));
  } else {
    await db.insert(aiMemory).values({
      id: crypto.randomUUID(),
      userId,
      summary,
    });
  }

  return summary;
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return "";
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") {
      continue;
    }
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text.trim();
      }
    }
  }

  return "";
}

async function listGeminiGenerateModels(apiKey: string) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      {
        method: "GET",
        headers: { "content-type": "application/json" },
      },
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    return (payload.models ?? [])
      .filter((model) => model.name && model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => model.name as string);
  } catch {
    return [];
  }
}

function parseImageDataUrl(imageDataUrl?: string) {
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return null;
  }
  const [meta, data] = imageDataUrl.split(",", 2);
  if (!meta || !data) {
    return null;
  }
  const mimeType = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1];
  if (!mimeType) {
    return null;
  }
  return { mimeType, base64Data: data };
}

export async function generateAssistantReply(params: {
  userId: string;
  userMessage: string;
  conversationId: string;
  assistant: "auto" | "chatgpt" | "gemini";
  imageDataUrl?: string;
}) {
  const { userId, userMessage, conversationId, assistant, imageDataUrl } = params;

  const memorySummary = await updateUserMemory(userId, userMessage);

  const historyRows = await db
    .select({
      role: aiMessage.role,
      content: aiMessage.content,
    })
    .from(aiMessage)
    .where(eq(aiMessage.conversationId, conversationId))
    .orderBy(desc(aiMessage.createdAt))
    .limit(16);

  const history = historyRows
    .reverse()
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));

  const scrubbedHistoryBatch = scrubTextBatch(history.map((item) => item.content));
  const scrubbedHistory = history.map((item, index) => ({
    role: item.role,
    content: scrubbedHistoryBatch.scrubbed[index] ?? item.content,
  }));
  const scrubbedMemory = scrubSensitiveText(memorySummary);
  const scrubbedUserMessage = scrubSensitiveText(userMessage);
  const scrubTokens = {
    ...scrubbedHistoryBatch.tokens,
    ...scrubbedMemory.tokens,
    ...scrubbedUserMessage.tokens,
  };
  const route = chooseModelRoute({
    requested: assistant,
    prompt: userMessage,
  });
  const selectedAssistant = assistant === "auto" ? route.provider : assistant;
  const cacheKey = buildCacheKey({
    assistant: selectedAssistant,
    prompt: scrubbedUserMessage.scrubbed,
    memory: scrubbedMemory.scrubbed,
    imageDigest: imageDataUrl ? String(imageDataUrl.length) : "",
  });
  const cached = readCachedReply(cacheKey);

  inspectForGovernance({
    userId,
    direction: "input",
    text: userMessage,
    model: selectedAssistant,
    routeContext: "ai_gateway_pre_prompt",
  });

  if (cached) {
    trackUsage({
      userId,
      prompt: userMessage,
      reply: cached.reply,
    });
    const outputAudit = inspectForGovernance({
      userId,
      direction: "output",
      text: cached.reply,
      model: cached.model,
      routeContext: "ai_gateway_cached_response",
    });
    return {
      reply: cached.reply,
      memorySummary,
      metadata: {
        modelUsed: cached.model,
        routing: route.strategy,
        cached: true,
        auditId: outputAudit.id,
        aiBom: outputAudit.aiBom,
      },
    };
  }

  const systemInstruction =
    "You are a warm AI assistant in a personal chat app. Be concise, helpful, and remember user context.";
  const parsedImage = parseImageDataUrl(imageDataUrl);

  async function tryGeminiReply() {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "GEMINI_API_KEY is not configured for this deployment yet. Add it in Vercel Environment Variables and redeploy.",
      };
    }

    const availableModels = await listGeminiGenerateModels(apiKey);
    const configuredModel = env.GEMINI_MODEL?.trim();
    const preferred = configuredModel ? [`models/${configuredModel.replace(/^models\//, "")}`] : ["models/gemini-2.0-flash"];
    const fallback = preferred;
    const models = (availableModels.length > 0
      ? [...preferred.filter((name) => availableModels.includes(name)), ...availableModels]
      : fallback
    ).filter((value, index, array) => array.indexOf(value) === index);
    let lastError = "Unknown provider error";

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: systemInstruction }],
                },
                ...(memorySummary
                  ? [{ role: "user", parts: [{ text: `User memory:\n${scrubbedMemory.scrubbed}` }] }]
                  : []),
                ...scrubbedHistory.map((item) => ({
                  role: item.role === "assistant" ? "model" : "user",
                  parts: [{ text: item.content }],
                })),
                {
                  role: "user",
                  parts: [
                    { text: scrubbedUserMessage.scrubbed },
                    ...(parsedImage
                      ? [
                          {
                            inline_data: {
                              mime_type: parsedImage.mimeType,
                              data: parsedImage.base64Data,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          lastError = `Model ${model} failed (${response.status}). ${errorText}`.slice(0, 240);
          continue;
        }

        const payload = await response.json();
        const reply = extractGeminiText(payload);

        if (!reply) {
          lastError = `Model ${model} returned empty output`;
          continue;
        }

        return { ok: true as const, reply: unmaskSensitiveText(reply, scrubTokens), model };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Request exception";
      }
    }

    return {
      ok: false as const,
      error: `I couldn't reach the AI provider right now. ${lastError}`,
    };
  }

  async function tryOpenAiReply() {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "OPENAI_API_KEY is not configured for this deployment yet. Add it in Vercel Environment Variables and redeploy.",
      };
    }

    const models = [env.OPENAI_MODEL?.trim() || "gpt-4o-mini"];
    let lastError = "Unknown provider error";

    const input = [
      { role: "system", content: systemInstruction },
      ...(memorySummary ? [{ role: "system", content: `User memory:\n${scrubbedMemory.scrubbed}` }] : []),
      ...scrubbedHistory.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      {
        role: "user",
        content: [
          { type: "input_text", text: scrubbedUserMessage.scrubbed },
          ...(parsedImage ? [{ type: "input_image", image_url: imageDataUrl }] : []),
        ],
      },
    ];

    for (const model of models) {
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          lastError = `Model ${model} failed (${response.status}). ${errorText}`.slice(0, 240);
          continue;
        }

        const payload = (await response.json()) as {
          output_text?: string;
          output?: Array<{
            content?: Array<{ type?: string; text?: string }>;
          }>;
        };

        const textFromOutput = payload.output_text?.trim();
        if (textFromOutput) {
          return { ok: true as const, reply: unmaskSensitiveText(textFromOutput, scrubTokens), model };
        }

        const nestedText =
          payload.output
            ?.flatMap((item) => item.content ?? [])
            .find((item) => item.type === "output_text" && item.text?.trim())?.text
            ?.trim() ?? "";

        if (nestedText) {
          return { ok: true as const, reply: unmaskSensitiveText(nestedText, scrubTokens), model };
        }

        lastError = `Model ${model} returned empty output`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Request exception";
      }
    }

    return {
      ok: false as const,
      error: `I couldn't reach the AI provider right now. ${lastError}`,
    };
  }

  if (selectedAssistant === "gemini") {
    const result = await tryGeminiReply();
    const finalReply = result.ok ? result.reply : result.error;
    const modelUsed = result.ok ? result.model : "gemini_fallback";
    writeCachedReply(cacheKey, finalReply, modelUsed);
    trackUsage({ userId, prompt: userMessage, reply: finalReply });
    const outputAudit = inspectForGovernance({
      userId,
      direction: "output",
      text: finalReply,
      model: modelUsed,
      routeContext: "ai_gateway_post_prompt",
    });
    return {
      reply: finalReply,
      memorySummary,
      metadata: {
        modelUsed,
        routing: route.strategy,
        cached: false,
        auditId: outputAudit.id,
        aiBom: outputAudit.aiBom,
      },
    };
  }

  if (selectedAssistant === "chatgpt") {
    const result = await tryOpenAiReply();
    const finalReply = result.ok ? result.reply : result.error;
    const modelUsed = result.ok ? result.model : "chatgpt_fallback";
    writeCachedReply(cacheKey, finalReply, modelUsed);
    trackUsage({ userId, prompt: userMessage, reply: finalReply });
    const outputAudit = inspectForGovernance({
      userId,
      direction: "output",
      text: finalReply,
      model: modelUsed,
      routeContext: "ai_gateway_post_prompt",
    });
    return {
      reply: finalReply,
      memorySummary,
      metadata: {
        modelUsed,
        routing: route.strategy,
        cached: false,
        auditId: outputAudit.id,
        aiBom: outputAudit.aiBom,
      },
    };
  }

  const openAiResult = await tryOpenAiReply();
  if (openAiResult.ok) {
    return { reply: openAiResult.reply, memorySummary };
  }

  const geminiResult = await tryGeminiReply();
  if (geminiResult.ok) {
    return { reply: geminiResult.reply, memorySummary };
  }

  const finalReply = `I couldn't reach the AI provider right now. OpenAI: ${openAiResult.error} | Gemini: ${geminiResult.error}`.slice(
    0,
    500,
  );
  writeCachedReply(cacheKey, finalReply, "provider_unavailable");
  trackUsage({ userId, prompt: userMessage, reply: finalReply });
  const outputAudit = inspectForGovernance({
    userId,
    direction: "output",
    text: finalReply,
    model: "provider_unavailable",
    routeContext: "ai_gateway_post_prompt",
  });
  return {
    reply: finalReply,
    memorySummary,
    metadata: {
      modelUsed: "provider_unavailable",
      routing: route.strategy,
      cached: false,
      auditId: outputAudit.id,
      aiBom: outputAudit.aiBom,
    },
  };
}
