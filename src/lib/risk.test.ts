import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AccountRow, UserRow } from "@/lib/db";
import type { RiskConfigInput } from "@/lib/risk-view";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "anerith-risk-"));
process.env.DATABASE_PATH = path.join(dataDir, "risk.db");
process.env.SEED_DEMO_DATA = "false";

const db = await import("@/lib/db");
const risk = await import("@/lib/risk");
const accounts = await import("@/lib/accounts");
const objectives = await import("@/lib/objectives");
const riskView = await import("@/lib/risk-view");

const START = 10_000_000; // $100,000 in cents

function makeUser(role: "user" | "admin" = "user"): UserRow {
  const id = db.newId();
  const email = `${role}-${id.slice(0, 8)}@test.local`;
  db.run(
    `INSERT INTO users (id, email, password_hash, full_name, role, kyc_status, created_at)
     VALUES (?, ?, 'x', 'Test Trader', ?, 'verified', ?)`,
    [id, email, role, db.nowIso()],
  );
  return db.one<UserRow>("SELECT * FROM users WHERE id = ?", [id])!;
}

function makeAccount(userId: string): AccountRow {
  return accounts.provisionChallengeAccount(userId, "two-step", START, `challenge-${db.newId()}`);
}

function configInput(accountId: string, overrides: Partial<RiskConfigInput> = {}): RiskConfigInput {
  const base: RiskConfigInput = {
    id: null,
    name: `profile-${accountId.slice(0, 6)}`,
    scope: "account",
    planKey: null,
    accountId,
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
  };
  return Object.assign(base, overrides);
}

function applyConfig(admin: UserRow, accountId: string, overrides: Partial<RiskConfigInput> = {}) {
  return riskView.saveRiskConfig(admin, configInput(accountId, overrides));
}

function accountRow(id: string): AccountRow {
  return db.one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id])!;
}

function currentDayKey(timezone = "UTC", hour = 0, minute = 0): string {
  return risk.tradingDayKey(new Date(), timezone, hour, minute);
}

function primeAccount(
  accountId: string,
  input: {
    balanceCents?: number;
    startBalanceCents?: number;
    dayStartCents?: number;
    highWaterMarkCents?: number;
    dayKey?: string;
    status?: string;
  } = {},
): void {
  const balance = input.balanceCents ?? START;
  const start = input.startBalanceCents ?? START;
  const dayStart = input.dayStartCents ?? start;
  const hwm = input.highWaterMarkCents ?? Math.max(start, balance);
  db.run(
    `UPDATE accounts SET balance_cents = ?, start_balance_cents = ?, high_water_mark_cents = ?,
      day_start_date = ?, day_start_balance_cents = ?, day_start_equity_cents = ?, status = ?
     WHERE id = ?`,
    [balance, start, hwm, input.dayKey ?? currentDayKey(), dayStart, dayStart, input.status ?? "active", accountId],
  );
}

function insertClosedTrade(accountId: string, closedAtIso: string, profitCents = 0, swapCents = 0): void {
  db.run(
    `INSERT INTO positions (
      id, account_id, symbol, side, lots, entry_price, commission_cents, swap_cents, profit_cents,
      status, opened_at, closed_at, close_price, close_reason
    ) VALUES (?, ?, 'EURUSD', 'buy', 1, 1.1, 0, ?, ?, 'closed', ?, ?, 1.1, 'manual')`,
    [db.newId(), accountId, swapCents, profitCents, closedAtIso, closedAtIso],
  );
}

function insertOpenPosition(accountId: string, entryPrice: number, lots = 1): string {
  const id = db.newId();
  db.run(
    `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, status, opened_at)
     VALUES (?, ?, 'EURUSD', 'buy', ?, ?, 'open', ?)`,
    [id, accountId, lots, entryPrice, db.nowIso()],
  );
  return id;
}

function count(sql: string, params: (string | number)[] = []): number {
  return db.one<{ c: number }>(sql, params)?.c ?? 0;
}

let admin: UserRow;
let trader: UserRow;

beforeAll(() => {
  db.getDb();
  admin = db.one<UserRow>("SELECT * FROM users WHERE role = 'admin' LIMIT 1")!;
  trader = makeUser("user");
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may keep the SQLite handle open; the temp directory is disposable. */
  }
});

