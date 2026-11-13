import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AccountRow, OrderRow, PositionRow, UserRow } from "@/lib/db";
import type { ExecutionSettingsInput } from "@/lib/execution";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "anerith-trading-"));
process.env.DATABASE_PATH = path.join(dataDir, "trading.db");
process.env.SEED_DEMO_DATA = "false";

const db = await import("@/lib/db");
const accounts = await import("@/lib/accounts");
const execution = await import("@/lib/execution");
const instrumentSpecs = await import("@/lib/instrument-specs");
const marketData = await import("@/lib/market-data");
const objectives = await import("@/lib/objectives");
const trading = await import("@/lib/trading");
const { ApiError } = await import("@/lib/errors");

const START = 10_000_000; // $100,000 in cents
const NOW = new Date("2026-11-11T12:00:00.000Z"); // Wednesday, session open.
const EUR = { bid: 1.1, ask: 1.1001 };

let admin: UserRow;
let trader: UserRow;
let accountSeq = 0;

function makeUser(role: "user" | "admin" = "user"): UserRow {
  const id = db.newId();
  db.run(
    `INSERT INTO users (id, email, password_hash, full_name, role, kyc_status, created_at)
     VALUES (?, ?, 'x', 'Engine Test', ?, 'verified', ?)`,
    [id, `${role}-${id.slice(0, 8)}@test.local`, role, db.nowIso()],
  );
  return db.one<UserRow>("SELECT * FROM users WHERE id = ?", [id])!;
}

function newAccount(): AccountRow {
  accountSeq += 1;
  return accounts.provisionChallengeAccount(trader.id, "two-step", START, `challenge-${accountSeq}-${db.newId()}`);
}

function accountRow(id: string): AccountRow {
  return db.one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id])!;
}

function pinQuote(symbol: string, bid: number, ask: number, overrides: { provider?: string; timestamp?: number } = {}): void {
  const timestamp = overrides.timestamp ?? Date.now();
  db.run(
    `INSERT INTO market_quotes (symbol, provider, bid, ask, mid, spread, last_price, change_pct, high_24h, low_24h, status, timestamp, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'open', ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       provider = excluded.provider, bid = excluded.bid, ask = excluded.ask, mid = excluded.mid,
       spread = excluded.spread, last_price = excluded.last_price, high_24h = excluded.high_24h,
       low_24h = excluded.low_24h, status = excluded.status, timestamp = excluded.timestamp,
       received_at = excluded.received_at`,
    [
      symbol,
      overrides.provider ?? "internal-simulated",
      bid,
      ask,
      (bid + ask) / 2,
      ask - bid,
      (bid + ask) / 2,
      Math.max(bid, ask),
      Math.min(bid, ask),
      timestamp,
      db.nowIso(),
    ],
  );
}

function configureExecution(overrides: Partial<ExecutionSettingsInput> = {}): void {
  execution.saveExecutionSettings(admin, {
    provider: "internal-simulated",
    marketDataProvider: "internal-simulated",
    policy: "instant",
    slippagePips: 0,
    maxQuoteAgeMs: 5000,
    maxGapPips: 50,
    swapEnabled: false,
    ...overrides,
  });
}

function positionRow(id: string): PositionRow {
  return db.one<PositionRow>("SELECT * FROM positions WHERE id = ?", [id])!;
}

function orderRow(id: string): OrderRow {
  return db.one<OrderRow>("SELECT * FROM orders WHERE id = ?", [id])!;
}

function count(sql: string, params: (string | number)[] = []): number {
  return db.one<{ c: number }>(sql, params)?.c ?? 0;
}

beforeAll(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  db.getDb();
  admin = db.one<UserRow>("SELECT * FROM users WHERE role = 'admin' LIMIT 1")!;
  trader = makeUser();
  const inst = instrumentSpecs.getEffectiveInstrument("EURUSD");
  instrumentSpecs.saveInstrumentSpec(admin, {
    symbol: "EURUSD",
    enabled: true,
    tradingStatus: "open",
    minLots: inst.minLots,
    maxLots: inst.maxLots,
    lotStep: inst.lotStep,
    contractSize: inst.contractSize,
    tickSize: inst.tickSize,
    pipSize: inst.pipSize,
    precision: inst.precision,
    maxLeverage: inst.maxLeverage,
    spreads: inst.spreads,
    commissions: { standard: 5, raw: 3.5, zero: 0.35 },
    swapLong: inst.swapLong,
    swapShort: inst.swapShort,
    session: inst.session,
    baseCurrency: inst.baseCurrency,
    quoteCurrency: inst.quoteCurrency,
  });
});

beforeEach(() => {
  configureExecution();
});

afterAll(() => {
  vi.useRealTimers();
});

