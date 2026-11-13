import { getAccountsForUser, summarizeAccount } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { getRiskDashboard } from "@/lib/risk-view";
import { RiskDashboardClient } from "@/components/risk-dashboard-client";

export const dynamic = "force-dynamic";

export default async function RiskPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const accounts = getAccountsForUser(user.id);
  if (accounts.length === 0) {
    return <RiskDashboardClient initialAccounts={[]} initialAccountId="" initial={null} />;
  }
  const dashboard = await getRiskDashboard(user.id);
  return (
    <RiskDashboardClient
      initialAccounts={accounts.map(summarizeAccount)}
      initialAccountId={dashboard.account.id}
      initial={dashboard}
    />
  );
}