describe("daily loss computation", () => {
  const base = {
    basis: "equity" as const,
    limitBasis: "starting_balance" as const,
    pct: 5,
    initialBalanceCents: START,
    dayStartBalanceCents: START,
    dayStartEquityCents: START,
    balanceCents: START,
    equityCents: START,
  };

  it("does not breach one cent below the exact limit", () => {
    const state = risk.computeDailyLoss({ ...base, equityCents: START - 499_999 });
    expect(state.limitCents).toBe(500_000);
    expect(state.usedCents).toBe(499_999);
    expect(state.breach).toBe(false);
    expect(state.remainingCents).toBe(1);
  });

  it("breaches exactly at the limit and beyond", () => {
    const exact = risk.computeDailyLoss({ ...base, equityCents: START - 500_000 });
    expect(exact.breach).toBe(true);
    expect(exact.remainingCents).toBe(0);
    const beyond = risk.computeDailyLoss({ ...base, equityCents: START - 500_001 });
    expect(beyond.breach).toBe(true);
    expect(beyond.usedCents).toBe(500_001);
  });

  it("counts floating P&L only when the basis is equity", () => {
    const equityBasis = risk.computeDailyLoss({
      ...base,
      balanceCents: START,
      equityCents: START - 600_000,
    });
    expect(equityBasis.breach).toBe(true);
    const balanceBasis = risk.computeDailyLoss({
      ...base,
      basis: "balance",
      balanceCents: START,
      equityCents: START - 600_000,
    });
    expect(balanceBasis.usedCents).toBe(0);
    expect(balanceBasis.breach).toBe(false);
  });

  it("supports a day-start-equity limit basis", () => {
    const state = risk.computeDailyLoss({
      ...base,
      limitBasis: "day_start_equity",
      dayStartEquityCents: 9_000_000,
      equityCents: 8_550_000,
    });
    expect(state.limitCents).toBe(450_000);
    expect(state.breach).toBe(true);
  });

  it("treats commissions and costs as part of the loss when balance falls", () => {
    const state = risk.computeDailyLoss({ ...base, balanceCents: START - 12_500, equityCents: START - 12_500 });
    expect(state.usedCents).toBe(12_500);
    expect(state.breach).toBe(false);
  });
});

describe("drawdown computation", () => {
  const base = {
    mode: "static" as const,
    basis: "equity" as const,
    pct: 10,
    initialBalanceCents: START,
    highWaterMarkCents: START,
    balanceCents: START,
    equityCents: START,
    trailingLockPct: null,
  };

  it("keeps a static floor anchored to the initial balance", () => {
    const state = risk.computeDrawdown({
      ...base,
      highWaterMarkCents: 10_500_000,
      equityCents: 9_800_000,
    });
    expect(state.floorCents).toBe(9_000_000);
    expect(state.baselineCents).toBe(START);
    expect(state.usedCents).toBe(200_000);
    expect(state.breach).toBe(false);
  });

  it("breaches a static account exactly at the floor", () => {
    const state = risk.computeDrawdown({ ...base, equityCents: 9_000_000 });
    expect(state.breach).toBe(true);
    expect(state.remainingCents).toBe(0);
  });

  it("trails the high-water mark and never lowers it after a loss", () => {
    const afterProfit = risk.computeDrawdown({
      ...base,
      mode: "trailing",
      highWaterMarkCents: 10_500_000,
      equityCents: 9_800_000,
    });
    expect(afterProfit.floorCents).toBe(9_500_000);
    expect(afterProfit.usedCents).toBe(700_000);
    expect(afterProfit.breach).toBe(false);
    expect(afterProfit.nextHighWaterMarkCents).toBe(10_500_000);

    const afterLoss = risk.computeDrawdown({
      ...base,
      mode: "trailing",
      highWaterMarkCents: afterProfit.nextHighWaterMarkCents,
      equityCents: 9_500_000,
    });
    expect(afterLoss.breach).toBe(true);
    expect(afterLoss.floorCents).toBe(9_500_000);
    expect(afterLoss.nextHighWaterMarkCents).toBe(10_500_000);
  });

  it("locks a trailing floor at initial balance plus the configured lock", () => {
    const state = risk.computeDrawdown({
      ...base,
      mode: "trailing",
      highWaterMarkCents: 11_000_000,
      equityCents: 10_500_000,
      trailingLockPct: 2,
    });
    expect(state.floorCents).toBe(10_200_000);
    expect(state.locked).toBe(true);
    expect(state.breach).toBe(false);
    const breach = risk.computeDrawdown({
      ...base,
      mode: "trailing",
      highWaterMarkCents: 11_000_000,
      equityCents: 10_200_000,
      trailingLockPct: 2,
    });
    expect(breach.breach).toBe(true);
  });
});

