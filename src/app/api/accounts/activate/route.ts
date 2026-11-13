import { ACTIVE_ACCOUNT_COOKIE, activeAccountCookieOptions, requireUser } from "@/lib/auth";
import { getAccountForUser, getAccountSummaries } from "@/lib/accounts";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { activateAccountSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = activateAccountSchema.parse(await readJson(request));
    const account = getAccountForUser(user.id, body.accountId);
    if (account.status !== "active") {
      throw new ApiError(400, "This account is closed and cannot be traded.");
    }
    const data = await getAccountSummaries(user.id);
    const response = ok({ ...data, activeId: account.id });
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, activeAccountCookieOptions);
    return response;
  } catch (error) {
    return fail(error);
  }
}
