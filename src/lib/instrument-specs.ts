import { all, newId, one, run, nowIso, type UserRow } from "./db";
import { getInstrument, INSTRUMENTS, type Instrument, type Plan } from "./instruments";
import { ApiError } from "./errors";

export interface InstrumentSpecRow {
  symbol: string;
  enabled: number;
  trading_status: "open" | "closed" | "halted";
  min_lots: number;
  max_lots: number;
  lot_step: number;
  contract_size: number;
  tick_size: number;
  pip_size: number;
  precision: number;
  max_leverage: number;
  spread_standard: number;
  spread_raw: number;
  spread_zero: number;
  commission_standard: number;
  commission_raw: number;
  commission_zero: number;
  swap_long: number;
  swap_short: number;
  session: string;
  base_currency: string;
  quote_currency: string;
  updated_by: string | null;
  updated_at: string;
}

export interface EffectiveInstrument extends Instrument {
  enabled: boolean;
  tradingStatus: "open" | "closed" | "halted";
  minLots: number;
  maxLots: number;
  lotStep: number;
  tickSize: number;
  baseCurrency: string;
  quoteCurrency: string;
  updatedAt: string;
}

function merge(base: Instrument, row?: InstrumentSpecRow): EffectiveInstrument {
  if (!row) {
    return {
      ...base,
      enabled: true,
      tradingStatus: "open",
      minLots: 0.01,
      maxLots: 50,
      lotStep: 0.01,
      tickSize: Number(Math.pow(10, -base.precision).toFixed(base.precision)),
      baseCurrency: base.symbol.length === 6 ? base.symbol.slice(0, 3) : "USD",
      quoteCurrency: base.symbol.length === 6 ? base.symbol.slice(3, 6) : "USD",
      updatedAt: new Date(0).toISOString(),
    };
  }
  return {
    ...base,
    contractSize: row.contract_size,
    pipSize: row.pip_size,
    precision: row.precision,
    maxLeverage: row.max_leverage,
    spreads: {
      standard: row.spread_standard,
      raw: row.spread_raw,
      zero: row.spread_zero,
    },
    commissions: {
      standard: row.commission_standard,
      raw: row.commission_raw,
      zero: row.commission_zero,
    },
    swapLong: row.swap_long,
    swapShort: row.swap_short,
    session: row.session,
    enabled: row.enabled === 1,
    tradingStatus: row.trading_status,
    minLots: row.min_lots,
    maxLots: row.max_lots,
    lotStep: row.lot_step,
    tickSize: row.tick_size,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    updatedAt: row.updated_at,
  };
}

export function getEffectiveInstrument(symbol: string): EffectiveInstrument {
  const base = getInstrument(symbol);
  const row = one<InstrumentSpecRow>("SELECT * FROM instrument_specs WHERE symbol = ?", [symbol]);
  return merge(base, row);
}

export function listEffectiveInstruments(includeDisabled = false): EffectiveInstrument[] {
  const rows = all<InstrumentSpecRow>("SELECT * FROM instrument_specs");
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  return INSTRUMENTS.map((base) => merge(base, bySymbol.get(base.symbol))).filter(
    (inst) => includeDisabled || inst.enabled,
  );
}

export function instrumentMeta(inst: EffectiveInstrument) {
  return {
    symbol: inst.symbol,
    name: inst.name,
    short: inst.short,
    category: inst.category,
    precision: inst.precision,
    pipSize: inst.pipSize,
    contractSize: inst.contractSize,
    session: inst.session,
    maxLeverage: inst.maxLeverage,
    minLots: inst.minLots,
    maxLots: inst.maxLots,
    lotStep: inst.lotStep,
    tickSize: inst.tickSize,
    tradingStatus: inst.tradingStatus,
    baseCurrency: inst.baseCurrency,
    quoteCurrency: inst.quoteCurrency,
    spreads: inst.spreads,
    commissions: inst.commissions,
  };
}

export function spreadForPlan(inst: EffectiveInstrument, plan: Plan): number {
  return inst.spreads[plan] * inst.pipSize;
}

export function commissionForPlan(inst: EffectiveInstrument, plan: Plan, lots: number): number {
  return Math.round(inst.commissions[plan] * lots * 100);
}

export function assertVolume(inst: EffectiveInstrument, lots: number): void {
  if (!inst.enabled) throw new ApiError(400, `${inst.symbol} is disabled for trading.`);
  if (lots < inst.minLots || lots > inst.maxLots) {
    throw new ApiError(400, `${inst.symbol} volume must be between ${inst.minLots} and ${inst.maxLots} lots.`);
  }
  const steps = lots / inst.lotStep;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) {
    throw new ApiError(400, `${inst.symbol} volume must use ${inst.lotStep} lot steps.`);
  }
}