describe("trading day, reset and DST handling", () => {
  it("rolls the day at the configured reset hour", () => {
    expect(risk.tradingDayKey(new Date("2026-05-10T05:59:00Z"), "UTC", 6, 0)).toBe("2026-05-09");
    expect(risk.tradingDayKey(new Date("2026-05-10T06:00:00Z"), "UTC", 6, 0)).toBe("2026-05-10");
  });

  it("honours a non-UTC timezone and reset time", () => {
    expect(risk.tradingDayKey(new Date("2026-05-10T02:30:00Z"), "Africa/Nairobi", 6, 0)).toBe("2026-05-09");
    expect(risk.tradingDayKey(new Date("2026-05-10T03:30:00Z"), "Africa/Nairobi", 6, 0)).toBe("2026-05-10");
  });

  it("computes DST-safe day starts and next resets in New York", () => {
    const start = risk.currentDayStart(new Date("2026-03-08T12:00:00Z"), "America/New_York", 0, 0);
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    const next = risk.nextResetInstant(new Date("2026-03-08T12:00:00Z"), "America/New_York", 0, 0);
    expect(next.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(risk.tradingDayKey(new Date("2026-05-10T01:00:00Z"), "Not/AZone", 0, 0)).toBe("2026-05-10");
  });
});

describe("pre-trade risk validation", () => {
  it("allows risk exactly at the per-trade limit and rejects one cent above", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id);
    const state = risk.computeAccountRisk(accountRow(account.id));
    expect(state.metrics.riskPerTradeLimitCents).toBe(100_000);

    const allowed = risk.validateTradeAgainstRisk({
      config: state.config,
      metrics: state.metrics,
      request: { symbol: "EURUSD", side: "buy", lots: 1, price: 1.1, sl: 1.09, kind: "market" },
      riskCents: 100_000,
      notionalCents: 110_000,
      instrumentExposureCents: 0,
      accountLeverage: account.leverage,
      now: new Date(),
      newsBlackout: false,
    });
    expect(allowed.allowed).toBe(true);

    const rejected = risk.validateTradeAgainstRisk({
      config: state.config,
      metrics: state.metrics,
      request: { symbol: "EURUSD", side: "buy", lots: 1, price: 1.1, sl: 1.09, kind: "market" },
      riskCents: 100_001,
      notionalCents: 110_000,
      instrumentExposureCents: 0,
      accountLeverage: account.leverage,
      now: new Date(),
      newsBlackout: false,
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.violations.some((item) => item.rule === "max_risk_per_trade")).toBe(true);
  });

  it("requires a stop loss when the profile demands one", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id);
    const state = risk.computeAccountRisk(accountRow(account.id));
    const result = risk.validateTradeAgainstRisk({
      config: state.config,
      metrics: state.metrics,
      request: { symbol: "EURUSD", side: "buy", lots: 1, price: 1.1, sl: null, kind: "market" },
      riskCents: 0,
      notionalCents: 110_000,
      instrumentExposureCents: 0,
      accountLeverage: account.leverage,
      now: new Date(),
      newsBlackout: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((item) => item.rule === "stop_loss_required")).toBe(true);
  });

  it("rejects a trade that exceeds remaining daily headroom", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START - 450_000 });
    const state = risk.computeAccountRisk(accountRow(account.id));
    expect(state.metrics.dailyLoss.remainingCents).toBe(50_000);
    const result = risk.validateTradeAgainstRisk({
      config: state.config,
      metrics: state.metrics,
      request: { symbol: "EURUSD", side: "buy", lots: 1, price: 1.1, sl: 1.09, kind: "market" },
      riskCents: 60_000,
      notionalCents: 110_000,
      instrumentExposureCents: 0,
      accountLeverage: account.leverage,
      now: new Date(),
      newsBlackout: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((item) => item.rule === "daily_loss_headroom")).toBe(true);
  });

  it("enforces position caps, exposure caps, weekend and news restrictions", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id, { weekendHolding: false, newsTradingAllowed: false });
    primeAccount(account.id);
    const state = risk.computeAccountRisk(accountRow(account.id));
    const base = {
      config: state.config,
      metrics: { ...state.metrics, openPositions: 20 },
      request: { symbol: "EURUSD" as const, side: "buy" as const, lots: 1, price: 1.1, sl: 1.09, kind: "market" as const },
      riskCents: 10_000,
      notionalCents: 110_000,
      instrumentExposureCents: 9_950_000,
      accountLeverage: account.leverage,
      now: new Date("2026-05-09T12:00:00Z"),
      newsBlackout: true,
    };
    const result = risk.validateTradeAgainstRisk(base);
    const rules = result.violations.map((item) => item.rule);
    expect(rules).toContain("max_open_positions");
    expect(rules).toContain("max_instrument_exposure");
    expect(rules).toContain("weekend_holding");
    expect(rules).toContain("news_blackout");
  });
});

