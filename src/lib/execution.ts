import { newId, nowIso, one, run, type ExecutionEventRow, type ExecutionSettingsRow, type OrderRow, type UserRow } from "./db";
import type { Plan, Side } from "./instruments";
import type { Quote } from "./market";
import { commissionCents } from "./finance";
import { getEffectiveInstrument, type EffectiveInstrument } from "./instrument-specs";
import { executionSettings, marketDataProviderExists } from "./market-data";
import { ApiError } from "./errors";

export interface ExecutionFill {
  price: number;
  commissionCents: number;
  provider: string;
  reference: string;
  slippageCents: number;
}

export interface PendingFillDecision {
  hit: boolean;
  fill: ExecutionFill | null;
  rejection: string | null;
}

export interface ExecutionProvider {
  id: string;
  simulated: boolean;
  marketFill(inst: EffectiveInstrument, side: Side, lots: number, quote: Quote, plan: Plan, settings: ExecutionSettingsRow): ExecutionFill;
  closeFill(inst: EffectiveInstrument, side: Side, lots: number, quote: Quote, plan: Plan, settings: ExecutionSettingsRow): ExecutionFill;
  pendingFill(order: OrderRow, quote: Quote, plan: Plan, settings: ExecutionSettingsRow): PendingFillDecision;
}

function roundPrice(inst: EffectiveInstrument, price: number): number {
  return Number((Math.round(price / inst.tickSize) * inst.tickSize).toFixed(inst.precision));
}

function fill(
  inst: EffectiveInstrument,
  lots: number,
  rawPrice: number,
  basePrice: number,
  plan: Plan,
  provider: string,
): ExecutionFill {
  const price = roundPrice(inst, rawPrice);
  return {
    price,
    commissionCents: commissionCents(plan, inst.symbol, lots),
    provider,
    reference: newId(),
    slippageCents: Math.round(Math.abs(price - basePrice) * inst.contractSize * lots * 100),
  };
}

const internalSimulatedExecution: ExecutionProvider = {
  id: "internal-simulated",
  simulated: true,
  marketFill(inst, side, lots, quote, plan, settings) {
    const slip = settings.slippage_pips * inst.pipSize;
    const base = side === "buy" ? quote.ask : quote.bid;
    return fill(inst, lots, side === "buy" ? base + slip : base - slip, base, plan, "internal-simulated");
  },
  closeFill(inst, side, lots, quote, plan, settings) {
    const slip = settings.slippage_pips * inst.pipSize;
    const base = side === "buy" ? quote.bid : quote.ask;
    return fill(inst, lots, side === "buy" ? base - slip : base + slip, base, plan, "internal-simulated");
  },
  pendingFill(order, quote, plan, settings) {
    const inst = getEffectiveInstrument(order.symbol);
    const hit =
      (order.type === "limit" && order.side === "buy" && quote.ask <= order.price) ||
      (order.type === "limit" && order.side === "sell" && quote.bid >= order.price) ||
      (order.type === "stop" && order.side === "buy" && quote.ask >= order.price) ||
      (order.type === "stop" && order.side === "sell" && quote.bid <= order.price);
    if (!hit) return { hit: false, fill: null, rejection: null };

    if (order.type === "stop" && settings.policy === "reject_on_gap") {
      const gapPips =
        order.side === "buy"
          ? (quote.ask - order.price) / inst.pipSize
          : (order.price - quote.bid) / inst.pipSize;
      if (gapPips > settings.max_gap_pips) {
        return { hit: true, fill: null, rejection: `Price gapped ${gapPips.toFixed(1)} pips beyond the ${settings.max_gap_pips} pip execution limit.` };
      }
    }

    const slip = settings.slippage_pips * inst.pipSize;
    let raw: number;
    let base: number;
    if (order.type === "limit" && order.side === "buy") {
      base = quote.ask;
      raw = Math.min(quote.ask + slip, order.price);
    } else if (order.type === "limit" && order.side === "sell") {
      base = quote.bid;
      raw = Math.max(quote.bid - slip, order.price);
    } else if (order.side === "buy") {
      base = quote.ask;
      raw = quote.ask + slip;
    } else {
      base = quote.bid;
      raw = quote.bid - slip;
    }
    return { hit: true, fill: fill(inst, order.lots, raw, base, plan, "internal-simulated"), rejection: null };
  },
};

