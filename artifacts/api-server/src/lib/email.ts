import { logger } from "./logger";

// MSG91 transactional email (v5). Template-based: create an email template in
// the MSG91 dashboard with variables (e.g. ##name##, ##title##, ##body##,
// ##link##) and reference it by MSG91_EMAIL_TEMPLATE_ID.
//
// Best-effort and fully optional: if not enabled/configured, every function
// here is a no-op, so notifications keep working in-app without email.

const MSG91_EMAIL_ENDPOINT =
  process.env.MSG91_EMAIL_ENDPOINT ||
  "https://control.msg91.com/api/v5/email/send";

const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;

/** Email sending is opt-in and requires the full MSG91 email config. */
export function isEmailConfigured(): boolean {
  return (
    process.env.MSG91_EMAIL_ENABLED === "true" &&
    Boolean(process.env.MSG91_AUTH_KEY) &&
    Boolean(process.env.MSG91_EMAIL_FROM) &&
    Boolean(process.env.MSG91_EMAIL_DOMAIN)
  );
}

export interface EmailRecipient {
  email: string;
  name?: string | null;
  /** Values for the template's variables (keys match the MSG91 template). */
  variables?: Record<string, string>;
}

/**
 * Send a templated email to one or more recipients via MSG91.
 * Never throws — failures are logged and swallowed so email delivery can never
 * block or break the operation that triggered it.
 */
export async function sendTemplateEmails(
  recipients: EmailRecipient[],
  templateId?: string,
): Promise<void> {
  if (!isEmailConfigured()) return;

  const tmpl = templateId || process.env.MSG91_EMAIL_TEMPLATE_ID;
  if (!tmpl) return;

  const valid = recipients.filter((r) => r.email && r.email.includes("@"));
  if (valid.length === 0) return;

  const authKey = process.env.MSG91_AUTH_KEY as string;
  const from = {
    email: process.env.MSG91_EMAIL_FROM as string,
    name: process.env.MSG91_EMAIL_FROM_NAME || "Dempo Learn",
  };
  const domain = process.env.MSG91_EMAIL_DOMAIN as string;

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const payload = {
      recipients: batch.map((r) => ({
        to: [{ email: r.email, name: r.name || r.email }],
        variables: r.variables || {},
      })),
      from,
      domain,
      template_id: tmpl,
    };

    try {
      const res = await fetch(MSG91_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: authKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error(
          { status: res.status, body: text.slice(0, 300), count: batch.length },
          "MSG91 email send failed",
        );
      }
    } catch (err) {
      logger.error({ err, count: batch.length }, "MSG91 email send error");
    }
  }
}

/**
 * Best-effort invite email. Uses MSG91_INVITE_TEMPLATE_ID (falls back to the
 * generic template). Passes variables a template can render into a nice message:
 * name, inviter, role, app_url, invite_url, title, body.
 */
export async function sendInviteEmail(params: {
  email: string;
  name?: string | null;
  inviterName?: string | null;
  role: string;
  inviteUrl: string;
}): Promise<void> {
  const inviter = params.inviterName || "Your professor";
  const roleLabel = params.role === "teacher" ? "professor" : "student";
  await sendTemplateEmails(
    [
      {
        email: params.email,
        name: params.name,
        variables: {
          name: params.name || "there",
          inviter,
          role: roleLabel,
          app_url: process.env.APP_BASE_URL || "",
          invite_url: params.inviteUrl,
          title: "You're invited to Dempo Learn",
          body: `${inviter} has invited you to join Dempo Learn as a ${roleLabel}. Set up your account to see your courses, assignments, and feedback in one place.`,
        },
      },
    ],
    process.env.MSG91_INVITE_TEMPLATE_ID || undefined,
  );
}
