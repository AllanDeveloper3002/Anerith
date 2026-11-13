import { getAccountForUser, getAccountsForUser, getActiveAccountOrNull, summarizeAccount } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { all, type TransactionRow } from "@/lib/db";
import { getClosedTrades, mapTransaction } from "@/lib/trading";
import { HistoryClient } from "@/components/history-client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const active = await getActiveAccountOrNull(user.id);
  const accounts = getAccountsForUser(user.id);
  const account = active ?? accounts[0];

  if (!account) {
    return (
      <HistoryClient
        initialAccounts={[]}
        initialAccountId=""
        initialTrades={[]}
        initialTransactions={[]}
      />
    );
  }

  const owned = getAccountForUser(user.id, account.id);
  const trades = getClosedTrades(owned.id);
  const transactions = all<TransactionRow>(
    `SELECT * FROM transactions WHERE user_id = ? AND (account_id = ? OR type = 'challenge_purchase')
     ORDER BY created_at DESC LIMIT 120`,
    [user.id, owned.id],
  );

  return (
    <HistoryClient
      initialAccounts={accounts.map(summarizeAccount)}
      initialAccountId={owned.id}
      initialTrades={trades}
      initialTransactions={transactions.map(mapTransaction)}
    />
  );
}
