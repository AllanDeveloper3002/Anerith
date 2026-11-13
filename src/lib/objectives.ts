import {
  all,
  type AccountRow,
  nowIso,
  one,
  run,
  withTransaction,
} from "./db";
import { accountMath, getAccountRow, provisionNextAccount } from "./accounts";
import { closePositionInternal, triggerPendingOrder } from "./trading";
import { recordExecutionEvent } from "./execution";
import { notify } from "./notifications";
import type { OrderRow, PositionRow } from "./db";
import { fmtUsd } from "./format";
import { centsToUsd } from "./format";
import { phaseLabel } from "./challenges";
import { getExecutionQuote } from "./market-data";
import {
  applyStatusTransition,
  breachMetrics,
  isWeekendWindow,
  logRiskEvent,
  logWarningOnce,
  notifyBreach,
  recordBreachOnce,
  syncRiskState,
  type RiskConfig,
  type RiskMetrics,
} from "./risk";

const globalRef = globalThis as unknown as { __anerithWarnings?: Set<string> };
const warnings = globalRef.__anerithWarnings ?? new Set<string>();
globalRef.__anerithWarnings = warnings;

function warnOnce(key: string, userId: string, title: string, body: string) {
  if (warnings.has(key)) return;
  warnings.add(key);
  notify(userId, title, body, "warning");
}

function cancelPendingOrders(accountId: string, reason: string) {
  const orders = all<OrderRow>("SELECT * FROM orders WHERE account_id = ? AND status = 'pending'", [accountId]);
  if (orders.length === 0) return;
  run("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE account_id = ? AND status = 'pending'", [
    nowIso(),
    accountId,
  ]);
  for (const order of orders) {
    recordExecutionEvent({
      accountId,
      orderId: order.id,
      eventType: "order_cancelled",
      provider: order.execution_provider,
      symbol: order.symbol,
      side: order.side,
      lots: order.lots,
      price: order.price,
      reason,
    });
  }
}

function closeAllOpen(account: AccountRow, reason: string) {
  const positions = all<PositionRow>(
    "SELECT * FROM positions WHERE account_id = ? AND status = 'open'",
    [account.id],
  );
  for (const position of positions) {
    closePositionInternal(account, position, reason);
  }
}

function breachAccount(
  account: AccountRow,
  metrics: RiskMetrics,
  config: RiskConfig,
  rule: string,
  detail: string,
): void {
  withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
    if (!fresh || fresh.status !== "active") return;
    const inserted = recordBreachOnce({
      account: fresh,
      metrics,
      rule,
      detail,
      actionTaken: config.closeOnBreach
        ? "positions_closed_and_trading_locked"
        : "trading_locked",
    });
    if (config.closeOnBreach) closeAllOpen(fresh, `risk_breach_${rule}`);
    cancelPendingOrders(fresh.id, `risk_breach_${rule}`);
    applyStatusTransition({
      account: fresh,
      toStatus: "breached",
      reason: detail,
      actorRole: "system",
      breach: { rule, detail },
      metadata: breachMetrics(metrics),
    });
    if (inserted) notifyBreach(fresh, rule, detail, metrics);
  });
}

function enforceWeekendFlat(account: AccountRow, metrics: RiskMetrics, config: RiskConfig): void {
  if (config.weekendHolding) return;
  if (!isWeekendWindow(new Date(), config)) return;
  if (metrics.openPositions === 0 && metrics.pendingOrders === 0) return;
  withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
    if (!fresh || fresh.status !== "active") return;
    closeAllOpen(fresh, "weekend_flat");
    cancelPendingOrders(fresh.id, "weekend_flat");
    const logged = logRiskEvent({
      accountId: fresh.id,
      userId: fresh.user_id,
      type: "info",
      severity: "warning",
      rule: "weekend_flat",
      message: `Weekend holding is disabled. Open positions and pending orders were closed for the ${metrics.dayKey} session.`,
      dedupeKey: `weekend_flat:${fresh.id}:${metrics.dayKey}`,
    });
    if (logged) {
      notify(
        fresh.user_id,
        "Weekend flat applied",
        "Weekend holding is disabled on this account. Open positions and pending orders were closed by the risk engine.",
        "warning",
      );
    }
  });
}

