import {
  all,
  type AccountRow,
  type OrderRow,
  type PositionRow,
  newId,
  nowIso,
  one,
  run,
  withTransaction,
} from "./db";
import type { Side } from "./instruments";
import { notionalCents, profitCents, requiredMarginCents } from "./finance";
import { getExecutionQuote } from "./market-data";
import { ApiError } from "./errors";
import { centsToUsd, fmtUsd } from "./format";
import { notify } from "./notifications";
import type { AccountStatus, DrawdownMode } from "./challenges";
import type { RiskCompliance } from "./types";

const SPREAD_PLAN = "standard" as const;
const DAY_MS = 86_400_000;
const SNAPSHOT_INTERVAL_MS = 15_000;
const EQUITY_SNAPSHOT_INTERVAL_MS = 60_000;

export type DailyLossBasis = "equity" | "balance";
export type DailyLimitBasis = "starting_balance" | "day_start_equity";
export type DrawdownBasis = "equity" | "balance";
export type RiskScope = "default" | "plan" | "account";

export interface RiskConfig {
  id: string;
  name: string;
  scope: RiskScope;
  planKey: string | null;
  accountId: string | null;
  enabled: boolean;
  profitTargetPct: number | null;
  phase2TargetPct: number | null;
  dailyLossPct: number;
  dailyLossBasis: DailyLossBasis;
  dailyLimitBasis: DailyLimitBasis;
  drawdownPct: number;
  drawdownMode: DrawdownMode;
  drawdownBasis: DrawdownBasis;
  trailingLockPct: number | null;
  minTradingDays: number;
  maxTradingDays: number | null;
  maxRiskPerTradePct: number;
  requireStopLoss: boolean;
  maxOpenPositions: number;
  maxTotalExposurePct: number;
  maxInstrumentExposurePct: number;
  maxPositionLots: number;
  maxLeverage: number;
  restrictedSymbols: string[];
  weekendHolding: boolean;
  weekendCloseHourUtc: number;
  newsTradingAllowed: boolean;
  newsBlackoutMinutes: number;
  closeOnBreach: boolean;
  resetTimezone: string;
  resetHour: number;
  resetMinute: number;
  updatedAt: string;
}

interface RiskConfigRow {
  id: string;
  name: string;
  scope: RiskScope;
  plan_key: string | null;
  account_id: string | null;
  enabled: number;
  profit_target_pct: number | null;
  phase2_target_pct: number | null;
  daily_loss_pct: number;
  daily_loss_basis: DailyLossBasis;
  daily_limit_basis: DailyLimitBasis;
  drawdown_pct: number;
  drawdown_mode: DrawdownMode;
  drawdown_basis: DrawdownBasis;
  trailing_lock_pct: number | null;
  min_trading_days: number;
  max_trading_days: number | null;
  max_risk_per_trade_pct: number;
  require_stop_loss: number;
  max_open_positions: number;
  max_total_exposure_pct: number;
  max_instrument_exposure_pct: number;
  max_position_lots: number;
  max_leverage: number;
  restricted_symbols: string;
  weekend_holding: number;
  weekend_close_hour_utc: number;
  news_trading_allowed: number;
  news_blackout_minutes: number;
  close_on_breach: number;
  reset_timezone: string;
  reset_hour: number;
  reset_minute: number;
  updated_at: string;
}

interface DailySnapshotRow {
  id: string;
  account_id: string;
  day_key: string;
  timezone: string;
  start_balance_cents: number;
  start_equity_cents: number;
  end_balance_cents: number;
  end_equity_cents: number;
  peak_equity_cents: number;
  trough_equity_cents: number;
  realized_pnl_cents: number;
  commission_cents: number;
  swap_cents: number;
  open_positions: number;
  traded: number;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
}

interface EquitySnapshotRow {
  equity_cents: number;
  recorded_at: string;
}

export interface NewsRow {
  id: string;
  title: string;
  symbol: string | null;
  impact: string;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
  cancelled_at: string | null;
}

export interface DailyLossComputation {
  referenceCents: number;
  currentCents: number;
  limitCents: number;
  usedCents: number;
  remainingCents: number;
  progressPct: number;
  breach: boolean;
  basis: DailyLossBasis;
  limitBasis: DailyLimitBasis;
}

export interface DrawdownComputation {
  limitCents: number;
  baselineCents: number;
  floorCents: number;
  usedCents: number;
  remainingCents: number;
  progressPct: number;
  breach: boolean;
  highWaterMarkCents: number;
  nextHighWaterMarkCents: number;
  locked: boolean;
  mode: DrawdownMode;
  basis: DrawdownBasis;
}

export interface RiskMetrics {
  accountId: string;
  status: AccountStatus;
  dayKey: string;
  timezone: string;
  resetHour: number;
  resetMinute: number;
  nextResetAt: string;
  balanceCents: number;
  equityCents: number;
  floatingCents: number;
  marginCents: number;
  freeCents: number;
  marginLevelPct: number | null;
  startBalanceCents: number;
  highWaterMarkCents: number;
  nextHighWaterMarkCents: number;
  realizedPnlCents: number;
  profitTargetCents: number | null;
  profitProgressPct: number;
  dailyLoss: DailyLossComputation;
  drawdown: DrawdownComputation;
  tradingDays: number;
  minTradingDays: number;
  maxTradingDays: number | null;
  tradingDaysRemaining: number | null;
  openPositions: number;
  pendingOrders: number;
  exposureCents: number;
  exposurePct: number;
  exposureBySymbol: { symbol: string; notionalCents: number; pct: number }[];
  riskPerTradeLimitCents: number;
  commissionTodayCents: number;
  swapTodayCents: number;
  realizedTodayCents: number;
  closedToday: number;
  weekendWindow: boolean;
  newsBlackout: boolean;
  compliance: RiskCompliance;
  violations: string[];
}

