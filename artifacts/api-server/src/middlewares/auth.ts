import { type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, teacherInvitesTable, type User } from "@workspace/db";
import { logActivity } from "../lib/activityLog";

// Emails that are automatically provisioned as teacher + admin.
const ADMIN_EMAILS = new Set(["pravendalal@gmail.com"]);

function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.trim().toLowerCase());
}

// Extend Express Request with our resolved local user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      localUser?: User;
    }
  }
}

/**
 * Deletes a pending teacher invite matching the email (case-insensitive) and
 * returns whether one existed.
 */
async function consumeTeacherInvite(
  email: string | null | undefined,
): Promise<boolean> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const deleted = await db
    .delete(teacherInvitesTable)
    .where(eq(teacherInvitesTable.email, normalized))
    .returning();
  return deleted.length > 0;
}

/**
 * Requires a valid Clerk session and JIT-provisions a local user row keyed by
 * the Clerk user id. Attaches req.userId and req.localUser.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    // Fetch profile details from Clerk to seed the local row.
    let email = "";
    let name: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        "";
      const fullName = [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      name = fullName || clerkUser.username || null;
      avatarUrl = clerkUser.imageUrl ?? null;
    } catch (err) {
      req.log.warn({ err }, "Failed to fetch Clerk user for provisioning");
    }

    const admin = isAdminEmail(email);
    // An admin-created teacher invite provisions this account as a teacher
    // automatically (no role self-selection).
    const invitedTeacher = !admin && (await consumeTeacherInvite(email));
    [user] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email,
        name,
        avatarUrl,
        // Admins are auto-assigned the teacher role (no role picker needed).
        role: admin || invitedTeacher ? "teacher" : "unassigned",
        isAdmin: admin,
      })
      .onConflictDoNothing()
      .returning();

    if (!user) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId));
    } else {
      void logActivity({
        user,
        action: invitedTeacher ? "teacher.invite_redeemed" : "auth.provisioned",
        message: admin
          ? `New user provisioned as teacher + admin: ${email}`
          : invitedTeacher
            ? `Invited teacher signed in and was provisioned as teacher: ${email}`
            : `New user provisioned: ${email || userId}`,
        metadata: { role: user.role, isAdmin: user.isAdmin },
      });
    }
  } else if (user.role === "unassigned" && !isAdminEmail(user.email)) {
    // A user who signed in before picking a role: honor a pending teacher
    // invite created for their email.
    if (await consumeTeacherInvite(user.email)) {
      const [upgraded] = await db
        .update(usersTable)
        .set({ role: "teacher" })
        .where(eq(usersTable.id, userId))
        .returning();
      if (upgraded) {
        user = upgraded;
        void logActivity({
          user,
          action: "teacher.invite_redeemed",
          message: `Pending teacher invite applied to ${user.email}`,
          metadata: { role: user.role },
        });
      }
    }
  } else if (isAdminEmail(user.email) && (!user.isAdmin || user.role === "unassigned")) {
    // Upgrade an existing designated-admin account that predates the flag.
    const [upgraded] = await db
      .update(usersTable)
      .set({
        isAdmin: true,
        role: user.role === "unassigned" ? "teacher" : user.role,
      })
      .where(eq(usersTable.id, userId))
      .returning();
    if (upgraded) {
      user = upgraded;
      void logActivity({
        user,
        action: "user.admin_granted",
        message: `Admin privileges granted to ${user.email}`,
        metadata: { role: user.role },
      });
    }
  }

  req.userId = userId;
  req.localUser = user;
  next();
}

/**
 * Requires the authenticated local user to be an admin. Must run after
 * requireAuth.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.localUser?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
