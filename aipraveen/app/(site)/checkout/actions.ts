"use server";

import { cookies } from "next/headers";
import { getProduct } from "@/lib/catalog";
import { resolveLineItem } from "@/lib/checkout";
import {
  upsertUserByEmail,
  recordPurchase,
  recordRenewal,
  recordCompetitionOrder,
  createSession,
} from "@/lib/data";
import { SESSION_COOKIE, sessionCookieOptions, getCurrentUser } from "@/lib/auth";

export interface CheckoutInput {
  email: string;
  product?: string;
  renew?: string;
  competition?: string;
  coupon?: string;
}

export interface CheckoutOutcome {
  ok: boolean;
  error?: string;
  /** Redirect target the client should navigate to on success. */
  redirect?: string;
}

/**
 * Dev/mock checkout: records a paid order + entitlement and signs the buyer
 * in (they just paid on this device). In production the Razorpay widget runs
 * first and this is only reached after signature verification.
 */
export async function completeCheckout(
  input: CheckoutInput,
): Promise<CheckoutOutcome> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email for your login and receipts." };
  }

  const line = resolveLineItem({
    product: input.product,
    renew: input.renew,
    competition: input.competition,
  });
  if (!line) return { ok: false, error: "That item is no longer available." };

  // Attach to the logged-in user if any, else create/find by email.
  const current = await getCurrentUser();
  const user = current ?? (await upsertUserByEmail(email));

  if (line.kind === "competition") {
    await recordCompetitionOrder(user.id, email, line.refId, line.title, line.amount);
  } else if (line.kind === "renewal") {
    await recordRenewal(user.id, email, getProduct(line.refId)!);
  } else {
    await recordPurchase(user.id, email, getProduct(line.refId)!);
  }

  // Sign the buyer in if they weren't already.
  if (!current) {
    const token = await createSession(user.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions);
  }

  const q = new URLSearchParams();
  if (line.kind === "competition") q.set("competition", line.refId);
  else q.set("product", line.slug!);
  if (line.kind === "renewal") q.set("renewed", "1");

  return { ok: true, redirect: `/checkout/success?${q.toString()}` };
}
