import type { Plan, Side } from "./instruments";
import { getEffectiveInstrument, commissionForPlan, type EffectiveInstrument } from "./instrument-specs";
import { getExecutionQuote } from "./market-data";
import { ApiError } from "./errors";

const LOT_UNITS = 100;
const RATE_MICROS = 1_000_000;
const DAY_MS = 86_400_000;

function roundDiv(numerator: number, denominator: number): number {
  if (denominator === 0) throw new ApiError(503, "Financial conversion rate is unavailable.");
  return Math.round(numerator / denominator);
}

function lotUnits(lots: number): number {
  return Math.round(lots * LOT_UNITS);
}

function ticks(price: number, tickSize: number): number {
  return Math.round(price / tickSize);
}

interface ConversionRule {
  symbol: string;
  mode: "multiply" | "divide";
}

const CONVERSIONS: Record<string, ConversionRule> = {
  EUR: { symbol: "EURUSD", mode: "multiply" },
  GBP: { symbol: "GBPUSD", mode: "multiply" },
  AUD: { symbol: "AUDUSD", mode: "multiply" },
  JPY: { symbol: "USDJPY", mode: "divide" },
  CHF: { symbol: "USDCHF", mode: "divide" },
  CAD: { symbol: "USDCAD", mode: "divide" },
  ZAR: { symbol: "USDZAR", mode: "divide" },
};

function convertToUsdCents(amountCents: number, currency: string, timestamp: number): number {
  if (currency === "USD") return amountCents;
  const rule = CONVERSIONS[currency];
  if (!rule) throw new ApiError(503, `No USD conversion rule for ${currency}. Trading is paused.`);
  const quote = getExecutionQuote(rule.symbol, "standard", timestamp);
  const rateMicros = Math.round(quote.mid * RATE_MICROS);
  return rule.mode === "multiply"
    ? roundDiv(amountCents * rateMicros, RATE_MICROS)
    : roundDiv(amountCents * RATE_MICROS, rateMicros);
}

function profitQuoteCents(inst: EffectiveInstrument, side: Side, lots: number, entry: number, exit: number): number {
  const diffTicks = ticks(exit, inst.tickSize) - ticks(entry, inst.tickSize);
  const tickValueCents = Math.round(inst.tickSize * inst.contractSize * 100);
  const gross = roundDiv(diffTicks * tickValueCents * lotUnits(lots), LOT_UNITS);
  return side === "sell" ? -gross : gross;
}

export function profitCents(
  symbol: string,
  side: Side,
  lots: number,
  entry: number,
  exit: number,
  timestamp = Date.now(),
): number {
  const inst = getEffectiveInstrument(symbol);
  return convertToUsdCents(profitQuoteCents(inst, side, lots, entry, exit), inst.quoteCurrency, timestamp);
}

export function notionalCents(symbol: string, lots: number, price: number, timestamp = Date.now()): number {
  const inst = getEffectiveInstrument(symbol);
  if (inst.kind === "usd-base") return Math.round(lots * inst.contractSize * 100);
  if (inst.kind === "cross") {
    const baseCents = Math.round(lots * inst.contractSize * 100);
    return convertToUsdCents(baseCents, inst.baseCurrency, timestamp);
  }
  const quoteCents = Math.round(lots * inst.contractSize * price * 100);
  return convertToUsdCents(quoteCents, inst.quoteCurrency, timestamp);
}

export function effectiveLeverageFor(leverage: number, symbol: string): number {
  return Math.max(1, Math.min(leverage, getEffectiveInstrument(symbol).maxLeverage));
}

export function requiredMarginCents(
  leverage: number,
  symbol: string,
  lots: number,
  price: number,
  timestamp = Date.now(),
): number {
  return roundDiv(notionalCents(symbol, lots, price, timestamp), effectiveLeverageFor(leverage, symbol));
}

export function commissionCents(plan: Plan, symbol: string, lots: number): number {
  return commissionForPlan(getEffectiveInstrument(symbol), plan, lots);
}

export function pipValueCents(symbol: string, price: number, lots = 1, timestamp = Date.now()): number {
  const inst = getEffectiveInstrument(symbol);
  return Math.abs(profitCents(symbol, "buy", lots, price, price + inst.pipSize, timestamp));
}

export function tickValueCents(symbol: string, lots = 1, timestamp = Date.now()): number {
  const inst = getEffectiveInstrument(symbol);
  return Math.abs(profitCents(symbol, "buy", lots, inst.base, inst.base + inst.tickSize, timestamp));
}

export function swapCents(symbol: string, side: Side, lots: number, nights: number): number {
  const inst = getEffectiveInstrument(symbol);
  const rate = side === "buy" ? inst.swapLong : inst.swapShort;
  return Math.round(rate * lots * Math.max(0, nights) * 100);
}

export function nightsHeld(openedAt: string, now = new Date()): number {
  const opened = new Date(openedAt);
  const start = Date.UTC(opened.getUTCFullYear(), opened.getUTCMonth(), opened.getUTCDate());
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function spreadCostCents(symbol: string, lots: number, spreadPrice: number, timestamp = Date.now()): number {
  const inst = getEffectiveInstrument(symbol);
  const half = spreadPrice / 2;
  return Math.abs(profitCents(symbol, "buy", lots, inst.base - half, inst.base + half, timestamp));
}