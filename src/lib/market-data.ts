import { all, one, run, nowIso, type ExecutionSettingsRow, type MarketQuoteRow } from "./db";
import { getCandles as syntheticCandles, getQuote as syntheticQuote, type Candle, type Quote, type Timeframe } from "./market";
import type { Plan } from "./instruments";
import {
  getEffectiveInstrument,
  isSessionOpen,
  listEffectiveInstruments,
  spreadForPlan,
} from "./instrument-specs";
import { ApiError } from "./errors";
import {
  fetchLiveCandles,
  fetchLiveRates,
  LIVE_RATES_PROVIDER_ID,
  liveRatesConfigured,
} from "./live-rates";

export const INTERNAL_MARKET_PROVIDER_ID = "internal-simulated";

export interface MarketDataProvider {
  id: string;
  simulated: boolean;
  quote(symbol: string, plan: Plan, timestamp: number): Quote;
  refresh?(plan: Plan, settings: ExecutionSettingsRow): Promise<void>;
  candles?(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]>;
}

const internalSimulatedProvider: MarketDataProvider = {
  id: INTERNAL_MARKET_PROVIDER_ID,
  simulated: true,
  quote(symbol, plan, timestamp) {
    const inst = getEffectiveInstrument(symbol);
    const base = syntheticQuote(symbol, plan, timestamp / 1000);
    const spread = spreadForPlan(inst, plan);
    const status = inst.tradingStatus !== "open" ? inst.tradingStatus : isSessionOpen(inst, new Date(timestamp)) ? "open" : "closed";
    return {
      ...base,
      bid: base.mid - spread / 2,
      ask: base.mid + spread / 2,
      spread,
      timestamp,
      status,
      provider: INTERNAL_MARKET_PROVIDER_ID,
      simulated: true,
    };
  },
};

const liveRatesProvider: MarketDataProvider = {
  id: LIVE_RATES_PROVIDER_ID,
  simulated: false,
  quote() {
    throw new ApiError(503, "Live market data is fetched asynchronously by the engine. Trading pauses until fresh quotes arrive.");
  },
  async refresh(plan, settings) {
    const quotes = await fetchLiveRates(settings);
    for (const quote of quotes) ingestQuote(quote);
  },
  candles(symbol, timeframe, limit) {
    return fetchLiveCandles(symbol, timeframe, limit);
  },
};

const providers = new Map<string, MarketDataProvider>([
  [internalSimulatedProvider.id, internalSimulatedProvider],
  [liveRatesProvider.id, liveRatesProvider],
]);

export function marketDataProviderExists(id: string): boolean {
  return providers.has(id);
}

export function listMarketDataProviders(): { id: string; simulated: boolean }[] {
  return [...providers.values()].map((provider) => ({ id: provider.id, simulated: provider.simulated }));
}

export function marketDataProvider(): MarketDataProvider {
  const settings = executionSettings();
  const provider = providers.get(settings.market_data_provider);
  if (!provider) throw new ApiError(503, `Market data provider ${settings.market_data_provider} is not available. Trading is paused.`);
  return provider;
}

export function marketDataProviderStatus(): { id: string; simulated: boolean; configured: boolean } {
  const settings = executionSettings();
  const provider = providers.get(settings.market_data_provider);
  return {
    id: settings.market_data_provider,
    simulated: provider?.simulated ?? true,
    configured: settings.market_data_provider !== LIVE_RATES_PROVIDER_ID || liveRatesConfigured(),
  };
}

export function executionSettings(): ExecutionSettingsRow {
  const row = one<ExecutionSettingsRow>("SELECT * FROM execution_settings WHERE id = 'default'");
  if (!row) throw new ApiError(503, "Execution settings are unavailable. Trading is paused.");
  return row;
}

function rowToQuote(row: MarketQuoteRow): Quote {
  return {
    symbol: row.symbol,
    bid: row.bid,
    ask: row.ask,
    mid: row.mid,
    spread: row.spread,
    changePct: row.change_pct,
    high24h: row.high_24h,
    low24h: row.low_24h,
    timestamp: row.timestamp,
    status: row.status,
    provider: row.provider,
    simulated: row.provider === INTERNAL_MARKET_PROVIDER_ID,
  };
}

