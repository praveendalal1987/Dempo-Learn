/**
 * Data service. Currently an in-memory dev store (survives HMR via globalThis)
 * seeded with a demo learner + admin. Every function is async so that swapping
 * in a Drizzle/Postgres implementation later is a drop-in replacement — the
 * app only ever calls these functions, never a DB directly.
 */
import { getProduct, renewLabelFor, type Product } from "./catalog";
import { renewalPrice } from "./format";
import { CURRICULUM } from "./course";

export type EntitlementStatus = "active" | "expiring" | "expired";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  /** Public portfolio slug, e.g. "asha-menon". */
  slug: string;
}

export interface ProjectLink {
  label: string;
  url: string;
}

export type ProjectStatus = "in_review" | "published";

/** A build a learner submitted against a practice brief — their portfolio work. */
export interface UserProject {
  id: string;
  userId: string;
  briefId: string;
  briefTitle: string;
  title: string;
  description: string;
  audience: string;
  techStack: string[];
  links: ProjectLink[];
  status: ProjectStatus;
  createdAt: Date;
}

/** A readable display name: the set name, else a title-cased email local part. */
export function displayName(user: { name: string | null; email: string }): string {
  if (user.name) return user.name;
  const local = user.email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || "Learner";
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "learner"
  );
}

export interface AppEntitlement {
  id: string;
  userId: string;
  productId: string;
  purchasedAt: Date;
  expiresAt: Date;
  renewalCount: number;
}

export type OrderStatus = "paid" | "renewal" | "refunded" | "free" | "failed";

export interface AppOrder {
  id: string;
  userId: string | null;
  email: string;
  productId?: string;
  competitionId?: string;
  description: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
}

interface MagicToken {
  token: string;
  email: string;
  expiresAt: Date;
  consumed: boolean;
}

interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}

interface Store {
  users: Map<string, AppUser>;
  magicTokens: Map<string, MagicToken>;
  sessions: Map<string, Session>;
  entitlements: AppEntitlement[];
  orders: AppOrder[];
  /** key: `${userId}:${productId}` -> Set of completed lesson keys */
  progress: Map<string, Set<string>>;
  projects: UserProject[];
  orderSeq: number;
}

const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function uid(): string {
  return crypto.randomUUID();
}

function seed(): Store {
  const store: Store = {
    users: new Map(),
    magicTokens: new Map(),
    sessions: new Map(),
    entitlements: [],
    orders: [],
    progress: new Map(),
    projects: [],
    orderSeq: 2142,
  };

  const asha: AppUser = {
    id: "u_asha",
    email: "asha.menon@gmail.com",
    name: "Asha Menon",
    isAdmin: false,
    slug: "asha-menon",
  };
  const owner: AppUser = {
    id: "u_praveen",
    email: "praveen@aipraveen.com",
    name: "Praveen Dalal",
    isAdmin: true,
    slug: "praveen-dalal",
  };
  store.users.set(asha.id, asha);
  store.users.set(owner.id, owner);

  const now = Date.now();
  // Active flagship course, ~40% done.
  store.entitlements.push({
    id: uid(),
    userId: asha.id,
    productId: "flagship",
    purchasedAt: new Date(now - 60 * DAY_MS),
    expiresAt: new Date(now - 60 * DAY_MS + YEAR_MS),
    renewalCount: 0,
  });
  // Career kit expiring in 21 days.
  store.entitlements.push({
    id: uid(),
    userId: asha.id,
    productId: "career",
    purchasedAt: new Date(now - (365 - 21) * DAY_MS),
    expiresAt: new Date(now + 21 * DAY_MS),
    renewalCount: 0,
  });
  // Prompt to Product expired.
  store.entitlements.push({
    id: uid(),
    userId: asha.id,
    productId: "prompt",
    purchasedAt: new Date(now - 400 * DAY_MS),
    expiresAt: new Date(now - 40 * DAY_MS),
    renewalCount: 0,
  });

  // Seed ~40% progress on the flagship course (first 6 of 15 lessons).
  const flatKeys = lessonKeysFor("flagship");
  store.progress.set(
    "u_asha:flagship",
    new Set(flatKeys.slice(0, 6)),
  );

  // Seed Asha's portfolio: two published builds + one in review.
  store.projects.push(
    {
      id: uid(),
      userId: asha.id,
      briefId: "PR-003",
      briefTitle: "Review-to-insight digest",
      title: "ReviewLens — weekly insight digest",
      description:
        "Ingests a week of marketplace reviews and produces a one-page digest: the top three themes, the sentiment trend, and the single most urgent issue, each with a quoted example.",
      audience: "Founders and marketing leads at small D2C brands.",
      techStack: ["Next.js", "GPT-4o mini", "Google Sheets", "Vercel"],
      links: [
        { label: "Live demo", url: "https://example.com/reviewlens" },
        { label: "How it works", url: "https://example.com/reviewlens/notes" },
      ],
      status: "published",
      createdAt: new Date(now - 20 * DAY_MS),
    },
    {
      id: uid(),
      userId: asha.id,
      briefId: "PR-022",
      briefTitle: "WhatsApp order-taker for a tiffin service",
      title: "TiffinDesk — WhatsApp order-taker",
      description:
        "Reads a day of free-text WhatsApp orders, matches them to the menu, and prints a kitchen-ready list plus anything that needs confirming.",
      audience: "Home kitchens and small tiffin services.",
      techStack: ["Python", "Claude", "Streamlit"],
      links: [{ label: "Live demo", url: "https://example.com/tiffindesk" }],
      status: "published",
      createdAt: new Date(now - 8 * DAY_MS),
    },
    {
      id: uid(),
      userId: asha.id,
      briefId: "PR-031",
      briefTitle: "Resume screener that explains itself",
      title: "FairScreen — explainable resume screening",
      description:
        "Scores resumes against an explicit rubric and writes one honest paragraph for every reject — no silent scores.",
      audience: "Campus placement cells and small hiring teams.",
      techStack: ["Next.js", "OpenAI API"],
      links: [],
      status: "in_review",
      createdAt: new Date(now - 3 * DAY_MS),
    },
  );

  return store;
}

