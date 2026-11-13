import { describe, expect, it } from "vitest";
import {
  calcProfitUsd,
  getInstrument,
  INSTRUMENTS,
  requiredMarginCents,
  spreadPrice,
  SYMBOLS,
} from "@/lib/instruments";
import { getCandles, getQuote, priceAt, TF_SECONDS } from "@/lib/market";
import { centsToUsd, fmtSignedUsd, fmtUsd, usdToCents } from "@/lib/format";

describe("money helpers", () => {
  it("round-trips dollars and cents", () => {
    expect(usdToCents(10.005)).toBe(1001);
    expect(centsToUsd(1001)).toBe(10.01);
    expect(centsToUsd(usdToCents(1240.5))).toBe(1240.5);
  });

  it("formats signed currency", () => {
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
    expect(fmtUsd(-12.3)).toBe("−$12.30");
    expect(fmtSignedUsd(42)).toBe("+$42.00");
    expect(fmtSignedUsd(-42)).toBe("−$42.00");
  });
});

describe("instrument pricing", () => {
  it("keeps every spread tier ordered", () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.spreads.standard).toBeGreaterThanOrEqual(instrument.spreads.raw);
      expect(instrument.spreads.raw).toBeGreaterThanOrEqual(instrument.spreads.zero);
    }
  });

  it("converts pips into price offsets", () => {
    expect(spreadPrice("EURUSD", "standard")).toBeCloseTo(0.00008, 8);
    expect(spreadPrice("EURUSD", "zero")).toBe(0);
    expect(spreadPrice("USDJPY", "raw")).toBeCloseTo(0.002, 8);
  });

  it("computes long and short P&L symmetrically for USD-quoted pairs", () => {
    const long = calcProfitUsd("EURUSD", "buy", 1, 1.1, 1.11);
    expect(long).toBeCloseTo(1000, 6);
    expect(calcProfitUsd("EURUSD", "sell", 1, 1.1, 1.11)).toBeCloseTo(-1000, 6);
  });

  it("converts USD-base P&L back through the exit rate", () => {
    const pnl = calcProfitUsd("USDJPY", "buy", 1, 150, 151);
    expect(pnl).toBeCloseTo(100_000 / 151, 4);
    expect(calcProfitUsd("USDJPY", "sell", 1, 150, 151)).toBeCloseTo(-100_000 / 151, 4);
  });

  it("requires margin at the effective leverage", () => {
    expect(requiredMarginCents(100, "EURUSD", 1, 1.1)).toBe(110_000);
    expect(requiredMarginCents(2000, "EURUSD", 1, 1.1)).toBe(5500);
    expect(requiredMarginCents(100, "USDJPY", 1, 150)).toBe(100_000);
  });

  it("caps leverage per instrument", () => {
    expect(getInstrument("EURUSD").maxLeverage).toBe(2000);
    expect(getInstrument("XTIUSD").maxLeverage).toBe(200);
  });
});

describe("synthetic market", () => {
  const now = 1_780_000_000;

  it("is deterministic for a given symbol and time", () => {
    expect(priceAt("EURUSD", now)).toBe(priceAt("EURUSD", now));
    expect(priceAt("EURUSD", now)).not.toBe(priceAt("GBPUSD", now));
  });

  it("quotes bid below ask around the mid", () => {
    for (const symbol of SYMBOLS) {
      const quote = getQuote(symbol, "standard", now);
      expect(quote.bid).toBeLessThan(quote.ask);
      expect(quote.mid).toBeCloseTo((quote.bid + quote.ask) / 2, 10);
      expect(quote.high24h).toBeGreaterThanOrEqual(quote.low24h);
    }
  });

  it("builds ascending, bounded candles that end on the live price", () => {
    for (const timeframe of Object.keys(TF_SECONDS) as (keyof typeof TF_SECONDS)[]) {
      const interval = TF_SECONDS[timeframe];
      const candles = getCandles("XAUUSD", timeframe, 120, now);
      expect(candles).toHaveLength(120);
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
        expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
        expect(candle.volume).toBeGreaterThan(0);
        if (i > 0) expect(candle.time - candles[i - 1].time).toBe(interval);
      }
      const last = candles[candles.length - 1];
      expect(last.close).toBeCloseTo(priceAt("XAUUSD", now), 10);
      expect(last.time).toBe(Math.floor(now / interval) * interval);
    }
  });

  it("clamps candle limits to a safe range", () => {
    expect(getCandles("EURUSD", "1m", 1, now)).toHaveLength(10);
    expect(getCandles("EURUSD", "1m", 5000, now)).toHaveLength(1000);
  });
});