export function ingestQuote(quote: Quote): boolean {
  const existing = one<MarketQuoteRow>("SELECT timestamp FROM market_quotes WHERE symbol = ?", [quote.symbol]);
  if (existing && existing.timestamp >= quote.timestamp) return false;
  run(
    `INSERT INTO market_quotes (symbol, provider, bid, ask, mid, spread, last_price, change_pct, high_24h, low_24h, status, timestamp, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       provider = excluded.provider, bid = excluded.bid, ask = excluded.ask, mid = excluded.mid,
       spread = excluded.spread, last_price = excluded.last_price, change_pct = excluded.change_pct,
       high_24h = excluded.high_24h, low_24h = excluded.low_24h, status = excluded.status,
       timestamp = excluded.timestamp, received_at = excluded.received_at`,
    [
      quote.symbol,
      quote.provider,
      quote.bid,
      quote.ask,
      quote.mid,
      quote.spread,
      quote.mid,
      quote.changePct,
      quote.high24h,
      quote.low24h,
      quote.status,
      quote.timestamp,
      nowIso(),
    ],
  );
  return true;
}

export function refreshQuote(symbol: string, plan: Plan, timestamp = Date.now()): Quote {
  const provider = marketDataProvider();
  if (!provider.simulated) {
    throw new ApiError(503, "Live market data cannot be refreshed synchronously. Wait for the next engine tick.");
  }
  const quote = provider.quote(symbol, plan, timestamp);
  ingestQuote(quote);
  return quote;
}

export async function refreshAllQuotes(plan: Plan): Promise<void> {
  const settings = executionSettings();
  const provider = marketDataProvider();
  if (provider.refresh) {
    try {
      await provider.refresh(plan, settings);
    } catch (error) {
      console.error("[anerith] market data feed refresh failed", provider.id, error);
    }
    return;
  }
  const timestamp = Date.now();
  for (const inst of listEffectiveInstruments(true)) {
    try {
      ingestQuote(provider.quote(inst.symbol, plan, timestamp));
    } catch (error) {
      console.error("[anerith] quote refresh failed", inst.symbol, error);
    }
  }
}

export function getExecutionQuote(symbol: string, plan: Plan, timestamp = Date.now()): Quote {
  const settings = executionSettings();
  const provider = marketDataProvider();
  const row = one<MarketQuoteRow>("SELECT * FROM market_quotes WHERE symbol = ?", [symbol]);
  if (row && row.provider === settings.market_data_provider && timestamp - row.timestamp <= settings.max_quote_age_ms) {
    return rowToQuote(row);
  }
  if (!provider.simulated) {
    throw new ApiError(
      503,
      row
        ? `Live market data for ${symbol} is stale. Trading is paused until fresh prices arrive.`
        : `No live market data has arrived for ${symbol} yet. Trading is paused until fresh prices arrive.`,
    );
  }
  try {
    return refreshQuote(symbol, plan, timestamp);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[anerith] market data unavailable", symbol, error);
    throw new ApiError(503, "Market data is unavailable. Trading is paused until fresh prices arrive.");
  }
}

export function getAllExecutionQuotes(plan: Plan): Quote[] {
  const quotes: Quote[] = [];
  for (const inst of listEffectiveInstruments()) {
    try {
      quotes.push(getExecutionQuote(inst.symbol, plan));
    } catch {
      const row = one<MarketQuoteRow>("SELECT * FROM market_quotes WHERE symbol = ?", [inst.symbol]);
      if (row) quotes.push(rowToQuote(row));
    }
  }
  return quotes;
}

export interface CandleSeries {
  candles: Candle[];
  provider: string;
  simulated: boolean;
}

export function getExecutionCandles(symbol: string, timeframe: Timeframe, limit = 400, now?: number): Candle[] {
  getEffectiveInstrument(symbol);
  return syntheticCandles(symbol, timeframe, limit, now);
}

export async function loadExecutionCandles(symbol: string, timeframe: Timeframe, limit = 400): Promise<CandleSeries> {
  getEffectiveInstrument(symbol);
  const provider = marketDataProvider();
  if (provider.candles && !provider.simulated) {
    try {
      const candles = await provider.candles(symbol, timeframe, limit);
      if (candles.length > 0) {
        return { candles, provider: provider.id, simulated: false };
      }
      console.warn(`[anerith] live candles unavailable for ${symbol} ${timeframe}; using disclosed simulated history.`);
    } catch (error) {
      console.error("[anerith] live candle history fetch failed", symbol, timeframe, error);
    }
  }
  return {
    candles: getExecutionCandles(symbol, timeframe, limit),
    provider: INTERNAL_MARKET_PROVIDER_ID,
    simulated: true,
  };
}

export function latestQuotes(): Quote[] {
  return all<MarketQuoteRow>("SELECT * FROM market_quotes").map(rowToQuote);
}
