"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui";
import { fieldStyle, primaryButtonStyle } from "@/components/form";
import { formatINR } from "@/lib/format";
import type { LineItem } from "@/lib/checkout";
import { completeCheckout } from "@/app/(site)/checkout/actions";

export function CheckoutClient({
  line,
  prefillEmail,
  query,
  razorpayConfigured,
}: {
  line: LineItem;
  prefillEmail: string;
  query: { product?: string; renew?: string; competition?: string };
  razorpayConfigured: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(prefillEmail);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    // In production, the Razorpay widget would run here first, then on a
    // verified payment we'd call completeCheckout. Without keys we go straight
    // to the mock completion.
    const res = await completeCheckout({ email, coupon, ...query });
    if (res.ok && res.redirect) {
      router.push(res.redirect);
    } else {
      setError(res.error ?? "Payment could not be completed.");
      setBusy(false);
    }
  }

  const payLabel = line.isFree
    ? "Get free access"
    : `Pay ${formatINR(line.amount)}`;

  return (
    <Container max="checkout" style={{ padding: "64px 28px 96px" }}>
      <h1 className="display" style={{ fontWeight: 650, fontSize: 30, letterSpacing: "-0.02em", margin: "0 0 24px" }}>
        Checkout
      </h1>

      {/* Order summary */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-card)",
          padding: 22,
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--r-card)",
            background: line.thumbBg,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{line.title}</div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "var(--text-secondary)", marginTop: 4 }}>
            {line.accessLine}
          </div>
        </div>
        <div className="display" style={{ fontWeight: 650, fontSize: 20, color: "var(--accent)" }}>
          {line.isFree ? "Free" : formatINR(line.amount)}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void pay();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Email</span>
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldStyle}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Your login and receipts go here.
          </span>
        </label>

        {!line.isFree && (
          <input
            placeholder="Coupon code (optional)"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            style={fieldStyle}
          />
        )}

        {error && <div style={{ color: "var(--error)", fontSize: 13 }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Processing…" : payLabel}
        </button>
      </form>

      <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: "16px 0 0" }}>
        {line.isFree
          ? "No card needed — we email you a magic link to sign in."
          : razorpayConfigured
            ? "Secured by Razorpay — UPI, cards, netbanking."
            : "Test mode — no real charge (Razorpay keys not configured)."}
      </p>
      {!line.isFree && line.kind !== "competition" && (
        <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: "6px 0 0" }}>
          7-day refund on courses, no questions asked.
        </p>
      )}
    </Container>
  );
}
