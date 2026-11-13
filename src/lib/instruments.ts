export type Plan = "standard" | "raw" | "zero";
export type AccountType = "demo" | "real";
export type Side = "buy" | "sell";
export type Category = "forex" | "metals" | "indices" | "crypto" | "energy";
export type InstrumentKind = "usd-quote" | "usd-base" | "cross" | "metal" | "index" | "crypto" | "energy";

export interface Instrument {
  symbol: string;
  name: string;
  short: string;
  category: Category;
  kind: InstrumentKind;
  base: number;
  precision: number;
  pipSize: number;
  contractSize: number;
  maxLeverage: number;
  dailyVol: number;
  spreads: Record<Plan, number>;
  commissions: Record<Plan, number>;
  swapLong: number;
  swapShort: number;
  session: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  forex: "Forex",
  metals: "Metals",
  indices: "Indices",
  crypto: "Crypto",
  energy: "Energy",
};

export const PLAN_META: Record<
  Plan,
  { name: string; blurb: string; spread: string; commission: string; minDeposit: number }
> = {
  standard: {
    name: "Standard",
    blurb: "Commission-free trading with competitive spreads. Ideal for most traders.",
    spread: "from 0.8 pips",
    commission: "$0",
    minDeposit: 50,
  },
  raw: {
    name: "Raw Spread",
    blurb: "Institutional raw spreads with a low per-lot commission.",
    spread: "from 0.1 pips",
    commission: "$3.50 / lot / side",
    minDeposit: 50,
  },
  zero: {
    name: "Zero",
    blurb: "Our tightest spreads. Pay only a fraction of a pip in commission.",
    spread: "from 0.0 pips",
    commission: "$0.35 / lot / side",
    minDeposit: 50,
  },
};

export const LEVERAGE_OPTIONS = [100, 200, 500, 1000, 2000];

const make = (i: Instrument): Instrument => i;

