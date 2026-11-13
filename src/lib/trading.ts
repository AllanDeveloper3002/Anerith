import {
  all,
  type AccountRow,
  type ExecutionEventRow,
  newId,
  nowIso,
  one,
  type OrderRow,
  type PositionRow,
  run,
  type TransactionRow,
  withTransaction,
} from "./db";
import type { Side } from "./instruments";
import {
  commissionCents,
  nightsHeld,
  notionalCents,
  profitCents,
  requiredMarginCents,
  swapCents,
} from "./finance";
import { getExecutionQuote, executionSettings } from "./market-data";
import {
  executionProvider,
  findExecutionEvent,
  recordExecutionEvent,
} from "./execution";
import { assertTradable, assertVolume, getEffectiveInstrument } from "./instrument-specs";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import { accountMath, getActiveAccount, summarizeAccount } from "./accounts";
import { assertTradeAllowed, evaluateTradeAllowed } from "./risk";
import type {
  AccountDTO,
  ClosedTradeDTO,
  ExecutionEventDTO,
  OrderDTO,
  PositionDTO,
  TradeStateDTO,
  TransactionDTO,
} from "./types";

const SPREAD_PLAN = "standard" as const;

export function mapPosition(row: PositionRow): PositionDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    side: row.side,
    lots: row.lots,
    entryPrice: row.entry_price,
    currentPrice: row.current_price,
    sl: row.sl,
    tp: row.tp,
    floating: centsToUsd(row.floating_cents),
    margin: centsToUsd(row.margin_cents),
    commission: centsToUsd(row.commission_cents),
    swap: centsToUsd(row.swap_cents ?? 0),
    openedAt: row.opened_at,
    modifiedAt: row.modified_at,
    clientOrderId: row.client_order_id,
    orderId: row.order_id,
    executionProvider: row.execution_provider,
    executionRef: row.execution_ref,
    simulatedExecution: row.execution_provider === "internal-simulated",
  };
}

export function mapOrder(row: OrderRow): OrderDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    lots: row.lots,
    price: row.price,
    sl: row.sl,
    tp: row.tp,
    status: row.status,
    createdAt: row.created_at,
    triggeredAt: row.triggered_at,
    expiresAt: row.expires_at,
    filledPrice: row.filled_price,
    rejectionReason: row.rejection_reason,
    modifiedAt: row.modified_at,
    cancelledAt: row.cancelled_at,
    clientOrderId: row.client_order_id,
    executionProvider: row.execution_provider,
    executionRef: row.execution_ref,
  };
}

export function mapClosedTrade(row: PositionRow): ClosedTradeDTO {
  const profit = centsToUsd(row.profit_cents ?? 0);
  const commission = centsToUsd(row.commission_cents);
  const swap = centsToUsd(row.swap_cents ?? 0);
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    lots: row.lots,
    entryPrice: row.entry_price,
    closePrice: row.close_price ?? 0,
    profit,
    commission,
    swap,
    net: Number((profit + swap - commission).toFixed(2)),
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? row.opened_at,
    closeReason: row.close_reason ?? "manual",
  };
}