export interface RiskState {
  account: AccountRow;
  config: RiskConfig;
  metrics: RiskMetrics;
  positions: PositionRow[];
  pendingOrders: OrderRow[];
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  id: "builtin-default",
  name: "Institutional default",
  scope: "default",
  planKey: null,
  accountId: null,
  enabled: true,
  profitTargetPct: 10,
  phase2TargetPct: 5,
  dailyLossPct: 5,
  dailyLossBasis: "equity",
  dailyLimitBasis: "starting_balance",
  drawdownPct: 10,
  drawdownMode: "static",
  drawdownBasis: "equity",
  trailingLockPct: null,
  minTradingDays: 5,
  maxTradingDays: null,
  maxRiskPerTradePct: 1,
  requireStopLoss: true,
  maxOpenPositions: 20,
  maxTotalExposurePct: 300,
  maxInstrumentExposurePct: 100,
  maxPositionLots: 50,
  maxLeverage: 2000,
  restrictedSymbols: [],
  weekendHolding: true,
  weekendCloseHourUtc: 21,
  newsTradingAllowed: true,
  newsBlackoutMinutes: 30,
  closeOnBreach: true,
  resetTimezone: "UTC",
  resetHour: 0,
  resetMinute: 0,
  updatedAt: new Date(0).toISOString(),
};

export function rowToRiskConfig(row: RiskConfigRow): RiskConfig {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    planKey: row.plan_key,
    accountId: row.account_id,
    enabled: Boolean(row.enabled),
    profitTargetPct: row.profit_target_pct,
    phase2TargetPct: row.phase2_target_pct,
    dailyLossPct: row.daily_loss_pct,
    dailyLossBasis: row.daily_loss_basis,
    dailyLimitBasis: row.daily_limit_basis,
    drawdownPct: row.drawdown_pct,
    drawdownMode: row.drawdown_mode,
    drawdownBasis: row.drawdown_basis,
    trailingLockPct: row.trailing_lock_pct,
    minTradingDays: row.min_trading_days,
    maxTradingDays: row.max_trading_days,
    maxRiskPerTradePct: row.max_risk_per_trade_pct,
    requireStopLoss: Boolean(row.require_stop_loss),
    maxOpenPositions: row.max_open_positions,
    maxTotalExposurePct: row.max_total_exposure_pct,
    maxInstrumentExposurePct: row.max_instrument_exposure_pct,
    maxPositionLots: row.max_position_lots,
    maxLeverage: row.max_leverage,
    restrictedSymbols: JSON.parse(row.restricted_symbols) as string[],
    weekendHolding: Boolean(row.weekend_holding),
    weekendCloseHourUtc: row.weekend_close_hour_utc,
    newsTradingAllowed: Boolean(row.news_trading_allowed),
    newsBlackoutMinutes: row.news_blackout_minutes,
    closeOnBreach: Boolean(row.close_on_breach),
    resetTimezone: row.reset_timezone,
    resetHour: row.reset_hour,
    resetMinute: row.reset_minute,
    updatedAt: row.updated_at,
  };
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(at: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(at);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(guess), timezone);
    const rendered = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = target - rendered;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** The trading day label for an instant, honouring the configured reset time. */
export function tradingDayKey(
  at: Date,
  timezone: string,
  resetHour = 0,
  resetMinute = 0,
): string {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const parts = zonedParts(at, tz);
  const minutes = parts.hour * 60 + parts.minute;
  const resetMinutes = Math.max(0, Math.min(23, resetHour)) * 60 + Math.max(0, Math.min(59, resetMinute));
  let dayValue = Date.UTC(parts.year, parts.month - 1, parts.day);
  if (minutes < resetMinutes) dayValue -= DAY_MS;
  return new Date(dayValue).toISOString().slice(0, 10);
}

/** The instant at which the current trading day began. */
export function currentDayStart(
  at: Date,
  timezone: string,
  resetHour = 0,
  resetMinute = 0,
): Date {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const dayKey = tradingDayKey(at, tz, resetHour, resetMinute);
  const [year, month, day] = dayKey.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, resetHour, resetMinute, tz);
}

/** The instant of the next daily reset. */
export function nextResetInstant(
  at: Date,
  timezone: string,
  resetHour = 0,
  resetMinute = 0,
): Date {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const dayKey = tradingDayKey(at, tz, resetHour, resetMinute);
  const [year, month, day] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + DAY_MS);
  return zonedTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    resetHour,
    resetMinute,
    tz,
  );
}

export function computeDailyLoss(input: {
  basis: DailyLossBasis;
  limitBasis: DailyLimitBasis;
  pct: number;
  initialBalanceCents: number;
  dayStartBalanceCents: number;
  dayStartEquityCents: number;
  balanceCents: number;
  equityCents: number;
}): DailyLossComputation {
  const referenceCents =
    input.basis === "balance" ? input.dayStartBalanceCents : input.dayStartEquityCents;
  const currentCents = input.basis === "balance" ? input.balanceCents : input.equityCents;
  const limitBase =
    input.limitBasis === "day_start_equity" ? input.dayStartEquityCents : input.initialBalanceCents;
  const limitCents = Math.max(0, Math.round((limitBase * input.pct) / 100));
  const usedCents = Math.max(0, referenceCents - currentCents);
  return {
    referenceCents,
    currentCents,
    limitCents,
    usedCents,
    remainingCents: Math.max(0, limitCents - usedCents),
    progressPct: limitCents > 0 ? (usedCents / limitCents) * 100 : 0,
    breach: limitCents > 0 && usedCents >= limitCents,
    basis: input.basis,
    limitBasis: input.limitBasis,
  };
}

