import { describe, expect, it } from "vitest";
import {
  atr,
  bollinger,
  DEFAULT_INDICATORS,
  ema,
  lastValue,
  macd,
  rsi,
  sma,
  withTick,
  type IndicatorCandle,
} from "@/lib/indicators";

function candles(closes: number[]): IndicatorCandle[] {
  return closes.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100,
  }));
}

describe("technical indicators", () => {
  it("computes simple and exponential moving averages", () => {
    const source = candles([1, 2, 3, 4, 5]);
    expect(sma(source, 3).map((point) => point.value)).toEqual([2, 3, 4]);
    expect(ema(source, 3).map((point) => point.value)).toEqual([2, 3, 4]);
    expect(lastValue(sma(source, 20))).toBeNull();
  });

  it("computes Bollinger bands around the rolling mean", () => {
    const result = bollinger(candles([1, 2, 3]), 3, 2);
    expect(result.middle[0].value).toBe(2);
    expect(result.upper[0].value).toBeCloseTo(3.63299, 5);
    expect(result.lower[0].value).toBeCloseTo(0.36701, 5);
    expect(result.upper[0].value - result.middle[0].value).toBeCloseTo(
      result.middle[0].value - result.lower[0].value,
      10,
    );
  });

  it("uses Wilder smoothing for RSI", () => {
    const points = rsi(candles([1, 2, 3, 2, 4]), 2);
    expect(points.map((point) => Number(point.value.toFixed(3)))).toEqual([100, 50, 83.333]);
  });

  it("computes MACD line, signal and histogram on aligned times", () => {
    const source = candles(Array.from({ length: 60 }, (_, index) => 1 + index * 0.1));
    const result = macd(source, 12, 26, 9);
    expect(result.macd.length).toBeGreaterThan(0);
    expect(result.signal.length).toBeGreaterThan(0);
    expect(result.histogram.length).toBe(result.signal.length);
    const signalByTime = new Map(result.signal.map((point) => [point.time, point.value]));
    for (const point of result.histogram) {
      expect(point.value).toBeCloseTo((result.macd.find((item) => item.time === point.time)?.value ?? 0) - (signalByTime.get(point.time) ?? 0), 10);
    }
  });

  it("computes ATR from true range and keeps a flat range stable", () => {
    const points = atr(candles([1.5, 2.5, 3.5, 4.5]), 2);
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.value === 1.5)).toBe(true);
  });

  it("updates the live candle without corrupting history", () => {
    const source = candles([1, 2, 3]);
    const live: IndicatorCandle = {
      time: source[2].time,
      open: 3,
      high: 4,
      low: 2.5,
      close: 3.8,
      volume: 200,
    };
    const updated = withTick(source, live);
    expect(updated).toHaveLength(3);
    expect(updated[2].close).toBe(3.8);
    expect(withTick(source, { ...live, time: source[0].time })).toBe(source);
    expect(withTick(source, { ...live, time: source[2].time + 60 })).toHaveLength(4);
  });

  it("exposes stable defaults for every supported study", () => {
    expect(DEFAULT_INDICATORS).toMatchObject({
      ma: true,
      ema: true,
      bollinger: false,
      rsi: true,
      macd: false,
      atr: false,
    });
  });
});
