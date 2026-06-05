import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob: data:",
    "frame-ancestors 'none'",
  ].join("; "),
};

const RATE_LIMIT_MAX = 120;

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

async function checkApiRateLimit(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;

  const { checkRateLimit } = await import("@/lib/server/rate-limit");
  const limit = await checkRateLimit({
    key: `middleware:${getClientIp(request)}:${request.nextUrl.pathname}`,
    limit: RATE_LIMIT_MAX,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.resetSeconds),
        },
      },
    );
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request);
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
