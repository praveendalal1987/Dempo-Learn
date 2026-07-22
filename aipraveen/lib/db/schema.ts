/**
 * Production Postgres schema (Drizzle). This is the target for Supabase
 * (Mumbai / ap-south-1). Until DATABASE_URL is set the app runs against the
 * in-memory dev store in lib/data.ts, which mirrors these shapes.
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "paid",
  "renewal",
  "refunded",
  "free",
  "failed",
]);

export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "expiring",
  "expired",
]);

export const portfolioStatus = pgEnum("portfolio_status", [
  "draft",
  "in_review",
  "feedback_received",
  "published",
]);

export const testimonialStatus = pgEnum("testimonial_status", [
  "pending",
  "approved",
  "declined",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Passwordless 15-minute login tokens. */
export const magicTokens = pgTable("magic_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Catalog is seeded from lib/catalog.ts; this table lets admin edit later. */
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // course | kit
  price: integer("price").notNull(), // INR, 0 = free
  renewPercent: integer("renew_percent").notNull().default(45),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(), // e.g. AP-2141
  userId: uuid("user_id").references(() => users.id),
  email: text("email").notNull(),
  productId: text("product_id"),
  competitionId: text("competition_id"),
  description: text("description").notNull(),
  amount: integer("amount").notNull(), // INR paise-free rupees
  status: orderStatus("status").notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlements = pgTable("entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  renewalCount: integer("renewal_count").notNull().default(0),
});

/** Per-lesson completion for a user's course. */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    lessonKey: text("lesson_key").notNull(),
    completed: boolean("completed").notNull().default(false),
    lastPositionSec: integer("last_position_sec").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId, t.lessonKey] })],
);

export const portfolioProjects = pgTable("portfolio_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  briefId: text("brief_id").notNull(),
  title: text("title").notNull(),
  status: portfolioStatus("status").notNull().default("draft"),
  feedback: text("feedback"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testimonials = pgTable("testimonials", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  product: text("product").notNull(),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  status: testimonialStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitionEntries = pgTable("competition_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  competitionId: text("competition_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Simple contact-capture tables for the marketing inquiry/waitlist forms. */
export const inquiries = pgTable("inquiries", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(), // workshop | industry
  name: text("name").notNull(),
  email: text("email").notNull(),
  payload: text("payload"), // JSON blob of the rest of the form
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookWaitlist = pgTable("book_waitlist", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type PortfolioProject = typeof portfolioProjects.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
