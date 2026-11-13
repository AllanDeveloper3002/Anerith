import { ApiError } from "./errors";
import { one, type ExecutionSettingsRow, type MarketQuoteRow } from "./db";
import type { Candle, Quote, Timeframe } from "./market";
import { getEffectiveInstrument, isSessionOpen, listEffectiveInstruments } from "./instrument-specs";

export const LIVE_RATES_PROVIDER_ID = "live-rates";

interface LiveRatesConfig {
  url: string;
  candlesUrl: string | null;
  apiKey: string | null;
  keyHeader: string;
  keyPrefix: string;
  symbolMap: Record<string, string>;
  intervalMap: Record<string, string>;
  timeoutMs: number;
}

function jsonEnv(name: string): Record<string, string> {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key.toUpperCase()] = value;
    }
    return result;
  } catch {
    console.warn(`[anerith] ${name} is not valid JSON; ignoring.`);
    return {};
  }
}

function liveRatesConfig(): LiveRatesConfig {
  const url = process.env.LIVE_RATES_URL?.trim();
  if (!url) {
    throw new ApiError(
      503,
      "Live market data is selected but LIVE_RATES_URL is not configured. Set the provider URL and API key on the server, or switch market data back to internal-simulated.",
    );
  }
  return {
    url,
    candlesUrl: process.env.LIVE_RATES_CANDLES_URL?.trim() || null,
    apiKey: process.env.LIVE_RATES_API_KEY?.trim() || null,
    keyHeader: process.env.LIVE_RATES_KEY_HEADER?.trim() || "Authorization",
    keyPrefix: process.env.LIVE_RATES_KEY_PREFIX ?? "",
    symbolMap: jsonEnv("LIVE_RATES_SYMBOL_MAP"),
    intervalMap: {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      ...jsonEnv("LIVE_RATES_INTERVAL_MAP"),
    },
    timeoutMs: Math.max(1000, Math.min(20_000, Number(process.env.LIVE_RATES_TIMEOUT_MS ?? 5000) || 5000)),
  };
}

function requestHeaders(config: LiveRatesConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) {
    headers[config.keyHeader] = config.keyPrefix ? `${config.keyPrefix}${config.apiKey}` : config.apiKey;
  }
  return headers;
}

function providerSymbol(symbol: string, config: LiveRatesConfig): string {
  return config.symbolMap[symbol] ?? symbol;
}

function normalizeSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/=X$/, "");
}

function symbolLookup(config: LiveRatesConfig): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const inst of listEffectiveInstruments(true)) {
    lookup.set(normalizeSymbol(inst.symbol), inst.symbol);
    const mapped = config.symbolMap[inst.symbol];
    if (mapped) lookup.set(normalizeSymbol(mapped), inst.symbol);
  }
  return lookup;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(record: UnknownRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stringValue(record: UnknownRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function extractEntries(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["quotes", "data", "results", "symbols", "rates", "prices"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value)) return Object.entries(value).map(([symbol, item]) => (isRecord(item) ? { symbol, ...item } : { symbol }));
  }
  // Bare map: { EURUSD: { bid, ask }, ... }
  const entries = Object.entries(payload).filter(([, value]) => isRecord(value));
  if (entries.length > 0) return entries.map(([symbol, value]) => ({ symbol, ...(value as UnknownRecord) }));
  // Single quote object.
  if (stringValue(payload, "symbol", "ticker", "instrument")) return [payload];
  return [];
}

function normalizeTimestamp(value: number | null, now: number): number | null {
  if (value === null) return now;
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : value * 1000;
  if (Math.abs(ms - now) > 5 * 60_000) return null;
  return Math.round(ms);
}

function normalizeBidAsk(bid: number | null, ask: number | null): { bid: number; ask: number } | null {
  if (bid === null || ask === null) return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  if (bid <= 0 || ask <= 0 || ask < bid) return null;
  return { bid, ask };
}

function previousQuote(symbol: string): MarketQuoteRow | undefined {
  return one<MarketQuoteRow>("SELECT * FROM market_quotes WHERE symbol = ?", [symbol]);
}