function passAccount(account: AccountRow, config: RiskConfig): void {
  withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
    if (!fresh || fresh.status !== "active" || fresh.type === "funded") return;
    closeAllOpen(fresh, "phase_complete");
    cancelPendingOrders(fresh.id, "phase_complete");
    applyStatusTransition({
      account: fresh,
      toStatus: "passed",
      reason: "All objectives satisfied: realized profit target, minimum trading days and risk compliance.",
      actorRole: "system",
    });

    if (fresh.type === "trial") {
      notify(
        fresh.user_id,
        "Trial objectives complete",
        "You completed the free trial objectives. Choose a challenge to earn a funded Anerith account.",
        "success",
      );
      return;
    }

    const next = provisionNextAccount(fresh);
    if (next) {
      const funded = next.type === "funded";
      notify(
        fresh.user_id,
        funded ? "Funded account activated" : `Phase ${next.phase} unlocked`,
        funded
          ? `Congratulations — your ${fmtUsd(next.account_size_cents / 100, 0)} funded account ${next.number} is live with a ${next.profit_split_pct}% profit split.`
          : `${phaseLabel({ type: fresh.type, plan: fresh.plan, phase: fresh.phase, status: fresh.status })} passed. Account ${next.number} is ready for Phase ${next.phase} with a ${next.profit_target_pct}% target and ${config.maxRiskPerTradePct.toFixed(2)}% max risk per trade.`,
        "success",
      );
    }
  });
}

export interface EvaluationResult {
  changed: boolean;
  outcome?: "failed" | "passed" | "breached";
}

export function evaluateAccount(accountId: string): EvaluationResult {
  let account = getAccountRow(accountId);
  if (account.status !== "active") return { changed: false };

  let state;
  try {
    state = syncRiskState(accountId);
  } catch (error) {
    console.error("[anerith] risk sync failed", accountId, error);
    return { changed: false };
  }
  account = state.account;
  if (account.status !== "active") return { changed: false };
  const { metrics, config } = state;

  if (metrics.dailyLoss.limitCents > 0 && metrics.dailyLoss.progressPct >= 80) {
    logWarningOnce(
      account,
      metrics,
      "daily_loss_warning",
      `You have used ${Math.min(100, Math.round(metrics.dailyLoss.progressPct))}% of your ${config.dailyLossPct}% daily loss limit.`,
    );
    warnOnce(
      `${account.id}:daily:${metrics.dayKey}`,
      account.user_id,
      "Daily loss warning",
      `You have used ${Math.min(100, Math.round(metrics.dailyLoss.progressPct))}% of your ${config.dailyLossPct}% daily loss limit.`,
    );
  }
  if (metrics.drawdown.limitCents > 0 && metrics.drawdown.progressPct >= 80) {
    logWarningOnce(
      account,
      metrics,
      "drawdown_warning",
      `You are within ${Math.max(0, Math.round(100 - metrics.drawdown.progressPct))}% of your maximum drawdown limit.`,
    );
    warnOnce(
      `${account.id}:dd:${metrics.dayKey}`,
      account.user_id,
      "Drawdown warning",
      `You are within ${Math.max(0, Math.round(100 - metrics.drawdown.progressPct))}% of your maximum drawdown limit.`,
    );
  }

  if (metrics.dailyLoss.breach) {
    breachAccount(
      account,
      metrics,
      config,
      "daily_loss",
      `Daily loss limit of ${fmtUsd(centsToUsd(metrics.dailyLoss.limitCents))} exceeded (used ${fmtUsd(
        centsToUsd(metrics.dailyLoss.usedCents),
      )}).`,
    );
    return { changed: true, outcome: "breached" };
  }
  if (metrics.drawdown.breach) {
    breachAccount(
      account,
      metrics,
      config,
      "max_drawdown",
      `Maximum ${config.drawdownMode} drawdown of ${fmtUsd(
        centsToUsd(metrics.drawdown.limitCents),
      )} exceeded (used ${fmtUsd(centsToUsd(metrics.drawdown.usedCents))}).`,
    );
    return { changed: true, outcome: "breached" };
  }
  if (metrics.maxTradingDays != null && metrics.tradingDays > metrics.maxTradingDays) {
    breachAccount(
      account,
      metrics,
      config,
      "max_trading_days",
      `Maximum trading period of ${metrics.maxTradingDays} days exceeded (${metrics.tradingDays} days traded).`,
    );
    return { changed: true, outcome: "breached" };
  }

  enforceWeekendFlat(account, metrics, config);

  if (
    account.type !== "funded" &&
    metrics.profitTargetCents != null &&
    metrics.realizedPnlCents >= metrics.profitTargetCents &&
    metrics.tradingDays >= config.minTradingDays &&
    metrics.compliance !== "breached"
  ) {
    passAccount(account, config);
    return { changed: true, outcome: "passed" };
  }

  return { changed: false };
}

