import {
  all,
  type AccountRow,
  newId,
  nowIso,
  one,
  type OrderRow,
  type PositionRow,
  run,
  type UserRow,
  withTransaction,
} from "./db";
import { getAccountForUser, getActiveAccountOrNull } from "./accounts";
import { closePositionInternal } from "./trading";
import {
  applyStatusTransition,
  computeAccountRisk,
  DEFAULT_RISK_CONFIG,
  isValidTimeZone,
  logAdminAudit,
  logRiskEvent,
  resolveRiskConfig,
  rowToRiskConfig,
  syncRiskState,
  type RiskConfig,
  type RiskMetrics,
  type RiskState,
} from "./risk";
import { notify } from "./notifications";
import { recordExecutionEvent } from "./execution";
import { SYMBOLS } from "./instruments";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import type {
  AdminAuditDTO,
  AdminRiskAccountDTO,
  AdminRiskViewDTO,
  BreachDTO,
  ConfigHistoryDTO,
  DailySnapshotDTO,
  EquityPointDTO,
  NewsEventDTO,
  RiskConfigDTO,
  RiskDashboardDTO,
  RiskEventDTO,
  RiskMetricsDTO,
  StatusHistoryDTO,
} from "./types";
import type { DrawdownMode } from "./challenges";

interface ConfigRow {
  id: string;
  name: string;
  scope: "default" | "plan" | "account";
  plan_key: string | null;
  account_id: string | null;
  enabled: number;
  profit_target_pct: number | null;
  phase2_target_pct: number | null;
  daily_loss_pct: number;
  daily_loss_basis: "equity" | "balance";
  daily_limit_basis: "starting_balance" | "day_start_equity";
  drawdown_pct: number;
  drawdown_mode: DrawdownMode;
  drawdown_basis: "equity" | "balance";
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

interface BreachRow {
  id: string;
  account_id: string;
  user_id: string;
  rule: string;
  detail: string;
  action_taken: string;
  status: string;
  occurred_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  account_number: string;
  full_name: string;
  email: string;
}

interface EventRow {
  id: string;
  account_id: string | null;
  type: string;
  severity: string;
  rule: string;
  message: string;
  actor_role: string | null;
  created_at: string;
  account_number: string | null;
}

interface AuditRow {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  note: string | null;
  created_at: string;
}

interface NewsRow {
  id: string;
  title: string;
  symbol: string | null;
  impact: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  cancelled_at: string | null;
}

interface SnapshotRow {
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
  finalized_at: string | null;
}

interface EquityRow {
  equity_cents: number;
  balance_cents: number;
  daily_loss_cents: number;
  drawdown_cents: number;
  recorded_at: string;
}

interface StatusRow {
  id: string;
  account_id: string;
  from_status: string;
  to_status: string;
  reason: string;
  actor_role: string | null;
  created_at: string;
  account_number: string | null;
  owner: string | null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function toRiskConfigDTO(config: RiskConfig): RiskConfigDTO {
  return { ...config };
}

export function toRiskMetricsDTO(metrics: RiskMetrics, config: RiskConfig): RiskMetricsDTO {
  return {
    accountId: metrics.accountId,
    status: metrics.status,
    dayKey: metrics.dayKey,
    timezone: metrics.timezone,
    resetHour: metrics.resetHour,
    resetMinute: metrics.resetMinute,
    nextResetAt: metrics.nextResetAt,
    balance: centsToUsd(metrics.balanceCents),
    equity: centsToUsd(metrics.equityCents),
    floating: centsToUsd(metrics.floatingCents),
    margin: centsToUsd(metrics.marginCents),
    freeMargin: centsToUsd(metrics.freeCents),
    marginLevelPct: metrics.marginLevelPct === null ? null : round2(metrics.marginLevelPct),
    startBalance: centsToUsd(metrics.startBalanceCents),
    highWaterMark: centsToUsd(metrics.highWaterMarkCents),
    realizedPnl: centsToUsd(metrics.realizedPnlCents),
    profitTarget: metrics.profitTargetCents == null ? null : centsToUsd(metrics.profitTargetCents),
    profitProgressPct: round2(metrics.profitProgressPct),
    dailyLossUsed: centsToUsd(metrics.dailyLoss.usedCents),
    dailyLossLimit: centsToUsd(metrics.dailyLoss.limitCents),
    dailyLossRemaining: centsToUsd(metrics.dailyLoss.remainingCents),
    dailyLossProgressPct: round2(metrics.dailyLoss.progressPct),
    dailyLossBasis: metrics.dailyLoss.basis,
    dailyLimitBasis: metrics.dailyLoss.limitBasis,
    drawdownUsed: centsToUsd(metrics.drawdown.usedCents),
    drawdownLimit: centsToUsd(metrics.drawdown.limitCents),
    drawdownRemaining: centsToUsd(metrics.drawdown.remainingCents),
    drawdownProgressPct: round2(metrics.drawdown.progressPct),
    drawdownFloor: centsToUsd(metrics.drawdown.floorCents),
    drawdownBaseline: centsToUsd(metrics.drawdown.baselineCents),
    drawdownMode: metrics.drawdown.mode,
    drawdownBasis: metrics.drawdown.basis,
    tradingDays: metrics.tradingDays,
    minTradingDays: metrics.minTradingDays,
    maxTradingDays: metrics.maxTradingDays,
    tradingDaysRemaining: metrics.tradingDaysRemaining,
    openPositions: metrics.openPositions,
    pendingOrders: metrics.pendingOrders,
    exposure: centsToUsd(metrics.exposureCents),
    exposurePct: round2(metrics.exposurePct),
    exposureBySymbol: metrics.exposureBySymbol.map((item) => ({
      symbol: item.symbol,
      notional: centsToUsd(item.notionalCents),
      pct: round2(item.pct),
    })),
    riskPerTradeLimit: centsToUsd(metrics.riskPerTradeLimitCents),
    maxOpenPositions: config.maxOpenPositions,
    maxTotalExposurePct: config.maxTotalExposurePct,
    maxInstrumentExposurePct: config.maxInstrumentExposurePct,
    maxPositionLots: config.maxPositionLots,
    maxLeverage: config.maxLeverage,
    restrictedSymbols: config.restrictedSymbols,
    weekendHolding: config.weekendHolding,
    newsTradingAllowed: config.newsTradingAllowed,
    weekendWindow: metrics.weekendWindow,
    newsBlackout: metrics.newsBlackout,
    compliance: metrics.compliance,
    violations: metrics.violations,
    dailyCommission: centsToUsd(metrics.commissionTodayCents),
    dailySwap: centsToUsd(metrics.swapTodayCents),
  };
}

function mapEvent(row: EventRow): RiskEventDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    severity: row.severity,
    rule: row.rule,
    message: row.message,
    actorRole: row.actor_role,
    createdAt: row.created_at,
    accountNumber: row.account_number,
  };
}