const executionProviders = new Map<string, ExecutionProvider>([
  [internalSimulatedExecution.id, internalSimulatedExecution],
]);

export function listExecutionProviders(): { id: string; simulated: boolean }[] {
  return [...executionProviders.values()].map((provider) => ({ id: provider.id, simulated: provider.simulated }));
}

export function executionProvider(): ExecutionProvider {
  const settings = executionSettings();
  const provider = executionProviders.get(settings.provider);
  if (!provider) throw new ApiError(503, `Execution provider ${settings.provider} is not available. Trading is paused.`);
  return provider;
}

export function recordExecutionEvent(input: {
  accountId: string;
  positionId?: string | null;
  orderId?: string | null;
  eventType: string;
  provider: string;
  executionRef?: string | null;
  symbol?: string | null;
  side?: Side | null;
  lots?: number | null;
  price?: number | null;
  commissionCents?: number;
  reason?: string | null;
  metrics?: unknown;
  dedupeKey?: string | null;
}): boolean {
  const result = run(
    `INSERT OR IGNORE INTO execution_events (
      id, account_id, position_id, order_id, event_type, provider, execution_ref, symbol, side, lots, price,
      commission_cents, reason, metrics_json, dedupe_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.accountId,
      input.positionId ?? null,
      input.orderId ?? null,
      input.eventType,
      input.provider,
      input.executionRef ?? null,
      input.symbol ?? null,
      input.side ?? null,
      input.lots ?? null,
      input.price ?? null,
      input.commissionCents ?? 0,
      input.reason ?? null,
      input.metrics ? JSON.stringify(input.metrics) : null,
      input.dedupeKey ?? null,
      nowIso(),
    ],
  );
  return result > 0;
}

export function findExecutionEvent(dedupeKey: string): ExecutionEventRow | undefined {
  return one<ExecutionEventRow>("SELECT * FROM execution_events WHERE dedupe_key = ?", [dedupeKey]);
}

export interface ExecutionSettingsInput {
  provider: string;
  marketDataProvider: string;
  policy: "instant" | "reject_on_gap";
  slippagePips: number;
  maxQuoteAgeMs: number;
  maxGapPips: number;
  swapEnabled: boolean;
}

export function saveExecutionSettings(admin: UserRow, input: ExecutionSettingsInput): ExecutionSettingsRow {
  if (!executionProviders.has(input.provider)) throw new ApiError(400, "Unknown execution provider.");
  if (!marketDataProviderExists(input.marketDataProvider)) throw new ApiError(400, "Unknown market data provider.");
  if (input.slippagePips < 0 || input.maxGapPips < 0) throw new ApiError(400, "Slippage and gap limits cannot be negative.");
  if (input.maxQuoteAgeMs < 500 || input.maxQuoteAgeMs > 120_000) throw new ApiError(400, "Quote age limit must be between 500ms and 120s.");
  const before = one<ExecutionSettingsRow>("SELECT * FROM execution_settings WHERE id = 'default'");
  run(
    `UPDATE execution_settings SET provider = ?, market_data_provider = ?, policy = ?, slippage_pips = ?, max_quote_age_ms = ?, max_gap_pips = ?, swap_enabled = ?, updated_by = ?, updated_at = ? WHERE id = 'default'`,
    [input.provider, input.marketDataProvider, input.policy, input.slippagePips, input.maxQuoteAgeMs, input.maxGapPips, input.swapEnabled ? 1 : 0, admin.id, nowIso()],
  );
  const after = one<ExecutionSettingsRow>("SELECT * FROM execution_settings WHERE id = 'default'")!;
  run(
    `INSERT INTO admin_audit_log (id, admin_id, admin_email, action, target_type, target_id, before_json, after_json, note, created_at)
     VALUES (?, ?, ?, 'engine.execution_settings.save', 'execution_settings', 'default', ?, ?, NULL, ?)`,
    [newId(), admin.id, admin.email, before ? JSON.stringify(before) : null, JSON.stringify(after), nowIso()],
  );
  return after;
}