export function computeDrawdown(input: {
  mode: DrawdownMode;
  basis: DrawdownBasis;
  pct: number;
  initialBalanceCents: number;
  highWaterMarkCents: number;
  balanceCents: number;
  equityCents: number;
  trailingLockPct: number | null;
}): DrawdownComputation {
  const currentCents = input.basis === "balance" ? input.balanceCents : input.equityCents;
  const limitCents = Math.max(0, Math.round((input.initialBalanceCents * input.pct) / 100));
  let baselineCents = input.initialBalanceCents;
  let floorCents = input.initialBalanceCents - limitCents;
  let highWaterMarkCents = Math.max(input.initialBalanceCents, input.highWaterMarkCents);
  let locked = false;

  if (input.mode === "trailing") {
    highWaterMarkCents = Math.max(highWaterMarkCents, currentCents);
    floorCents = highWaterMarkCents - limitCents;
    if (input.trailingLockPct != null) {
      const lockFloor = input.initialBalanceCents + Math.round((input.initialBalanceCents * input.trailingLockPct) / 100);
      if (floorCents < lockFloor) {
        floorCents = lockFloor;
        locked = true;
      }
    }
    baselineCents = floorCents + limitCents;
  }

  const usedCents = Math.max(0, baselineCents - currentCents);
  return {
    limitCents,
    baselineCents,
    floorCents,
    usedCents,
    remainingCents: Math.max(0, limitCents - usedCents),
    progressPct: limitCents > 0 ? (usedCents / limitCents) * 100 : 0,
    breach: limitCents > 0 && usedCents >= limitCents,
    highWaterMarkCents,
    nextHighWaterMarkCents:
      input.mode === "trailing" ? Math.max(input.highWaterMarkCents, currentCents) : input.highWaterMarkCents,
    locked,
    mode: input.mode,
    basis: input.basis,
  };
}

export function countTradingDays(
  dates: string[],
  timezone: string,
  resetHour: number,
  resetMinute: number,
): number {
  const keys = new Set<string>();
  for (const iso of dates) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    keys.add(tradingDayKey(at, timezone, resetHour, resetMinute));
  }
  return keys.size;
}

export function isWeekendWindow(now: Date, config: Pick<RiskConfig, "weekendCloseHourUtc">): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 5 && hour >= config.weekendCloseHourUtc) return true;
  if (day === 6) return true;
  if (day === 0 && hour < 21) return true;
  return false;
}

export function resolveRiskConfig(account: AccountRow): RiskConfig {
  const accountScoped = account.risk_config_id
    ? one<RiskConfigRow>("SELECT * FROM risk_configs WHERE id = ? AND enabled = 1", [
        account.risk_config_id,
      ])
    : one<RiskConfigRow>(
        "SELECT * FROM risk_configs WHERE scope = 'account' AND account_id = ? AND enabled = 1 LIMIT 1",
        [account.id],
      );
  const planScoped =
    accountScoped ??
    one<RiskConfigRow>(
      "SELECT * FROM risk_configs WHERE scope = 'plan' AND plan_key = ? AND enabled = 1 LIMIT 1",
      [account.plan],
    );
  const row =
    planScoped ??
    one<RiskConfigRow>("SELECT * FROM risk_configs WHERE scope = 'default' AND enabled = 1 LIMIT 1");
  const config = row ? rowToRiskConfig(row) : { ...DEFAULT_RISK_CONFIG };
  if (!isValidTimeZone(config.resetTimezone)) config.resetTimezone = "UTC";
  if (account.max_trading_days != null) config.maxTradingDays = account.max_trading_days;
  return config;
}

export function profitTargetPctFor(account: AccountRow, config: RiskConfig): number | null {
  if (account.type === "funded") return null;
  const configured =
    account.phase <= 1
      ? config.profitTargetPct
      : (config.phase2TargetPct ?? config.profitTargetPct);
  return configured ?? account.profit_target_pct;
}

function getAccount(accountId: string): AccountRow {
  const row = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!row) throw new ApiError(404, "Trading account not found.");
  return row;
}

function hasNewsBlackout(symbol: string | null, now: Date, minutes: number): boolean {
  const pad = Math.max(0, minutes) * 60_000;
  const from = new Date(now.getTime() - pad).toISOString();
  const to = new Date(now.getTime() + pad).toISOString();
  const row = one<{ c: number }>(
    `SELECT COUNT(*) as c FROM news_events
     WHERE cancelled_at IS NULL AND starts_at <= ? AND ends_at >= ?
       AND (symbol IS NULL OR ? IS NULL OR symbol = ?)`,
    [to, from, symbol, symbol],
  );
  return (row?.c ?? 0) > 0;
}

export function dailyAggregates(accountId: string, dayStartIso: string): {
  realizedCents: number;
  commissionCents: number;
  swapCents: number;
  closedCount: number;
} {
  const realized =
    one<{ v: number }>(
      `SELECT COALESCE(SUM(profit_cents), 0) as v FROM positions
       WHERE account_id = ? AND status = 'closed' AND closed_at >= ?`,
      [accountId, dayStartIso],
    )?.v ?? 0;
  const swap =
    one<{ v: number }>(
      `SELECT COALESCE(SUM(swap_cents), 0) as v FROM positions
       WHERE account_id = ? AND status = 'closed' AND closed_at >= ?`,
      [accountId, dayStartIso],
    )?.v ?? 0;
  const closedCount =
    one<{ v: number }>(
      `SELECT COUNT(*) as v FROM positions
       WHERE account_id = ? AND status = 'closed' AND closed_at >= ?`,
      [accountId, dayStartIso],
    )?.v ?? 0;
  const commission =
    one<{ v: number }>(
      `SELECT COALESCE(SUM(-amount_cents), 0) as v FROM transactions
       WHERE account_id = ? AND type = 'commission' AND created_at >= ?`,
      [accountId, dayStartIso],
    )?.v ?? 0;
  return {
    realizedCents: realized,
    commissionCents: commission,
    swapCents: swap,
    closedCount,
  };
}

