# Dempo LMS — Architecture & Build Document

> The single source of truth for how the Dempo learning platform is built, hosted, and operated.
> Target: **one college, ~2,000 students + ~200 staff, India, single-tenant, ~$40–265/mo.**
> Execution timeline & task owners live in [PLAN.md](PLAN.md). This document is the design.

---

## 1. Executive summary

Dempo is a teaching/LMS web app: students join courses, submit assignments (text, files, links, video, audio) and receive AI-assisted grading + plagiarism scores; teachers create courses, run an AI-pre-filled grading queue, and message students.

**Guiding principles**
1. **Right-sized, not web-scale.** 2,000 students is a modest load (~300–1,000 peak concurrent at exam time). No microservices, no Kubernetes. Boring and reliable wins.
2. **India-resident by default.** Student data lives in India (Bangalore/Mumbai). Every vendor is India-friendly; the two cross-border exceptions (Clerk, and any non-Indian AI) are explicitly flagged and contained.
3. **Everything pluggable.** AI, storage, and messaging are wired behind standard interfaces (env-configured), so a provider swap is a config change, not a rebuild.
4. **Human-in-the-loop.** AI *suggests*; the professor *decides*. Protects fairness, trust, and grade appeals.

---

## 2. System architecture

```
                         ┌──────────────────────────────┐
   Students / Faculty    │  Custom domain + HTTPS        │
   (web + mobile browser)│  learn.dempo.in               │
                         └───────────────┬───────────────┘
                                         │
                ┌────────────────────────┴─────────────────────────┐
                │                                                   │
       ┌────────▼─────────┐                            ┌────────────▼───────────┐
       │  FRONTEND (SPA)  │        /api  ───────────►  │   API SERVER (Express)  │
       │  React 19 + Vite │                            │   stateless, 1..N       │
       │  Cloudflare Pages│                            │   autoscales on load    │
       │  (global CDN)    │                            │   DO App Platform · BLR │
       └──────────────────┘                            └──┬──────┬──────┬──────┬─┘
                                                          │      │      │      │
              ┌───────────────────────────────────────────┘      │      │      └────────────┐
              │                             ┌──────────────────────┘      │                  │
     ┌────────▼─────────┐         ┌─────────▼──────────┐        ┌──────────▼───────┐ ┌────────▼────────┐
     │  PostgreSQL      │         │  Object storage    │        │  Sarvam AI       │ │  MSG91          │
     │  Drizzle ORM     │         │  S3-compatible     │        │  grading (toggle)│ │  email/WhatsApp │
     │  DO Managed · BLR│         │  DO Spaces · BLR   │        │  India · OpenAI- │ │  /SMS · India   │
     │  pooler + PITR   │         │  presigned uploads │        │  compatible      │ │                 │
     └──────────────────┘         └────────────────────┘        └──────────────────┘ └─────────────────┘
                                                                      Clerk (auth · US identity ⚠)

   Cross-cutting: Sentry (errors) · UptimeRobot (uptime) · staging env · tested backups · CI/CD via GitHub
```

**Request flow.** Browser loads the SPA from Cloudflare's edge → SPA calls `/api/*` on the Express server → server checks the Clerk session cookie, applies role-based authorization, reads/writes Postgres, and returns JSON. Big file uploads bypass the server entirely (see §5). Notifications and AI calls happen best-effort and never block the user's request.

**Why this shape**
- **Two deployables** (static SPA + Node API) — the SPA is free to serve from a CDN; the API is the only thing that needs compute and scaling.
- **Stateless API** — no server-side session memory (auth is in the Clerk cookie), so we can run many copies and autoscale during exams.
- **Managed everything** — DO handles DB backups, storage durability, and scaling so a small team doesn't run servers by hand.

---

## 3. Technology stack

| Layer | Technology |
|-------|-----------|
| Language / runtime | TypeScript 5.9, Node.js 24 |
| Monorepo | pnpm workspaces |
| Frontend | React 19, Vite, wouter (routing), TanStack Query, shadcn/ui, Tailwind v4 |
| Backend | Express 5, Pino logging |
| Database | PostgreSQL + Drizzle ORM (`pg` driver) |
| API contract | OpenAPI (`lib/api-spec/openapi.yaml`) → Orval codegen → typed client + Zod schemas |
| Validation | Zod (end-to-end, generated from the spec) |
| Auth | Clerk (`@clerk/express`, `@clerk/react`) |
| AI | OpenAI-compatible SDK → Sarvam AI endpoint |
| Object storage | S3-compatible SDK (`@aws-sdk/client-s3`) → DO Spaces |
| Messaging | MSG91 (email / WhatsApp / SMS) |