export function mapTransaction(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amount: centsToUsd(row.amount_cents),
    status: row.status,
    method: row.method,
    reference: row.reference,
    note: row.note,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapExecutionEvent(row: ExecutionEventRow): ExecutionEventDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    positionId: row.position_id,
    orderId: row.order_id,
    eventType: row.event_type,
    provider: row.provider,
    executionRef: row.execution_ref,
    symbol: row.symbol,
    side: row.side,
    lots: row.lots,
    price: row.price,
    commission: centsToUsd(row.commission_cents),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function assertActive(account: AccountRow): void {
  if (account.status === "suspended") {
    throw new ApiError(
      400,
      "This account is suspended by the risk desk. You can close open positions, but new trading is disabled.",
    );
  }
  if (account.status !== "active") {
    throw new ApiError(400, "This account is no longer active. Start a new challenge to continue trading.");
  }
}

function assertCanClose(account: AccountRow): void {
  if (account.status !== "active" && account.status !== "suspended") {
    throw new ApiError(400, "This account is closed and can no longer accept trade changes.");
  }
}

function validateProtection(
  side: Side,
  reference: number,
  sl: number | null | undefined,
  tp: number | null | undefined,
): void {
  if (sl != null) {
    if (sl <= 0) throw new ApiError(400, "Stop loss must be greater than zero.");
    if (side === "buy" && sl >= reference) {
      throw new ApiError(400, "For a buy, the stop loss must be below the entry price.");
    }
    if (side === "sell" && sl <= reference) {
      throw new ApiError(400, "For a sell, the stop loss must be above the entry price.");
    }
  }
  if (tp != null) {
    if (tp <= 0) throw new ApiError(400, "Take profit must be greater than zero.");
    if (side === "buy" && tp <= reference) {
      throw new ApiError(400, "For a buy, take profit must be above the entry price.");
    }
    if (side === "sell" && tp >= reference) {
      throw new ApiError(400, "For a sell, take profit must be below the entry price.");
    }
  }
}

function recordCommission(account: AccountRow, amountCents: number, note: string): void {
  if (amountCents <= 0) return;
  run("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?", [amountCents, account.id]);
  run(
    `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
     VALUES (?, ?, ?, 'commission', ?, 'completed', NULL, NULL, ?, ?, ?)`,
    [newId(), account.user_id, account.id, -amountCents, note, nowIso(), nowIso()],
  );
}

function recordTradeSettlement(account: AccountRow, amountCents: number, note: string): void {
  run("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?", [amountCents, account.id]);
  run(
    `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
     VALUES (?, ?, ?, 'trade', ?, 'completed', NULL, NULL, ?, ?, ?)`,
    [newId(), account.user_id, account.id, amountCents, note, nowIso(), nowIso()],
  );
}

export function markPositionsToMarket(accountId?: string): void {
  const positions = accountId
    ? all<PositionRow>("SELECT * FROM positions WHERE account_id = ? AND status = 'open'", [accountId])
    : all<PositionRow>("SELECT * FROM positions WHERE status = 'open'");
  const quotes = new Map<string, ReturnType<typeof getExecutionQuote>>();
  const timestamp = Date.now();
  for (const position of positions) {
    try {
      let quote = quotes.get(position.symbol);
      if (!quote) {
        quote = getExecutionQuote(position.symbol, SPREAD_PLAN, timestamp);
        quotes.set(position.symbol, quote);
      }
      const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [position.account_id]);
      if (!account) continue;
      const exit = position.side === "buy" ? quote.bid : quote.ask;
      const floating = profitCents(position.symbol, position.side, position.lots, position.entry_price, exit, timestamp);
      const margin = requiredMarginCents(account.leverage, position.symbol, position.lots, position.entry_price, timestamp);
      run("UPDATE positions SET current_price = ?, floating_cents = ?, margin_cents = ? WHERE id = ?", [
        exit,
        floating,
        margin,
        position.id,
      ]);
    } catch (error) {
      console.error("[anerith] position mark failed", position.id, error);
    }
  }
}

export async function getTradeState(userId: string): Promise<TradeStateDTO> {
  const account = await getActiveAccount(userId);
  markPositionsToMarket(account.id);
  const positions = all<PositionRow>(
    "SELECT * FROM positions WHERE account_id = ? AND status = 'open' ORDER BY opened_at DESC",
    [account.id],
  ).map(mapPosition);
  const orders = all<OrderRow>(
    "SELECT * FROM orders WHERE account_id = ? AND status = 'pending' ORDER BY created_at DESC",
    [account.id],
  ).map(mapOrder);
  const closed = all<PositionRow>(
    "SELECT * FROM positions WHERE account_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 20",
    [account.id],
  ).map(mapClosedTrade);
  const recentEvents = getExecutionEvents(account.id, 30);
  return { account: summarizeAccount(account), positions, orders, recentClosed: closed, recentEvents };
}

export function getExecutionEvents(accountId: string, limit = 50): ExecutionEventDTO[] {
  return all<ExecutionEventRow>(
    "SELECT * FROM execution_events WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
    [accountId, limit],
  ).map(mapExecutionEvent);
}

