import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments";

/**
 * Razorpay webhook. Verifies the signature and would reconcile order state
 * (payment captured / failed / refunded) against the store. Active only when
 * RAZORPAY_WEBHOOK_SECRET is set; in dev the mock checkout path is used instead.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const body = await req.text();

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as { event: string };
  switch (event.event) {
    case "payment.captured":
      // reconcile: mark order paid + ensure entitlement (idempotent)
      break;
    case "payment.failed":
      // mark order failed
      break;
    case "refund.processed":
      // mark order refunded + revoke entitlement
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
