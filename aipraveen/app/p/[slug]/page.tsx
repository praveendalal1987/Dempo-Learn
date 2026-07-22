import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/portfolio";
import { routes } from "@/lib/routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = getPublicProfile(slug);
  if (!profile) return { title: "Portfolio not found" };
  return {
    title: `${profile.name} — reviewed portfolio`,
    description: `${profile.name}: ${profile.line}. Every project personally reviewed and approved by Praveen Dalal.`,
  };
}

export default async function RecruiterView({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = getPublicProfile(slug);
  if (!profile) notFound();

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Navy top bar */}
      <div style={{ background: "var(--ink)", color: "#fff" }}>
        <div
          className="mono"
          style={{
            maxWidth: "var(--w-detail)",
            margin: "0 auto",
            padding: "14px 28px",
            fontSize: 10,
            letterSpacing: "0.16em",
            color: "var(--accent-on-navy)",
          }}
        >
          REVIEWED PORTFOLIO · AIPRAVEEN.COM
        </div>
      </div>

      {/* Profile */}
      <div style={{ maxWidth: "var(--w-detail)", margin: "0 auto", padding: "48px 28px 24px" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div
            className="display"
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--ink)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 650,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 className="display" style={{ fontWeight: 650, fontSize: 30, margin: "0 0 4px" }}>
              {profile.name}
            </h1>
            <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{profile.line}</div>
          </div>
          <a
            href="mailto:hello@aipraveen.com"
            className="plain"
            style={{ background: "var(--ink)", color: "#fff", borderRadius: "var(--r-card)", padding: "11px 20px", fontSize: 14, fontWeight: 600 }}
          >
            Contact
          </a>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {profile.skills.map((s) => (
            <span
              key={s}
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-chip)",
                padding: "5px 10px",
              }}
            >
              {s.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Trust banner */}
      <div style={{ maxWidth: "var(--w-detail)", margin: "0 auto", padding: "0 28px 24px" }}>
        <div
          style={{
            background: "var(--accent-tint)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--r-card)",
            padding: "14px 20px",
            fontSize: 13.5,
            color: "var(--ink)",
          }}
        >
          Every published project below was personally reviewed and approved by Praveen Dalal.
        </div>
      </div>

      {/* Projects */}
      <div style={{ maxWidth: "var(--w-detail)", margin: "0 auto", padding: "0 28px 40px", display: "flex", flexDirection: "column", gap: 22 }}>
        {profile.published.map((p) => (
          <div key={p.title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: "28px 32px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
              <h2 className="display" style={{ fontWeight: 650, fontSize: 20, margin: 0 }}>
                {p.title}
              </h2>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--accent)", whiteSpace: "nowrap" }}>
                {p.tag}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 16 }}>
              <Col label="PROBLEM" text={p.problem} />
              <Col label="BUILT" text={p.built} />
              <Col label="OUTCOME" text={p.outcome} />
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--success)" }}>
                REVIEWED BY PRAVEEN DALAL ✓
              </span>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--text-secondary)" }}>
                {p.date}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Hiring CTA */}
      <div style={{ maxWidth: "var(--w-detail)", margin: "0 auto", padding: "0 28px 80px" }}>
        <div style={{ textAlign: "center", padding: "32px", borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 14px" }}>
            Want to hire students who ship, or run a competition of your own?
          </p>
          <Link href={routes.companies} className="plain" style={{ background: "var(--ink)", color: "#fff", borderRadius: "var(--r-card)", padding: "11px 20px", fontSize: 14, fontWeight: 600 }}>
            For companies →
          </Link>
        </div>
      </div>
    </>
  );
}

function Col({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 8 }}>
        {label}
      </div>
      <p style={{ margin: 0, fontSize: 13.5 }}>{text}</p>
    </div>
  );
}