export interface MarketOrderInput {
  symbol: string;
  side: Side;
  lots: number;
  sl?: number | null;
  tp?: number | null;
  clientOrderId?: string | null;
}

export function placeMarketOrder(
  account: AccountRow,
  input: MarketOrderInput,
): { account: AccountDTO; position: PositionDTO; message: string } {
  assertActive(account);
  const inst = getEffectiveInstrument(input.symbol);
  assertVolume(inst, input.lots);

  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertActive(fresh);
    if (input.clientOrderId) {
      const existing = one<PositionRow>(
        "SELECT * FROM positions WHERE account_id = ? AND client_order_id = ?",
        [fresh.id, input.clientOrderId],
      );
      if (existing) {
        return {
          account: summarizeAccount(fresh),
          position: mapPosition(existing),
          message: "Duplicate request ignored; the order was already executed.",
        };
      }
    }
    const now = new Date();
    assertTradable(inst, now);
    const quote = getExecutionQuote(input.symbol, SPREAD_PLAN, now.getTime());
    if (quote.status !== "open") throw new ApiError(400, `${input.symbol} market is closed.`);
    const fill = executionProvider().marketFill(inst, input.side, input.lots, quote, SPREAD_PLAN, executionSettings());
    validateProtection(input.side, fill.price, input.sl, input.tp);
    const riskRequest = {
      symbol: input.symbol,
      side: input.side,
      lots: input.lots,
      price: fill.price,
      sl: input.sl ?? null,
      kind: "market" as const,
    };
    assertTradeAllowed(fresh, riskRequest, { log: false, now });
    const math = accountMath(fresh);
    const marginCents = requiredMarginCents(fresh.leverage, input.symbol, input.lots, fill.price, now.getTime());
    if (math.freeCents < marginCents + fill.commissionCents) {
      throw new ApiError(
        400,
        `Insufficient free margin. Required ${centsToUsd(marginCents + fill.commissionCents).toFixed(2)} USD, available ${centsToUsd(math.freeCents).toFixed(2)} USD.`,
      );
    }
    recordCommission(fresh, fill.commissionCents, "Trading commission");
    const id = newId();
    run(
      `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
        profit_cents, status, opened_at, closed_at, close_price, close_reason, client_order_id, order_id,
        parent_position_id, execution_provider, execution_ref, current_price, floating_cents, margin_cents, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'open', ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, 0, ?, NULL)`,
      [
        id,
        fresh.id,
        input.symbol,
        input.side,
        input.lots,
        fill.price,
        input.sl ?? null,
        input.tp ?? null,
        fill.commissionCents,
        nowIso(),
        input.clientOrderId ?? null,
        fill.provider,
        fill.reference,
        fill.price,
        marginCents,
      ],
    );
    recordExecutionEvent({
      accountId: fresh.id,
      positionId: id,
      eventType: "position_opened",
      provider: fill.provider,
      executionRef: fill.reference,
      symbol: input.symbol,
      side: input.side,
      lots: input.lots,
      price: fill.price,
      commissionCents: fill.commissionCents,
      reason: "market_order",
      dedupeKey: input.clientOrderId ? `market:${fresh.id}:${input.clientOrderId}` : null,
    });
    const row = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [id])!;
    const updated = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [fresh.id])!;
    return {
      account: summarizeAccount(updated),
      position: mapPosition(row),
      message: `${input.side === "buy" ? "Bought" : "Sold"} ${input.lots.toFixed(2)} lots of ${input.symbol}.`,
    };
  });
}

export interface PendingOrderInput {
  symbol: string;
  side: Side;
  type: "limit" | "stop";
  lots: number;
  price: number;
  sl?: number | null;
  tp?: number | null;
  expiresAt?: string | null;
  clientOrderId?: string | null;
}

function validatePendingPrice(side: Side, type: "limit" | "stop", price: number, quote: { bid: number; ask: number }): void {
  if (type === "limit") {
    if (side === "buy" && price >= quote.ask) {
      throw new ApiError(400, "A buy limit must be placed below the current ask price.");
    }
    if (side === "sell" && price <= quote.bid) {
      throw new ApiError(400, "A sell limit must be placed above the current bid price.");
    }
  } else {
    if (side === "buy" && price <= quote.ask) {
      throw new ApiError(400, "A buy stop must be placed above the current ask price.");
    }
    if (side === "sell" && price >= quote.bid) {
      throw new ApiError(400, "A sell stop must be placed below the current bid price.");
    }
  }
}