function mapBreach(row: BreachRow): BreachDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    accountNumber: row.account_number,
    owner: row.full_name,
    email: row.email,
    rule: row.rule,
    detail: row.detail,
    actionTaken: row.action_taken,
    status: row.status === "resolved" ? "resolved" : "open",
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolutionNote: row.resolution_note,
  };
}

function mapSnapshot(row: SnapshotRow): DailySnapshotDTO {
  return {
    dayKey: row.day_key,
    timezone: row.timezone,
    startBalance: centsToUsd(row.start_balance_cents),
    startEquity: centsToUsd(row.start_equity_cents),
    endBalance: centsToUsd(row.end_balance_cents),
    endEquity: centsToUsd(row.end_equity_cents),
    peakEquity: centsToUsd(row.peak_equity_cents),
    troughEquity: centsToUsd(row.trough_equity_cents),
    realizedPnl: centsToUsd(row.realized_pnl_cents),
    commission: centsToUsd(row.commission_cents),
    swap: centsToUsd(row.swap_cents),
    openPositions: row.open_positions,
    traded: Boolean(row.traded),
    finalizedAt: row.finalized_at,
  };
}

function mapStatus(row: StatusRow): StatusHistoryDTO {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorRole: row.actor_role,
    createdAt: row.created_at,
    accountNumber: row.account_number,
    accountOwner: row.owner,
  };
}

