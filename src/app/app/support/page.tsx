import { getSessionUser } from "@/lib/auth";
import { listSupportTickets } from "@/lib/support";
import { SupportClient } from "@/components/support-client";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return <SupportClient initialTickets={listSupportTickets(user.id)} email={user.email} />;
}