export function computeAccountRisk(
  account: AccountRow,
  options: { now?: Date; config?: RiskConfig } = {},
): RiskState {
  const now = options.now ?? new Date();
  const config = options.config ?? resolveRiskConfig(account);
  const positions = all<PositionRow>(
    "SELECT * FROM positions WHERE account_id = ? AND status = 'open' ORDER BY opened_at DESC",
    [account.id],
  );
  const pendingOrders = all<OrderRow>(
    "SELECT * FROM orders WHERE account_id = ? AND status = 'pending'",
    [account.id],
  );

  let floatingCents = 0;
  let marginCents = 0;
  let exposureCents = 0;
  const exposureMap = new Map<string, number>();
  const timestamp = now.getTime();
  for (const position of positions) {
    const quote = getExecutionQuote(position.symbol, SPREAD_PLAN, timestamp);
    const exit = position.side === "buy" ? quote.bid : quote.ask;
    floatingCents += profitCents(position.symbol, position.side, position.lots, position.entry_price, exit, timestamp);
    marginCents += requiredMarginCents(account.leverage, position.symbol, position.lots, position.entry_price, timestamp);
    const notional = notionalCents(position.symbol, position.lots, exit, timestamp);
    exposureCents += notional;
    exposureMap.set(position.symbol, (exposureMap.get(position.symbol) ?? 0) + notional);
  }

  const equityCents = account.balance_cents + floatingCents;
  const freeCents = equityCents - marginCents;
  const marginLevelPct = marginCents > 0 ? (equityCents / marginCents) * 100 : null;

  const dayKey = tradingDayKey(now, config.resetTimezone, config.resetHour, config.resetMinute);
  const sameDay = account.day_start_date === dayKey;
  const dayStartBalanceCents = sameDay
    ? account.day_start_balance_cents > 0
      ? account.day_start_balance_cents
      : account.balance_cents
    : account.balance_cents;
  const dayStartEquityCents = sameDay
    ? account.day_start_equity_cents > 0
      ? account.day_start_equity_cents
      : equityCents
    : equityCents;

  const dailyLoss = computeDailyLoss({
    basis: config.dailyLossBasis,
    limitBasis: config.dailyLimitBasis,
    pct: config.dailyLossPct,
    initialBalanceCents: account.start_balance_cents,
    dayStartBalanceCents,
    dayStartEquityCents,
    balanceCents: account.balance_cents,
    equityCents,
  });

  const drawdown = computeDrawdown({
    mode: config.drawdownMode,
    basis: config.drawdownBasis,
    pct: config.drawdownPct,
    initialBalanceCents: account.start_balance_cents,
    highWaterMarkCents: account.high_water_mark_cents,
    balanceCents: account.balance_cents,
    equityCents,
    trailingLockPct: config.trailingLockPct,
  });

  const closedDates = all<{ closed_at: string }>(
    `SELECT closed_at FROM positions
     WHERE account_id = ? AND status = 'closed' AND closed_at IS NOT NULL`,
    [account.id],
  ).map((row) => row.closed_at);
  const tradingDays = countTradingDays(
    closedDates,
    config.resetTimezone,
    config.resetHour,
    config.resetMinute,
  );

  const dayStart = currentDayStart(now, config.resetTimezone, config.resetHour, config.resetMinute);
  const aggregates = dailyAggregates(account.id, dayStart.toISOString());

  const targetPct = profitTargetPctFor(account, config);
  const profitTargetCents =
    targetPct == null ? null : Math.max(0, Math.round((account.start_balance_cents * targetPct) / 100));
  const realizedPnlCents = account.balance_cents - account.start_balance_cents;
  const profitProgressPct =
    profitTargetCents && profitTargetCents > 0
      ? Math.max(0, Math.min(100, (realizedPnlCents / profitTargetCents) * 100))
      : 0;

  const maxTradingDays = config.maxTradingDays;
  const tradingDaysRemaining =
    maxTradingDays == null ? null : Math.max(0, maxTradingDays - tradingDays);

  const exposureBase = Math.max(1, Math.abs(equityCents));
  const exposureBySymbol = [...exposureMap.entries()]
    .map(([symbol, notionalCents]) => ({
      symbol,
      notionalCents,
      pct: (notionalCents / exposureBase) * 100,
    }))
    .sort((a, b) => b.notionalCents - a.notionalCents);

  const violations: string[] = [];
  if (dailyLoss.breach) {
    violations.push(
      `Daily loss limit of ${fmtUsd(centsToUsd(dailyLoss.limitCents))} reached (used ${fmtUsd(centsToUsd(dailyLoss.usedCents))}).`,
    );
  }
  if (drawdown.breach) {
    violations.push(
      `Maximum drawdown of ${fmtUsd(centsToUsd(drawdown.limitCents))} breached (used ${fmtUsd(centsToUsd(drawdown.usedCents))}).`,
    );
  }
  if (maxTradingDays != null && tradingDays > maxTradingDays) {
    violations.push(`Maximum trading days (${maxTradingDays}) exceeded.`);
  }

  const breached = account.status === "breached" || violations.length > 0;
  const compliance: RiskCompliance = breached
    ? "breached"
    : dailyLoss.progressPct >= 80 ||
        drawdown.progressPct >= 80 ||
        (tradingDaysRemaining != null && tradingDaysRemaining <= 1)
      ? "warning"
      : "safe";

  return {
    account,
    config,
    positions,
    pendingOrders,
    metrics: {
      accountId: account.id,
      status: account.status,
      dayKey,
      timezone: config.resetTimezone,
      resetHour: config.resetHour,
      resetMinute: config.resetMinute,
      nextResetAt: nextResetInstant(
        now,
        config.resetTimezone,
        config.resetHour,
        config.resetMinute,
      ).toISOString(),
      balanceCents: account.balance_cents,
      equityCents,
      floatingCents,
      marginCents,
      freeCents,
      marginLevelPct,
      startBalanceCents: account.start_balance_cents,
      highWaterMarkCents: drawdown.highWaterMarkCents,
      nextHighWaterMarkCents: drawdown.nextHighWaterMarkCents,
      realizedPnlCents,
      profitTargetCents,
      profitProgressPct,
      dailyLoss,
      drawdown,
      tradingDays,
      minTradingDays: config.minTradingDays,
      maxTradingDays,
      tradingDaysRemaining,
      openPositions: positions.length,
      pendingOrders: pendingOrders.length,
      exposureCents,
      exposurePct: (exposureCents / exposureBase) * 100,
      exposureBySymbol,
      riskPerTradeLimitCents: Math.max(
        0,
        Math.round((account.start_balance_cents * config.maxRiskPerTradePct) / 100),
      ),
      commissionTodayCents: aggregates.commissionCents,
      swapTodayCents: aggregates.swapCents,
      realizedTodayCents: aggregates.realizedCents,
      closedToday: aggregates.closedCount,
      weekendWindow: isWeekendWindow(now, config),
      newsBlackout: !config.newsTradingAllowed
        ? hasNewsBlackout(null, now, config.newsBlackoutMinutes)
        : false,
      compliance,
      violations,
    },
  };
}