describe("breach enforcement", () => {
  it("breaches exactly at the daily limit, closes positions, cancels orders and notifies", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START - 500_000, dayStartCents: START });
    const positionId = insertOpenPosition(account.id, 1.1);
    const orderId = db.newId();
    db.run(
      `INSERT INTO orders (id, account_id, symbol, side, type, lots, price, status, created_at)
       VALUES (?, ?, 'EURUSD', 'buy', 'limit', 1, 1.05, 'pending', ?)`,
      [orderId, account.id, db.nowIso()],
    );

    const result = objectives.evaluateAccount(account.id);
    expect(result.outcome).toBe("breached");

    const fresh = accountRow(account.id);
    expect(fresh.status).toBe("breached");
    expect(fresh.breach_rule).toBe("daily_loss");
    expect(fresh.breached_at).toBeTruthy();
    expect(db.one<{ status: string }>("SELECT status FROM positions WHERE id = ?", [positionId])?.status).toBe("closed");
    expect(db.one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId])?.status).toBe("cancelled");
    expect(count("SELECT COUNT(*) as c FROM breaches WHERE account_id = ?", [account.id])).toBe(1);
    expect(count("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND title = 'Account breached'", [trader.id])).toBe(1);

    const blocked = () =>
      risk.assertTradeAllowed(accountRow(account.id), {
        symbol: "EURUSD",
        side: "buy",
        lots: 0.1,
        price: 1.1,
        sl: 1.09,
        kind: "market",
      });
    expect(blocked).toThrow();
  });

  it("counts floating losses on an equity-basis daily limit but not on a balance basis", async () => {
    const equityAccount = makeAccount(trader.id);
    await applyConfig(admin, equityAccount.id, { dailyLossBasis: "equity", drawdownBasis: "balance" });
    primeAccount(equityAccount.id, { balanceCents: START, dayStartCents: START });
    insertOpenPosition(equityAccount.id, 2.0, 10);

    const balanceAccount = makeAccount(trader.id);
    await applyConfig(admin, balanceAccount.id, { dailyLossBasis: "balance", drawdownBasis: "balance" });
    primeAccount(balanceAccount.id, { balanceCents: START, dayStartCents: START });
    insertOpenPosition(balanceAccount.id, 2.0, 10);

    const equityResult = objectives.evaluateAccount(equityAccount.id);
    expect(equityResult.outcome).toBe("breached");
    expect(accountRow(equityAccount.id).status).toBe("breached");

    const balanceResult = objectives.evaluateAccount(balanceAccount.id);
    expect(balanceResult.outcome).toBeUndefined();
    expect(accountRow(balanceAccount.id).status).toBe("active");
  });

  it("records duplicate breach events only once and recovers safely after a restart", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START - 500_000, dayStartCents: START });

    await Promise.all([
      Promise.resolve().then(() => objectives.evaluateAccount(account.id)),
      Promise.resolve().then(() => objectives.evaluateAccount(account.id)),
    ]);
    expect(count("SELECT COUNT(*) as c FROM breaches WHERE account_id = ?", [account.id])).toBe(1);
    expect(count("SELECT COUNT(*) as c FROM account_status_history WHERE account_id = ? AND to_status = 'breached'", [account.id])).toBe(1);

    // Simulate a crash/restart that left the account active despite an existing breach.
    db.run("UPDATE accounts SET status = 'active', ended_at = NULL WHERE id = ?", [account.id]);
    const recovered = objectives.evaluateAccount(account.id);
    expect(recovered.outcome).toBe("breached");
    expect(accountRow(account.id).status).toBe("breached");
    expect(count("SELECT COUNT(*) as c FROM breaches WHERE account_id = ?", [account.id])).toBe(1);
  });

  it("keeps risk events immutable", () => {
    const account = makeAccount(trader.id);
    db.run(
      `INSERT INTO risk_events (id, account_id, type, severity, rule, message, created_at)
       VALUES (?, ?, 'test', 'info', 'immutability', 'test event', ?)`,
      [db.newId(), account.id, db.nowIso()],
    );
    expect(() => db.run("UPDATE risk_events SET message = 'changed' WHERE account_id = ?", [account.id])).toThrow(
      /immutable/,
    );
    expect(() => db.run("DELETE FROM risk_events WHERE account_id = ?", [account.id])).toThrow(/immutable/);
  });

  it("does not pass an account that reached target before minimum trading days", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START + 1_000_000, dayStartCents: START + 1_000_000 });

    expect(objectives.evaluateAccount(account.id).outcome).toBeUndefined();
    expect(accountRow(account.id).status).toBe("active");

    for (let day = 1; day <= 5; day += 1) {
      const at = new Date(Date.now() - day * 86_400_000).toISOString();
      insertClosedTrade(account.id, at, 0, 0);
    }
    expect(objectives.evaluateAccount(account.id).outcome).toBe("passed");
    expect(accountRow(account.id).status).toBe("passed");
    const next = db.one<AccountRow>(
      "SELECT * FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [trader.id],
    );
    expect(next).toBeTruthy();
    expect(next!.phase).toBe(2);
    expect(next!.profit_target_pct).toBe(5);
  });

  it("tracks commissions and swaps in daily risk metrics", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START - 12_500, dayStartCents: START });
    db.run(
      `INSERT INTO transactions (id, account_id, user_id, type, amount_cents, note, created_at)
       VALUES (?, ?, ?, 'commission', ?, 'round turn', ?)`,
      [db.newId(), account.id, trader.id, -12_500, db.nowIso()],
    );
    insertClosedTrade(account.id, db.nowIso(), 0, -2_500);

    const state = risk.computeAccountRisk(accountRow(account.id));
    expect(state.metrics.commissionTodayCents).toBe(12_500);
    expect(state.metrics.swapTodayCents).toBe(-2_500);
    expect(state.metrics.dailyLoss.usedCents).toBe(12_500);
    expect(state.metrics.dailyLoss.breach).toBe(false);
  });
});

