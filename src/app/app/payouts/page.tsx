import { getAccountsForUser, summarizeAccount } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { PAYOUT_MIN_USD } from "@/lib/challenges";
import { getPayoutsForUser } from "@/lib/payouts";
import { PayoutsClient } from "@/components/payouts-client";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <PayoutsClient
      initialPayouts={getPayoutsForUser(user.id)}
      initialAccounts={getAccountsForUser(user.id).map(summarizeAccount)}
      kycStatus={user.kyc_status}
      minPayout={PAYOUT_MIN_USD}
    />
  );
}