**Monorepo layout**
```
artifacts/dempo/         Web app (React SPA) — 20+ pages
artifacts/api-server/    Express API — ~20 route modules + tests
artifacts/mockup-sandbox/ UI prototyping workspace
lib/db/                  Drizzle schema (source of truth for data)
lib/api-spec/            OpenAPI spec (source of truth for the API)
lib/api-client-react/    Generated typed API hooks
lib/api-zod/             Generated Zod schemas
lib/object-storage-web/  Browser upload helper (presigned URLs)
lib/integrations-openai-ai-server/  AI client (OpenAI-compatible)
```

---

## 4. Data architecture

**The notebook, not the warehouse.** The database stores *facts* — small text/number records: users, courses, enrollments, invites (email allow-list), assignments, submissions (metadata + a pointer to the file), quizzes, grades, messages, notifications, activity logs. Big files never go here.

- **Source of truth:** `lib/db/src/schema/`. Schema changes flow through Drizzle migrations (`pnpm --filter @workspace/db run push`).
- **Connection pooling is mandatory.** Many API copies × many students must not exhaust Postgres connections. Use DO's built-in pooler and cap the per-instance pool size.
- **Backups:** managed Postgres provides automated backups + point-in-time recovery. **A restore must be tested** — an untested backup is not a backup.

---

## 5. File storage strategy

Files (PDFs, video, audio, images) live in **object storage** (the "warehouse"), separate from the database. This is what keeps the system cheap and scalable as content grows.

**How uploads work (presigned URLs).** The API never carries file bytes:
```
1. Browser → API:  "I want to upload a video"
2. API → Browser:  a short-lived, single-use upload URL (presigned)
3. Browser → Storage:  uploads the file DIRECTLY (bypasses the API)
4. API → DB:  records the file's storage path
```
This means exam-day uploads by hundreds of students never overload the API server. **The app already implements this** — the migration only swaps the storage backend from Replit's sidecar to standard S3 (DO Spaces).

**Access control.** Each object carries an ACL policy (`objectAcl.ts`); downloads are authorized per-user before the file is served.

**Cost reality.** Storage is the one line item that only grows. Two charges: **storage** (~₹20/GB-month) and **egress** (download). Video dominates both. A video-heavy 2,000-student college can generate **~2–3 TB/semester**, ~10 TB over a few years.

**Cost-control levers (policy, not plumbing):**
1. 🎥 **Prefer video *links*** (YouTube-unlisted / Drive). The app already supports link submissions → video lives on Google's storage, near-zero cost to you. *Recommend making this the default for video.*
2. 📏 **Cap upload sizes** (e.g. 200 MB) and compress video.
3. 🗄️ **Retention policy** (e.g. keep submissions 3 years, then archive/delete) — caps unbounded growth; a college needs this policy anyway.
4. ⚡ **CDN caching** of frequently watched files to cut repeated egress.

**Residency note.** DO Spaces (Bangalore) keeps files in India. Cloudflare R2 is cheaper (zero egress) but not guaranteed India-resident — so we stay on DO Spaces and lean on the levers above.

---

## 6. AI grading

**What the AI does:** reads a submission and drafts a score + feedback; the professor accepts or overrides. Best-effort and non-blocking — a submission is never held up by AI.

**What is NOT AI / already local:** plagiarism detection is a **server-side word-shingle Jaccard similarity** computed in India — **no external service, no data leaves the country.** ✅

**Provider: Sarvam AI** (Indian, India-hosted, understands 10 Indic languages).
- OpenAI-compatible → plugs into the existing client with **no code rewrite**:
  - Base URL: `https://api.sarvam.ai/v1`
  - Models: `sarvam-105b` (best) or `sarvam-30b` (cheaper)
- **Cost:** ~₹0.01 per grade; a full semester of ~60,000 grades ≈ a few hundred rupees. ₹1,000 free credit covers piloting.

**How it's built**
1. **On/off toggle** (`AI_GRADING_ENABLED`), default **OFF**. Ship without AI; enable after compliance sign-off.
2. **Identity stripping** — remove names/roll numbers/IDs before any text is sent to the AI (defense-in-depth).
3. **Pluggable** — because it's the standard OpenAI interface, swapping Sarvam for another India-hosted provider (e.g. AWS Bedrock Mumbai) is a config change. An optional gateway (e.g. LiteLLM) can route without touching the app.

**Compliance stance.** Launch with AI off → confirm the college's data bar → point AI at the India-hosted provider → enable. Keep the human-in-the-loop.

---

## 7. Notifications & messaging (MSG91)

**The gap this closes:** today the app only writes **in-app** notifications (the bell icon, `lib/notifications.ts`). It **cannot email or text anyone** — a student who isn't logged in hears nothing. Unacceptable for a real college.

**Provider: MSG91** (Indian) — one account for **email + WhatsApp + SMS**, keeping that data in India.

