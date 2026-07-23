import { NextResponse, type NextRequest } from "next/server";
import { verifyRazorpaySignature } from "@/lib/payments";
import { fulfillOrder } from "@/lib/fulfill";

/**
 * Called from the Razorpay success handler. Verifies the payment signature
 * server-side, then grants access via fulfillOrder. Never trust the client:
 * access is only granted if the signature checks out.
 */
export async function POST(req: NextRequest) {
  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    email?: string;
    product?: string;
    renew?: string;
    competition?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });
  }

  const valid = verifyRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  );
  if (!valid) {
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  const result = await fulfillOrder({
    email: body.email ?? "",
    product: body.product,
    renew: body.renew,
    competition: body.competition,
  });

  const status = result.ok ? 200 : 400;
  return NextResponse.json(result, { status });
}
