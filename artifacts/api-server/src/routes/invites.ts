import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db, appInvitesTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logActivity } from "../lib/activityLog";
import { sendInviteEmail } from "../lib/email";

const router: IRouter = Router();

function inviteUrl(token: string): string {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${base}/sign-up?invite=${token}`;
}

// GET /admin/invites — list the allow-list (pending + accepted)
router.get(
  "/admin/invites",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(appInvitesTable)
      .orderBy(desc(appInvitesTable.createdAt));
    res.json(rows.map((r) => ({ ...r, inviteUrl: inviteUrl(r.token) })));
  },
);

// POST /admin/invites — add (invite) a user by email + role; best-effort email
const createSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["student", "teacher"]).default("student"),
});

router.post(
  "/admin/invites",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const admin = req.localUser!;
    const email = parsed.data.email.toLowerCase();
    const name = parsed.data.name?.trim() || null;
    const role = parsed.data.role;

    const [alreadyUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    const [existing] = await db
      .select()
      .from(appInvitesTable)
      .where(eq(appInvitesTable.email, email));

    let invite;
    if (existing) {
      [invite] = await db
        .update(appInvitesTable)
        .set({ name: name ?? existing.name, role })
        .where(eq(appInvitesTable.id, existing.id))
        .returning();
    } else {
      [invite] = await db
        .insert(appInvitesTable)
        .values({
          email,
          name,
          role,
          token: randomUUID(),
          invitedBy: admin.id,
          invitedByEmail: admin.email,
        })
        .returning();
    }

    void logActivity({
      user: admin,
      action: "invite.created",
      message: `Invited ${email} as ${role}`,
      metadata: { email, role },
    });
    void sendInviteEmail({
      email,
      name: invite.name,
      inviterName: admin.name,
      role,
      inviteUrl: inviteUrl(invite.token),
    });

    res.status(201).json({
      invite: { ...invite, inviteUrl: inviteUrl(invite.token) },
      alreadyRegistered: !!alreadyUser,
    });
  },
);

// POST /admin/invites/:id/resend — re-send the invite email
router.post(
  "/admin/invites/:id/resend",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const [invite] = await db
      .select()
      .from(appInvitesTable)
      .where(eq(appInvitesTable.id, id));
    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    void sendInviteEmail({
      email: invite.email,
      name: invite.name,
      inviterName: req.localUser!.name,
      role: invite.role,
      inviteUrl: inviteUrl(invite.token),
    });
    res.json({ ok: true, inviteUrl: inviteUrl(invite.token) });
  },
);

// DELETE /admin/invites/:id — revoke an invite (removes them from the allow-list)
router.delete(
  "/admin/invites/:id",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await db.delete(appInvitesTable).where(eq(appInvitesTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
