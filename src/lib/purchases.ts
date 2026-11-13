import {
  all,
  type AccountRow,
  type ChallengeRow,
  newId,
  nowIso,
  one,
  run,
  type UserRow,
  withTransaction,
} from "./db";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import { getPlan, getSizeOption, type ChallengePlanKey, planName } from "./challenges";
import { provisionChallengeAccount } from "./accounts";
import { notify } from "./notifications";
import type { ChallengePurchaseDTO } from "./types";

function mapPurchase(row: ChallengeRow): ChallengePurchaseDTO {
  return {
    id: row.id,
    plan: row.plan,
    accountSize: centsToUsd(row.account_size_cents),
    price: centsToUsd(row.price_cents),
    method: row.method,
    reference: row.reference,
    status: row.status,
    accountId: row.account_id ?? "",
    createdAt: row.created_at,
  };
}

export function getPurchasesForUser(userId: string): ChallengePurchaseDTO[] {
  return all<ChallengeRow>(
    "SELECT * FROM challenges WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  ).map(mapPurchase);
}

export interface ChallengeOrderInput {
  plan: ChallengePlanKey;
  size: number;
  method: string;
  id?: string;
  reference?: string;
  createdAt?: string;
  noticeTitle?: string;
  priceCents?: number;
}

/**
 * Creates the challenge order, ledger entry and trading account.
 * Safe to call twice with the same id: an existing order returns its account.
 */
export function completeChallengePurchase(
  userId: string,
  input: ChallengeOrderInput,
): { purchase: ChallengePurchaseDTO; account: AccountRow } {
  const plan = getPlan(input.plan);
  const size = getSizeOption(input.plan, input.size);
  if (!size) throw new ApiError(400, "This account size is not available for the selected plan.");
  if (size.price <= 0) throw new ApiError(400, "This program does not require checkout.");

  const id = input.id ?? newId();
  const reference = input.reference ?? `AN-CH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const now = input.createdAt ?? nowIso();
  const priceCents = input.priceCents ?? size.price * 100;

  const existing = one<ChallengeRow>("SELECT * FROM challenges WHERE id = ?", [id]);
  if (existing) {
    const account = existing.account_id
      ? one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [existing.account_id])
      : undefined;
    if (!account) throw new ApiError(409, "This order is already being processed.");
    return { purchase: mapPurchase(existing), account };
  }

  const account = provisionChallengeAccount(userId, input.plan, size.size * 100, id);
  run(
    `INSERT INTO challenges (id, user_id, plan, account_size_cents, price_cents, status, method, reference, account_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
    [id, userId, input.plan, size.size * 100, priceCents, input.method, reference, account.id, now],
  );
  run(
    `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
     VALUES (?, ?, NULL, 'challenge_purchase', ?, 'completed', ?, ?, ?, ?, ?)`,
    [
      newId(),
      userId,
      -priceCents,
      input.method,
      reference,
      `${plan.name} · $${size.size.toLocaleString("en-US")} account · ${planName(input.plan)}`,
      now,
      now,
    ],
  );
  notify(
    userId,
    input.noticeTitle ?? "Challenge activated",
    `Your ${plan.name} $${size.size.toLocaleString("en-US")} account ${account.number} is live. Good luck.`,
    "success",
  );

  const row = one<ChallengeRow>("SELECT * FROM challenges WHERE id = ?", [id])!;
  return { purchase: mapPurchase(row), account };
}

export function purchaseChallenge(
  user: UserRow,
  input: { plan: "one-step" | "two-step" | "instant"; size: number; method: "card" | "crypto" | "bank" },
): { purchase: ChallengePurchaseDTO; account: AccountRow } {
  return withTransaction(() =>
    completeChallengePurchase(user.id, {
      plan: input.plan,
      size: input.size,
      method: input.method,
    }),
  );
}