export function evaluateAllActiveAccounts(): void {
  const accounts = all<AccountRow>("SELECT id FROM accounts WHERE status = 'active'");
  for (const account of accounts) {
    try {
      evaluateAccount(account.id);
    } catch (error) {
      console.error("[anerith] evaluation error", account.id, error);
    }
  }
}

export function stopOutCheck(): void {
  const accounts = all<AccountRow>(
    `SELECT DISTINCT a.* FROM accounts a
     JOIN positions p ON p.account_id = a.id AND p.status = 'open'
     WHERE a.status = 'active'`,
  );
  for (const account of accounts) {
    const math = accountMath(account);
    if (math.marginLevelPct === null || math.marginLevelPct >= 50) continue;
    withTransaction(() => {
      for (const position of math.positions) {
        closePositionInternal(account, position, "stop_out");
      }
      cancelPendingOrders(account.id, "stop_out");
    });
    notify(
      account.user_id,
      "Positions liquidated",
      "Your account reached the 50% margin level and open positions were closed by the risk engine.",
      "danger",
    );
  }
}

export function processProtectiveExits(): void {
  const positions = all<PositionRow>("SELECT * FROM positions WHERE status = 'open'");
  for (const position of positions) {
    try {
      const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [position.account_id]);
      if (!account || account.status !== "active") continue;
      const q = getExecutionQuote(position.symbol, "standard");
      if (q.status !== "open") continue;
      let hit: string | null = null;
      if (position.side === "buy") {
        if (position.sl != null && q.bid <= position.sl) hit = "sl";
        else if (position.tp != null && q.bid >= position.tp) hit = "tp";
      } else {
        if (position.sl != null && q.ask >= position.sl) hit = "sl";
        else if (position.tp != null && q.ask <= position.tp) hit = "tp";
      }
      if (!hit) continue;
      let closed = false;
      withTransaction(() => {
        const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
        if (!fresh || fresh.status !== "active") return;
        closePositionInternal(fresh, position, hit!);
        closed = true;
      });
      if (!closed) continue;
      const label = hit === "sl" ? "Stop loss" : "Take profit";
      notify(
        account.user_id,
        `${label} triggered`,
        `${position.symbol} ${position.side} ${position.lots.toFixed(2)} lots closed by ${label.toLowerCase()}.`,
        hit === "tp" ? "success" : "warning",
      );
    } catch (error) {
      console.error("[anerith] protective exit failed", position.id, error);
    }
  }
}

export function pendingOrderMonitor(): void {
  const orders = all<OrderRow>("SELECT * FROM orders WHERE status = 'pending'");
  for (const order of orders) {
    try {
      const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [order.account_id]);
      if (!account || account.status !== "active") continue;
      const result = triggerPendingOrder(order, account);
      if (result === "none") continue;
      const fresh = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id]);
      if (result === "filled") {
        notify(
          account.user_id,
          "Pending order filled",
          `${order.side === "buy" ? "Buy" : "Sell"} ${order.type} ${order.lots.toFixed(2)} lots of ${order.symbol} filled at ${fresh?.filled_price ?? order.price}.`,
          "info",
        );
      } else if (result === "rejected") {
        notify(
          account.user_id,
          "Pending order rejected",
          `${order.symbol} ${order.side} ${order.type} was rejected: ${fresh?.rejection_reason ?? "Execution conditions were not met."}`,
          "warning",
        );
      } else {
        notify(
          account.user_id,
          "Pending order expired",
          `${order.symbol} ${order.side} ${order.type} expired before it could be executed.`,
          "warning",
        );
      }
    } catch (error) {
      console.error("[anerith] pending order monitor failed", order.id, error);
    }
  }
}
