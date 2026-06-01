import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { billingProfile, billingTransaction } from "@/db/schema";
import { getErrorMessage, isMissingTableError } from "@/lib/server/db-resilience";
import {
  addFallbackBillingTransaction,
  getFallbackBillingProfile,
  getFallbackBillingTransactions,
  saveFallbackBillingProfile,
} from "@/lib/server/fallback-persistence";
import { getAuthenticatedUser, unauthorized } from "@/lib/server/session";

const actionSchema = z.object({
  action: z.enum(["switch_plan", "refill", "consume_pro_call", "outcome_bonus"]),
  plan: z.enum(["basic", "scale"]).optional(),
  credits: z.number().int().min(1).max(10000).optional(),
  amountCents: z.number().int().min(0).max(1_000_000).optional(),
  note: z.string().trim().max(240).optional(),
});

function popupNeeded(used: number, included: number) {
  if (included <= 0) return false;
  return used / included >= 0.9;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    let [profile] = await db.select().from(billingProfile).where(eq(billingProfile.userId, user.id)).limit(1);
    if (!profile) {
      [profile] = await db.insert(billingProfile).values({ id: crypto.randomUUID(), userId: user.id }).returning();
    }

    const transactions = await db
      .select({
        id: billingTransaction.id,
        type: billingTransaction.type,
        credits: billingTransaction.credits,
        amountCents: billingTransaction.amountCents,
        note: billingTransaction.note,
        createdAt: billingTransaction.createdAt,
      })
      .from(billingTransaction)
      .where(eq(billingTransaction.userId, user.id))
      .orderBy(desc(billingTransaction.createdAt))
      .limit(20);

    return NextResponse.json({
      profile,
      transactions,
      refillPopup: popupNeeded(profile.proCallsUsed, profile.proCallsIncluded),
      tiers: {
        basic: "$20/mo + 100 Pro calls",
        scale: "$100/mo + unlimited Standard calls",
      },
      storage: "database",
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    const profile = getFallbackBillingProfile(user.id);
    return NextResponse.json({
      profile,
      transactions: getFallbackBillingTransactions(user.id),
      refillPopup: popupNeeded(profile.proCallsUsed, profile.proCallsIncluded),
      tiers: {
        basic: "$20/mo + 100 Pro calls",
        scale: "$100/mo + unlimited Standard calls",
      },
      storage: "fallback_memory",
    });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid billing action payload" }, { status: 400 });
  }

  try {
    let [profile] = await db.select().from(billingProfile).where(eq(billingProfile.userId, user.id)).limit(1);
    if (!profile) {
      [profile] = await db.insert(billingProfile).values({ id: crypto.randomUUID(), userId: user.id }).returning();
    }

    if (parsed.data.action === "switch_plan") {
      const nextPlan = parsed.data.plan ?? "basic";
      const monthlyFeeCents = nextPlan === "scale" ? 10000 : 2000;
      const standardUnlimited = nextPlan === "scale";
      const proCallsIncluded = nextPlan === "scale" ? 300 : 100;
      [profile] = await db
        .update(billingProfile)
        .set({ plan: nextPlan, monthlyFeeCents, standardUnlimited, proCallsIncluded, updatedAt: new Date() })
        .where(eq(billingProfile.userId, user.id))
        .returning();
      if (!profile) throw new Error("Failed to update billing profile");
    }

    if (parsed.data.action === "refill") {
      const credits = parsed.data.credits ?? 50;
      const amountCents = parsed.data.amountCents ?? 500;
      [profile] = await db
        .update(billingProfile)
        .set({ creditsRemaining: profile.creditsRemaining + credits, updatedAt: new Date() })
        .where(eq(billingProfile.userId, user.id))
        .returning();
      if (!profile) throw new Error("Failed to update billing profile");
      await db.insert(billingTransaction).values({
        id: crypto.randomUUID(),
        userId: user.id,
        type: "refill",
        credits,
        amountCents,
        note: parsed.data.note ?? "Credit refill",
      });
    }

    if (parsed.data.action === "consume_pro_call") {
      [profile] = await db
        .update(billingProfile)
        .set({
          proCallsUsed: profile.proCallsUsed + 1,
          creditsRemaining: Math.max(0, profile.creditsRemaining - 1),
          updatedAt: new Date(),
        })
        .where(eq(billingProfile.userId, user.id))
        .returning();
      if (!profile) throw new Error("Failed to update billing profile");
    }

    if (parsed.data.action === "outcome_bonus") {
      const amountCents = parsed.data.amountCents ?? 250;
      await db.insert(billingTransaction).values({
        id: crypto.randomUUID(),
        userId: user.id,
        type: "success_fee",
        credits: 0,
        amountCents,
        note: parsed.data.note ?? "Outcome-based bonus",
      });
    }

    return NextResponse.json({ profile, refillPopup: popupNeeded(profile.proCallsUsed, profile.proCallsIncluded), storage: "database" });
  } catch (error) {
    if (!isMissingTableError(error)) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    let profile = getFallbackBillingProfile(user.id);

    if (parsed.data.action === "switch_plan") {
      const nextPlan = parsed.data.plan ?? "basic";
      profile = saveFallbackBillingProfile(user.id, {
        plan: nextPlan,
        monthlyFeeCents: nextPlan === "scale" ? 10000 : 2000,
        standardUnlimited: nextPlan === "scale",
        proCallsIncluded: nextPlan === "scale" ? 300 : 100,
      });
    }

    if (parsed.data.action === "refill") {
      const credits = parsed.data.credits ?? 50;
      const amountCents = parsed.data.amountCents ?? 500;
      profile = saveFallbackBillingProfile(user.id, { creditsRemaining: profile.creditsRemaining + credits });
      addFallbackBillingTransaction({
        id: crypto.randomUUID(),
        userId: user.id,
        type: "refill",
        credits,
        amountCents,
        note: parsed.data.note ?? "Credit refill",
        createdAt: new Date().toISOString(),
      });
    }

    if (parsed.data.action === "consume_pro_call") {
      profile = saveFallbackBillingProfile(user.id, {
        proCallsUsed: profile.proCallsUsed + 1,
        creditsRemaining: Math.max(0, profile.creditsRemaining - 1),
      });
    }

    if (parsed.data.action === "outcome_bonus") {
      addFallbackBillingTransaction({
        id: crypto.randomUUID(),
        userId: user.id,
        type: "success_fee",
        credits: 0,
        amountCents: parsed.data.amountCents ?? 250,
        note: parsed.data.note ?? "Outcome-based bonus",
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ profile, refillPopup: popupNeeded(profile.proCallsUsed, profile.proCallsIncluded), storage: "fallback_memory" });
  }
}
