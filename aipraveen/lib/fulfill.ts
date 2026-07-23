import { cookies } from "next/headers";
import { getProduct } from "./catalog";
import { resolveLineItem } from "./checkout";
import {
  upsertUserByEmail,
  recordPurchase,
  recordRenewal,
  recordCompetitionOrder,
  createSession,
} from "./data";
import { SESSION_COOKIE, sessionCookieOptions, getCurrentUser } from "./auth";

export interface FulfillInput {
  email: string;
  product?: string;
  renew?: string;
  competition?: string;
}

export interface FulfillOutcome {
  ok: boolean;
  error?: string;
  redirect?: string;
}

/**
 * Grant access after a (mock or verified) payment: create the order + a
 * one-year entitlement (or a renewal / competition entry) and sign the buyer
 * in. Shared by the dev-mock checkout action and the Razorpay verify route.
 */
export async function fulfillOrder(input: FulfillInput): Promise<FulfillOutcome> {
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

  const current = await getCurrentUser();
  const user = current ?? (await upsertUserByEmail(email));

  if (line.kind === "competition") {
    await recordCompetitionOrder(user.id, email, line.refId, line.title, line.amount);
  } else if (line.kind === "renewal") {
    await recordRenewal(user.id, email, getProduct(line.refId)!);
  } else {
    await recordPurchase(user.id, email, getProduct(line.refId)!);
  }

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
