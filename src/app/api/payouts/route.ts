import { requireUser } from "@/lib/auth";
import { getAccountForUser, getAccountsForUser, summarizeAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { getPayoutsForUser, requestPayout } from "@/lib/payouts";
import { ApiError } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { payoutRequestSchema } from "@/lib/validation";
import { PAYOUT_MIN_USD } from "@/lib/challenges";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = getAccountsForUser(user.id).map(summarizeAccount);
    return ok({
      payouts: getPayoutsForUser(user.id),
      accounts,
      kycStatus: user.kyc_status,
      minPayout: PAYOUT_MIN_USD,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limit = rateLimit(clientKey(request, "payout"), 5, 60_000);
    if (!limit.allowed) throw new ApiError(429, "Too many payout requests. Please wait a moment.");
    const body = payoutRequestSchema.parse(await readJson(request));
    const account = getAccountForUser(user.id, body.accountId);
    const payout = requestPayout(user, account, body);
    return ok({ payout, message: "Payout submitted for review." }, 201);
  } catch (error) {
    return fail(error);
  }
}