function mapNews(row: NewsRow): NewsEventDTO {
  return {
    id: row.id,
    title: row.title,
    symbol: row.symbol,
    impact: row.impact,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

function loadBreaches(where: string, params: (string | number)[], limit: number): BreachDTO[] {
  return all<BreachRow>(
    `SELECT b.*, a.number as account_number, u.full_name, u.email
     FROM breaches b
     JOIN accounts a ON a.id = b.account_id
     JOIN users u ON u.id = b.user_id
     ${where}
     ORDER BY b.occurred_at DESC LIMIT ?`,
    [...params, limit],
  ).map(mapBreach);
}

function loadEvents(where: string, params: (string | number)[], limit: number): RiskEventDTO[] {
  return all<EventRow>(
    `SELECT e.*, a.number as account_number
     FROM risk_events e LEFT JOIN accounts a ON a.id = e.account_id
     ${where}
     ORDER BY e.created_at DESC LIMIT ?`,
    [...params, limit],
  ).map(mapEvent);
}

export async function getRiskDashboard(userId: string, accountId?: string | null): Promise<RiskDashboardDTO> {
  const account = accountId
    ? getAccountForUser(userId, accountId)
    : ((await getActiveAccountOrNull(userId)) ??
      one<AccountRow>("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", [userId]));

  if (!account) throw new ApiError(404, "No trading account found.");

  let state: RiskState;
  try {
    state = syncRiskState(account.id);
  } catch (error) {
    console.error("[anerith] risk dashboard sync failed", account.id, error);
    state = computeAccountRisk(account);
  }

  const config = state.config;
  const metrics = toRiskMetricsDTO(state.metrics, config);

  const dailySnapshots = all<SnapshotRow>(
    `SELECT * FROM account_daily_snapshots WHERE account_id = ?
     ORDER BY day_key DESC LIMIT 14`,
    [account.id],
  )
    .map(mapSnapshot)
    .reverse();

  const equityCurve: EquityPointDTO[] = all<EquityRow>(
    `SELECT equity_cents, balance_cents, daily_loss_cents, drawdown_cents, recorded_at
     FROM equity_snapshots WHERE account_id = ? ORDER BY recorded_at DESC LIMIT 240`,
    [account.id],
  )
    .reverse()
    .map((row) => ({
      time: row.recorded_at,
      balance: centsToUsd(row.balance_cents),
      equity: centsToUsd(row.equity_cents),
      dailyLoss: centsToUsd(row.daily_loss_cents),
      drawdown: centsToUsd(row.drawdown_cents),
    }));

  const statusHistory = all<StatusRow>(
    `SELECT h.*, a.number as account_number, u.full_name as owner
     FROM account_status_history h
     JOIN accounts a ON a.id = h.account_id
     JOIN users u ON u.id = a.user_id
     WHERE h.account_id = ? ORDER BY h.created_at DESC LIMIT 25`,
    [account.id],
  ).map(mapStatus);

  return {
    account: {
      id: account.id,
      number: account.number,
      type: account.type,
      plan: account.plan,
      phase: account.phase,
      status: account.status,
      size: centsToUsd(account.account_size_cents),
      leverage: account.leverage,
      profitSplitPct: account.profit_split_pct,
      breachedAt: account.breached_at,
      breachRule: account.breach_rule,
      breachDetail: account.breach_detail,
      suspendedAt: account.suspended_at,
      suspensionReason: account.suspension_reason,
    },
    config: toRiskConfigDTO(config),
    metrics,
    events: loadEvents("WHERE e.account_id = ?", [account.id], 40),
    breaches: loadBreaches("WHERE b.account_id = ?", [account.id], 30),
    dailySnapshots,
    equityCurve,
    statusHistory,
    generatedAt: nowIso(),
  };
}

export function getAdminRiskView(): AdminRiskViewDTO {
  const configs = all<ConfigRow>(
    `SELECT * FROM risk_configs
     ORDER BY CASE scope WHEN 'default' THEN 0 WHEN 'plan' THEN 1 ELSE 2 END, name ASC`,
  ).map((row) => toRiskConfigDTO(rowToRiskConfig(row as never)));

  const accountRows = all<AccountRow & { full_name: string; email: string }>(
    `SELECT a.*, u.full_name, u.email FROM accounts a JOIN users u ON u.id = a.user_id
     ORDER BY CASE a.status WHEN 'breached' THEN 0 WHEN 'suspended' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
       a.created_at DESC
     LIMIT 250`,
  );

  const accounts: AdminRiskAccountDTO[] = accountRows.map((row) => {
    const base: AdminRiskAccountDTO = {
      id: row.id,
      number: row.number,
      owner: row.full_name,
      email: row.email,
      status: row.status,
      type: row.type,
      plan: row.plan,
      phase: row.phase,
      riskConfigId: row.risk_config_id,
      size: centsToUsd(row.account_size_cents),
      balance: centsToUsd(row.balance_cents),
      equity: centsToUsd(row.balance_cents),
      dailyLossUsed: 0,
      dailyLossLimit: 0,
      dailyLossProgressPct: 0,
      drawdownUsed: 0,
      drawdownLimit: 0,
      drawdownProgressPct: 0,
      tradingDays: 0,
      minTradingDays: 0,
      maxTradingDays: null,
      openPositions: 0,
      exposure: 0,
      compliance: row.status === "breached" ? "breached" : "safe",
      breachedAt: row.breached_at,
      breachRule: row.breach_rule,
      suspendedAt: row.suspended_at,
      suspensionReason: row.suspension_reason,
    };
    try {
      const { metrics } = computeAccountRisk(row);
      return {
        ...base,
        equity: centsToUsd(metrics.equityCents),
        dailyLossUsed: centsToUsd(metrics.dailyLoss.usedCents),
        dailyLossLimit: centsToUsd(metrics.dailyLoss.limitCents),
        dailyLossProgressPct: round2(metrics.dailyLoss.progressPct),
        drawdownUsed: centsToUsd(metrics.drawdown.usedCents),
        drawdownLimit: centsToUsd(metrics.drawdown.limitCents),
        drawdownProgressPct: round2(metrics.drawdown.progressPct),
        tradingDays: metrics.tradingDays,
        minTradingDays: metrics.minTradingDays,
        maxTradingDays: metrics.maxTradingDays,
        openPositions: metrics.openPositions,
        exposure: centsToUsd(metrics.exposureCents),
        compliance: metrics.compliance,
      };
    } catch (error) {
      console.error("[anerith] admin risk view failed for account", row.id, error);
      return base;
    }
  });

  const audit = all<AuditRow>(
    `SELECT id, admin_email, action, target_type, target_id, note, created_at
     FROM admin_audit_log ORDER BY created_at DESC LIMIT 120`,
  ).map<AdminAuditDTO>((row) => ({
    id: row.id,
    adminEmail: row.admin_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    note: row.note,
    createdAt: row.created_at,
  }));

  const configHistory = all<{
    id: string;
    config_id: string;
    admin_email: string;
    action: string;
    before_json: string | null;
    after_json: string;
    created_at: string;
  }>(
    `SELECT id, config_id, admin_email, action, before_json, after_json, created_at
     FROM risk_config_history ORDER BY created_at DESC LIMIT 150`,
  ).map<ConfigHistoryDTO>((row) => ({
    id: row.id,
    configId: row.config_id,
    adminEmail: row.admin_email,
    action: row.action,
    before: row.before_json ? (JSON.parse(row.before_json) as Record<string, unknown>) : null,
    after: JSON.parse(row.after_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  const news = all<NewsRow>(
    `SELECT id, title, symbol, impact, starts_at, ends_at, created_at, cancelled_at
     FROM news_events ORDER BY starts_at DESC LIMIT 60`,
  ).map(mapNews);

  const statusHistory = all<StatusRow>(
    `SELECT h.*, a.number as account_number, u.full_name as owner
     FROM account_status_history h
     JOIN accounts a ON a.id = h.account_id
     JOIN users u ON u.id = a.user_id
     ORDER BY h.created_at DESC LIMIT 80`,
  ).map(mapStatus);

  return {
    configs,
    accounts,
    breaches: loadBreaches("", [], 80),
    events: loadEvents("", [], 120),
    audit,
    news,
    statusHistory,
    configHistory,
    generatedAt: nowIso(),
  };
}

export interface RiskConfigInput {
  id?: string | null;
  name: string;
  scope: "default" | "plan" | "account";
  planKey?: string | null;
  accountId?: string | null;
  enabled: boolean;
  profitTargetPct: number | null;
  phase2TargetPct: number | null;
  dailyLossPct: number;
  dailyLossBasis: "equity" | "balance";
  dailyLimitBasis: "starting_balance" | "day_start_equity";
  drawdownPct: number;
  drawdownMode: DrawdownMode;
  drawdownBasis: "equity" | "balance";
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
}

export function saveRiskConfig(admin: UserRow, input: RiskConfigInput): RiskConfigDTO {
  if (!isValidTimeZone(input.resetTimezone)) {
    throw new ApiError(400, "Enter a valid IANA timezone, for example UTC or Africa/Nairobi.");
  }
  if (input.scope === "plan" && !input.planKey) {
    throw new ApiError(400, "A plan profile must specify a plan.");
  }
  if (input.scope === "account" && !input.accountId) {
    throw new ApiError(400, "An account profile must specify an account.");
  }
  if (input.drawdownPct <= 0) throw new ApiError(400, "Maximum drawdown must be greater than zero.");
  if (input.dailyLossPct < 0) throw new ApiError(400, "Daily loss cannot be negative.");
  if (input.maxRiskPerTradePct < 0) throw new ApiError(400, "Maximum risk per trade cannot be negative.");
  if (input.maxPositionLots <= 0) throw new ApiError(400, "Maximum position size must be greater than zero.");
  if (input.maxLeverage <= 0) throw new ApiError(400, "Maximum leverage must be greater than zero.");
  if (input.restrictedSymbols.some((symbol) => !SYMBOLS.includes(symbol))) {
    throw new ApiError(400, "Restricted instruments must be known trading symbols.");
  }

  if (input.scope === "account") {
    const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [input.accountId!]);
    if (!account) throw new ApiError(404, "Trading account not found.");
  }

  return withTransaction(() => {
    const now = nowIso();
    const planKey = input.scope === "plan" ? input.planKey! : null;
    const accountId = input.scope === "account" ? input.accountId! : null;
    let existing: ConfigRow | undefined;
    if (input.id) {
      existing = one<ConfigRow>("SELECT * FROM risk_configs WHERE id = ?", [input.id]);
      if (!existing) throw new ApiError(404, "Risk configuration not found.");
    } else if (input.scope === "default") {
      existing = one<ConfigRow>("SELECT * FROM risk_configs WHERE scope = 'default' LIMIT 1");
    } else if (input.scope === "plan") {
      existing = one<ConfigRow>("SELECT * FROM risk_configs WHERE scope = 'plan' AND plan_key = ? LIMIT 1", [
        input.planKey!,
      ]);
    } else {
      existing = one<ConfigRow>("SELECT * FROM risk_configs WHERE scope = 'account' AND account_id = ? LIMIT 1", [
        input.accountId!,
      ]);
    }

    if (input.id && existing && existing.id !== input.id) {
      throw new ApiError(409, "Another risk profile already governs this scope. Edit that profile instead.");
    }
    if (input.id && existing) {
      const competing = one<ConfigRow>(
        `SELECT * FROM risk_configs WHERE id <> ? AND scope = ?
           AND (? IS NULL OR plan_key = ?) AND (? IS NULL OR account_id = ?)
         LIMIT 1`,
        [existing.id, input.scope, planKey, planKey, accountId, accountId],
      );
      if (competing) {
        throw new ApiError(409, "Another risk profile already governs this scope. Edit that profile instead.");
      }
    }

    const id = existing?.id ?? newId();
    const before = existing ? toRiskConfigDTO(rowToRiskConfig(existing as never)) : null;

    if (existing) {
      run(
        `UPDATE risk_configs SET
          name = ?, scope = ?, plan_key = ?, account_id = ?, enabled = ?,
          profit_target_pct = ?, phase2_target_pct = ?, daily_loss_pct = ?, daily_loss_basis = ?,
          daily_limit_basis = ?, drawdown_pct = ?, drawdown_mode = ?, drawdown_basis = ?,
          trailing_lock_pct = ?, min_trading_days = ?, max_trading_days = ?,
          max_risk_per_trade_pct = ?, require_stop_loss = ?, max_open_positions = ?,
          max_total_exposure_pct = ?, max_instrument_exposure_pct = ?, max_position_lots = ?,
          max_leverage = ?, restricted_symbols = ?, weekend_holding = ?,
          weekend_close_hour_utc = ?, news_trading_allowed = ?, news_blackout_minutes = ?,
          close_on_breach = ?, reset_timezone = ?, reset_hour = ?, reset_minute = ?,
          updated_by = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.name,
          input.scope,
          planKey,
          accountId,
          input.enabled ? 1 : 0,
          input.profitTargetPct,
          input.phase2TargetPct,
          input.dailyLossPct,
          input.dailyLossBasis,
          input.dailyLimitBasis,
          input.drawdownPct,
          input.drawdownMode,
          input.drawdownBasis,
          input.trailingLockPct,
          input.minTradingDays,
          input.maxTradingDays,
          input.maxRiskPerTradePct,
          input.requireStopLoss ? 1 : 0,
          input.maxOpenPositions,
          input.maxTotalExposurePct,
          input.maxInstrumentExposurePct,
          input.maxPositionLots,
          input.maxLeverage,
          JSON.stringify(input.restrictedSymbols),
          input.weekendHolding ? 1 : 0,
          input.weekendCloseHourUtc,
          input.newsTradingAllowed ? 1 : 0,
          input.newsBlackoutMinutes,
          input.closeOnBreach ? 1 : 0,
          input.resetTimezone,
          input.resetHour,
          input.resetMinute,
          admin.id,
          now,
          existing.id,
        ],
      );
    } else {
      run(
        `INSERT INTO risk_configs (
          id, name, scope, plan_key, account_id, enabled, profit_target_pct, phase2_target_pct,
          daily_loss_pct, daily_loss_basis, daily_limit_basis, drawdown_pct, drawdown_mode,
          drawdown_basis, trailing_lock_pct, min_trading_days, max_trading_days,
          max_risk_per_trade_pct, require_stop_loss, max_open_positions, max_total_exposure_pct,
          max_instrument_exposure_pct, max_position_lots, max_leverage, restricted_symbols,
          weekend_holding, weekend_close_hour_utc,
          news_trading_allowed, news_blackout_minutes, close_on_breach, reset_timezone,
          reset_hour, reset_minute, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name,
          input.scope,
          planKey,
          accountId,
          input.enabled ? 1 : 0,
          input.profitTargetPct,
          input.phase2TargetPct,
          input.dailyLossPct,
          input.dailyLossBasis,
          input.dailyLimitBasis,
          input.drawdownPct,
          input.drawdownMode,
          input.drawdownBasis,
          input.trailingLockPct,
          input.minTradingDays,
          input.maxTradingDays,
          input.maxRiskPerTradePct,
          input.requireStopLoss ? 1 : 0,
          input.maxOpenPositions,
          input.maxTotalExposurePct,
          input.maxInstrumentExposurePct,
          input.maxPositionLots,
          input.maxLeverage,
          JSON.stringify(input.restrictedSymbols),
          input.weekendHolding ? 1 : 0,
          input.weekendCloseHourUtc,
          input.newsTradingAllowed ? 1 : 0,
          input.newsBlackoutMinutes,
          input.closeOnBreach ? 1 : 0,
          input.resetTimezone,
          input.resetHour,
          input.resetMinute,
          admin.id,
          admin.id,
          now,
          now,
        ],
      );
    }

    const saved = one<ConfigRow>("SELECT * FROM risk_configs WHERE id = ?", [id])!;
    const after = toRiskConfigDTO(rowToRiskConfig(saved as never));
    run(
      `INSERT INTO risk_config_history (id, config_id, admin_id, admin_email, action, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        id,
        admin.id,
        admin.email,
        existing ? "updated" : "created",
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
        now,
      ],
    );
    logAdminAudit(
      admin,
      existing ? "risk_config.updated" : "risk_config.created",
      "risk_config",
      id,
      before,
      after,
      `${after.name} (${after.scope}${after.planKey ? `:${after.planKey}` : ""})`,
    );
    return after;
  });
}

export function assignAccountRiskConfig(
  admin: UserRow,
  accountId: string,
  configId: string | null,
  note?: string | null,
): { accountId: string; configId: string | null } {
  const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!account) throw new ApiError(404, "Trading account not found.");
  let config: ConfigRow | undefined;
  if (configId) {
    config = one<ConfigRow>("SELECT * FROM risk_configs WHERE id = ? AND enabled = 1", [configId]);
    if (!config) throw new ApiError(404, "Risk configuration not found or disabled.");
    if (config.scope === "account" && config.account_id !== accountId) {
      throw new ApiError(400, "That account profile belongs to a different account.");
    }
  }
  const before = account.risk_config_id;
  run("UPDATE accounts SET risk_config_id = ? WHERE id = ?", [configId, accountId]);
  logAdminAudit(
    admin,
    "account.risk_config_assigned",
    "account",
    accountId,
    { riskConfigId: before },
    { riskConfigId: configId },
    note ?? (config ? `Assigned ${config.name}.` : "Cleared account override; plan profile applies."),
  );
  return { accountId, configId };
}

export function resolveBreach(admin: UserRow, breachId: string, note: string): BreachDTO {
  if (note.trim().length < 5) throw new ApiError(400, "A resolution note of at least 5 characters is required.");
  const row = one<BreachRow>(
    `SELECT b.*, a.number as account_number, u.full_name, u.email
     FROM breaches b JOIN accounts a ON a.id = b.account_id JOIN users u ON u.id = b.user_id
     WHERE b.id = ?`,
    [breachId],
  );
  if (!row) throw new ApiError(404, "Breach record not found.");
  if (row.status === "resolved") return mapBreach(row);
  const at = nowIso();
  run(
    "UPDATE breaches SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ?",
    [at, admin.email, note.trim(), breachId],
  );
  logAdminAudit(
    admin,
    "breach.resolved",
    "account",
    row.account_id,
    { breachId, status: "open" },
    { breachId, status: "resolved", note: note.trim() },
    `Breach ${row.rule} resolved. Account status is unchanged.`,
  );
  const updated = one<BreachRow>(
    `SELECT b.*, a.number as account_number, u.full_name, u.email
     FROM breaches b JOIN accounts a ON a.id = b.account_id JOIN users u ON u.id = b.user_id
     WHERE b.id = ?`,
    [breachId],
  )!;
  return mapBreach(updated);
}

export function suspendAccount(admin: UserRow, accountId: string, reason: string): void {
  if (reason.trim().length < 5) throw new ApiError(400, "Document the reason for suspension (at least 5 characters).");
  const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!account) throw new ApiError(404, "Trading account not found.");
  if (account.status !== "active") {
    throw new ApiError(400, "Only active accounts can be suspended.");
  }
  withTransaction(() => {
    const pending = all<OrderRow>(
      "SELECT * FROM orders WHERE account_id = ? AND status = 'pending'",
      [accountId],
    );
    if (pending.length > 0) {
      const cancelledAt = nowIso();
      run(
        "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE account_id = ? AND status = 'pending'",
        [cancelledAt, accountId],
      );
      for (const order of pending) {
        recordExecutionEvent({
          accountId,
          orderId: order.id,
          eventType: "order_cancelled",
          provider: order.execution_provider,
          symbol: order.symbol,
          side: order.side,
          lots: order.lots,
          price: order.price,
          reason: "admin_suspend",
        });
      }
    }
    applyStatusTransition({
      account,
      toStatus: "suspended",
      reason: reason.trim(),
      actorId: admin.id,
      actorRole: "admin",
    });
    logAdminAudit(admin, "account.suspended", "account", accountId, { status: account.status }, { status: "suspended" }, reason.trim());
  });
  notify(
    account.user_id,
    "Account suspended",
    `Trading on ${account.number} is suspended. Reason: ${reason.trim()}. Open positions can still be closed.`,
    "warning",
  );
}

export function reactivateAccount(admin: UserRow, accountId: string, note: string): void {
  const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!account) throw new ApiError(404, "Trading account not found.");
  if (account.status !== "suspended" && account.status !== "breached") {
    throw new ApiError(400, "Only suspended or breached accounts can be reactivated.");
  }
  if (note.trim().length < 5) {
    throw new ApiError(400, "Document the authorization for reactivation (at least 5 characters).");
  }
  if (account.status === "breached") {
    const open = one<{ c: number }>("SELECT COUNT(*) as c FROM breaches WHERE account_id = ? AND status = 'open'", [
      accountId,
    ])?.c ?? 0;
    if (open > 0) {
      throw new ApiError(400, "Resolve every open breach before reactivating this account.");
    }
  }
  withTransaction(() => {
    applyStatusTransition({
      account,
      toStatus: "active",
      reason: note.trim(),
      actorId: admin.id,
      actorRole: "admin",
    });
    logAdminAudit(admin, "account.reactivated", "account", accountId, { status: account.status }, { status: "active" }, note.trim());
  });
  notify(
    account.user_id,
    "Account reactivated",
    `Trading on ${account.number} has been reactivated by an administrator. The historical breach record remains on file.`,
    "success",
  );
}

export function closeAccount(admin: UserRow, accountId: string, reason: string): void {
  if (reason.trim().length < 5) throw new ApiError(400, "Document the reason for closure (at least 5 characters).");
  const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!account) throw new ApiError(404, "Trading account not found.");
  if (account.status === "closed") throw new ApiError(400, "This account is already closed.");
  withTransaction(() => {
    const positions = all<{ id: string; status: string }>(
      "SELECT id, status FROM positions WHERE account_id = ? AND status = 'open'",
      [accountId],
    );
    for (const position of positions) {
      const full = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [position.id]);
      if (full) closePositionInternal(account, full, "admin_close");
    }
    run("UPDATE orders SET status = 'cancelled' WHERE account_id = ? AND status = 'pending'", [accountId]);
    applyStatusTransition({
      account,
      toStatus: "closed",
      reason: reason.trim(),
      actorId: admin.id,
      actorRole: "admin",
    });
    logAdminAudit(admin, "account.closed", "account", accountId, { status: account.status }, { status: "closed" }, reason.trim());
  });
  notify(account.user_id, "Account closed", `Account ${account.number} has been closed. Reason: ${reason.trim()}.`, "warning");
}

function toIsoOrThrow(value: string, label: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new ApiError(400, `Enter a valid ${label}.`);
  return at.toISOString();
}

export function createNewsEvent(
  admin: UserRow,
  input: { title: string; symbol: string | null; impact: string; startsAt: string; endsAt: string },
): NewsEventDTO {
  const title = input.title.trim();
  if (title.length < 3) throw new ApiError(400, "Enter a news event title.");
  const symbol = input.symbol?.trim() || null;
  if (symbol && !SYMBOLS.includes(symbol)) throw new ApiError(400, "Unknown trading instrument.");
  const startsAt = toIsoOrThrow(input.startsAt, "start time");
  const endsAt = toIsoOrThrow(input.endsAt, "end time");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ApiError(400, "The news window must end after it starts.");
  }
  const impact = ["high", "medium", "low"].includes(input.impact) ? input.impact : "high";
  const id = newId();
  const at = nowIso();
  run(
    `INSERT INTO news_events (id, title, symbol, impact, starts_at, ends_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, symbol, impact, startsAt, endsAt, admin.id, at],
  );
  logAdminAudit(
    admin,
    "news.created",
    "news_event",
    id,
    null,
    { title, symbol, impact, startsAt, endsAt },
    title,
  );
  return {
    id,
    title,
    symbol,
    impact,
    startsAt,
    endsAt,
    createdAt: at,
    cancelledAt: null,
  };
}

export function cancelNewsEvent(admin: UserRow, id: string): void {
  const row = one<NewsRow>("SELECT * FROM news_events WHERE id = ?", [id]);
  if (!row) throw new ApiError(404, "News event not found.");
  if (row.cancelled_at) return;
  const at = nowIso();
  run("UPDATE news_events SET cancelled_at = ? WHERE id = ?", [at, id]);
  logAdminAudit(admin, "news.cancelled", "news_event", id, { cancelledAt: null }, { cancelledAt: at }, row.title);
}

export function riskConfigDefaults(): RiskConfigDTO {
  return toRiskConfigDTO({ ...DEFAULT_RISK_CONFIG });
}

export function accountRiskConfigFor(account: AccountRow): RiskConfigDTO {
  return toRiskConfigDTO(resolveRiskConfig(account));
}

export { logRiskEvent };
