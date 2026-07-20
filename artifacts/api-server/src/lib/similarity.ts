import { eq, or } from "drizzle-orm";
import {
  db,
  submissionsTable,
  submissionSimilaritiesTable,
} from "@workspace/db";
import { logger } from "./logger";

/** Pairs below this score (0-100) are not stored/flagged. */
export const SIMILARITY_FLAG_THRESHOLD = 40;

/** Word 3-shingles of a normalized text. */
function shingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i < words.length - 2; i++) {
    set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  if (set.size === 0 && words.length > 0) {
    words.forEach((w) => set.add(w));
  }
  return set;
}

/** Jaccard similarity between two texts as a 0-100 percentage. */
export function computePairSimilarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const s of sa) {
    if (sb.has(s)) intersection++;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

/** A [start, end) character range within a text. */
export interface HighlightRange {
  start: number;
  end: number;
}

/** Tokenize into lowercase alphanumeric words, keeping character offsets. */
function tokenizeWithOffsets(
  text: string,
): { word: string; start: number; end: number }[] {
  const tokens: { word: string; start: number; end: number }[] = [];
  const re = /[a-zA-Z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

const SHINGLE_SIZE = 3;

/**
 * Character ranges in both texts covered by shared word 3-shingles. Uses the
 * same shingling scheme as computePairSimilarity so highlights reflect the
 * stored score.
 */
export function computeMatchedRanges(
  a: string,
  b: string,
): { aRanges: HighlightRange[]; bRanges: HighlightRange[] } {
  const ta = tokenizeWithOffsets(a);
  const tb = tokenizeWithOffsets(b);

  // Mirror computePairSimilarity's short-text fallback: when either text has
  // fewer tokens than a full shingle, compare single words so highlights stay
  // consistent with the reported score.
  const size =
    ta.length < SHINGLE_SIZE || tb.length < SHINGLE_SIZE ? 1 : SHINGLE_SIZE;

  const shinglesOf = (tokens: { word: string }[]): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= tokens.length - size; i++) {
      set.add(
        tokens
          .slice(i, i + size)
          .map((t) => t.word)
          .join(" "),
      );
    }
    return set;
  };

  const sa = shinglesOf(ta);
  const sb = shinglesOf(tb);
  const common = new Set<string>();
  for (const s of sa) if (sb.has(s)) common.add(s);

  const rangesFor = (
    tokens: { word: string; start: number; end: number }[],
  ): HighlightRange[] => {
    const marked = new Array<boolean>(tokens.length).fill(false);
    for (let i = 0; i <= tokens.length - size; i++) {
      const key = tokens
        .slice(i, i + size)
        .map((t) => t.word)
        .join(" ");
      if (common.has(key)) {
        for (let k = i; k < i + size; k++) marked[k] = true;
      }
    }
    const ranges: HighlightRange[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (!marked[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < tokens.length && marked[j + 1]) j++;
      ranges.push({ start: tokens[i].start, end: tokens[j].end });
      i = j + 1;
    }
    return ranges;
  };

  return { aRanges: rangesFor(ta), bRanges: rangesFor(tb) };
}

/**
 * Recompute all pairwise similarities for an assignment's text submissions and
 * store pairs at or above the flag threshold. Best-effort: callers should not
 * let a failure here block submission creation.
 */
export async function recomputeAssignmentSimilarities(
  assignmentId: number,
): Promise<number> {
  const submissions = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.assignmentId, assignmentId));

  const withText = submissions.filter(
    (s) => !!s.textResponse && s.textResponse.trim().length > 0,
  );

  const pairs: {
    assignmentId: number;
    submissionAId: number;
    submissionBId: number;
    score: number;
  }[] = [];

  for (let i = 0; i < withText.length; i++) {
    for (let j = i + 1; j < withText.length; j++) {
      const a = withText[i];
      const b = withText[j];
      // Ignore multiple submissions from the same student.
      if (a.studentId === b.studentId) continue;
      const score = computePairSimilarity(a.textResponse!, b.textResponse!);
      if (score >= SIMILARITY_FLAG_THRESHOLD) {
        pairs.push({
          assignmentId,
          submissionAId: Math.min(a.id, b.id),
          submissionBId: Math.max(a.id, b.id),
          score,
        });
      }
    }
  }

  // Preserve teacher dismissals across re-runs: remember which submission
  // pairs were dismissed before wiping and re-apply on the fresh rows.
  const existing = await db
    .select()
    .from(submissionSimilaritiesTable)
    .where(eq(submissionSimilaritiesTable.assignmentId, assignmentId));
  const dismissedByPair = new Map<string, Date>();
  for (const p of existing) {
    if (p.dismissedAt) {
      dismissedByPair.set(`${p.submissionAId}:${p.submissionBId}`, p.dismissedAt);
    }
  }

  await db
    .delete(submissionSimilaritiesTable)
    .where(eq(submissionSimilaritiesTable.assignmentId, assignmentId));
  if (pairs.length > 0) {
    await db.insert(submissionSimilaritiesTable).values(
      pairs.map((p) => ({
        ...p,
        dismissedAt:
          dismissedByPair.get(`${p.submissionAId}:${p.submissionBId}`) ?? null,
      })),
    );
  }
  return pairs.length;
}

/** Best-effort variant used on submission creation. */
export async function recomputeAssignmentSimilaritiesSafe(
  assignmentId: number,
): Promise<void> {
  try {
    await recomputeAssignmentSimilarities(assignmentId);
  } catch (err) {
    logger.error({ err, assignmentId }, "Similarity computation failed");
  }
}

/** All stored similarity pairs involving one submission. */
export async function getSimilaritiesForSubmission(submissionId: number) {
  return db
    .select()
    .from(submissionSimilaritiesTable)
    .where(
      or(
        eq(submissionSimilaritiesTable.submissionAId, submissionId),
        eq(submissionSimilaritiesTable.submissionBId, submissionId),
      ),
    );
}

/** All stored similarity pairs for an assignment. */
export async function getSimilaritiesForAssignment(assignmentId: number) {
  return db
    .select()
    .from(submissionSimilaritiesTable)
    .where(eq(submissionSimilaritiesTable.assignmentId, assignmentId));
}
