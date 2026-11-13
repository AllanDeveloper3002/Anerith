import { requireUser } from "@/lib/auth";
import { getAccountForUser, getActiveAccount, summarizeAccount } from "@/lib/accounts";
import { computeAnalytics } from "@/lib/analytics";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const account = accountId
      ? getAccountForUser(user.id, accountId)
      : await getActiveAccount(user.id);
    return ok({
      account: summarizeAccount(account),
      analytics: computeAnalytics(account.id),
    });
  } catch (error) {
    return fail(error);
  }
}