// Persist across HMR reloads in dev.
const g = globalThis as unknown as { __aipraveenStore?: Store };
const db: Store = g.__aipraveenStore ?? (g.__aipraveenStore = seed());

/** Flat lesson keys ("0".."n") for a course, in curriculum order. */
export function lessonKeysFor(_productId: string): string[] {
  const total = CURRICULUM.reduce((n, m) => n + m.lessons.length, 0);
  return Array.from({ length: total }, (_, i) => String(i));
}

function computeStatus(expiresAt: Date): EntitlementStatus {
  const days = (expiresAt.getTime() - Date.now()) / DAY_MS;
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "active";
}

// ---------- users ----------
export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const e = email.trim().toLowerCase();
  for (const u of db.users.values()) if (u.email === e) return u;
  return null;
}

export async function getUser(id: string): Promise<AppUser | null> {
  return db.users.get(id) ?? null;
}

export async function upsertUserByEmail(email: string): Promise<AppUser> {
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  const clean = email.trim().toLowerCase();
  const user: AppUser = {
    id: uid(),
    email: clean,
    name: null,
    isAdmin: false,
    slug: uniqueSlug(slugify(clean.split("@")[0])),
  };
  db.users.set(user.id, user);
  return user;
}

function uniqueSlug(base: string): string {
  let slug = base;
  let n = 2;
  const taken = (s: string) =>
    [...db.users.values()].some((u) => u.slug === s);
  while (taken(slug)) slug = `${base}-${n++}`;
  return slug;
}

export async function getUserBySlug(slug: string): Promise<AppUser | null> {
  for (const u of db.users.values()) if (u.slug === slug) return u;
  return null;
}

// ---------- magic links ----------
export async function createMagicToken(email: string): Promise<string> {
  const token = uid().replace(/-/g, "");
  db.magicTokens.set(token, {
    token,
    email: email.trim().toLowerCase(),
    expiresAt: new Date(Date.now() + MAGIC_TTL_MS),
    consumed: false,
  });
  return token;
}

export async function consumeMagicToken(token: string): Promise<string | null> {
  const t = db.magicTokens.get(token);
  if (!t || t.consumed || t.expiresAt.getTime() < Date.now()) return null;
  t.consumed = true;
  return t.email;
}