function normalizeExpiry(value: string | null | undefined, now: Date): string | null {
  if (value == null) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
    throw new ApiError(400, "Order expiry must be a valid future time.");
  }
  return at.toISOString();
}

export function placePendingOrder(
  account: AccountRow,
  input: PendingOrderInput,
): { account: AccountDTO; order: OrderDTO; message: string } {
  assertActive(account);
  const inst = getEffectiveInstrument(input.symbol);
  assertVolume(inst, input.lots);
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertActive(fresh);
    if (input.clientOrderId) {
      const existing = one<OrderRow>(
        "SELECT * FROM orders WHERE account_id = ? AND client_order_id = ?",
        [fresh.id, input.clientOrderId],
      );
      if (existing) {
        return {
          account: summarizeAccount(fresh),
          order: mapOrder(existing),
          message: "Duplicate request ignored; the order already exists.",
        };
      }
    }
    const now = new Date();
    assertTradable(inst, now);
    const quote = getExecutionQuote(input.symbol, SPREAD_PLAN, now.getTime());
    if (quote.status !== "open") throw new ApiError(400, `${input.symbol} market is closed.`);
    validatePendingPrice(input.side, input.type, input.price, quote);
    validateProtection(input.side, input.price, input.sl, input.tp);
    const expiresAt = normalizeExpiry(input.expiresAt, now);
    assertTradeAllowed(fresh, {
      symbol: input.symbol,
      side: input.side,
      lots: input.lots,
      price: input.price,
      sl: input.sl ?? null,
      kind: "pending",
    }, { log: false, now });
    const id = newId();
    const provider = executionProvider();
    run(
      `INSERT INTO orders (id, account_id, symbol, side, type, lots, price, sl, tp, status, created_at, triggered_at,
        client_order_id, expires_at, execution_provider, execution_ref, filled_price, rejection_reason, modified_at, cancelled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      [
        id,
        fresh.id,
        input.symbol,
        input.side,
        input.type,
        input.lots,
        input.price,
        input.sl ?? null,
        input.tp ?? null,
        nowIso(),
        input.clientOrderId ?? null,
        expiresAt,
        provider.id,
      ],
    );
    recordExecutionEvent({
      accountId: fresh.id,
      orderId: id,
      eventType: "order_placed",
      provider: provider.id,
      symbol: input.symbol,
      side: input.side,
      lots: input.lots,
      price: input.price,
      reason: `${input.side}_${input.type}`,
      dedupeKey: input.clientOrderId ? `pending:${fresh.id}:${input.clientOrderId}` : null,
    });
    const row = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [id])!;
    return {
      account: summarizeAccount(fresh),
      order: mapOrder(row),
      message: `${input.side === "buy" ? "Buy" : "Sell"} ${input.type} order placed for ${input.symbol}.`,
    };
  });
}

export interface ModifyPendingInput {
  price?: number;
  lots?: number;
  sl?: number | null;
  tp?: number | null;
  expiresAt?: string | null;
}

export function modifyPendingOrder(
  account: AccountRow,
  orderId: string,
  input: ModifyPendingInput,
): { order: OrderDTO; message: string } {
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertActive(fresh);
    const order = one<OrderRow>("SELECT * FROM orders WHERE id = ? AND account_id = ?", [orderId, fresh.id]);
    if (!order) throw new ApiError(404, "Order not found.");
    if (order.status !== "pending") throw new ApiError(400, "Only pending orders can be modified.");
    const inst = getEffectiveInstrument(order.symbol);
    const lots = input.lots ?? order.lots;
    assertVolume(inst, lots);
    const price = input.price ?? order.price;
    const sl = input.sl === undefined ? order.sl : input.sl;
    const tp = input.tp === undefined ? order.tp : input.tp;
    const now = new Date();
    assertTradable(inst, now);
    const quote = getExecutionQuote(order.symbol, SPREAD_PLAN, now.getTime());
    validatePendingPrice(order.side, order.type, price, quote);
    validateProtection(order.side, price, sl, tp);
    const expiresAt = input.expiresAt === undefined ? order.expires_at : normalizeExpiry(input.expiresAt, now);
    assertTradeAllowed(fresh, {
      symbol: order.symbol,
      side: order.side,
      lots,
      price,
      sl,
      kind: "pending",
    }, { log: false, now });
    run(
      "UPDATE orders SET price = ?, lots = ?, sl = ?, tp = ?, expires_at = ?, modified_at = ? WHERE id = ?",
      [price, lots, sl, tp, expiresAt, nowIso(), order.id],
    );
    recordExecutionEvent({
      accountId: fresh.id,
      orderId: order.id,
      eventType: "order_modified",
      provider: order.execution_provider,
      symbol: order.symbol,
      side: order.side,
      lots,
      price,
      reason: "client_modify",
    });
    const row = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id])!;
    return { order: mapOrder(row), message: "Pending order updated." };
  });
}

export function cancelPendingOrder(account: AccountRow, orderId: string): { message: string } {
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertCanClose(fresh);
    const order = one<OrderRow>("SELECT * FROM orders WHERE id = ? AND account_id = ?", [orderId, fresh.id]);
    if (!order) throw new ApiError(404, "Order not found.");
    if (order.status === "cancelled") return { message: "Pending order cancelled." };
    if (order.status !== "pending") throw new ApiError(400, "This order is no longer pending.");
    run("UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'pending'", [nowIso(), order.id]);
    recordExecutionEvent({
      accountId: fresh.id,
      orderId: order.id,
      eventType: "order_cancelled",
      provider: order.execution_provider,
      symbol: order.symbol,
      side: order.side,
      lots: order.lots,
      price: order.price,
      reason: "client_cancel",
    });
    return { message: "Pending order cancelled." };
  });
}

export interface ClosePositionInput {
  lots?: number | null;
  clientOrderId?: string | null;
}

export function closePosition(
  account: AccountRow,
  positionId: string,
  input: ClosePositionInput = {},
): { account: AccountDTO; trade: ClosedTradeDTO; message: string } {
  assertCanClose(account);
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertCanClose(fresh);
    const dedupeKey = input.clientOrderId ? `close:${fresh.id}:${input.clientOrderId}` : null;
    if (dedupeKey) {
      const event = findExecutionEvent(dedupeKey);
      if (event?.position_id) {
        const existing = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [event.position_id]);
        if (existing) {
          return {
            account: summarizeAccount(fresh),
            trade: mapClosedTrade(existing),
            message: "Duplicate close request ignored; the position was already closed.",
          };
        }
      }
    }
    const position = one<PositionRow>(
      "SELECT * FROM positions WHERE id = ? AND account_id = ? AND status = 'open'",
      [positionId, fresh.id],
    );
    if (!position) throw new ApiError(404, "Open position not found.");
    const trade = closePositionInternal(fresh, position, "manual", undefined, input.lots ?? null, dedupeKey);
    const updated = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [fresh.id])!;
    return {
      account: summarizeAccount(updated),
      trade,
      message: `Position closed · ${trade.net >= 0 ? "+" : ""}$${trade.net.toFixed(2)}`,
    };
  });
}

export function closeAllPositions(account: AccountRow): {
  account: AccountDTO;
  closedCount: number;
  message: string;
} {
  assertCanClose(account);
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertCanClose(fresh);
    const positions = all<PositionRow>(
      "SELECT * FROM positions WHERE account_id = ? AND status = 'open'",
      [fresh.id],
    );
    for (const position of positions) {
      closePositionInternal(fresh, position, "manual");
    }
    const updated = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [fresh.id])!;
    return {
      account: summarizeAccount(updated),
      closedCount: positions.length,
      message: positions.length === 0 ? "No open positions." : `Closed ${positions.length} position${positions.length === 1 ? "" : "s"}.`,
    };
  });
}

export function closePositionInternal(
  account: AccountRow,
  position: PositionRow,
  reason: string,
  executionPrice?: number,
  closeLots?: number | null,
  dedupeKey?: string | null,
): ClosedTradeDTO {
  const current = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [position.id])!;
  if (current.status !== "open") return mapClosedTrade(current);
  const inst = getEffectiveInstrument(current.symbol);
  const lots = closeLots ?? current.lots;
  if (lots <= 0 || lots > current.lots) throw new ApiError(400, "Close volume must be greater than zero and no larger than the open volume.");
  const partial = lots < current.lots;
  if (partial) {
    assertVolume(inst, lots);
    const remaining = Number((current.lots - lots).toFixed(8));
    if (remaining > 0 && remaining < inst.minLots) {
      throw new ApiError(400, `Remaining volume would be below the ${inst.minLots} lot minimum.`);
    }
  }
  const now = new Date();
  const quote = getExecutionQuote(current.symbol, SPREAD_PLAN, now.getTime());
  const fill = executionProvider().closeFill(inst, current.side, lots, quote, SPREAD_PLAN, executionSettings());
  const exit = executionPrice ?? fill.price;
  const grossCents = profitCents(current.symbol, current.side, lots, current.entry_price, exit, now.getTime());
  const settings = executionSettings();
  const swap = settings.swap_enabled ? swapCents(current.symbol, current.side, lots, nightsHeld(current.opened_at, now)) : 0;
  const closeCommission = fill.commissionCents;
  const closedAt = nowIso();
  const commissionShare = partial
    ? Math.round((current.commission_cents * lots) / current.lots)
    : 0;

  if (partial) {
    const childId = newId();
    run(
      `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
        profit_cents, status, opened_at, closed_at, close_price, close_reason, client_order_id, order_id,
        parent_position_id, execution_provider, execution_ref, current_price, floating_cents, margin_cents, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'closed', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        childId,
        current.account_id,
        current.symbol,
        current.side,
        lots,
        current.entry_price,
        commissionShare + closeCommission,
        swap,
        grossCents,
        current.opened_at,
        closedAt,
        exit,
        reason,
        current.order_id,
        current.id,
        fill.provider,
        fill.reference,
        exit,
        closedAt,
      ],
    );
    run(
      "UPDATE positions SET lots = ?, commission_cents = commission_cents - ?, modified_at = ? WHERE id = ? AND status = 'open'",
      [Number((current.lots - lots).toFixed(8)), commissionShare, closedAt, current.id],
    );
    recordTradeSettlement(account, grossCents + swap, `Partially closed ${current.side} ${lots} ${current.symbol} (${reason})`);
    recordCommission(account, closeCommission, "Closing commission");
    recordExecutionEvent({
      accountId: current.account_id,
      positionId: childId,
      orderId: current.order_id,
      eventType: "position_closed",
      provider: fill.provider,
      executionRef: fill.reference,
      symbol: current.symbol,
      side: current.side,
      lots,
      price: exit,
      commissionCents: closeCommission,
      reason,
      metrics: { parentPositionId: current.id, remainingLots: Number((current.lots - lots).toFixed(8)), swapCents: swap },
      dedupeKey,
    });
    const child = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [childId])!;
    return mapClosedTrade(child);
  }

  const changed = run(
    `UPDATE positions SET status = 'closed', closed_at = ?, close_price = ?, close_reason = ?,
      profit_cents = ?, swap_cents = ?, commission_cents = commission_cents + ?, modified_at = ?
     WHERE id = ? AND status = 'open'`,
    [closedAt, exit, reason, grossCents, swap, closeCommission, closedAt, current.id],
  );
  if (changed === 0) {
    const closed = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [current.id])!;
    return mapClosedTrade(closed);
  }
  recordTradeSettlement(account, grossCents + swap, `Closed ${current.side} ${current.lots} ${current.symbol} (${reason})`);
  recordCommission(account, closeCommission, "Closing commission");
  recordExecutionEvent({
    accountId: current.account_id,
    positionId: current.id,
    orderId: current.order_id,
    eventType: "position_closed",
    provider: fill.provider,
    executionRef: fill.reference,
    symbol: current.symbol,
    side: current.side,
    lots: current.lots,
    price: exit,
    commissionCents: closeCommission,
    reason,
    metrics: { swapCents: swap },
    dedupeKey,
  });
  const row = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [current.id])!;
  return mapClosedTrade(row);
}

