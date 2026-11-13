import { getAccountForUser, getAccountsForUser, getActiveAccountOrNull, summarizeAccount } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";
import { AnalyticsClient } from "@/components/analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const accounts = getAccountsForUser(user.id);
  const active = await getActiveAccountOrNull(user.id);
  const account = active ?? accounts[0];

  if (!account) {
    return <AnalyticsClient initialAccounts={[]} initialAccountId="" initialAnalytics={null} />;
  }

  const owned = getAccountForUser(user.id, account.id);
  return (
    <AnalyticsClient
      initialAccounts={accounts.map(summarizeAccount)}
      initialAccountId={owned.id}
      initialAnalytics={computeAnalytics(owned.id)}
    />
  );
}
