/** Presentation helpers for portfolio projects. Data lives in lib/data.ts. */
import type { ProjectStatus } from "./data";

export function projectStatusChip(status: ProjectStatus): {
  label: string;
  color: string;
  border: string;
  bg: string;
} {
  if (status === "published") {
    return {
      label: "PUBLISHED",
      color: "var(--success)",
      border: "var(--success-border)",
      bg: "var(--success-bg)",
    };
  }
  return {
    label: "IN REVIEW",
    color: "var(--text-secondary)",
    border: "var(--border)",
    bg: "var(--muted-fill)",
  };
}
