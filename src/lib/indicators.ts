export interface IndicatorCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface IndicatorSettings {
  ma: boolean;
  maPeriod: number;
  ema: boolean;
  emaPeriod: number;
  bollinger: boolean;
  bollingerPeriod: number;
  bollingerMultiplier: number;
  rsi: boolean;
  rsiPeriod: number;
  macd: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atr: boolean;
  atrPeriod: number;
}

export const DEFAULT_INDICATORS: IndicatorSettings = {
  ma: true,
  maPeriod: 20,
  ema: true,
  emaPeriod: 50,
  bollinger: false,
  bollingerPeriod: 20,
  bollingerMultiplier: 2,
  rsi: true,
  rsiPeriod: 14,
  macd: false,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atr: false,
  atrPeriod: 14,
};

export interface BollingerResult {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export interface MacdResult {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

function periodOr(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function validCandle(candle: IndicatorCandle): boolean {
  return (
    Number.isFinite(candle.time) &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close)
  );
}

export function sma(candles: IndicatorCandle[], periodInput: number): IndicatorPoint[] {
  const period = periodOr(periodInput, 20);
  const source = candles.filter(validCandle);
  if (source.length < period) return [];
  const points: IndicatorPoint[] = [];
  let sum = 0;
  for (let index = 0; index < source.length; index += 1) {
    sum += source[index].close;
    if (index >= period) sum -= source[index - period].close;
    if (index >= period - 1) {
      points.push({ time: source[index].time, value: sum / period });
    }
  }
  return points;
}

function emaAligned(candles: IndicatorCandle[], periodInput: number): IndicatorPoint[] {
  const period = periodOr(periodInput, 20);
  const source = candles.filter(validCandle);
  if (source.length < period) return [];
  const points: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  let seed = 0;
  for (let index = 0; index < period; index += 1) seed += source[index].close;
  let current = seed / period;
  points.push({ time: source[period - 1].time, value: current });
  for (let index = period; index < source.length; index += 1) {
    current = (source[index].close - current) * multiplier + current;
    points.push({ time: source[index].time, value: current });
  }
  return points;
}

export function ema(candles: IndicatorCandle[], periodInput: number): IndicatorPoint[] {
  return emaAligned(candles, periodInput);
}

export function bollinger(
  candles: IndicatorCandle[],
  periodInput: number,
  multiplierInput: number,
): BollingerResult {
  const period = periodOr(periodInput, 20);
  const multiplier = Number.isFinite(multiplierInput) && multiplierInput > 0 ? multiplierInput : 2;
  const source = candles.filter(validCandle);
  if (source.length < period) return { upper: [], middle: [], lower: [] };
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  let sum = 0;
  let squared = 0;
  for (let index = 0; index < source.length; index += 1) {
    const close = source[index].close;
    sum += close;
    squared += close * close;
    if (index >= period) {
      const expired = source[index - period].close;
      sum -= expired;
      squared -= expired * expired;
    }
    if (index < period - 1) continue;
    const mean = sum / period;
    const variance = Math.max(0, squared / period - mean * mean);
    const deviation = Math.sqrt(variance) * multiplier;
    middle.push({ time: source[index].time, value: mean });
    upper.push({ time: source[index].time, value: mean + deviation });
    lower.push({ time: source[index].time, value: mean - deviation });
  }
  return { upper, middle, lower };
}

export function rsi(candles: IndicatorCandle[], periodInput: number): IndicatorPoint[] {
  const period = periodOr(periodInput, 14);
  const source = candles.filter(validCandle);
  if (source.length <= period) return [];
  const points: IndicatorPoint[] = [];
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = source[index].close - source[index - 1].close;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const rsiValue = (): number => {
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    if (avgGain === 0) return 0;
    const relative = avgGain / avgLoss;
    return 100 - 100 / (1 + relative);
  };
  points.push({ time: source[period].time, value: rsiValue() });
  for (let index = period + 1; index < source.length; index += 1) {
    const change = source[index].close - source[index - 1].close;
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    points.push({ time: source[index].time, value: rsiValue() });
  }
  return points;
}

function emaOfPoints(points: IndicatorPoint[], periodInput: number): IndicatorPoint[] {
  const period = periodOr(periodInput, 9);
  if (points.length < period) return [];
  const result: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  let seed = 0;
  for (let index = 0; index < period; index += 1) seed += points[index].value;
  let current = seed / period;
  result.push({ time: points[period - 1].time, value: current });
  for (let index = period; index < points.length; index += 1) {
    current = (points[index].value - current) * multiplier + current;
    result.push({ time: points[index].time, value: current });
  }
  return result;
}

export function macd(
  candles: IndicatorCandle[],
  fastInput = 12,
  slowInput = 26,
  signalInput = 9,
): MacdResult {
  const fast = emaAligned(candles, fastInput);
  const slow = emaAligned(candles, slowInput);
  if (fast.length === 0 || slow.length === 0) return { macd: [], signal: [], histogram: [] };
  const slowByTime = new Map(slow.map((point) => [point.time, point.value]));
  const line: IndicatorPoint[] = [];
  for (const point of fast) {
    const slowValue = slowByTime.get(point.time);
    if (slowValue === undefined) continue;
    line.push({ time: point.time, value: point.value - slowValue });
  }
  const signal = emaOfPoints(line, signalInput);
  const signalByTime = new Map(signal.map((point) => [point.time, point.value]));
  const histogram: IndicatorPoint[] = [];
  for (const point of line) {
    const signalValue = signalByTime.get(point.time);
    if (signalValue === undefined) continue;
    histogram.push({ time: point.time, value: point.value - signalValue });
  }
  return { macd: line, signal, histogram };
}

export function atr(candles: IndicatorCandle[], periodInput: number): IndicatorPoint[] {
  const period = periodOr(periodInput, 14);
  const source = candles.filter(validCandle);
  if (source.length <= period) return [];
  const trueRanges: number[] = [];
  for (let index = 1; index < source.length; index += 1) {
    const candle = source[index];
    const previous = source[index - 1];
    trueRanges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close),
      ),
    );
  }
  if (trueRanges.length < period) return [];
  let current = 0;
  for (let index = 0; index < period; index += 1) current += trueRanges[index];
  current /= period;
  const points: IndicatorPoint[] = [{ time: source[period].time, value: current }];
  for (let index = period; index < trueRanges.length; index += 1) {
    current = (current * (period - 1) + trueRanges[index]) / period;
    points.push({ time: source[index + 1].time, value: current });
  }
  return points;
}

export function lastValue(points: IndicatorPoint[]): number | null {
  if (points.length === 0) return null;
  return points[points.length - 1].value;
}

export function withTick(candles: IndicatorCandle[], tick: IndicatorCandle | null): IndicatorCandle[] {
  if (!tick) return candles;
  if (candles.length === 0) return [tick];
  const last = candles[candles.length - 1];
  if (tick.time < last.time) return candles;
  if (tick.time === last.time) return [...candles.slice(0, -1), tick];
  return [...candles, tick];
}