// ---------- sessions ----------
export async function createSession(userId: string): Promise<string> {
  const token = uid().replace(/-/g, "") + uid().replace(/-/g, "");
  db.sessions.set(token, {
    token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function getSessionUser(token: string | undefined): Promise<AppUser | null> {
  if (!token) return null;
  const s = db.sessions.get(token);
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return db.users.get(s.userId) ?? null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (token) db.sessions.delete(token);
}

// ---------- entitlements ----------
export interface EntitlementView extends AppEntitlement {
  product: Product;
  status: EntitlementStatus;
}

export async function listEntitlements(userId: string): Promise<EntitlementView[]> {
  return db.entitlements
    .filter((e) => e.userId === userId)
    .map((e) => {
      const product = getProduct(e.productId)!;
      return { ...e, product, status: computeStatus(e.expiresAt) };
    })
    .filter((e) => e.product);
}

export async function getEntitlement(
  userId: string,
  productId: string,
): Promise<EntitlementView | null> {
  const e = db.entitlements.find(
    (x) => x.userId === userId && x.productId === productId,
  );
  if (!e) return null;
  const product = getProduct(e.productId);
  if (!product) return null;
  return { ...e, product, status: computeStatus(e.expiresAt) };
}

/** Does the user hold at least one active (non-expired) paid course? */
export async function hasActivePaidCourse(userId: string): Promise<boolean> {
  const ents = await listEntitlements(userId);
  return ents.some(
    (e) => e.product.kind === "course" && e.product.price > 0 && e.status !== "expired",
  );
}

// ---------- orders + purchase ----------
function nextOrderId(): string {
  return `AP-${db.orderSeq++}`;
}

export interface PurchaseResult {
  order: AppOrder;
  entitlement: AppEntitlement | null;
}

/** Record a successful purchase: create the order and a 1-year entitlement. */
export async function recordPurchase(
  userId: string,
  email: string,
  product: Product,
): Promise<PurchaseResult> {
  const now = Date.now();
  const order: AppOrder = {
    id: nextOrderId(),
    userId,
    email,
    productId: product.id,
    description: product.title,
    amount: product.price,
    status: product.price === 0 ? "free" : "paid",
    createdAt: new Date(now),
  };
  db.orders.push(order);

  // Idempotent: if already entitled, just extend to max(existing, +1yr).
  let ent = db.entitlements.find(
    (e) => e.userId === userId && e.productId === product.id,
  );
  if (ent) {
    ent.expiresAt = new Date(Math.max(ent.expiresAt.getTime(), now) + YEAR_MS);
  } else {
    ent = {
      id: uid(),
      userId,
      productId: product.id,
      purchasedAt: new Date(now),
      expiresAt: new Date(now + YEAR_MS),
      renewalCount: 0,
    };
    db.entitlements.push(ent);
  }
  return { order, entitlement: ent };
}

/** Record a renewal: extend by one year from the later of now/current expiry. */
export async function recordRenewal(
  userId: string,
  email: string,
  product: Product,
): Promise<PurchaseResult> {
  const now = Date.now();
  const ent = db.entitlements.find(
    (e) => e.userId === userId && e.productId === product.id,
  );
  const base = ent ? Math.max(ent.expiresAt.getTime(), now) : now;
  if (ent) {
    ent.expiresAt = new Date(base + YEAR_MS);
    ent.renewalCount += 1;
  }
  const order: AppOrder = {
    id: nextOrderId(),
    userId,
    email,
    productId: product.id,
    description: `${product.title} · renewal`,
    amount: renewalPrice(product.price, product.renewPercent),
    status: "renewal",
    createdAt: new Date(now),
  };
  db.orders.push(order);
  return { order, entitlement: ent ?? null };
}

/** Record a competition entry-fee order (no course entitlement). */
export async function recordCompetitionOrder(
  userId: string,
  email: string,
  competitionId: string,
  name: string,
  fee: number,
): Promise<AppOrder> {
  const order: AppOrder = {
    id: nextOrderId(),
    userId,
    email,
    competitionId,
    description: `Competition entry — ${name}`,
    amount: fee,
    status: "paid",
    createdAt: new Date(),
  };
  db.orders.push(order);
  return order;
}

export async function listOrders(userId: string): Promise<AppOrder[]> {
  return db.orders
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ---------- lesson progress ----------
export async function getCompletedLessons(
  userId: string,
  productId: string,
): Promise<Set<string>> {
  return db.progress.get(`${userId}:${productId}`) ?? new Set();
}

export interface CourseProgress {
  completed: number;
  total: number;
  percent: number;
  /** Index of the first incomplete lesson (clamped to last if all done). */
  nextLessonIndex: number;
}

export async function courseProgress(
  userId: string,
  productId: string,
): Promise<CourseProgress> {
  const keys = lessonKeysFor(productId);
  const done = await getCompletedLessons(userId, productId);
  const completed = keys.filter((k) => done.has(k)).length;
  const total = keys.length;
  const nextIdx = keys.findIndex((k) => !done.has(k));
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    nextLessonIndex: nextIdx < 0 ? Math.max(0, total - 1) : nextIdx,
  };
}

export async function setLessonCompleted(
  userId: string,
  productId: string,
  lessonKey: string,
  completed: boolean,
): Promise<void> {
  const key = `${userId}:${productId}`;
  const set = db.progress.get(key) ?? new Set<string>();
  if (completed) set.add(lessonKey);
  else set.delete(lessonKey);
  db.progress.set(key, set);
}

// ---------- portfolio projects ----------
export interface SubmitProjectInput {
  briefId: string;
  briefTitle: string;
  title: string;
  description: string;
  audience: string;
  techStack: string[];
  links: ProjectLink[];
}

/** All of a user's projects, newest first (owner view). */
export async function listUserProjects(userId: string): Promise<UserProject[]> {
  return db.projects
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Only published projects (public recruiter/portfolio view). */
export async function listPublishedProjects(userId: string): Promise<UserProject[]> {
  return (await listUserProjects(userId)).filter((p) => p.status === "published");
}

/** Create a portfolio project from a submission. */
export async function addUserProject(
  userId: string,
  input: SubmitProjectInput,
): Promise<UserProject> {
  const project: UserProject = {
    id: uid(),
    userId,
    briefId: input.briefId,
    briefTitle: input.briefTitle,
    title: input.title,
    description: input.description,
    audience: input.audience,
    techStack: input.techStack,
    links: input.links,
    // Self-published so it appears on the shareable page immediately.
    status: "published",
    createdAt: new Date(),
  };
  db.projects.push(project);
  return project;
}

export { renewLabelFor };
