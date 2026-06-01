import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/server/logger";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "CSRF_ERROR"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_SERVER_ERROR";

type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(error: ApiError | Error | unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  logger.error("Unhandled API error", { error });
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      },
    },
    { status: 500 },
  );
}

export function unauthorized(message = "Unauthorized") {
  return apiError(new ApiError(401, "UNAUTHORIZED", message));
}

export function notFound(message = "Resource not found"): never {
  throw new ApiError(404, "NOT_FOUND", message);
}

export async function parseJson(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  const body = await request.text();
  if (body.length > MAX_JSON_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

export async function validateJson<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const body = await parseJson(request);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid request payload", parsed.error.flatten());
  }
  return parsed.data;
}

export function assertSameOrigin(request: Request) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;

  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;

  if (origin !== requestOrigin) {
    throw new ApiError(403, "CSRF_ERROR", "Cross-site request blocked");
  }
}

const MAX_JSON_BODY_BYTES = 1_000_000;

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function assertRateLimit(
  request: Request,
  options: { keyPrefix: string; limit?: number; windowSeconds?: number; userId?: string },
) {
  const { checkRateLimit } = await import("@/lib/server/rate-limit");
  const limit = await checkRateLimit({
    key: `${options.keyPrefix}:${options.userId ?? "anon"}:${getClientIp(request)}`,
    limit: options.limit ?? 60,
    windowSeconds: options.windowSeconds ?? 60,
  });

  if (!limit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests", {
      retryAfter: limit.resetSeconds,
      remaining: limit.remaining,
    });
  }

  return limit;
}

export function withApiHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
) {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiError(error);
    }
  };
}