describe("administrator config changes and resolution", () => {
  it("versions every rule-set change and records the admin identity", async () => {
    const account = makeAccount(trader.id);
    const created = await applyConfig(admin, account.id);
    const historyAfterCreate = db.all<{ action: string; before_json: string | null; admin_email: string }>(
      "SELECT action, before_json, admin_email FROM risk_config_history WHERE config_id = ? ORDER BY created_at",
      [created.id],
    );
    expect(historyAfterCreate).toHaveLength(1);
    expect(historyAfterCreate[0].action).toBe("created");
    expect(historyAfterCreate[0].before_json).toBeNull();
    expect(historyAfterCreate[0].admin_email).toBe(admin.email);

    const updated = await riskView.saveRiskConfig(admin, {
      ...configInput(account.id, { dailyLossPct: 7, drawdownPct: 12 }),
      id: created.id,
    });
    expect(updated.dailyLossPct).toBe(7);
    expect(risk.resolveRiskConfig(accountRow(account.id)).dailyLossPct).toBe(7);

    const history = db.all<{ action: string; before_json: string | null; after_json: string }>(
      "SELECT action, before_json, after_json FROM risk_config_history WHERE config_id = ? ORDER BY created_at",
      [created.id],
    );
    expect(history).toHaveLength(2);
    expect(history[1].action).toBe("updated");
    expect(JSON.parse(history[1].before_json!).dailyLossPct).toBe(5);
    expect(JSON.parse(history[1].after_json).dailyLossPct).toBe(7);
    expect(
      count("SELECT COUNT(*) as c FROM admin_audit_log WHERE action = 'risk_config.updated' AND admin_email = ?", [
        admin.email,
      ]),
    ).toBe(1);
  });

  it("applies config changes to live calculations immediately", async () => {
    const account = makeAccount(trader.id);
    const config = await applyConfig(admin, account.id, { maxRiskPerTradePct: 2 });
    primeAccount(account.id);
    expect(risk.computeAccountRisk(accountRow(account.id)).metrics.riskPerTradeLimitCents).toBe(200_000);
    await riskView.saveRiskConfig(admin, { ...configInput(account.id, { maxRiskPerTradePct: 0.5 }), id: config.id });
    expect(risk.computeAccountRisk(accountRow(account.id)).metrics.riskPerTradeLimitCents).toBe(50_000);
  });

  it("pins a profile to an account and audits the assignment", async () => {
    const account = makeAccount(trader.id);
    const planConfig = db.one<{ id: string }>(
      "SELECT id FROM risk_configs WHERE scope = 'plan' AND plan_key = 'two-step'",
    )!;
    await riskView.assignAccountRiskConfig(admin, account.id, planConfig.id, "Manual supervisory assignment");
    expect(accountRow(account.id).risk_config_id).toBe(planConfig.id);
    expect(
      count(
        "SELECT COUNT(*) as c FROM admin_audit_log WHERE action = 'account.risk_config_assigned' AND target_id = ?",
        [account.id],
      ),
    ).toBe(1);
  });
});

