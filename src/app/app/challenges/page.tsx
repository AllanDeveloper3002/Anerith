import { getSessionUser } from "@/lib/auth";
import { getPaymentIntentsForUser, paymentGatewayInfo } from "@/lib/payments";
import { getPurchasesForUser } from "@/lib/purchases";
import { ChallengesClient } from "@/components/challenges-client";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <ChallengesClient
      initialPurchases={getPurchasesForUser(user.id)}
      initialIntents={getPaymentIntentsForUser(user.id)}
      gateway={paymentGatewayInfo()}
    />
  );
}
