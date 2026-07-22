import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { AdminClient } from "@/components/admin-client";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  return <AdminClient />;
}
