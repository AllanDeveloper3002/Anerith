import { cookies } from "next/headers";
import {
  all,
  type AccountRow,
  type BrokerConnectionRow,
  newId,
  nextAccountNumber,
  nowIso,
  one,
  type PositionRow,
  run,
  utcDate,
} from "./db";
import { ACTIVE_ACCOUNT_COOKIE } from "./auth";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import type { AccountDTO, AccountObjectivesDTO, RiskCompliance } from "./types";
import {
  accountTypeForPlan,
  type ChallengePlanKey,
  type DrawdownMode,
  getPlan,
  phaseLabel,
  phaseTarget,
  TRIAL_PLAN,
} from "./challenges";
import { computeAccountRisk, profitTargetPctFor, resolveRiskConfig } from "./risk";
import { executionSettings } from "./market-data";

export interface AccountMath {
  positions: PositionRow[];
  balanceCents: number;
  floatingCents: number;
  marginCents: number;
  equityCents: number;
  freeCents: number;
  marginLevelPct: number | null;
  profitCents: number;
  tradingDays: number;
  dailyLossUsedCents: number;
  drawdownUsedCents: number;
  dailyLossLimitCents: number;
  drawdownLimitCents: number;
  dailyLossRemainingCents: number;
  drawdownRemainingCents: number;
  profitTargetCents: number | null;
  profitTargetPct: number | null;
  dailyLossPct: number;
  maxDrawdownPct: number;
  drawdownMode: DrawdownMode;
  maxTradingDays: number | null;
  minTradingDays: number;
  tradingDaysRemaining: number | null;
  dailyResetTimezone: string;
  dailyResetHour: number;
  dailyResetMinute: number;
  exposureCents: number;
  riskPerTradeLimitCents: number;
  compliance: RiskCompliance;
  configName: string;
}

export function accountMath(account: AccountRow): AccountMath {
  const state = computeAccountRisk(account);
  const { metrics, config } = state;
  return {
    positions: state.positions,
    balanceCents: metrics.balanceCents,
    floatingCents: metrics.floatingCents,
    marginCents: metrics.marginCents,
    equityCents: metrics.equityCents,
    freeCents: metrics.freeCents,
    marginLevelPct: metrics.marginLevelPct,
    profitCents: metrics.realizedPnlCents,
    tradingDays: metrics.tradingDays,
    dailyLossUsedCents: metrics.dailyLoss.usedCents,
    drawdownUsedCents: metrics.drawdown.usedCents,
    dailyLossLimitCents: metrics.dailyLoss.limitCents,
    drawdownLimitCents: metrics.drawdown.limitCents,
    dailyLossRemainingCents: metrics.dailyLoss.remainingCents,
    drawdownRemainingCents: metrics.drawdown.remainingCents,
    profitTargetCents: metrics.profitTargetCents,
    profitTargetPct: profitTargetPctFor(account, config),
    dailyLossPct: config.dailyLossPct,
    maxDrawdownPct: config.drawdownPct,
    drawdownMode: config.drawdownMode,
    maxTradingDays: metrics.maxTradingDays,
    minTradingDays: metrics.minTradingDays,
    tradingDaysRemaining: metrics.tradingDaysRemaining,
    dailyResetTimezone: metrics.timezone,
    dailyResetHour: metrics.resetHour,
    dailyResetMinute: metrics.resetMinute,
    exposureCents: metrics.exposureCents,
    riskPerTradeLimitCents: metrics.riskPerTradeLimitCents,
    compliance: metrics.compliance,
    configName: config.name,
  };
}

function pct(value: number): number {
  return Number(value.toFixed(2));
}

function objectivesFor(account: AccountRow, math: AccountMath): AccountObjectivesDTO {
  const dailyLossLimit = centsToUsd(math.dailyLossLimitCents);
  const drawdownLimit = centsToUsd(math.drawdownLimitCents);
  const target = math.profitTargetCents == null ? null : centsToUsd(math.profitTargetCents);
  const profit = centsToUsd(math.profitCents);
  return {
    profitTargetPct: math.profitTargetPct,
    profitTargetUsd: target,
    profitCurrentUsd: profit,
    profitProgressPct: target && target > 0 ? pct(Math.max(0, Math.min(100, (profit / target) * 100))) : 0,
    tradingDays: math.tradingDays,
    minTradingDays: math.minTradingDays,
    minDaysMet: math.tradingDays >= math.minTradingDays,
    maxTradingDays: math.maxTradingDays,
    dailyResetTimezone: math.dailyResetTimezone,
    dailyResetHour: math.dailyResetHour,
    dailyResetMinute: math.dailyResetMinute,
    dailyLossPct: math.dailyLossPct,
    dailyLossLimitUsd: dailyLossLimit,
    dailyLossUsedUsd: centsToUsd(math.dailyLossUsedCents),
    dailyLossProgressPct: dailyLossLimit > 0 ? pct((centsToUsd(math.dailyLossUsedCents) / dailyLossLimit) * 100) : 0,
    maxDrawdownPct: math.maxDrawdownPct,
    maxDrawdownLimitUsd: drawdownLimit,
    drawdownUsedUsd: centsToUsd(math.drawdownUsedCents),
    drawdownProgressPct: drawdownLimit > 0 ? pct((centsToUsd(math.drawdownUsedCents) / drawdownLimit) * 100) : 0,
    drawdownMode: math.drawdownMode,
  };
}