describe("market execution", () => {
  it("fills a buy at the ask plus configured slippage and charges commission", () => {
    configureExecution({ slippagePips: 1 });
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();

    const result = trading.placeMarketOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      lots: 0.5,
      sl: 1.098,
      tp: 1.104,
      clientOrderId: `market-buy-${db.newId()}`,
    });

    expect(result.position.entryPrice).toBeCloseTo(1.1002, 5);
    expect(result.position.commission).toBeCloseTo(2.5, 5);
    expect(result.position.simulatedExecution).toBe(true);
    expect(accountRow(account.id).balance_cents).toBe(START - 250);
    const event = db.one<{ provider: string; event_type: string; lots: number }>(
      "SELECT provider, event_type, lots FROM execution_events WHERE position_id = ? AND event_type = 'position_opened'",
      [result.position.id],
    );
    expect(event).toMatchObject({ provider: "internal-simulated", event_type: "position_opened", lots: 0.5 });
  });

  it("fills a sell at the bid minus configured slippage", () => {
    configureExecution({ slippagePips: 1 });
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();

    const result = trading.placeMarketOrder(account, {
      symbol: "EURUSD",
      side: "sell",
      lots: 0.5,
      sl: 1.102,
      tp: 1.097,
      clientOrderId: `market-sell-${db.newId()}`,
    });

    expect(result.position.entryPrice).toBeCloseTo(1.0999, 5);
  });

  it("rejects a market order when the risk profile requires a stop loss", () => {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();

    expect(() =>
      trading.placeMarketOrder(account, { symbol: "EURUSD", side: "buy", lots: 0.1, clientOrderId: db.newId() }),
    ).toThrow(/stop loss/i);
    expect(accountRow(account.id).balance_cents).toBe(START);
  });

  it("treats a repeated clientOrderId as the same order and only settles once", async () => {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const clientOrderId = `dup-${db.newId()}`;
    const input = { symbol: "EURUSD", side: "buy" as const, lots: 0.5, sl: 1.098, clientOrderId };

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => trading.placeMarketOrder(account, input)),
      Promise.resolve().then(() => trading.placeMarketOrder(account, input)),
    ]);

    expect(first.position.id).toBe(second.position.id);
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE account_id = ?", [account.id])).toBe(1);
    expect(accountRow(account.id).balance_cents).toBe(START - 250);
  });
});

describe("pending orders", () => {
  it("keeps a buy limit pending until the ask crosses, then fills exactly once", () => {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const placed = trading.placePendingOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      type: "limit",
      lots: 0.5,
      price: 1.099,
      sl: 1.097,
      tp: 1.102,
      clientOrderId: `limit-${db.newId()}`,
    });

    objectives.pendingOrderMonitor();
    expect(orderRow(placed.order.id).status).toBe("pending");
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE account_id = ?", [account.id])).toBe(0);

    pinQuote("EURUSD", 1.0988, 1.0989);
    objectives.pendingOrderMonitor();
    objectives.pendingOrderMonitor();

    const filled = orderRow(placed.order.id);
    expect(filled.status).toBe("filled");
    expect(filled.filled_price).toBeCloseTo(1.0989, 5);
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE account_id = ?", [account.id])).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM execution_events WHERE order_id = ? AND event_type = 'order_filled'", [placed.order.id])).toBe(1);
  });

  it("rejects a stop order that gaps beyond the configured execution limit", () => {
    configureExecution({ policy: "reject_on_gap", maxGapPips: 2 });
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const placed = trading.placePendingOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      type: "stop",
      lots: 0.5,
      price: 1.101,
      sl: 1.099,
      tp: 1.104,
      clientOrderId: `stop-${db.newId()}`,
    });

    pinQuote("EURUSD", 1.102, 1.1021);
    objectives.pendingOrderMonitor();

    const rejected = orderRow(placed.order.id);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toMatch(/gapped/i);
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE account_id = ?", [account.id])).toBe(0);
  });

  it("expires a persisted pending order that outlives its expiry", () => {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const placed = trading.placePendingOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      type: "limit",
      lots: 0.5,
      price: 1.099,
      sl: 1.097,
      clientOrderId: `expiry-${db.newId()}`,
    });
    db.run("UPDATE orders SET expires_at = ? WHERE id = ?", ["2026-11-11T11:00:00.000Z", placed.order.id]);

    const result = trading.triggerPendingOrder(orderRow(placed.order.id), account);

    expect(result).toBe("expired");
    expect(orderRow(placed.order.id).status).toBe("expired");
    expect(count("SELECT COUNT(*) AS c FROM execution_events WHERE order_id = ? AND event_type = 'order_expired'", [placed.order.id])).toBe(1);
  });
});

