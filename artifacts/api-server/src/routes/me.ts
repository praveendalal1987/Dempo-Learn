import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  GetTeacherProfileResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activityLog";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  res.json(GetMeResponse.parse(req.localUser));
});

router.patch("/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;

  // Role is self-selectable ONLY as the initial choice by a brand-new
  // (unassigned) user, and ONLY to "student". Teacher is invite-only
  // (see middlewares/auth.ts), so it can never be self-granted here. This
  // closes a privilege-escalation hole where any user could PATCH /me with
  // {"role":"teacher"} to promote themselves.
  if (
    parsed.data.role !== undefined &&
    parsed.data.role !== req.localUser!.role
  ) {
    if (req.localUser!.role !== "unassigned" || parsed.data.role !== "student") {
      res.status(403).json({
        error: "Role cannot be changed here.",
      });
      return;
    }
    updates.role = parsed.data.role;
  }

  const hasProfileFields =
    parsed.data.bio !== undefined ||
    parsed.data.title !== undefined ||
    parsed.data.linkedinUrl !== undefined;

  if (hasProfileFields) {
    if (req.localUser?.role !== "teacher") {
      res.status(403).json({ error: "Only professors can edit profile fields" });
      return;
    }
    if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio || null;
    if (parsed.data.title !== undefined) updates.title = parsed.data.title || null;
    if (parsed.data.linkedinUrl !== undefined) {
      const raw = (parsed.data.linkedinUrl || "").trim();
      if (raw === "") {
        updates.linkedinUrl = null;
      } else {
        let valid = false;
        try {
          const url = new URL(raw);
          valid =
            (url.protocol === "https:" || url.protocol === "http:") &&
            /(^|\.)linkedin\.com$/i.test(url.hostname);
        } catch {
          valid = false;
        }
        if (!valid) {
          res.status(400).json({
            error:
              "Invalid LinkedIn URL. Use a link like https://www.linkedin.com/in/your-name",
          });
          return;
        }
        updates.linkedinUrl = raw;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(UpdateMeResponse.parse(req.localUser));
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (parsed.data.role !== undefined && parsed.data.role !== req.localUser!.role) {
    void logActivity({
      user: req.localUser!,
      action: "user.role_changed",
      message: `${req.localUser!.email || req.userId} changed role from ${req.localUser!.role} to ${parsed.data.role}`,
      metadata: { from: req.localUser!.role, to: parsed.data.role },
    });
  }

  res.json(UpdateMeResponse.parse(user));
});

router.get(
  "/teachers/:teacherId/profile",
  requireAuth,
  async (req, res): Promise<void> => {
    const teacherId = String(req.params.teacherId);
    const [teacher] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, teacherId));

    if (!teacher || teacher.role !== "teacher") {
      res.status(404).json({ error: "Professor not found" });
      return;
    }

    res.json(
      GetTeacherProfileResponse.parse({
        id: teacher.id,
        name: teacher.name,
        avatarUrl: teacher.avatarUrl,
        bio: teacher.bio,
        title: teacher.title,
        linkedinUrl: teacher.linkedinUrl,
      }),
    );
  },
);

export default router;