export function payoutAvailableCents(account: AccountRow): number {
  if (account.type !== "funded" || account.status !== "active") return 0;
  return Math.max(0, account.balance_cents - account.start_balance_cents);
}

export function summarizeAccount(account: AccountRow): AccountDTO {
  const math = accountMath(account);
  const broker = account.broker_connection_id
    ? one<BrokerConnectionRow>("SELECT * FROM broker_connections WHERE id = ?", [account.broker_connection_id])
    : undefined;
  const provider = executionSettings().provider;

  return {
    id: account.id,
    number: account.number,
    type: account.type,
    plan: account.plan,
    phase: account.phase,
    status: account.status,
    size: centsToUsd(account.account_size_cents),
    leverage: account.leverage,
    balance: centsToUsd(math.balanceCents),
    equity: centsToUsd(math.equityCents),
    margin: centsToUsd(math.marginCents),
    freeMargin: centsToUsd(math.freeCents),
    marginLevel: math.marginLevelPct === null ? null : pct(math.marginLevelPct),
    floating: centsToUsd(math.floatingCents),
    openPositions: math.positions.length,
    startBalance: centsToUsd(account.start_balance_cents),
    profitSplitPct: account.profit_split_pct,
    payoutAvailable: centsToUsd(payoutAvailableCents(account)),
    totalPayouts: centsToUsd(account.total_payouts_cents),
    objectives: objectivesFor(account, math),
    broker: broker
      ? {
          id: broker.id,
          name: broker.name,
          environment: broker.environment,
          login: account.broker_login,
        }
      : null,
    createdAt: account.created_at,
    endedAt: account.ended_at,
    failReason: account.fail_reason,
    breachedAt: account.breached_at,
    breachRule: account.breach_rule,
    breachDetail: account.breach_detail,
    suspendedAt: account.suspended_at,
    suspensionReason: account.suspension_reason,
    maxTradingDays: math.maxTradingDays,
    executionProvider: provider,
    simulatedExecution: provider === "internal-simulated",
  };
}

export function getAccountsForUser(userId: string): AccountRow[] {
  return all<AccountRow>(
    "SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
}

export function getAccountForUser(userId: string, accountId: string): AccountRow {
  const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ? AND user_id = ?", [
    accountId,
    userId,
  ]);
  if (!account) throw new ApiError(404, "Trading account not found.");
  return account;
}

async function activeAccountIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ACCOUNT_COOKIE)?.value ?? null;
}

export async function getActiveAccountOrNull(userId: string): Promise<AccountRow | null> {
  const cookieId = await activeAccountIdFromCookie();
  if (cookieId) {
    const row = one<AccountRow>("SELECT * FROM accounts WHERE id = ? AND user_id = ?", [
      cookieId,
      userId,
    ]);
    if (row && row.status === "active") return row;
  }
  const rows = getAccountsForUser(userId).filter((a) => a.status === "active");
  return rows[0] ?? null;
}

export async function getActiveAccount(userId: string): Promise<AccountRow> {
  const account = await getActiveAccountOrNull(userId);
  if (!account) throw new ApiError(400, "You need an active evaluation or funded account.");
  return account;
}

export async function getAccountSummaries(
  userId: string,
): Promise<{ accounts: AccountDTO[]; activeId: string }> {
  const rows = getAccountsForUser(userId);
  const active = await getActiveAccountOrNull(userId);
  return {
    accounts: rows.map(summarizeAccount),
    activeId: active?.id ?? rows[0]?.id ?? "",
  };
}

function brokerFor(environment: "demo" | "live"): BrokerConnectionRow | undefined {
  return one<BrokerConnectionRow>(
    "SELECT * FROM broker_connections WHERE environment = ? AND status = 'connected' ORDER BY created_at ASC LIMIT 1",
    [environment],
  );
}

function brokerLogin(): string {
  return String(80_000_000 + Math.floor(Math.random() * 19_999_999));
}