describe("protective exits", () => {
  function openBuy(): { account: AccountRow; positionId: string } {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const result = trading.placeMarketOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      lots: 0.5,
      sl: 1.099,
      tp: 1.102,
      clientOrderId: `protect-${db.newId()}`,
    });
    return { account, positionId: result.position.id };
  }

  it("closes on stop loss with a realised loss", () => {
    const { account, positionId } = openBuy();
    pinQuote("EURUSD", 1.0989, 1.099);

    objectives.processProtectiveExits();

    const closed = positionRow(positionId);
    expect(closed.status).toBe("closed");
    expect(closed.close_reason).toBe("sl");
    expect(closed.close_price).toBeCloseTo(1.0989, 5);
    expect(closed.profit_cents).toBe(-6000);
    expect(accountRow(account.id).balance_cents).toBe(START - 250 - 6000 - 250);
  });

  it("closes on take profit with a realised gain", () => {
    const { account, positionId } = openBuy();
    pinQuote("EURUSD", 1.1021, 1.1022);

    objectives.processProtectiveExits();

    const closed = positionRow(positionId);
    expect(closed.status).toBe("closed");
    expect(closed.close_reason).toBe("tp");
    expect(closed.profit_cents).toBe(10_000);
    expect(accountRow(account.id).balance_cents).toBe(START - 250 + 10_000 - 250);
  });
});

describe("partial closes", () => {
  function openPosition(): { account: AccountRow; positionId: string } {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const result = trading.placeMarketOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      lots: 0.5,
      sl: 1.098,
      clientOrderId: `partial-${db.newId()}`,
    });
    return { account, positionId: result.position.id };
  }

  it("reduces the parent, books a child trade and ignores duplicate close requests", () => {
    const { account, positionId } = openPosition();
    pinQuote("EURUSD", 1.1011, 1.1012);
    const clientOrderId = `close-${db.newId()}`;

    const first = trading.closePosition(account, positionId, { lots: 0.25, clientOrderId });
    const second = trading.closePosition(account, positionId, { lots: 0.25, clientOrderId });

    expect(first.trade.lots).toBe(0.25);
    expect(second.trade.id).toBe(first.trade.id);
    const parent = positionRow(positionId);
    expect(parent.status).toBe("open");
    expect(parent.lots).toBe(0.25);
    expect(parent.commission_cents).toBe(125);
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE parent_position_id = ?", [positionId])).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM positions WHERE account_id = ? AND status = 'closed'", [account.id])).toBe(1);
  });

  it("rejects a close volume larger than the open volume", () => {
    const { account, positionId } = openPosition();
    pinQuote("EURUSD", 1.1011, 1.1012);
    expect(() => trading.closePosition(account, positionId, { lots: 1 })).toThrow(/Close volume/i);
    expect(positionRow(positionId).lots).toBe(0.5);
  });
});

describe("accounting", () => {
  it("marks floating P&L, equity and margin consistently through a rapid price move", () => {
    pinQuote("EURUSD", EUR.bid, EUR.ask);
    const account = newAccount();
    const result = trading.placeMarketOrder(account, {
      symbol: "EURUSD",
      side: "buy",
      lots: 0.5,
      sl: 1.09,
      clientOrderId: `mark-${db.newId()}`,
    });

    pinQuote("EURUSD", 1.1031, 1.1032);
    trading.markPositionsToMarket(account.id);
    let math = accounts.accountMath(accountRow(account.id));
    expect(positionRow(result.position.id).floating_cents).toBe(15_000);
    expect(math.floatingCents).toBe(15_000);
    expect(math.equityCents).toBe(math.balanceCents + 15_000);
    expect(math.marginCents).toBeGreaterThan(0);

    pinQuote("EURUSD", 1.0971, 1.0972);
    trading.markPositionsToMarket(account.id);
    math = accounts.accountMath(accountRow(account.id));
    expect(positionRow(result.position.id).floating_cents).toBe(-15_000);
    expect(math.equityCents).toBe(math.balanceCents - 15_000);
    expect(math.marginLevelPct).not.toBeNull();
  });

  it("pauses execution when selected live market data is stale", () => {
    configureExecution({ marketDataProvider: "live-rates" });
    pinQuote("EURUSD", EUR.bid, EUR.ask, { provider: "live-rates" });
    const fresh = marketData.getExecutionQuote("EURUSD", "standard");
    expect(fresh.simulated).toBe(false);
    expect(fresh.provider).toBe("live-rates");

    pinQuote("EURUSD", EUR.bid, EUR.ask, { provider: "live-rates", timestamp: Date.now() - 60_000 });
    let caught: unknown;
    try {
      marketData.getExecutionQuote("EURUSD", "standard");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as InstanceType<typeof ApiError>).status).toBe(503);
    expect((caught as Error).message).toMatch(/stale/i);
  });
});
