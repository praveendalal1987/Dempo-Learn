import type { Metadata } from "next";
import Link from "next/link";
import { Container, Chip } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPortfolio, statusChip } from "@/lib/portfolio";
import { routes } from "@/lib/routes";
import { CopyLink } from "@/components/copy-link";

export const metadata: Metadata = { title: "Your portfolio" };

export default async function PortfolioPage() {
  const user = await requireUser(routes.portfolio);
  const profile = getPortfolio(user.email);
  const shareUrl = `aipraveen.com/p/${profile.slug}`;

  return (
    <Container max="detail" style={{ padding: "40px 28px 80px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <h1 className="display" style={{ fontWeight: 650, fontSize: 30, margin: 0 }}>
          Your portfolio
        </h1>
        <Link href={routes.recruiter(profile.slug)} style={{ fontSize: 13.5, fontWeight: 600 }}>
          View as a recruiter →
        </Link>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 18px" }}>
        Published projects appear on your public, recruiter-facing page. Every one is personally reviewed before it goes
        live.
      </p>

      <div style={{ maxWidth: 520, marginBottom: 32 }}>
        <CopyLink url={shareUrl} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {profile.owned.map((p) => {
          const chip = statusChip(p.status);
          return (
            <div
              key={p.title}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-card)",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 260 }}>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>
                  {p.src}
                </div>
                <div className="display" style={{ fontWeight: 650, fontSize: 17, marginBottom: 4 }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{p.note}</div>
              </div>
              <Chip color={chip.color} border={chip.border} bg={chip.bg}>
                {p.status}
              </Chip>
              <div>
                {p.status === "DRAFT" && <ActionButton>Submit for review</ActionButton>}
                {p.hasFeedback && <ActionButton>View feedback</ActionButton>}
              </div>
            </div>
          );
        })}

        <Link
          href={routes.practice}
          className="plain"
          style={{
            border: "1px dashed var(--border)",
            borderRadius: "var(--r-card)",
            padding: "20px 24px",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Add a project from the practice library
        </Link>
      </div>
    </Container>
  );
}

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      style={{
        background: "transparent",
        color: "var(--ink)",
        border: "1px solid var(--ink)",
        borderRadius: "var(--r-card)",
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