**Delivery layer (to build).** Wrap the existing notification writer so one event fans out across channels, with per-user channel preferences:
```
Event (grade posted, assignment due, announcement)
   │
   ├─► 🔔 in-app bell    (exists)
   ├─► 📧 email          (MSG91)          ← Stage A
   └─► 💬 WhatsApp / SMS (MSG91, opt-in)  ← after India onboarding
```

**India onboarding (legally required, no provider skips these):**
| Channel | One-time setup | Purpose |
|---------|----------------|---------|
| Email | Domain verification (SPF/DKIM DNS records) | Deliverability / anti-spam |
| WhatsApp | Message-template approval (Meta, via MSG91) | Business messages must be pre-approved |
| SMS | **DLT registration** (sender ID + templates, TRAI) | Indian law for business SMS |

Email is quickest (Stage A). WhatsApp/SMS approvals take days — start them in parallel, enable when approved.

**Cost:** email negligible; WhatsApp/SMS ~paise per message. At scale, budget ₹2,000–6,000/mo.

---

## 8. Authentication & authorization

- **Auth: Clerk.** Google/Microsoft sign-in, cookie-based sessions. Users are **JIT-provisioned** on first sign-in (no signup webhook).
- **Roles:** `teacher | student | unassigned`. New users are forced through a role-picker before entering the app.
- **Roster-gating:** joining a course requires the user's email to be on that course's invite allow-list (case-insensitive) *and* the invite code — otherwise 403.
- **College SSO:** students should log in with their existing college Google Workspace / Microsoft 365 identity. Clerk supports this, **but enterprise SSO/SAML is a paid Clerk tier** — budget for it (§12).
- ⚠️ **Cross-border flag:** Clerk stores identity data (names/emails) on **US** infrastructure. Acceptable for launch with consent + a DPA; if the college requires strict India-only identity, plan a migration to India-resident auth later.

**Authorization is a known risk area** (see memory: role-revocation). It must be a focus of the security review (§9) — verify every route enforces the correct role and that revoked roles lose access immediately.

---

## 9. Security

**Already in place (good signals):**
- End-to-end **Zod validation** generated from the OpenAPI spec.
- Per-object **ACLs** on file access.
- **Supply-chain defense:** `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` blocks brand-new (potentially compromised) npm releases.
- A real **test suite** across API routes.

**Must add before selling:**
- **External penetration test** — the code is AI-generated and unaudited. A clean report is a procurement gate. (Sale-blocker.)
- **Internal authz review** — every route × role, plus role-revocation.
- **Rate limiting & abuse protection** on auth and upload endpoints.
- **Secrets management** — all keys in host env vars / secret store; never in git. `.env` files git-ignored.
- **Dependency scanning** in CI.
- **Malware scanning** of uploaded files before wide rollout.

---

## 10. Reliability, scaling & exam spikes

**The load:** ~2,000 students; peak concurrency during scheduled exams ~300–600, extreme ~1,000. Modest — handled by one right-sized setup.

**Exam-spike handling (three properties):**
1. **Stateless API** → run multiple copies, autoscale up when an exam starts, down after.
2. **DB connection pooling** → many copies don't exhaust Postgres.
3. **App-level exam robustness** → periodic answer **auto-save**, server-authoritative timers, graceful reconnect (protects students on flaky WiFi).

**Availability / DR:**
- For an SLA (target ~99.5%), run **redundant API instances** + a **Postgres standby**.
- **Test** backup restores; keep a 1-page DR runbook (RPO/RTO).
- **Load-test** one exam spike before go-live.

**Scaling headroom:** this design scales to ~10,000 students by resizing instances — no re-architecture. (Multi-college SaaS would be a separate future effort; out of scope for single-tenant.)

---

## 11. Data residency & DPDP compliance

**Where data lives:**
| Data | Location | Residency |
|------|----------|:---:|
| Database (facts) | DO Postgres, Bangalore | 🇮🇳 India |
| Files (submissions) | DO Spaces, Bangalore | 🇮🇳 India |
| API compute | DO App Platform, Bangalore | 🇮🇳 India |
| Plagiarism | On the API server | 🇮🇳 India |
| AI grading | Sarvam, India | 🇮🇳 India |
| Messaging | MSG91, India | 🇮🇳 India |
| **Identity (auth)** | **Clerk, US** | ⚠️ **Cross-border** |

**DPDP obligations:**
- Privacy Policy, Terms of Service, EULA.
- **Consent** capture in-app + a **data retention/deletion** policy.
- **Data Processing Agreements** with every vendor touching student data: DigitalOcean, Clerk, Sarvam, MSG91.
- Breach-notification process; data-subject access/delete rights.
- Resolve the Clerk cross-border item (consent + DPA now; India-resident auth if required later).

---

## 12. Cost model

