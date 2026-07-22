/**
 * Portfolio data. Demo content transcribed from the prototype; in production
 * these come from the portfolio_projects table keyed by user. `getPortfolio`
 * returns the demo learner's set, and `getPublicProfile` powers the public
 * recruiter view at /p/[slug].
 */

export type PortfolioStatus =
  | "PUBLISHED"
  | "FEEDBACK RECEIVED"
  | "IN REVIEW"
  | "DRAFT";

export interface PortfolioItem {
  src: string;
  title: string;
  note: string;
  status: PortfolioStatus;
  hasFeedback: boolean;
  isDraft: boolean;
}

export interface PublicProject {
  title: string;
  tag: string;
  date: string;
  problem: string;
  built: string;
  outcome: string;
}

export interface Profile {
  slug: string;
  name: string;
  email: string;
  line: string;
  skills: string[];
  owned: PortfolioItem[];
  published: PublicProject[];
}

export function statusChip(status: PortfolioStatus): {
  color: string;
  border: string;
  bg: string;
} {
  switch (status) {
    case "PUBLISHED":
      return { color: "var(--success)", border: "var(--success-border)", bg: "var(--success-bg)" };
    case "FEEDBACK RECEIVED":
      return { color: "var(--accent)", border: "var(--accent-border)", bg: "var(--accent-tint)" };
    case "IN REVIEW":
      return { color: "var(--text-secondary)", border: "var(--border)", bg: "var(--muted-fill)" };
    default:
      return { color: "var(--text-secondary)", border: "var(--border)", bg: "transparent" };
  }
}

const ASHA: Profile = {
  slug: "asha-menon",
  name: "Asha Menon",
  email: "asha.menon@gmail.com",
  line: "MBA candidate, Pune · builds AI tools that ship",
  skills: [
    "Prompting & spec-writing",
    "No-code AI builds",
    "Data storytelling",
    "Workflow automation",
  ],
  owned: [
    {
      src: "PR-003 · MARKETING",
      title: "Review-to-insight digest",
      note: "Live on your public portfolio since 02 Jul 2026",
      status: "PUBLISHED",
      hasFeedback: false,
      isDraft: false,
    },
    {
      src: "PR-022 · OPERATIONS",
      title: "Tiffin-service WhatsApp order-taker",
      note: "1 note from Praveen — fix the menu-mismatch case, then resubmit",
      status: "FEEDBACK RECEIVED",
      hasFeedback: true,
      isDraft: false,
    },
    {
      src: "PR-031 · HR",
      title: "Resume screener that explains itself",
      note: "Submitted 18 Jul · reviews take about 5 days",
      status: "IN REVIEW",
      hasFeedback: false,
      isDraft: false,
    },
    {
      src: "COMPETITION · CAMPUS FINTECH SPRINT",
      title: "Sprint entry — GST notice explainer",
      note: "Deadline 30 Sep 2026 · entry registered",
      status: "DRAFT",
      hasFeedback: false,
      isDraft: true,
    },
  ],
  published: [
    {
      title: "Review-to-insight digest",
      tag: "PR-003 · MARKETING",
      date: "PUBLISHED JUL 2026",
      problem: "A D2C brand drowning in 300+ weekly reviews nobody read.",
      built:
        "An AI pipeline that clusters reviews and writes a one-page weekly digest with linked evidence.",
      outcome:
        "Adopted by the brand for its Monday standup; response time to product issues dropped from weeks to days.",
    },
    {
      title: "Studio Course capstone — approval tracker",
      tag: "CAPSTONE · REVIEWED",
      date: "PUBLISHED MAY 2026",
      problem: "Student club reimbursements ran on forwarded emails and took a month.",
      built:
        "A role-based approval tool with an audit trail, built end-to-end with AI assistance.",
      outcome: "In live use by 3 college clubs; average reimbursement time now 4 days.",
    },
  ],
};

const PROFILES: Record<string, Profile> = { "asha-menon": ASHA };

/** The signed-in owner's portfolio (demo maps the seeded learner). */
export function getPortfolio(email: string): Profile {
  const found = Object.values(PROFILES).find((p) => p.email === email);
  return found ?? { ...ASHA, owned: [], published: [], email, name: email };
}

export function getPublicProfile(slug: string): Profile | null {
  return PROFILES[slug] ?? null;
}