export function modifyPosition(
  account: AccountRow,
  positionId: string,
  sl: number | null | undefined,
  tp: number | null | undefined,
): { position: PositionDTO; message: string } {
  return withTransaction(() => {
    const fresh = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id])!;
    assertActive(fresh);
    const position = one<PositionRow>(
      "SELECT * FROM positions WHERE id = ? AND account_id = ? AND status = 'open'",
      [positionId, fresh.id],
    );
    if (!position) throw new ApiError(404, "Open position not found.");
    const quote = getExecutionQuote(position.symbol, SPREAD_PLAN);
    const reference = position.side === "buy" ? quote.bid : quote.ask;
    const nextSl = sl === undefined ? position.sl : sl;
    const nextTp = tp === undefined ? position.tp : tp;
    if (nextSl != null) {
      if (nextSl <= 0) throw new ApiError(400, "Stop loss must be greater than zero.");
      if (position.side === "buy" && nextSl >= reference) {
        throw new ApiError(400, "Stop loss must be below the current bid.");
      }
      if (position.side === "sell" && nextSl <= reference) {
        throw new ApiError(400, "Stop loss must be above the current ask.");
      }
    }
    if (nextTp != null) {
      if (nextTp <= 0) throw new ApiError(400, "Take profit must be greater than zero.");
      if (position.side === "buy" && nextTp <= reference) {
        throw new ApiError(400, "Take profit must be above the current bid.");
      }
      if (position.side === "sell" && nextTp >= reference) {
        throw new ApiError(400, "Take profit must be below the current ask.");
      }
    }
    assertTradeAllowed(fresh, {
      symbol: position.symbol,
      side: position.side,
      lots: position.lots,
      price: position.entry_price,
      sl: nextSl,
      kind: "modify",
    }, { log: false });
    run("UPDATE positions SET sl = ?, tp = ?, modified_at = ? WHERE id = ?", [nextSl, nextTp, nowIso(), position.id]);
    recordExecutionEvent({
      accountId: fresh.id,
      positionId: position.id,
      eventType: "position_modified",
      provider: position.execution_provider,
      symbol: position.symbol,
      side: position.side,
      lots: position.lots,
      price: reference,
      reason: "protection_update",
      metrics: { sl: nextSl, tp: nextTp },
    });
    const row = one<PositionRow>("SELECT * FROM positions WHERE id = ?", [position.id])!;
    return { position: mapPosition(row), message: "Protection levels updated." };
  });
}

