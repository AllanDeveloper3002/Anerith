import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdminSummary } from "@/lib/admin";
import { AdminClient } from "@/components/admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/app");
  return <AdminClient initial={getAdminSummary(user.id)} />;
}
