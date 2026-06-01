import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { apiJson, assertSameOrigin, notFound, validateJson, withApiHandler } from "@/lib/server/api-response";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/server/logger";
import { sanitizeOptionalText, sanitizeText } from "@/lib/server/sanitize";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const privacySettingsSchema = z.object({
  profileVisibility: z.enum(["public", "team", "private"]).optional(),
  emailVisible: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  securityQuestion: z.string().max(240).optional(),
  securityAnswerHint: z.string().max(240).optional(),
}).strict();

type PrivacySettings = z.infer<typeof privacySettingsSchema>;

function safeParsePrivacySettings(raw: string | null | undefined): PrivacySettings {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const result = privacySettingsSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

const profileSchema = z.object({
  name: z.string().transform(sanitizeText).pipe(z.string().min(1).max(120)).optional(),
  image: z.string().transform(sanitizeText).pipe(z.string().url()).optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  bio: z.string().transform(sanitizeText).pipe(z.string().max(240)).optional(),
  phoneNumber: z.string().transform(sanitizeText).pipe(z.string().max(40)).optional(),
  privacySettings: privacySettingsSchema.optional(),
  themeAccent: z.string().transform(sanitizeText).pipe(z.string().max(20)).optional(),
  highContrast: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
});

/**
 * @openapi
 * /api/account/profile:
 *   get:
 *     summary: Get current user profile
 */
export const GET = withApiHandler(async function GET() {
  const currentUser = await getAuthenticatedUser();
  if (!currentUser) return unauthorized();

  const [record] = await db.select().from(user).where(eq(user.id, currentUser.id)).limit(1);
  if (!record) {
    notFound("Profile not found");
  }

  return apiJson({
    profile: {
      id: record.id,
      name: record.name,
      email: record.email,
      image: record.image,
      bio: record.bio,
      phoneNumber: record.phoneNumber,
      phoneVerified: record.phoneVerified,
      privacySettings: safeParsePrivacySettings(record.privacySettings),
      themeAccent: record.themeAccent,
      highContrast: record.highContrast,
      emailVerified: record.emailVerified,
      failedLoginAttempts: record.failedLoginAttempts,
      lockedUntil: record.lockedUntil,
      onboardingCompleted: record.onboardingCompleted,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
});

/**
 * @openapi
 * /api/account/profile:
 *   post:
 *     summary: Update user profile
 */
export const POST = withApiHandler(async function POST(request: Request) {
  assertSameOrigin(request);
  const currentUser = await getAuthenticatedUser();
  if (!currentUser) return unauthorized();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const limit = await checkRateLimit({ key: `profile:${currentUser.id}:${ip}`, limit: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return apiJson(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.resetSeconds),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  }

  const parsed = await validateJson(request, profileSchema);

  const privacySettings = parsed.privacySettings ? JSON.stringify(parsed.privacySettings) : undefined;
  const [updated] = await db
    .update(user)
    .set({
      ...(parsed.name ? { name: sanitizeText(parsed.name) } : {}),
      ...(parsed.image !== undefined ? { image: sanitizeOptionalText(parsed.image) || null } : {}),
      ...(parsed.bio !== undefined ? { bio: sanitizeText(parsed.bio) } : {}),
      ...(parsed.phoneNumber !== undefined ? { phoneNumber: sanitizeOptionalText(parsed.phoneNumber) || null } : {}),
      ...(privacySettings ? { privacySettings } : {}),
      ...(parsed.themeAccent ? { themeAccent: sanitizeText(parsed.themeAccent) } : {}),
      ...(parsed.highContrast !== undefined ? { highContrast: parsed.highContrast } : {}),
      ...(parsed.onboardingCompleted !== undefined ? { onboardingCompleted: parsed.onboardingCompleted } : {}),
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning();

  if (!updated) {
    notFound("Profile not found");
  }

  logger.info("profile updated", { userId: currentUser.id });

  return apiJson({
    profile: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      image: updated.image,
      bio: updated.bio,
      phoneNumber: updated.phoneNumber,
      phoneVerified: updated.phoneVerified,
      privacySettings: safeParsePrivacySettings(updated.privacySettings),
      themeAccent: updated.themeAccent,
      highContrast: updated.highContrast,
      emailVerified: updated.emailVerified,
      failedLoginAttempts: updated.failedLoginAttempts,
      lockedUntil: updated.lockedUntil,
      onboardingCompleted: updated.onboardingCompleted,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});
