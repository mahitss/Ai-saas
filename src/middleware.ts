import { NextResponse, type NextRequest } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self' blob: data:",
    "frame-ancestors 'none'",
  ].join("; "),
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitHits = new Map<string, { count: number; resetAt: number }>();

function applySecurityHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function isUnsafeMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function checkApiRateLimit(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;

  const now = Date.now();
  for (const [key, value] of rateLimitHits) {
    if (value.resetAt <= now) rateLimitHits.delete(key);
  }

  const key = `${getClientIp(request)}:${request.nextUrl.pathname}`;
  const current = rateLimitHits.get(key);
  const next =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  rateLimitHits.set(key, next);

  if (next.count <= RATE_LIMIT_MAX) return null;

  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests" } },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((next.resetAt - now) / 1000))),
      },
    },
  );
}

export function middleware(request: NextRequest) {
  const rateLimited = checkApiRateLimit(request);
  if (rateLimited) return applySecurityHeaders(rateLimited);

  if (request.nextUrl.pathname.startsWith("/api/") && isUnsafeMethod(request.method)) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const invalidOrigin = origin && origin !== request.nextUrl.origin;
    const invalidReferer = !origin && referer && new URL(referer).origin !== request.nextUrl.origin;

    if (invalidOrigin || invalidReferer) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: { code: "CSRF_ERROR", message: "Cross-site request blocked" } },
          { status: 403 },
        ),
      );
    }
  }

  const response = NextResponse.next();
  if (!request.cookies.has("csrf-token")) {
    response.cookies.set("csrf-token", crypto.randomUUID(), {
      httpOnly: false,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    });
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
