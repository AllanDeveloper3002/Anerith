import { getInstrument, Plan, spreadPrice, SYMBOLS } from "./instruments";

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: { key: Timeframe; label: string; seconds: number }[] = [
  { key: "1m", label: "1M", seconds: 60 },
  { key: "5m", label: "5M", seconds: 300 },
  { key: "15m", label: "15M", seconds: 900 },
  { key: "30m", label: "30M", seconds: 1800 },
  { key: "1h", label: "1H", seconds: 3600 },
  { key: "4h", label: "4H", seconds: 14400 },
  { key: "1d", label: "1D", seconds: 86400 },
];

export const TF_SECONDS: Record<Timeframe, number> = Object.fromEntries(
  TIMEFRAMES.map((t) => [t.key, t.seconds]),
) as Record<Timeframe, number>;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  changePct: number;
  high24h: number;
  low24h: number;
  timestamp: number;
  status: "open" | "closed" | "halted";
  provider: string;
  simulated: boolean;
}

interface Wave {
  sec: number;
  amp: number;
  phase: number;
}

const WAVES = [
  { sec: 45, amp: 0.3 },
  { sec: 240, amp: 0.34 },
  { sec: 1200, amp: 0.4 },
  { sec: 3600, amp: 0.45 },
  { sec: 14400, amp: 0.5 },
  { sec: 86400, amp: 0.55 },
  { sec: 604800, amp: 0.5 },
  { sec: 2592000, amp: 0.4 },
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(n: number, seed: number): number {
  const x = Math.sin(n * 127.1 + seed * 311.7 + 13.37) * 43758.5453123;
  return x - Math.floor(x);
}

function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u - 0.5;
}

const waveCache = new Map<string, Wave[]>();
const seedCache = new Map<string, number>();

function wavesFor(symbol: string): Wave[] {
  let waves = waveCache.get(symbol);
  if (!waves) {
    const seed = hashString(symbol);
    seedCache.set(symbol, seed);
    const rand = mulberry32(seed);
    waves = WAVES.map((w) => ({ ...w, phase: rand() * Math.PI * 2 }));
    waveCache.set(symbol, waves);
  }
  return waves;
}

function seedFor(symbol: string): number {
  wavesFor(symbol);
  return seedCache.get(symbol) ?? 0;
}

/**
 * Deterministic multi-scale price model. The same unix time always produces the
 * same price, which keeps every timeframe, tick and restart perfectly coherent.
 */
export function priceAt(symbol: string, unixSeconds: number): number {
  const inst = getInstrument(symbol);
  const seed = seedFor(symbol);
  let deviation = 0;
  const waves = wavesFor(symbol);
  for (const w of waves) {
    deviation +=
      w.amp *
      Math.sqrt(w.sec / 86400) *
      Math.sin((2 * Math.PI * unixSeconds) / w.sec + w.phase);
  }
  deviation *= inst.dailyVol;
  deviation += valueNoise(unixSeconds / 4, seed) * inst.dailyVol * 0.1;
  deviation += valueNoise(unixSeconds / 47, seed + 17) * inst.dailyVol * 0.22;
  return inst.base * Math.exp(deviation);
}

interface QuoteStats {
  bucket: number;
  changePct: number;
  high24h: number;
  low24h: number;
}

const statsCache = new Map<string, QuoteStats>();

function statsFor(symbol: string, now: number, mid: number): QuoteStats {
  const bucket = Math.floor(now / 20);
  const cached = statsCache.get(symbol);
  if (cached && cached.bucket === bucket) return cached;

  const ref = priceAt(symbol, now - 86400);
  let high = mid;
  let low = mid;
  for (let i = 0; i <= 96; i++) {
    const p = priceAt(symbol, now - 86400 + (i / 96) * 86400);
    if (p > high) high = p;
    if (p < low) low = p;
  }
  const next: QuoteStats = {
    bucket,
    changePct: ((mid - ref) / ref) * 100,
    high24h: high,
    low24h: low,
  };
  statsCache.set(symbol, next);
  return next;
}

export function getQuote(symbol: string, plan: Plan, now?: number): Quote {
  const t = now ?? Date.now() / 1000;
  const mid = priceAt(symbol, t);
  const spread = spreadPrice(symbol, plan);
  const stats = statsFor(symbol, t, mid);
  return {
    symbol,
    mid,
    bid: mid - spread / 2,
    ask: mid + spread / 2,
    spread,
    changePct: stats.changePct,
    high24h: stats.high24h,
    low24h: stats.low24h,
    timestamp: Math.floor(t * 1000),
    status: "open",
    provider: "internal-simulated",
    simulated: true,
  };
}

export function getAllQuotes(plan: Plan, now?: number): Quote[] {
  return SYMBOLS.map((symbol) => getQuote(symbol, plan, now));
}

export function getCandles(symbol: string, timeframe: Timeframe, limit = 400, nowInput?: number): Candle[] {
  const inst = getInstrument(symbol);
  const interval = TF_SECONDS[timeframe] ?? 60;
  const safeLimit = Math.max(10, Math.min(1000, Math.floor(limit)));
  const now = nowInput ?? Date.now() / 1000;
  const currentStart = Math.floor(now / interval) * interval;
  const start = currentStart - (safeLimit - 1) * interval;
  const seed = seedFor(symbol);
  const samples = interval <= 300 ? 30 : interval <= 3600 ? 60 : 120;
  const candles: Candle[] = [];

  for (let i = 0; i < safeLimit; i++) {
    const barStart = start + i * interval;
    const fullEnd = barStart + interval;
    const isCurrent = fullEnd > now;
    const barEnd = isCurrent ? now : fullEnd;
    const open = priceAt(symbol, barStart);
    let high = open;
    let low = open;
    let close = open;

    for (let s = 1; s <= samples; s++) {
      const t = barStart + ((barEnd - barStart) * s) / samples;
      const p = priceAt(symbol, t);
      if (p > high) high = p;
      if (p < low) low = p;
      close = p;
    }

    const volume = Math.round(600 + hash01(barStart / interval, seed) * 2400 + (high - low) / inst.pipSize);
    candles.push({
      time: barStart,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return candles;
}

export function getServerMarketTime(): number {
  return Math.floor(Date.now() / 1000);
}
