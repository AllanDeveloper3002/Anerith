import { ACTIVE_ACCOUNT_COOKIE, activeAccountCookieOptions, requireUser } from "@/lib/auth";
import { getAccountSummaries } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { purchaseChallenge } from "@/lib/purchases";
import { purchaseChallengeSchema } from "@/lib/validation";
import { ApiError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limit = rateLimit(clientKey(request, "purchase"), 10, 60_000);
    if (!limit.allowed) throw new ApiError(429, "Too many checkouts. Please wait a moment.");
    const body = purchaseChallengeSchema.parse(await readJson(request));
    const { purchase, account } = purchaseChallenge(user, body);
    const data = await getAccountSummaries(user.id);
    const response = ok({ purchase, accountId: account.id, ...data, activeId: account.id }, 201);
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, activeAccountCookieOptions);
    return response;
  } catch (error) {
    return fail(error);
  }
}