**Recurring — monthly** (₹ at ~₹86/$)
| Item | Lean (pilot) | Full (production) |
|------|---:|---:|
| API hosting (DO, redundant) | ₹2,200 | ₹4,300 |
| Managed Postgres (+ standby) | ₹1,300 | ₹4,300 |
| Object storage (grows) | ₹450 | ₹1,500 |
| Frontend (Cloudflare) | Free | Free |
| Clerk (with SSO) | Free | ₹2,200+ |
| MSG91 (email + WhatsApp/SMS) | ₹2,000 | ₹6,000 |
| Sarvam AI (when on) | ₹500 | ₹2,000 |
| Monitoring (Sentry/uptime) | Free | ₹2,200 |
| **Monthly total** | **~₹9,000 (~$105)** | **~₹22,800 (~$265)** |

**One-time / annual**
| Item | Rough cost |
|------|---:|
| Security audit + penetration test | ₹75,000–2,00,000 |
| Legal docs (ToS, Privacy, DPA, DPDP) | ₹40,000–1,00,000 |
| DLT / WhatsApp registration | ~₹5,000 |
| Cyber insurance (optional/annual) | ₹30,000+/yr |

**Not on an invoice:** your time — support/on-call, maintenance, per-college onboarding.

---

## 13. Observability & operations

- **Errors:** Sentry (frontend + API).
- **Uptime:** UptimeRobot alerts.
- **Logs:** Pino structured logs → host log stream (aggregator optional at this scale).
- **Activity log:** in-app audit trail already exists (`activityLog.ts`).
- **Environments:** a **staging** copy separate from production — never test on students' live data.
- **CI/CD:** GitHub → auto-deploy on push (host git-deploy or GitHub Actions).
- **Support model:** a defined channel + response-time SLA + **on-call during exams** (your hardest operational promise — plan before signing).

---

## 14. Onboarding & integrations

- **Bulk roster import** (CSV of students/courses) — essential to onboard 2,000 users without manual entry. (To build.)
- **College SSO** — students use existing college identity (§8).
- **SIS/ERP integration** (attendance, official grade export) — future, on request.
- **Accessibility (WCAG):** a first pass (keyboard nav, labels, contrast); full audit before wide rollout.

---

## 15. Readiness scorecard

| Area | Status |
|------|:---:|
| Hosting / infra (India) | ✅ Planned |
| Data residency | ✅ Planned |
| Security audit / pen test | ❌ Missing — sale-blocker |
| Legal & DPDP | ❌ Missing — sale-blocker |
| Reliability / DR / SLA | ⚠️ To build |
| College SSO | ⚠️ Paid tier + config |
| Support model | ❌ To define |
| Roster onboarding | ❌ To build |
| Notifications (MSG91) | 🔄 In build |
| AI grading (Sarvam) | ✅ Planned (toggle) |
| Exam integrity | ⚠️ Plagiarism only |
| Accessibility | ❓ Unverified |
| Monitoring | 🔄 Planned |
| Commercial model | ❌ To define |

**Verdict:** architecture is right-sized and India-compliant; the remaining work to be *sellable* is security, legal/DPDP, SSO, onboarding, and a support plan — not infrastructure. Full execution sequence in [PLAN.md](PLAN.md).

---

## 16. Configuration reference (environment variables)

*Secrets go in host env / `.env` (git-ignored) — never in the repo.*

```bash
# --- Database ---
DATABASE_URL=postgres://...@<do-postgres-host>:25060/dempo?sslmode=require

# --- Object storage (DO Spaces, S3-compatible) ---   [replaces Replit sidecar]
STORAGE_ENDPOINT=https://blr1.digitaloceanspaces.com
STORAGE_REGION=blr1
STORAGE_BUCKET=dempo-uploads
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
PRIVATE_OBJECT_DIR=/dempo-uploads/private
PUBLIC_OBJECT_SEARCH_PATHS=/dempo-uploads/public

# --- Auth (Clerk, your own account) ---
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_CLERK_PROXY_URL=            # empty in dev (intentional)

# --- AI grading (Sarvam, OpenAI-compatible) ---
AI_GRADING_ENABLED=false         # default off; flip on post-compliance
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.sarvam.ai/v1
AI_INTEGRATIONS_OPENAI_API_KEY=...
AI_GRADING_MODEL=sarvam-105b

# --- Messaging (MSG91) ---
MSG91_AUTH_KEY=...
MSG91_EMAIL_DOMAIN=dempo.in
MSG91_WHATSAPP_ENABLED=false     # enable after template approval
MSG91_SMS_ENABLED=false          # enable after DLT registration

# --- Observability ---
SENTRY_DSN=...
```

---

*Companion document: [PLAN.md](PLAN.md) — staged execution, task owners, and the path to first sale.*