export function getClosedTrades(accountId: string, limit = 200): ClosedTradeDTO[] {
  return all<PositionRow>(
    "SELECT * FROM positions WHERE account_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT ?",
    [accountId, limit],
  ).map(mapClosedTrade);
}

export type PendingTriggerResult = "filled" | "rejected" | "expired" | "none";

export function triggerPendingOrder(order: OrderRow, account: AccountRow): PendingTriggerResult {
  const now = new Date();
  if (order.expires_at && order.expires_at <= now.toISOString()) {
    return withTransaction(() => {
      const freshOrder = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id]);
      if (!freshOrder || freshOrder.status !== "pending") return "none" as const;
      run("UPDATE orders SET status = 'expired', rejection_reason = 'Order expired before execution.' WHERE id = ?", [freshOrder.id]);
      recordExecutionEvent({
        accountId: freshOrder.account_id,
        orderId: freshOrder.id,
        eventType: "order_expired",
        provider: freshOrder.execution_provider,
        symbol: freshOrder.symbol,
        side: freshOrder.side,
        lots: freshOrder.lots,
        price: freshOrder.price,
        reason: "expiry",
      });
      return "expired" as const;
    });
  }
  const quote = getExecutionQuote(order.symbol, SPREAD_PLAN, now.getTime());
  if (quote.status !== "open") return "none";
  const decision = executionProvider().pendingFill(order, quote, SPREAD_PLAN, executionSettings());
  if (!decision.hit) return "none";
  if (!decision.fill) {
    return withTransaction(() => {
      const freshOrder = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id]);
      if (!freshOrder || freshOrder.status !== "pending") return "none" as const;
      run("UPDATE orders SET status = 'rejected', rejection_reason = ? WHERE id = ?", [decision.rejection, freshOrder.id]);
      recordExecutionEvent({
        accountId: freshOrder.account_id,
        orderId: freshOrder.id,
        eventType: "order_rejected",
        provider: freshOrder.execution_provider,
        symbol: freshOrder.symbol,
        side: freshOrder.side,
        lots: freshOrder.lots,
        price: freshOrder.price,
        reason: decision.rejection,
      });
      return "rejected" as const;
    });
  }
  const fill = decision.fill;
  return withTransaction(() => {
    const freshOrder = one<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id]);
    if (!freshOrder || freshOrder.status !== "pending") return "none" as const;
    const freshAccount = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [account.id]);
    if (!freshAccount || freshAccount.status !== "active") return "none" as const;
    const risk = evaluateTradeAllowed(freshAccount, {
      symbol: freshOrder.symbol,
      side: freshOrder.side,
      lots: freshOrder.lots,
      price: fill.price,
      sl: freshOrder.sl,
      kind: "trigger",
    }, { now });
    const math = accountMath(freshAccount);
    const marginCents = requiredMarginCents(freshAccount.leverage, freshOrder.symbol, freshOrder.lots, fill.price, now.getTime());
    if (!risk.allowed || math.freeCents < marginCents + fill.commissionCents) {
      const reason = risk.allowed ? "Insufficient free margin at trigger time." : risk.violations[0]?.message ?? "Risk engine rejected the order.";
      run("UPDATE orders SET status = 'rejected', rejection_reason = ? WHERE id = ?", [reason, freshOrder.id]);
      recordExecutionEvent({
        accountId: freshAccount.id,
        orderId: freshOrder.id,
        eventType: "order_rejected",
        provider: fill.provider,
        symbol: freshOrder.symbol,
        side: freshOrder.side,
        lots: freshOrder.lots,
        price: fill.price,
        reason,
      });
      return "rejected" as const;
    }
    recordCommission(freshAccount, fill.commissionCents, "Trading commission");
    const id = newId();
    run(
      `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
        profit_cents, status, opened_at, closed_at, close_price, close_reason, client_order_id, order_id,
        parent_position_id, execution_provider, execution_ref, current_price, floating_cents, margin_cents, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'open', ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, ?, 0, ?, NULL)`,
      [
        id,
        freshAccount.id,
        freshOrder.symbol,
        freshOrder.side,
        freshOrder.lots,
        fill.price,
        freshOrder.sl,
        freshOrder.tp,
        fill.commissionCents,
        nowIso(),
        freshOrder.id,
        fill.provider,
        fill.reference,
        fill.price,
        marginCents,
      ],
    );
    run(
      "UPDATE orders SET status = 'filled', triggered_at = ?, filled_price = ?, execution_ref = ? WHERE id = ? AND status = 'pending'",
      [nowIso(), fill.price, fill.reference, freshOrder.id],
    );
    recordExecutionEvent({
      accountId: freshAccount.id,
      positionId: id,
      orderId: freshOrder.id,
      eventType: "order_filled",
      provider: fill.provider,
      executionRef: fill.reference,
      symbol: freshOrder.symbol,
      side: freshOrder.side,
      lots: freshOrder.lots,
      price: fill.price,
      commissionCents: fill.commissionCents,
      reason: `${freshOrder.side}_${freshOrder.type}_trigger`,
      dedupeKey: `fill:${freshOrder.id}`,
    });
    return "filled" as const;
  });
}

export function accountExposureCents(account: AccountRow, timestamp = Date.now()): number {
  const positions = all<PositionRow>("SELECT * FROM positions WHERE account_id = ? AND status = 'open'", [account.id]);
  return positions.reduce((sum, position) => {
    const quote = getExecutionQuote(position.symbol, SPREAD_PLAN, timestamp);
    const exit = position.side === "buy" ? quote.bid : quote.ask;
    return sum + notionalCents(position.symbol, position.lots, exit, timestamp);
  }, 0);
}