export function isSessionOpen(inst: EffectiveInstrument, now = new Date()): boolean {
  if (inst.tradingStatus !== "open") return false;
  if (inst.session === "24/7") return true;
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (inst.session === "24/5") {
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 21) return false;
    return true;
  }
  return day >= 1 && day <= 5;
}

export function assertTradable(inst: EffectiveInstrument, now = new Date()): void {
  if (!inst.enabled) throw new ApiError(400, `${inst.symbol} is disabled for trading.`);
  if (inst.tradingStatus === "halted") throw new ApiError(400, `${inst.symbol} is halted.`);
  if (!isSessionOpen(inst, now)) throw new ApiError(400, `${inst.symbol} market is closed.`);
}

export interface InstrumentSpecInput {
  symbol: string;
  enabled: boolean;
  tradingStatus: "open" | "closed" | "halted";
  minLots: number;
  maxLots: number;
  lotStep: number;
  contractSize: number;
  tickSize: number;
  pipSize: number;
  precision: number;
  maxLeverage: number;
  spreads: Record<Plan, number>;
  commissions: Record<Plan, number>;
  swapLong: number;
  swapShort: number;
  session: string;
  baseCurrency: string;
  quoteCurrency: string;
}

export function saveInstrumentSpec(admin: UserRow, input: InstrumentSpecInput): EffectiveInstrument {
  getInstrument(input.symbol);
  if (input.minLots <= 0 || input.maxLots < input.minLots || input.lotStep <= 0) {
    throw new ApiError(400, "Invalid volume limits.");
  }
  if (input.contractSize <= 0 || input.tickSize <= 0 || input.pipSize <= 0) {
    throw new ApiError(400, "Contract, tick and pip sizes must be positive.");
  }
  const before = one<InstrumentSpecRow>("SELECT * FROM instrument_specs WHERE symbol = ?", [input.symbol]);
  run(
    `INSERT INTO instrument_specs (
      symbol, enabled, trading_status, min_lots, max_lots, lot_step, contract_size, tick_size, pip_size,
      precision, max_leverage, spread_standard, spread_raw, spread_zero, commission_standard, commission_raw,
      commission_zero, swap_long, swap_short, session, base_currency, quote_currency, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      enabled = excluded.enabled, trading_status = excluded.trading_status, min_lots = excluded.min_lots,
      max_lots = excluded.max_lots, lot_step = excluded.lot_step, contract_size = excluded.contract_size,
      tick_size = excluded.tick_size, pip_size = excluded.pip_size, precision = excluded.precision,
      max_leverage = excluded.max_leverage, spread_standard = excluded.spread_standard, spread_raw = excluded.spread_raw,
      spread_zero = excluded.spread_zero, commission_standard = excluded.commission_standard,
      commission_raw = excluded.commission_raw, commission_zero = excluded.commission_zero,
      swap_long = excluded.swap_long, swap_short = excluded.swap_short, session = excluded.session,
      base_currency = excluded.base_currency, quote_currency = excluded.quote_currency,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [
      input.symbol,
      input.enabled ? 1 : 0,
      input.tradingStatus,
      input.minLots,
      input.maxLots,
      input.lotStep,
      input.contractSize,
      input.tickSize,
      input.pipSize,
      input.precision,
      input.maxLeverage,
      input.spreads.standard,
      input.spreads.raw,
      input.spreads.zero,
      input.commissions.standard,
      input.commissions.raw,
      input.commissions.zero,
      input.swapLong,
      input.swapShort,
      input.session,
      input.baseCurrency,
      input.quoteCurrency,
      admin.id,
      nowIso(),
    ],
  );
  const after = one<InstrumentSpecRow>("SELECT * FROM instrument_specs WHERE symbol = ?", [input.symbol])!;
  run(
    `INSERT INTO admin_audit_log (id, admin_id, admin_email, action, target_type, target_id, before_json, after_json, note, created_at)
     VALUES (?, ?, ?, 'engine.instrument_spec.save', 'instrument', ?, ?, ?, NULL, ?)`,
    [newId(), admin.id, admin.email, input.symbol, before ? JSON.stringify(before) : null, JSON.stringify(after), nowIso()],
  );
  return merge(getInstrument(input.symbol), after);
}