describe("suspension, resolution and reactivation", () => {
  it("suspends with documented authorization and blocks new trading", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id);
    const orderId = "order-suspend-test";
    db.run(
      `INSERT INTO orders (id, account_id, symbol, side, type, lots, price, sl, tp, status, created_at, execution_provider)
       VALUES (?, ?, 'EURUSD', 'buy', 'limit', 0.1, 1.05, 1.04, NULL, 'pending', ?, 'internal-simulated')`,
      [orderId, account.id, new Date().toISOString()],
    );
    riskView.suspendAccount(admin, account.id, "Compliance review pending");
    const fresh = accountRow(account.id);
    expect(fresh.status).toBe("suspended");
    expect(fresh.suspension_reason).toBe("Compliance review pending");
    expect(accountRow(account.id).status_before_suspension).toBe("active");
    expect(
      db.one<{ status: string; cancelled_at: string | null }>(
        "SELECT status, cancelled_at FROM orders WHERE id = ?",
        [orderId],
      ),
    ).toMatchObject({ status: "cancelled" });
    expect(
      db.one<{ reason: string }>(
        "SELECT reason FROM execution_events WHERE order_id = ? AND event_type = 'order_cancelled'",
        [orderId],
      )?.reason,
    ).toBe("admin_suspend");
    expect(() =>
      risk.assertTradeAllowed(fresh, {
        symbol: "EURUSD",
        side: "buy",
        lots: 0.1,
        price: 1.1,
        sl: 1.09,
        kind: "market",
      }),
    ).toThrow(/suspended/i);

    riskView.reactivateAccount(admin, account.id, "Review completed, no breach found");
    expect(accountRow(account.id).status).toBe("active");
    expect(
      count("SELECT COUNT(*) as c FROM account_status_history WHERE account_id = ?", [account.id]),
    ).toBe(2);
  });

  it("requires open breaches to be resolved before reinstating a breached account, while preserving history", async () => {
    const account = makeAccount(trader.id);
    await applyConfig(admin, account.id);
    primeAccount(account.id, { balanceCents: START - 500_000, dayStartCents: START });
    objectives.evaluateAccount(account.id);
    expect(accountRow(account.id).status).toBe("breached");

    expect(() => riskView.reactivateAccount(admin, account.id, "Manual reinstatement approved")).toThrow(
      /Resolve every open breach/,
    );

    const breach = db.one<{ id: string }>("SELECT id FROM breaches WHERE account_id = ? AND status = 'open'", [
      account.id,
    ])!;
    riskView.resolveBreach(admin, breach.id, "Reviewed by risk committee; client reinstated");
    expect(db.one<{ status: string }>("SELECT status FROM breaches WHERE id = ?", [breach.id])?.status).toBe("resolved");
    expect(count("SELECT COUNT(*) as c FROM breaches WHERE account_id = ?", [account.id])).toBe(1);

    riskView.reactivateAccount(admin, account.id, "Risk committee authorization 2026-11-11");
    const fresh = accountRow(account.id);
    expect(fresh.status).toBe("active");
    expect(fresh.breach_rule).toBe("daily_loss");
    expect(fresh.breached_at).toBeTruthy();
    expect(count("SELECT COUNT(*) as c FROM breaches WHERE account_id = ?", [account.id])).toBe(1);
  });
});
