import { db, activityLogsTable, type User } from "@workspace/db";
import { lt } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Retention window for activity logs, in days. Rows older than this are
 * pruned automatically. Configurable via ACTIVITY_LOG_RETENTION_DAYS
 * (default: 90). Set to 0 or a negative/invalid value to fall back to 90.
 */
function getRetentionDays(): number {
  const raw = process.env["ACTIVITY_LOG_RETENTION_DAYS"];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

/** Minimum interval between prune attempts (per process). */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastPruneAt = 0;
let pruneInFlight = false;

/**
 * Deletes activity log rows older than the retention window. Throttled so it
 * runs at most once per hour per process, and never throws.
 */
export async function pruneOldActivityLogs(): Promise<void> {
  if (pruneInFlight) return;
  pruneInFlight = true;
  try {
    const retentionDays = getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(activityLogsTable)
      .where(lt(activityLogsTable.createdAt, cutoff))
      .returning({ id: activityLogsTable.id });
    if (deleted.length > 0) {
      logger.info(
        { deletedCount: deleted.length, retentionDays },
        "Pruned old activity logs",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to prune old activity logs");
  } finally {
    pruneInFlight = false;
  }
}

/** Fire-and-forget prune, throttled to once per PRUNE_INTERVAL_MS. */
function maybePruneOldActivityLogs(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  void pruneOldActivityLogs();
}

export type ActivityLevel = "info" | "warn" | "error";

interface LogActivityInput {
  user?: Pick<User, "id" | "email"> | null;
  userId?: string | null;
  userEmail?: string | null;
  level?: ActivityLevel;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records a structured activity/audit event in the database (for the admin
 * logs view) and mirrors it to pino. Never throws — activity logging must not
 * break the request that triggered it.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  const userId = input.user?.id ?? input.userId ?? null;
  const userEmail = input.user?.email ?? input.userEmail ?? null;
  const level = input.level ?? "info";
  try {
    await db.insert(activityLogsTable).values({
      userId,
      userEmail,
      level,
      action: input.action,
      message: input.message,
      metadata: input.metadata ?? null,
    });
    logger[level === "warn" ? "warn" : level === "error" ? "error" : "info"](
      { userId, action: input.action, ...input.metadata },
      input.message,
    );
  } catch (err) {
    logger.error({ err, action: input.action }, "Failed to write activity log");
  }
  // Opportunistic retention cleanup: piggybacks on log writes so no separate
  // scheduler is needed; throttled to at most once per hour per process.
  maybePruneOldActivityLogs();
}