export function parseLiveRatesPayload(
  payload: unknown,
  settings: ExecutionSettingsRow,
  now = Date.now(),
): Quote[] {
  const config = liveRatesConfig();
  const lookup = symbolLookup(config);
  const quotes: Quote[] = [];
  for (const entry of extractEntries(payload)) {
    const rawSymbol = stringValue(entry, "symbol", "ticker", "instrument", "pair", "code");
    if (!rawSymbol) continue;
    const symbol = lookup.get(normalizeSymbol(rawSymbol));
    if (!symbol) continue;
    const prices = normalizeBidAsk(
      numberValue(entry, "bid", "bidPrice", "bid_price", "Bid"),
      numberValue(entry, "ask", "askPrice", "ask_price", "Ask"),
    );
    if (!prices) continue;
    const timestamp = normalizeTimestamp(numberValue(entry, "timestamp", "ts", "time", "updated_at", "quoteTime"), now);
    if (timestamp === null) {
      console.warn(`[anerith] live-rates quote for ${symbol} has an unusable timestamp; skipping.`);
      continue;
    }
    if (now - timestamp > settings.max_quote_age_ms) {
      console.warn(`[anerith] live-rates quote for ${symbol} is older than ${settings.max_quote_age_ms}ms; skipping.`);
      continue;
    }
    const inst = getEffectiveInstrument(symbol);
    const mid = (prices.bid + prices.ask) / 2;
    const prior = previousQuote(symbol);
    const providerHigh = numberValue(entry, "high24h", "high", "high_24h");
    const providerLow = numberValue(entry, "low24h", "low", "low_24h");
    const high = providerHigh !== null && providerHigh >= mid ? providerHigh : prior ? Math.max(prior.high_24h, mid) : mid;
    const low = providerLow !== null && providerLow <= mid ? providerLow : prior ? Math.min(prior.low_24h, mid) : mid;
    const providerChange = numberValue(entry, "changePct", "change_percent", "changePercent");
    const changePct = providerChange ?? (prior && prior.mid > 0 ? Number((((mid - prior.mid) / prior.mid) * 100).toFixed(4)) : 0);
    const status = inst.tradingStatus !== "open" ? inst.tradingStatus : isSessionOpen(inst, new Date(timestamp)) ? "open" : "closed";
    quotes.push({
      symbol,
      bid: prices.bid,
      ask: prices.ask,
      mid,
      spread: Number((prices.ask - prices.bid).toFixed(inst.precision + 2)),
      changePct,
      high24h: high,
      low24h: low,
      timestamp,
      status,
      provider: LIVE_RATES_PROVIDER_ID,
      simulated: false,
    });
  }
  return quotes;
}

export async function fetchLiveRates(settings: ExecutionSettingsRow, now = Date.now()): Promise<Quote[]> {
  const config = liveRatesConfig();
  const response = await fetch(config.url, {
    headers: requestHeaders(config),
    cache: "no-store",
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    throw new ApiError(502, `Live rates provider responded with HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  const quotes = parseLiveRatesPayload(payload, settings, now);
  if (quotes.length === 0) {
    throw new ApiError(502, "Live rates provider returned no usable quotes for configured instruments.");
  }
  return quotes;
}

interface RawCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseCandle(value: unknown): RawCandle | null {
  if (Array.isArray(value) && value.length >= 5) {
    const [time, open, high, low, close, volume] = value;
    if ([time, open, high, low, close].some((item) => typeof item !== "number" || !Number.isFinite(item))) return null;
    return { time: time as number, open: open as number, high: high as number, low: low as number, close: close as number, volume: (volume as number) || 0 };
  }
  if (!isRecord(value)) return null;
  const time = numberValue(value, "time", "t", "timestamp", "openTime", "open_time");
  const open = numberValue(value, "open", "o");
  const high = numberValue(value, "high", "h");
  const low = numberValue(value, "low", "l");
  const close = numberValue(value, "close", "c");
  if (time === null || open === null || high === null || low === null || close === null) return null;
  return { time, open, high, low, close, volume: numberValue(value, "volume", "v") ?? 0 };
}

export function parseCandlesPayload(payload: unknown): Candle[] {
  let entries: unknown[] = [];
  if (Array.isArray(payload)) {
    entries = payload;
  } else if (isRecord(payload)) {
    for (const key of ["candles", "data", "results", "bars", "ohlc"]) {
      if (Array.isArray(payload[key])) {
        entries = payload[key] as unknown[];
        break;
      }
    }
  }
  const candles: Candle[] = [];
  for (const entry of entries) {
    const parsed = parseCandle(entry);
    if (!parsed) continue;
    const time = parsed.time > 1e12 ? Math.floor(parsed.time / 1000) : parsed.time > 1e9 ? Math.floor(parsed.time / 1000) : parsed.time;
    candles.push({ time, open: parsed.open, high: parsed.high, low: parsed.low, close: parsed.close, volume: parsed.volume });
  }
  candles.sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (const candle of candles) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === candle.time) {
      deduped[deduped.length - 1] = candle;
    } else {
      deduped.push(candle);
    }
  }
  return deduped;
}

export async function fetchLiveCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Promise<Candle[]> {
  const config = liveRatesConfig();
  if (!config.candlesUrl) return [];
  const interval = config.intervalMap[timeframe] ?? timeframe;
  const url = config.candlesUrl
    .replace("{symbol}", encodeURIComponent(providerSymbol(symbol, config)))
    .replace("{interval}", encodeURIComponent(interval))
    .replace("{limit}", String(limit));
  const response = await fetch(url, {
    headers: requestHeaders(config),
    cache: "no-store",
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    throw new ApiError(502, `Live candles provider responded with HTTP ${response.status}.`);
  }
  return parseCandlesPayload(await response.json());
}

export function liveRatesConfigured(): boolean {
  return Boolean(process.env.LIVE_RATES_URL?.trim());
}