function recordEquitySnapshot(account: AccountRow, metrics: RiskMetrics, now: Date): void {
  const last = one<EquitySnapshotRow>(
    "SELECT equity_cents, recorded_at FROM equity_snapshots WHERE account_id = ? ORDER BY recorded_at DESC LIMIT 1",
    [account.id],
  );
  const lastMs = last ? Date.parse(last.recorded_at) : 0;
  const delta = last ? Math.abs(metrics.equityCents - last.equity_cents) : 0;
  const significant = !last || delta >= Math.max(100, Math.round(metrics.startBalanceCents * 0.0025));
  if (last && now.getTime() - lastMs < EQUITY_SNAPSHOT_INTERVAL_MS && !significant) return;
  run(
    `INSERT INTO equity_snapshots (
      id, account_id, balance_cents, equity_cents, floating_cents, margin_cents, exposure_cents,
      open_positions, daily_loss_cents, drawdown_cents, source, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tick', ?)`,
    [
      newId(),
      account.id,
      metrics.balanceCents,
      metrics.equityCents,
      metrics.floatingCents,
      metrics.marginCents,
      metrics.exposureCents,
      metrics.openPositions,
      metrics.dailyLoss.usedCents,
      metrics.drawdown.usedCents,
      now.toISOString(),
    ],
  );
}

const globalRef = globalThis as unknown as { __anerithRiskSync?: Map<string, number> };
const lastSync = globalRef.__anerithRiskSync ?? new Map<string, number>();
globalRef.__anerithRiskSync = lastSync;

/**
 * Persist the day-start snapshot, trailing high-water mark and equity curve.
 * Safe to call every tick: writes are throttled except for day rollover and new highs.
 */