export const INSTRUMENTS: Instrument[] = [
  make({
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    short: "EUR/USD",
    category: "forex",
    kind: "usd-quote",
    base: 1.085,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 2000,
    dailyVol: 0.0055,
    spreads: { standard: 0.8, raw: 0.1, zero: 0.0 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -7.9,
    swapShort: 2.1,
    session: "24/5",
  }),
  make({
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    short: "GBP/USD",
    category: "forex",
    kind: "usd-quote",
    base: 1.272,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 2000,
    dailyVol: 0.006,
    spreads: { standard: 0.9, raw: 0.2, zero: 0.0 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -8.4,
    swapShort: 2.4,
    session: "24/5",
  }),
  make({
    symbol: "USDJPY",
    name: "US Dollar / Japanese Yen",
    short: "USD/JPY",
    category: "forex",
    kind: "usd-base",
    base: 156.2,
    precision: 3,
    pipSize: 0.01,
    contractSize: 100_000,
    maxLeverage: 2000,
    dailyVol: 0.006,
    spreads: { standard: 0.9, raw: 0.2, zero: 0.0 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: 6.2,
    swapShort: -12.8,
    session: "24/5",
  }),
  make({
    symbol: "AUDUSD",
    name: "Australian Dollar / US Dollar",
    short: "AUD/USD",
    category: "forex",
    kind: "usd-quote",
    base: 0.655,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 2000,
    dailyVol: 0.0068,
    spreads: { standard: 1.0, raw: 0.2, zero: 0.0 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -4.6,
    swapShort: 1.2,
    session: "24/5",
  }),
  make({
    symbol: "USDCAD",
    name: "US Dollar / Canadian Dollar",
    short: "USD/CAD",
    category: "forex",
    kind: "usd-base",
    base: 1.365,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 2000,
    dailyVol: 0.005,
    spreads: { standard: 1.1, raw: 0.3, zero: 0.1 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: 2.8,
    swapShort: -7.4,
    session: "24/5",
  }),
  make({
    symbol: "EURGBP",
    name: "Euro / British Pound",
    short: "EUR/GBP",
    category: "forex",
    kind: "cross",
    base: 0.855,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 500,
    dailyVol: 0.004,
    spreads: { standard: 1.2, raw: 0.3, zero: 0.1 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -5.2,
    swapShort: 1.4,
    session: "24/5",
  }),
  make({
    symbol: "EURJPY",
    name: "Euro / Japanese Yen",
    short: "EUR/JPY",
    category: "forex",
    kind: "cross",
    base: 169.5,
    precision: 3,
    pipSize: 0.01,
    contractSize: 100_000,
    maxLeverage: 500,
    dailyVol: 0.006,
    spreads: { standard: 1.5, raw: 0.4, zero: 0.1 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: 3.8,
    swapShort: -9.6,
    session: "24/5",
  }),
  make({
    symbol: "GBPJPY",
    name: "British Pound / Japanese Yen",
    short: "GBP/JPY",
    category: "forex",
    kind: "cross",
    base: 198.6,
    precision: 3,
    pipSize: 0.01,
    contractSize: 100_000,
    maxLeverage: 500,
    dailyVol: 0.008,
    spreads: { standard: 2.0, raw: 0.6, zero: 0.2 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: 4.9,
    swapShort: -11.2,
    session: "24/5",
  }),
  make({
    symbol: "USDCHF",
    name: "US Dollar / Swiss Franc",
    short: "USD/CHF",
    category: "forex",
    kind: "usd-base",
    base: 0.885,
    precision: 5,
    pipSize: 0.0001,
    contractSize: 100_000,
    maxLeverage: 1000,
    dailyVol: 0.005,
    spreads: { standard: 1.1, raw: 0.3, zero: 0.1 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: 4.1,
    swapShort: -8.3,
    session: "24/5",
  }),
  make({
    symbol: "USDZAR",
    name: "US Dollar / South African Rand",
    short: "USD/ZAR",
    category: "forex",
    kind: "usd-base",
    base: 18.25,
    precision: 4,
    pipSize: 0.001,
    contractSize: 100_000,
    maxLeverage: 200,
    dailyVol: 0.012,
    spreads: { standard: 90, raw: 40, zero: 15 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -18.5,
    swapShort: 6.2,
    session: "24/5",
  }),
  make({
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    short: "XAU/USD",
    category: "metals",
    kind: "metal",
    base: 2385,
    precision: 2,
    pipSize: 0.01,
    contractSize: 100,
    maxLeverage: 1000,
    dailyVol: 0.011,
    spreads: { standard: 25, raw: 12, zero: 6 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -32.5,
    swapShort: 14.2,
    session: "24/5",
  }),
  make({
    symbol: "XAGUSD",
    name: "Silver / US Dollar",
    short: "XAG/USD",
    category: "metals",
    kind: "metal",
    base: 28.5,
    precision: 3,
    pipSize: 0.001,
    contractSize: 5000,
    maxLeverage: 500,
    dailyVol: 0.014,
    spreads: { standard: 20, raw: 10, zero: 5 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -4.1,
    swapShort: 1.8,
    session: "24/5",
  }),
  make({
    symbol: "US500",
    name: "S&P 500 Index",
    short: "US500",
    category: "indices",
    kind: "index",
    base: 5820,
    precision: 1,
    pipSize: 0.1,
    contractSize: 5,
    maxLeverage: 400,
    dailyVol: 0.012,
    spreads: { standard: 5, raw: 2, zero: 1 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -13.2,
    swapShort: 4.1,
    session: "Mon–Fri",
  }),
  make({
    symbol: "US100",
    name: "Nasdaq 100 Index",
    short: "US100",
    category: "indices",
    kind: "index",
    base: 20450,
    precision: 1,
    pipSize: 0.1,
    contractSize: 2,
    maxLeverage: 400,
    dailyVol: 0.016,
    spreads: { standard: 15, raw: 8, zero: 4 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -20.4,
    swapShort: 6.2,
    session: "Mon–Fri",
  }),
  make({
    symbol: "US30",
    name: "Dow Jones 30 Index",
    short: "US30",
    category: "indices",
    kind: "index",
    base: 42750,
    precision: 1,
    pipSize: 0.1,
    contractSize: 1,
    maxLeverage: 400,
    dailyVol: 0.011,
    spreads: { standard: 20, raw: 10, zero: 6 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -18.1,
    swapShort: 5.4,
    session: "Mon–Fri",
  }),
  make({
    symbol: "BTCUSD",
    name: "Bitcoin / US Dollar",
    short: "BTC/USD",
    category: "crypto",
    kind: "crypto",
    base: 96500,
    precision: 1,
    pipSize: 1,
    contractSize: 1,
    maxLeverage: 200,
    dailyVol: 0.03,
    spreads: { standard: 20, raw: 10, zero: 5 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -70,
    swapShort: 30,
    session: "24/7",
  }),
  make({
    symbol: "ETHUSD",
    name: "Ethereum / US Dollar",
    short: "ETH/USD",
    category: "crypto",
    kind: "crypto",
    base: 3350,
    precision: 2,
    pipSize: 0.1,
    contractSize: 1,
    maxLeverage: 200,
    dailyVol: 0.038,
    spreads: { standard: 15, raw: 8, zero: 4 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -8.2,
    swapShort: 3.1,
    session: "24/7",
  }),
  make({
    symbol: "XTIUSD",
    name: "West Texas Intermediate Crude",
    short: "WTI/USD",
    category: "energy",
    kind: "energy",
    base: 74.5,
    precision: 2,
    pipSize: 0.01,
    contractSize: 1000,
    maxLeverage: 200,
    dailyVol: 0.02,
    spreads: { standard: 3, raw: 1.5, zero: 0.8 },
    commissions: { standard: 0, raw: 3.5, zero: 0.35 },
    swapLong: -11.4,
    swapShort: 6.1,
    session: "Mon–Fri",
  }),
];

export type WatchGroup = "forex-majors" | "forex-minors" | "forex-exotics" | "metals" | "indices" | "crypto" | "energy";

export const WATCH_GROUP_LABELS: Record<WatchGroup, string> = {
  "forex-majors": "Forex majors",
  "forex-minors": "Forex minors",
  "forex-exotics": "Forex exotics",
  metals: "Metals",
  indices: "Indices",
  crypto: "Crypto",
  energy: "Energies",
};

const EXOTIC_CURRENCIES = new Set(["ZAR", "TRY", "MXN", "NOK", "SEK", "PLN", "HUF", "CZK"]);

export function watchGroupFor(symbol: string): WatchGroup {
  const instrument = INSTRUMENT_MAP[symbol];
  if (!instrument) return "forex-minors";
  if (instrument.category === "metals") return "metals";
  if (instrument.category === "indices") return "indices";
  if (instrument.category === "crypto") return "crypto";
  if (instrument.category === "energy") return "energy";
  if (symbol.length === 6) {
    if (EXOTIC_CURRENCIES.has(symbol.slice(0, 3)) || EXOTIC_CURRENCIES.has(symbol.slice(3))) return "forex-exotics";
    if (symbol.includes("USD")) return "forex-majors";
  }
  return "forex-minors";
}

export const INSTRUMENT_MAP: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.symbol, i]),
);

export const SYMBOLS = INSTRUMENTS.map((i) => i.symbol);

export function getInstrument(symbol: string): Instrument {
  const inst = INSTRUMENT_MAP[symbol];
  if (!inst) throw new Error(`Unknown instrument: ${symbol}`);
  return inst;
}

export function formatPrice(symbol: string, value: number): string {
  const inst = getInstrument(symbol);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: inst.precision,
    maximumFractionDigits: inst.precision,
  });
}

export function formatPriceNumber(symbol: string, value: number): number {
  const inst = getInstrument(symbol);
  return Number(value.toFixed(inst.precision));
}

export function pipSizeFor(symbol: string): number {
  return getInstrument(symbol).pipSize;
}

export function effectiveLeverage(leverage: number, symbol: string): number {
  return Math.min(leverage, getInstrument(symbol).maxLeverage);
}

export function marginRate(leverage: number, symbol: string): number {
  return 1 / effectiveLeverage(leverage, symbol);
}

/** USD notional value of one lot at the given price. */
export function notionalUsd(symbol: string, lots: number, price: number): number {
  const inst = getInstrument(symbol);
  if (inst.kind === "cross") throw new Error("Cross-currency notional requires the server finance module.");
  if (inst.kind === "usd-base") return lots * inst.contractSize;
  return lots * inst.contractSize * price;
}

/** Required margin in USD cents. */
export function requiredMarginCents(leverage: number, symbol: string, lots: number, price: number): number {
  return Math.round(notionalUsd(symbol, lots, price) / effectiveLeverage(leverage, symbol) * 100);
}

/** Gross profit in USD, before commission and swap. */
export function calcProfitUsd(symbol: string, side: Side, lots: number, entry: number, exit: number): number {
  const inst = getInstrument(symbol);
  if (inst.kind === "cross") throw new Error("Cross-currency P&L requires the server finance module.");
  let pnl: number;
  if (inst.kind === "usd-base") {
    pnl = ((exit - entry) * lots * inst.contractSize) / exit;
  } else {
    pnl = (exit - entry) * lots * inst.contractSize;
  }
  return side === "sell" ? -pnl : pnl;
}

export function commissionCents(plan: Plan, symbol: string, lots: number): number {
  return Math.round(getInstrument(symbol).commissions[plan] * lots * 100);
}

export function pipValueUsd(symbol: string, price: number, lots = 1): number {
  const inst = getInstrument(symbol);
  if (inst.kind === "cross") throw new Error("Cross-currency pip value requires the server finance module.");
  if (inst.kind === "usd-base") return (inst.pipSize * inst.contractSize * lots) / price;
  return inst.pipSize * inst.contractSize * lots;
}

export function spreadPips(symbol: string, plan: Plan): number {
  return getInstrument(symbol).spreads[plan];
}

export function spreadPrice(symbol: string, plan: Plan): number {
  const inst = getInstrument(symbol);
  return inst.spreads[plan] * inst.pipSize;
}

export function swapUsd(symbol: string, side: Side, lots: number, nights: number): number {
  const inst = getInstrument(symbol);
  const rate = side === "buy" ? inst.swapLong : inst.swapShort;
  return rate * lots * Math.max(0, nights);
}
