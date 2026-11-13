import { requireUser } from "@/lib/auth";
import {
  getAccountForUser,
  getAccountsForUser,
  getActiveAccountOrNull,
  summarizeAccount,
} from "@/lib/accounts";
import { all, type PositionRow, type TransactionRow } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getClosedTrades, mapTransaction } from "@/lib/trading";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("accountId");
    const account = requestedId
      ? getAccountForUser(user.id, requestedId)
      : await getActiveAccountOrNull(user.id);

    const accounts = getAccountsForUser(user.id).map(summarizeAccount);
    if (!account) {
      return ok({ accounts, activeId: "", account: null, trades: [], transactions: [] });
    }

    const trades = getClosedTrades(account.id);
    const transactionRows = all<TransactionRow>(
      `SELECT * FROM transactions WHERE user_id = ? AND (account_id = ? OR type = 'challenge_purchase')
       ORDER BY created_at DESC LIMIT 120`,
      [user.id, account.id],
    );

    return ok({
      accounts,
      activeId: account.id,
      account: summarizeAccount(account),
      trades,
      transactions: transactionRows.map(mapTransaction),
      openPositions: all<PositionRow>(
        "SELECT * FROM positions WHERE account_id = ? AND status = 'open'",
        [account.id],
      ).length,
    });
  } catch (error) {
    return fail(error);
  }
}
