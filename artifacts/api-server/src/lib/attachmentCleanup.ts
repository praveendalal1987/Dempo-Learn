import {
  db,
  assignmentsTable,
  courseMaterialsTable,
  submissionsTable,
} from '@workspace/db';
import { sql } from 'drizzle-orm';

import { ObjectNotFoundError, ObjectStorageService } from './objectStorage';

type MinimalLogger = {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Whether any database record (assignment attachment, course material
 * attachment, or submission file) still references the given object path.
 */
export async function isObjectPathReferenced(
  objectPath: string,
): Promise<boolean> {
  const result = await db.execute<{ referenced: boolean }>(sql`
    SELECT
      EXISTS (
        SELECT 1 FROM ${assignmentsTable},
          jsonb_array_elements(${assignmentsTable.attachments}) elem
        WHERE elem->>'path' = ${objectPath}
      )
      OR EXISTS (
        SELECT 1 FROM ${courseMaterialsTable},
          jsonb_array_elements(${courseMaterialsTable.attachments}) elem
        WHERE elem->>'path' = ${objectPath}
      )
      OR EXISTS (
        SELECT 1 FROM ${submissionsTable},
          jsonb_array_elements(${submissionsTable.files}) elem
        WHERE elem->>'path' = ${objectPath}
      ) AS referenced
  `);
  return Boolean(result.rows[0]?.referenced);
}

/**
 * Best-effort deletion of object-storage files that are no longer referenced
 * by any database record. Call this AFTER the referencing rows have been
 * deleted/updated. Paths still referenced elsewhere are left untouched.
 * Never throws — storage cleanup must not break the user-facing operation.
 */
export async function cleanupUnreferencedObjects(
  objectPaths: string[],
  log?: MinimalLogger,
): Promise<void> {
  const uniquePaths = Array.from(new Set(objectPaths)).filter((p) =>
    p.startsWith('/objects/'),
  );
  if (uniquePaths.length === 0) return;

  const objectStorageService = new ObjectStorageService();

  for (const objectPath of uniquePaths) {
    try {
      if (await isObjectPathReferenced(objectPath)) continue;

      const file = await objectStorageService.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        // Already gone — nothing to clean up.
        continue;
      }
      log?.error(
        { err: error, objectPath },
        'Failed to clean up unreferenced object',
      );
    }
  }
}
