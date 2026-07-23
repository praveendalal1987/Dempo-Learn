# Email setup (MSG91)

Dempo sends two kinds of email, both best-effort and **off until configured**:
- **Invite emails** — when an admin invites a user (`sendInviteEmail`).
- **Notification emails** — grade posted, announcement, feedback, etc.
  (`createNotifications` fan-out).

Ready-to-paste templates live in `docs/email-templates/`:
- `invite.html` — the invite email.
- `notification.html` — the generic notification email.

MSG91 templates use `##variable##` placeholders; the app fills them:
- Invite: `##name##`, `##inviter##`, `##role##`, `##invite_url##`, `##app_url##`.
- Notification: `##name##`, `##title##`, `##body##`, `##link##`.

## One-time setup

1. **MSG91 account + auth key.** Sign up at msg91.com; copy your **Auth Key**.
2. **Verify your sending domain** (MSG91 → Email → Domains): add the DNS records
   MSG91 shows (SPF/DKIM) for e.g. `dempo.in`. Wait for "Verified".
3. **Create the templates** (MSG91 → Email → Templates → New):
   - Paste `docs/email-templates/invite.html`, save, and copy its **template id**.
   - Paste `docs/email-templates/notification.html`, save, copy its **template id**.
4. **Set env vars** in **Render → the `dempo` service → Environment** (and locally
   in `.env` for testing):
   ```
   MSG91_AUTH_KEY=<your auth key>
   MSG91_EMAIL_ENABLED=true
   MSG91_EMAIL_FROM=no-reply@dempo.in
   MSG91_EMAIL_FROM_NAME=Dempo Learn
   MSG91_EMAIL_DOMAIN=dempo.in            # your verified domain
   MSG91_INVITE_TEMPLATE_ID=<invite template id>
   MSG91_EMAIL_TEMPLATE_ID=<notification template id>
   APP_BASE_URL=https://dempo.onrender.com   # already set on Render
   ```
5. **Save** → Render redeploys. Invites now email automatically; notifications
   for grades/announcements/feedback/messages email too.

## Verify

- Admin → **Invites** → add a test email you own → check the inbox for the
  invite (and that the "Accept your invite" button opens `APP_BASE_URL/sign-up`).
- Post a grade or announcement → the affected student gets a notification email.

## Notes

- If `MSG91_EMAIL_ENABLED` is not `true`, or the domain/template aren't set,
  email silently no-ops — the app keeps working (in-app notifications, and the
  copyable invite link in the admin panel still function).
- WhatsApp/SMS (also MSG91) are separate and need DLT registration + template
  approval; not required for email.