function insertAccount(input: {
  userId: string;
  type: AccountRow["type"];
  plan: ChallengePlanKey;
  phase: number;
  sizeCents: number;
  balanceCents: number;
  targetPct: number | null;
  dailyLossPct: number;
  maxDrawdownPct: number;
  drawdownMode: "static" | "trailing";
  minTradingDays: number;
  profitSplitPct: number;
  challengeId?: string | null;
}): AccountRow {
  const broker = brokerFor(input.type === "funded" ? "live" : "demo");
  const id = newId();
  run(
    `INSERT INTO accounts (
      id, user_id, number, type, plan, phase, account_size_cents, balance_cents, leverage, status,
      profit_target_pct, daily_loss_pct, max_drawdown_pct, drawdown_mode, min_trading_days, profit_split_pct,
      start_balance_cents, high_water_mark_cents, day_start_equity_cents, day_start_balance_cents, day_start_date, total_payouts_cents,
      challenge_id, broker_connection_id, broker_login, created_at, ended_at, fail_reason
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      100, 'active',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0,
      ?, ?, ?, ?, NULL, NULL
    )`,
    [
      id,
      input.userId,
      nextAccountNumber(),
      input.type,
      input.plan,
      input.phase,
      input.sizeCents,
      input.balanceCents,
      input.targetPct,
      input.dailyLossPct,
      input.maxDrawdownPct,
      input.drawdownMode,
      input.minTradingDays,
      input.profitSplitPct,
      input.sizeCents,
      input.balanceCents,
      input.balanceCents,
      input.balanceCents,
      utcDate(),
      input.challengeId ?? null,
      broker?.id ?? null,
      brokerLogin(),
      nowIso(),
    ],
  );
  return one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id])!;
}

export function provisionTrial(userId: string): AccountRow {
  return insertAccount({
    userId,
    type: "trial",
    plan: "trial",
    phase: 1,
    sizeCents: TRIAL_PLAN.sizes[0].size * 100,
    balanceCents: TRIAL_PLAN.sizes[0].size * 100,
    targetPct: TRIAL_PLAN.phaseTargets[0],
    dailyLossPct: TRIAL_PLAN.dailyLossPct,
    maxDrawdownPct: TRIAL_PLAN.maxDrawdownPct,
    drawdownMode: TRIAL_PLAN.drawdownMode,
    minTradingDays: TRIAL_PLAN.minTradingDays,
    profitSplitPct: 0,
  });
}

export function provisionChallengeAccount(
  userId: string,
  planKey: ChallengePlanKey,
  sizeCents: number,
  challengeId: string,
): AccountRow {
  const plan = getPlan(planKey);
  if (planKey === "trial") throw new ApiError(400, "Trials cannot be purchased.");
  const type = accountTypeForPlan(planKey);
  return insertAccount({
    userId,
    type,
    plan: planKey,
    phase: type === "funded" ? 0 : 1,
    sizeCents,
    balanceCents: sizeCents,
    targetPct: type === "funded" ? null : phaseTarget(planKey, 1),
    dailyLossPct: plan.dailyLossPct,
    maxDrawdownPct: plan.maxDrawdownPct,
    drawdownMode: plan.drawdownMode,
    minTradingDays: type === "funded" ? 0 : plan.minTradingDays,
    profitSplitPct: plan.profitSplitPct,
    challengeId,
  });
}

export function provisionNextAccount(parent: AccountRow): AccountRow | null {
  if (parent.type !== "evaluation") return null;
  const plan = getPlan(parent.plan);
  const config = resolveRiskConfig(parent);
  const nextPhase = parent.phase + 1;
  const nextTarget = parent.phase <= 1 ? config.phase2TargetPct : null;
  if (nextTarget != null) {
    return insertAccount({
      userId: parent.user_id,
      type: "evaluation",
      plan: parent.plan,
      phase: nextPhase,
      sizeCents: parent.account_size_cents,
      balanceCents: parent.account_size_cents,
      targetPct: nextTarget,
      dailyLossPct: config.dailyLossPct,
      maxDrawdownPct: config.drawdownPct,
      drawdownMode: config.drawdownMode,
      minTradingDays: config.minTradingDays,
      profitSplitPct: parent.profit_split_pct,
    });
  }
  return insertAccount({
    userId: parent.user_id,
    type: "funded",
    plan: parent.plan,
    phase: 0,
    sizeCents: parent.account_size_cents,
    balanceCents: parent.account_size_cents,
    targetPct: null,
    dailyLossPct: config.dailyLossPct,
    maxDrawdownPct: config.drawdownPct,
    drawdownMode: config.drawdownMode,
    minTradingDays: 0,
    profitSplitPct: plan.profitSplitPct,
  });
}

export function getAccountRow(accountId: string): AccountRow {
  const row = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!row) throw new ApiError(404, "Trading account not found.");
  return row;
}

export function currentAccountLabel(account: AccountRow): string {
  return phaseLabel({
    type: account.type,
    plan: account.plan,
    phase: account.phase,
    status: account.status,
  });
}
