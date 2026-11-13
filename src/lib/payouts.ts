import {
  all,
  type AccountRow,
  newId,
  nowIso,
  one,
  type PayoutRow,
  run,
  type UserRow,
  withTransaction,
} from "./db";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import { payoutAvailableCents } from "./accounts";
import { notify } from "./notifications";
import type { PayoutDTO } from "./types";
import { PAYOUT_MIN_USD } from "./challenges";

export function payoutMethodLabel(method: string): string {
  if (method === "card") return "Card";
  if (method === "bank") return "Bank transfer";
  if (method === "crypto") return "Crypto";
  return method;
}

function makeReference(): string {
  return `AN-PO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapPayout(row: PayoutRow, account?: AccountRow): PayoutDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    accountNumber: account?.number ?? "—",
    accountSize: account ? centsToUsd(account.account_size_cents) : 0,
    amount: centsToUsd(row.amount_cents),
    fee: centsToUsd(row.fee_cents),
    net: centsToUsd(row.net_cents),
    status: row.status,
    method: payoutMethodLabel(row.method),
    destination: row.destination,
    reference: row.reference,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
  };
}

export function getPayoutsForUser(userId: string): PayoutDTO[] {
  const rows = all<PayoutRow>("SELECT * FROM payouts WHERE user_id = ? ORDER BY requested_at DESC", [
    userId,
  ]);
  return rows.map((row) => {
    const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [row.account_id]);
    return mapPayout(row, account);
  });
}

export function getPayoutRowsForUser(userId: string): PayoutRow[] {
  return all<PayoutRow>("SELECT * FROM payouts WHERE user_id = ? ORDER BY requested_at DESC", [userId]);
}

export function requestPayout(
  user: UserRow,
  account: AccountRow,
  input: { amount: number; method: "card" | "bank" | "crypto"; destination: string },
): PayoutDTO {
  if (account.status !== "active" || account.type !== "funded") {
    throw new ApiError(400, "Payouts are available on active funded accounts.");
  }
  if (user.kyc_status !== "verified") {
    throw new ApiError(400, "Complete identity verification in Settings before requesting a payout.");
  }
  const amountCents = Math.round(input.amount * 100);
  if (amountCents < PAYOUT_MIN_USD * 100) {
    throw new ApiError(400, `Minimum payout is $${PAYOUT_MIN_USD}.`);
  }
  const available = payoutAvailableCents(account);
  if (amountCents > available) {
    throw new ApiError(
      400,
      `Payout exceeds available profit. Available: ${centsToUsd(available).toFixed(2)} USD.`,
    );
  }

  const split = account.profit_split_pct;
  const feeCents = Math.round(amountCents * (1 - split / 100));
  const netCents = amountCents - feeCents;
  const id = newId();
  const reference = makeReference();
  const now = nowIso();

  withTransaction(() => {
    run(
      "UPDATE accounts SET balance_cents = balance_cents - ?, day_start_equity_cents = MAX(0, day_start_equity_cents - ?), high_water_mark_cents = MAX(start_balance_cents, high_water_mark_cents - ?) WHERE id = ?",
      [amountCents, amountCents, amountCents, account.id],
    );
    run(
      `INSERT INTO payouts (id, user_id, account_id, amount_cents, fee_cents, net_cents, status, method, destination, reference, requested_at, processed_at, note)
       VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, NULL, NULL)`,
      [
        id,
        user.id,
        account.id,
        amountCents,
        feeCents,
        netCents,
        input.method,
        input.destination,
        reference,
        now,
      ],
    );
    run(
      `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
       VALUES (?, ?, ?, 'payout', ?, 'processing', ?, ?, ?, ?, NULL)`,
      [
        newId(),
        user.id,
        account.id,
        -amountCents,
        payoutMethodLabel(input.method),
        reference,
        `Payout $${centsToUsd(amountCents).toFixed(2)} gross · $${centsToUsd(netCents).toFixed(2)} net (${split}% split)`,
        now,
      ],
    );
    notify(
      user.id,
      "Payout request received",
      `Your $${centsToUsd(netCents).toFixed(2)} payout from account ${account.number} is being reviewed.`,
      "info",
    );
  });

  const row = one<PayoutRow>("SELECT * FROM payouts WHERE id = ?", [id])!;
  const freshAccount = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
  return mapPayout(row, freshAccount);
}

export function completePayout(payoutId: string): boolean {
  const payout = one<PayoutRow>("SELECT * FROM payouts WHERE id = ?", [payoutId]);
  if (!payout || payout.status !== "processing") return false;
  withTransaction(() => {
    run(
      "UPDATE payouts SET status = 'completed', processed_at = ?, note = COALESCE(note, 'Processed by Anerith payouts') WHERE id = ?",
      [nowIso(), payoutId],
    );
    run(
      "UPDATE accounts SET total_payouts_cents = total_payouts_cents + ? WHERE id = ?",
      [payout.net_cents, payout.account_id],
    );
    run(
      `UPDATE transactions SET status = 'completed', completed_at = ?
       WHERE reference = ? AND type = 'payout'`,
      [nowIso(), payout.reference],
    );
    notify(
      payout.user_id,
      "Payout processed",
      `Your payout has been sent. $${centsToUsd(payout.net_cents).toFixed(2)} net is on its way. Ref ${payout.reference}.`,
      "success",
    );
  });
  return true;
}

export function rejectPayout(payoutId: string, reason: string): boolean {
  const payout = one<PayoutRow>("SELECT * FROM payouts WHERE id = ?", [payoutId]);
  if (!payout || payout.status !== "processing") return false;
  withTransaction(() => {
    run(
      `UPDATE accounts SET balance_cents = balance_cents + ?, day_start_equity_cents = day_start_equity_cents + ?,
       high_water_mark_cents = high_water_mark_cents + ? WHERE id = ?`,
      [payout.amount_cents, payout.amount_cents, payout.amount_cents, payout.account_id],
    );
    run(
      "UPDATE payouts SET status = 'rejected', processed_at = ?, note = ? WHERE id = ?",
      [nowIso(), reason, payoutId],
    );
    run(
      `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
       VALUES (?, ?, ?, 'payout_reversal', ?, 'completed', NULL, ?, ?, ?, ?)`,
      [
        newId(),
        payout.user_id,
        payout.account_id,
        payout.amount_cents,
        payout.reference,
        `Payout rejected — funds returned (${reason})`,
        nowIso(),
        nowIso(),
      ],
    );
    notify(
      payout.user_id,
      "Payout request declined",
      `Your payout ${payout.reference} was declined: ${reason}. The reserved profit has been returned to your account.`,
      "danger",
    );
  });
  return true;
}

export function autoCompletePayouts(olderThanMs = 45_000): void {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const rows = all<PayoutRow>(
    "SELECT * FROM payouts WHERE status = 'processing' AND requested_at <= ?",
    [cutoff],
  );
  for (const row of rows) {
    completePayout(row.id);
  }
}

export function getPayoutRowForAdmin(payoutId: string): PayoutRow | undefined {
  return one<PayoutRow>("SELECT * FROM payouts WHERE id = ?", [payoutId]);
}
