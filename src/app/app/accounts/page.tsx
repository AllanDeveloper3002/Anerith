import { getAccountSummaries } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { AccountsClient } from "@/components/accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const { accounts, activeId } = await getAccountSummaries(user.id);
  return <AccountsClient initial={accounts} initialActiveId={activeId} />;
}