export function syncRiskState(
  accountId: string,
  options: { now?: Date; recordEquity?: boolean } = {},
): RiskState {
  const now = options.now ?? new Date();
  let account = getAccount(accountId);
  let config = resolveRiskConfig(account);
  let state = computeAccountRisk(account, { now, config });

  const existing = one<DailySnapshotRow>(
    "SELECT * FROM account_daily_snapshots WHERE account_id = ? AND day_key = ?",
    [accountId, state.metrics.dayKey],
  );
  const rollover = account.day_start_date !== state.metrics.dayKey;
  const stale = !existing || now.getTime() - Date.parse(existing.updated_at) >= SNAPSHOT_INTERVAL_MS;
  const hwmWrite =
    config.drawdownMode === "trailing" &&
    state.metrics.nextHighWaterMarkCents > account.high_water_mark_cents;

  if (!rollover && !stale && !hwmWrite) {
    if (options.recordEquity) recordEquitySnapshot(account, state.metrics, now);
    return state;
  }

  withTransaction(() => {
    const fresh = getAccount(accountId);
    const dayKey = state.metrics.dayKey;

    if (fresh.day_start_date !== dayKey) {
      run(
        `UPDATE account_daily_snapshots SET finalized_at = ?
         WHERE account_id = ? AND day_key < ? AND finalized_at IS NULL`,
        [nowIso(), fresh.id, dayKey],
      );
      run(
        `UPDATE accounts SET day_start_date = ?, day_start_equity_cents = ?,
          day_start_balance_cents = ?, last_evaluated_at = ? WHERE id = ?`,
        [
          dayKey,
          Math.max(0, state.metrics.equityCents),
          state.metrics.balanceCents,
          nowIso(),
          fresh.id,
        ],
      );
    } else if (stale) {
      run("UPDATE accounts SET last_evaluated_at = ? WHERE id = ?", [nowIso(), fresh.id]);
    }

    if (hwmWrite) {
      run(
        `UPDATE accounts SET high_water_mark_cents = ?
         WHERE id = ? AND high_water_mark_cents < ?`,
        [state.metrics.nextHighWaterMarkCents, fresh.id, state.metrics.nextHighWaterMarkCents],
      );
    }

    const snapshot = one<DailySnapshotRow>(
      "SELECT * FROM account_daily_snapshots WHERE account_id = ? AND day_key = ?",
      [fresh.id, dayKey],
    );
    const traded = state.metrics.closedToday > 0 ? 1 : 0;
    if (!snapshot) {
      run(
        `INSERT INTO account_daily_snapshots (
          id, account_id, day_key, timezone, reset_hour, reset_minute, start_balance_cents,
          start_equity_cents, end_balance_cents, end_equity_cents, peak_equity_cents,
          trough_equity_cents, realized_pnl_cents, commission_cents, swap_cents,
          open_positions, traded, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          fresh.id,
          dayKey,
          state.metrics.timezone,
          state.metrics.resetHour,
          state.metrics.resetMinute,
          state.metrics.balanceCents,
          state.metrics.equityCents,
          state.metrics.balanceCents,
          state.metrics.equityCents,
          state.metrics.equityCents,
          state.metrics.equityCents,
          state.metrics.realizedTodayCents,
          state.metrics.commissionTodayCents,
          state.metrics.swapTodayCents,
          state.metrics.openPositions,
          traded,
          nowIso(),
          nowIso(),
        ],
      );
    } else if (stale || rollover) {
      run(
        `UPDATE account_daily_snapshots SET
          end_balance_cents = ?, end_equity_cents = ?,
          peak_equity_cents = MAX(peak_equity_cents, ?),
          trough_equity_cents = MIN(trough_equity_cents, ?),
          realized_pnl_cents = ?, commission_cents = ?, swap_cents = ?,
          open_positions = ?, traded = ?, updated_at = ?
         WHERE id = ?`,
        [
          state.metrics.balanceCents,
          state.metrics.equityCents,
          state.metrics.equityCents,
          state.metrics.equityCents,
          state.metrics.realizedTodayCents,
          state.metrics.commissionTodayCents,
          state.metrics.swapTodayCents,
          state.metrics.openPositions,
          traded,
          nowIso(),
          snapshot.id,
        ],
      );
    }

    if (options.recordEquity ?? true) {
      recordEquitySnapshot(fresh, state.metrics, now);
    }
  });

  account = getAccount(accountId);
  config = resolveRiskConfig(account);
  state = computeAccountRisk(account, { now, config });
  lastSync.set(accountId, now.getTime());
  return state;
}

export function logRiskEvent(input: {
  accountId?: string | null;
  userId?: string | null;
  type: string;
  severity?: "info" | "warning" | "danger";
  rule: string;
  message: string;
  metrics?: unknown;
  dedupeKey?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
}): boolean {
  const changes = run(
    `INSERT OR IGNORE INTO risk_events (
      id, account_id, user_id, type, severity, rule, message, metrics_json, dedupe_key,
      actor_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.accountId ?? null,
      input.userId ?? null,
      input.type,
      input.severity ?? "info",
      input.rule,
      input.message,
      input.metrics ? JSON.stringify(input.metrics) : null,
      input.dedupeKey ?? null,
      input.actorId ?? null,
      input.actorRole ?? null,
      nowIso(),
    ],
  );
  return changes > 0;
}

export function logWarningOnce(account: AccountRow, metrics: RiskMetrics, rule: string, message: string): void {
  logRiskEvent({
    accountId: account.id,
    userId: account.user_id,
    type: "warning",
    severity: "warning",
    rule,
    message,
    metrics: breachMetrics(metrics),
    dedupeKey: `warning:${account.id}:${rule}:${metrics.dayKey}`,
  });
}

export function breachMetrics(metrics: RiskMetrics): Record<string, number | string | null> {
  return {
    dayKey: metrics.dayKey,
    timezone: metrics.timezone,
    balanceCents: metrics.balanceCents,
    equityCents: metrics.equityCents,
    floatingCents: metrics.floatingCents,
    realizedPnlCents: metrics.realizedPnlCents,
    dailyLossUsedCents: metrics.dailyLoss.usedCents,
    dailyLossLimitCents: metrics.dailyLoss.limitCents,
    drawdownUsedCents: metrics.drawdown.usedCents,
    drawdownLimitCents: metrics.drawdown.limitCents,
    drawdownFloorCents: metrics.drawdown.floorCents,
    tradingDays: metrics.tradingDays,
    openPositions: metrics.openPositions,
    exposureCents: metrics.exposureCents,
    capturedAt: nowIso(),
  };
}

export function recordBreachOnce(input: {
  account: AccountRow;
  metrics: RiskMetrics;
  rule: string;
  detail: string;
  actionTaken: string;
  dedupeKey?: string;
}): boolean {
  const dedupeKey =
    input.dedupeKey ?? `${input.account.id}:breach:${input.rule}:${input.metrics.dayKey}`;
  const at = nowIso();
  const metricsJson = JSON.stringify(breachMetrics(input.metrics));
  const inserted = run(
    `INSERT OR IGNORE INTO breaches (
      id, account_id, user_id, rule, detail, metrics_json, action_taken, status,
      dedupe_key, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [
      newId(),
      input.account.id,
      input.account.user_id,
      input.rule,
      input.detail,
      metricsJson,
      input.actionTaken,
      dedupeKey,
      at,
    ],
  );
  if (inserted === 0) return false;
  logRiskEvent({
    accountId: input.account.id,
    userId: input.account.user_id,
    type: "breach",
    severity: "danger",
    rule: input.rule,
    message: input.detail,
    metrics: breachMetrics(input.metrics),
    dedupeKey: `risk_event:${dedupeKey}`,
    actorRole: "system",
  });
  return true;
}

export function notifyBreach(
  account: AccountRow,
  rule: string,
  detail: string,
  metrics: RiskMetrics,
): void {
  notify(
    account.user_id,
    "Account breached",
    `${detail} Rule: ${rule}. Account ${account.number} is locked. This action is recorded in the audit trail and cannot be reversed automatically.`,
    "danger",
  );
  const admins = all<{ id: string; email: string }>("SELECT id, email FROM users WHERE role = 'admin'");
  for (const admin of admins) {
    notify(
      admin.id,
      `Risk breach · ${account.number}`,
      `${detail} Rule: ${rule}. Realized P&L ${fmtUsd(centsToUsd(metrics.realizedPnlCents))}; equity ${fmtUsd(centsToUsd(metrics.equityCents))}.`,
      "danger",
    );
  }
}

export function logAdminAudit(
  actor: { id: string; email: string; role?: string },
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  note?: string | null,
): void {
  run(
    `INSERT INTO admin_audit_log (
      id, admin_id, admin_email, action, target_type, target_id, before_json, after_json, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      actor.id,
      actor.email,
      action,
      targetType,
      targetId,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      note ?? null,
      nowIso(),
    ],
  );
  if (targetType === "account") {
    logRiskEvent({
      accountId: targetId,
      type: "admin_action",
      severity: "warning",
      rule: action,
      message: note || `${action.replace(/_/g, " ")} by ${actor.email}`,
      actorId: actor.id,
      actorRole: actor.role ?? "admin",
    });
  }
}

export function applyStatusTransition(input: {
  account: AccountRow;
  toStatus: AccountStatus;
  reason: string;
  actorId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown> | null;
  breach?: { rule: string; detail: string } | null;
}): void {
  const at = nowIso();
  const sets = ["status = ?"];
  const params: (string | number | null)[] = [input.toStatus];

  if (["passed", "failed", "breached", "closed"].includes(input.toStatus)) {
    sets.push("ended_at = COALESCE(ended_at, ?)");
    params.push(at);
  }
  if (input.toStatus === "breached" && input.breach) {
    sets.push(
      "breached_at = COALESCE(breached_at, ?)",
      "breach_rule = ?",
      "breach_detail = ?",
      "fail_reason = ?",
    );
    params.push(at, input.breach.rule, input.breach.detail, input.breach.detail);
  }
  if (input.toStatus === "suspended") {
    sets.push(
      "suspended_at = COALESCE(suspended_at, ?)",
      "suspended_by = ?",
      "suspension_reason = ?",
      "status_before_suspension = COALESCE(status_before_suspension, ?)",
    );
    params.push(at, input.actorId ?? null, input.reason, input.account.status);
  }
  if (input.toStatus === "active") {
    sets.push(
      "suspended_at = NULL",
      "suspended_by = NULL",
      "suspension_reason = NULL",
      "status_before_suspension = NULL",
      "ended_at = NULL",
    );
  }
  params.push(input.account.id);
  run(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`, params);
  run(
    `INSERT INTO account_status_history (
      id, account_id, from_status, to_status, reason, actor_id, actor_role, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.account.id,
      input.account.status,
      input.toStatus,
      input.reason,
      input.actorId ?? null,
      input.actorRole ?? "system",
      input.metadata ? JSON.stringify(input.metadata) : null,
      at,
    ],
  );
  logRiskEvent({
    accountId: input.account.id,
    userId: input.account.user_id,
    type: "status_change",
    severity: input.toStatus === "breached" ? "danger" : "info",
    rule: "status",
    message: `Account status changed from ${input.account.status} to ${input.toStatus}: ${input.reason}`,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? "system",
  });
}

export function riskForTradeCents(
  symbol: string,
  side: Side,
  lots: number,
  entry: number,
  stopLoss: number,
  timestamp = Date.now(),
): number {
  return Math.abs(profitCents(symbol, side, lots, entry, stopLoss, timestamp));
}

export interface TradeRequest {
  symbol: string;
  side: Side;
  lots: number;
  price: number;
  sl: number | null;
  kind: "market" | "pending" | "trigger" | "modify";
}

export interface RiskViolation {
  rule: string;
  message: string;
  blocking: boolean;
}

export interface TradeValidationInput {
  config: RiskConfig;
  metrics: RiskMetrics;
  request: TradeRequest;
  accountLeverage: number;
  riskCents: number;
  notionalCents: number;
  instrumentExposureCents: number;
  now: Date;
  newsBlackout: boolean;
}

export interface TradeValidationResult {
  allowed: boolean;
  violations: RiskViolation[];
}

export function validateTradeAgainstRisk(input: TradeValidationInput): TradeValidationResult {
  const { config, metrics, request } = input;
  const violations: RiskViolation[] = [];
  const block = (rule: string, message: string) => violations.push({ rule, message, blocking: true });
  const isOpening = request.kind !== "modify";

  if (metrics.status !== "active") {
    block(
      "account_status",
      metrics.status === "suspended"
        ? "This account is suspended. Trading is disabled until an administrator reactivates it."
        : "This account is no longer active. New risk cannot be accepted.",
    );
  }

  if (metrics.dailyLoss.limitCents > 0 && metrics.dailyLoss.usedCents >= metrics.dailyLoss.limitCents) {
    block("daily_loss", "Trading is locked: the daily loss limit has been reached.");
  }
  if (metrics.drawdown.limitCents > 0 && metrics.drawdown.usedCents >= metrics.drawdown.limitCents) {
    block("max_drawdown", "Trading is locked: the maximum drawdown limit has been breached.");
  }
  if (metrics.maxTradingDays != null && metrics.tradingDays > metrics.maxTradingDays) {
    block(
      "max_trading_days",
      `Trading is locked: the maximum of ${metrics.maxTradingDays} trading days has been exceeded.`,
    );
  }

  if (
    input.riskCents > 0 &&
    metrics.dailyLoss.limitCents > 0 &&
    metrics.dailyLoss.usedCents + input.riskCents > metrics.dailyLoss.limitCents
  ) {
    block(
      "daily_loss_headroom",
      `This trade risks ${fmtUsd(centsToUsd(input.riskCents))}, which exceeds the ${fmtUsd(
        centsToUsd(metrics.dailyLoss.remainingCents),
      )} daily loss allowance remaining.`,
    );
  }
  if (
    input.riskCents > 0 &&
    metrics.drawdown.limitCents > 0 &&
    metrics.drawdown.usedCents + input.riskCents > metrics.drawdown.limitCents
  ) {
    block(
      "drawdown_headroom",
      `This trade risks ${fmtUsd(centsToUsd(input.riskCents))}, which exceeds the ${fmtUsd(
        centsToUsd(metrics.drawdown.remainingCents),
      )} drawdown allowance remaining.`,
    );
  }

  if (config.maxRiskPerTradePct > 0) {
    if (request.sl == null) {
      if (config.requireStopLoss) {
        block(
          "stop_loss_required",
          `A stop loss is required. The maximum risk per trade is ${config.maxRiskPerTradePct.toFixed(
            2,
          )}% of the starting balance.`,
        );
      }
    } else if (input.riskCents > metrics.riskPerTradeLimitCents) {
      block(
        "max_risk_per_trade",
        `Trade risk of ${fmtUsd(centsToUsd(input.riskCents))} exceeds the ${config.maxRiskPerTradePct.toFixed(
          2,
        )}% maximum of ${fmtUsd(centsToUsd(metrics.riskPerTradeLimitCents))}.`,
      );
    }
  }

  if (isOpening) {
    if (config.restrictedSymbols.includes(request.symbol)) {
      block("restricted_instrument", `${request.symbol} is restricted on this account.`);
    }
    if (config.maxPositionLots > 0 && request.lots > config.maxPositionLots) {
      block(
        "max_position_size",
        `Order volume of ${request.lots.toFixed(2)} lots exceeds the ${config.maxPositionLots.toFixed(2)} lot maximum per position.`,
      );
    }
    if (config.maxLeverage > 0 && input.accountLeverage > config.maxLeverage) {
      block(
        "max_leverage",
        `Account leverage 1:${input.accountLeverage} exceeds the configured 1:${config.maxLeverage} maximum.`,
      );
    }
    if (metrics.openPositions + 1 > config.maxOpenPositions) {
      block(
        "max_open_positions",
        `Maximum open positions (${config.maxOpenPositions}) reached. Close a position before opening another.`,
      );
    }

    const exposureBase = Math.max(1, Math.abs(metrics.equityCents));
    const totalLimit = Math.round((exposureBase * config.maxTotalExposurePct) / 100);
    if (
      config.maxTotalExposurePct > 0 &&
      metrics.exposureCents + input.notionalCents > totalLimit
    ) {
      block(
        "max_total_exposure",
        `This order would raise total exposure to ${fmtUsd(
          centsToUsd(metrics.exposureCents + input.notionalCents),
        )}, above the ${config.maxTotalExposurePct.toFixed(0)}% limit of ${fmtUsd(centsToUsd(totalLimit))}.`,
      );
    }
    const instrumentLimit = Math.round((exposureBase * config.maxInstrumentExposurePct) / 100);
    if (
      config.maxInstrumentExposurePct > 0 &&
      input.instrumentExposureCents + input.notionalCents > instrumentLimit
    ) {
      block(
        "max_instrument_exposure",
        `This order would raise ${request.symbol} exposure above the ${config.maxInstrumentExposurePct.toFixed(
          0,
        )}% per-instrument limit.`,
      );
    }

    if (!config.weekendHolding && isWeekendWindow(input.now, config)) {
      block(
        "weekend_holding",
        "Weekend holding is disabled for this account. New positions can be opened when the market reopens.",
      );
    }
    if (!config.newsTradingAllowed && input.newsBlackout) {
      block(
        "news_blackout",
        `Trading ${request.symbol} is disabled around high-impact news for ${config.newsBlackoutMinutes} minutes.`,
      );
    }
  }

  return { allowed: violations.length === 0, violations };
}

export interface TradeDecision {
  allowed: boolean;
  violations: RiskViolation[];
  config: RiskConfig;
  metrics: RiskMetrics;
  riskCents: number;
  notionalCents: number;
}

export function evaluateTradeAllowed(
  account: AccountRow,
  request: TradeRequest,
  options: { now?: Date; log?: boolean } = {},
): TradeDecision {
  const now = options.now ?? new Date();
  let state: RiskState;
  try {
    state = computeAccountRisk(account, { now });
  } catch (error) {
    console.error("[anerith] risk evaluation failed; failing closed", error);
    throw new ApiError(503, "Risk engine unavailable. Trading is paused until risk data is available.");
  }

  const config = state.config;
  const metrics = state.metrics;
  const instrumentExposureCents =
    metrics.exposureBySymbol.find((item) => item.symbol === request.symbol)?.notionalCents ?? 0;
  const riskCents =
    request.sl != null
      ? riskForTradeCents(request.symbol, request.side, request.lots, request.price, request.sl, now.getTime())
      : 0;
  const orderNotionalCents = Math.max(
    0,
    notionalCents(request.symbol, request.lots, request.price, now.getTime()),
  );
  const newsBlackout =
    !config.newsTradingAllowed &&
    hasNewsBlackout(request.symbol, now, config.newsBlackoutMinutes);

  const result = validateTradeAgainstRisk({
    config,
    metrics,
    request,
    accountLeverage: account.leverage,
    riskCents,
    notionalCents: orderNotionalCents,
    instrumentExposureCents,
    now,
    newsBlackout,
  });

  if (!result.allowed && options.log !== false) {
    const first = result.violations[0];
    logRiskEvent({
      accountId: account.id,
      userId: account.user_id,
      type: "trade_rejected",
      severity: "warning",
      rule: first.rule,
      message: first.message,
      metrics: breachMetrics(metrics),
      dedupeKey: `reject:${account.id}:${first.rule}:${Math.floor(now.getTime() / 3_600_000)}`,
    });
  }

  return {
    allowed: result.allowed,
    violations: result.violations,
    config,
    metrics,
    riskCents,
    notionalCents: orderNotionalCents,
  };
}

export function assertTradeAllowed(
  account: AccountRow,
  request: TradeRequest,
  options: { now?: Date; log?: boolean } = {},
): TradeDecision {
  const decision = evaluateTradeAllowed(account, request, options);
  if (!decision.allowed) {
    throw new ApiError(400, decision.violations[0]?.message ?? "Trade rejected by the risk engine.");
  }
  return decision;
}

export function listActiveNews(now: Date, minutes: number): NewsRow[] {
  const pad = Math.max(0, minutes) * 60_000;
  const from = new Date(now.getTime() - pad).toISOString();
  const to = new Date(now.getTime() + pad).toISOString();
  return all<NewsRow>(
    `SELECT * FROM news_events
     WHERE cancelled_at IS NULL AND starts_at <= ? AND ends_at >= ?
     ORDER BY starts_at ASC`,
    [to, from],
  );
}
