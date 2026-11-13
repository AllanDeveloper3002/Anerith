export type IndicatorKind = "sma" | "ema" | "bollinger" | "rsi" | "macd" | "atr";

export interface IndicatorParams {
  period?: number;
  multiplier?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  overbought?: number;
  oversold?: number;
}

export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  visible: boolean;
  color: string;
  params: IndicatorParams;
}

export interface ChartSettings {
  showVolume: boolean;
  showGrid: boolean;
  upColor: string | null;
  downColor: string | null;
}

export interface IndicatorCatalogEntry {
  kind: IndicatorKind;
  name: string;
  description: string;
  pane: boolean;
  defaults: IndicatorParams;
  color: string;
}

export const INDICATOR_CATALOG: IndicatorCatalogEntry[] = [
  {
    kind: "sma",
    name: "Simple moving average",
    description: "Average close over a fixed number of candles.",
    pane: false,
    defaults: { period: 20 },
    color: "#e9c46a",
  },
  {
    kind: "ema",
    name: "Exponential moving average",
    description: "Moving average weighted toward recent closes.",
    pane: false,
    defaults: { period: 50 },
    color: "#56cfe1",
  },
  {
    kind: "bollinger",
    name: "Bollinger Bands",
    description: "Volatility bands around a simple moving average.",
    pane: false,
    defaults: { period: 20, multiplier: 2 },
    color: "#a78bfa",
  },
  {
    kind: "rsi",
    name: "Relative strength index",
    description: "Momentum oscillator with overbought and oversold levels.",
    pane: true,
    defaults: { period: 14, overbought: 70, oversold: 30 },
    color: "#c77dff",
  },
  {
    kind: "macd",
    name: "MACD",
    description: "Trend and momentum from fast and slow exponential averages.",
    pane: true,
    defaults: { fast: 12, slow: 26, signal: 9 },
    color: "#4cc9f0",
  },
  {
    kind: "atr",
    name: "Average true range",
    description: "Average volatility measured in price units.",
    pane: true,
    defaults: { period: 14 },
    color: "#f4a261",
  },
];

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  showVolume: true,
  showGrid: true,
  upColor: null,
  downColor: null,
};

let indicatorSeed = 0;

export function createIndicator(kind: IndicatorKind, overrides: Partial<IndicatorInstance> = {}): IndicatorInstance {
  const entry = INDICATOR_CATALOG.find((item) => item.kind === kind) ?? INDICATOR_CATALOG[0];
  indicatorSeed += 1;
  return {
    id: overrides.id ?? `${kind}-${Date.now().toString(36)}-${indicatorSeed}`,
    kind,
    visible: overrides.visible ?? true,
    color: overrides.color ?? entry.color,
    params: { ...entry.defaults, ...(overrides.params ?? {}) },
  };
}

export function defaultIndicators(): IndicatorInstance[] {
  return [createIndicator("sma"), createIndicator("ema"), createIndicator("rsi")];
}

export function indicatorLabel(indicator: IndicatorInstance): string {
  switch (indicator.kind) {
    case "sma":
      return `SMA ${indicator.params.period ?? 20}`;
    case "ema":
      return `EMA ${indicator.params.period ?? 50}`;
    case "bollinger":
      return `BB ${indicator.params.period ?? 20},${indicator.params.multiplier ?? 2}`;
    case "rsi":
      return `RSI ${indicator.params.period ?? 14}`;
    case "macd":
      return `MACD ${indicator.params.fast ?? 12},${indicator.params.slow ?? 26},${indicator.params.signal ?? 9}`;
    case "atr":
      return `ATR ${indicator.params.period ?? 14}`;
    default:
      return indicator.kind;
  }
}

export function parseIndicators(value: unknown): IndicatorInstance[] {
  if (!Array.isArray(value)) return defaultIndicators();
  const result: IndicatorInstance[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    if (!INDICATOR_CATALOG.some((entry) => entry.kind === kind)) continue;
    const params = record.params && typeof record.params === "object" ? (record.params as IndicatorParams) : {};
    result.push({
      id: typeof record.id === "string" && record.id.length <= 80 ? record.id : `${String(kind)}-${result.length}`,
      kind: kind as IndicatorKind,
      visible: record.visible !== false,
      color: typeof record.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(record.color) ? record.color : createIndicator(kind as IndicatorKind).color,
      params: sanitizeParams(params),
    });
  }
  return result.slice(0, 20);
}

function sanitizeParams(params: IndicatorParams): IndicatorParams {
  const clean: IndicatorParams = {};
  const take = (key: keyof IndicatorParams, min: number, max: number) => {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = Math.min(max, Math.max(min, value));
    }
  };
  take("period", 1, 400);
  take("multiplier", 0.1, 10);
  take("fast", 1, 200);
  take("slow", 2, 400);
  take("signal", 1, 100);
  take("overbought", 50, 100);
  take("oversold", 0, 50);
  return clean;
}

export function parseChartSettings(value: unknown): ChartSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_CHART_SETTINGS };
  const record = value as Record<string, unknown>;
  const color = (input: unknown) =>
    typeof input === "string" && /^#[0-9a-fA-F]{3,8}$/.test(input) ? input : null;
  return {
    showVolume: record.showVolume !== false,
    showGrid: record.showGrid !== false,
    upColor: color(record.upColor),
    downColor: color(record.downColor),
  };
}

export type DrawingTool =
  | "trendline"
  | "horizontal"
  | "vertical"
  | "ray"
  | "extended"
  | "channel"
  | "rectangle"
  | "fib"
  | "fibextension"
  | "text"
  | "brush"
  | "measure"
  | "timemeasure"
  | "erase";

export interface DrawingToolMeta {
  tool: DrawingTool;
  label: string;
  hint: string;
  points: number;
}

export const DRAWING_TOOLS: DrawingToolMeta[] = [
  { tool: "trendline", label: "Trend line", hint: "Click two points", points: 2 },
  { tool: "horizontal", label: "Horizontal line", hint: "Click a price", points: 1 },
  { tool: "vertical", label: "Vertical line", hint: "Click a time", points: 1 },
  { tool: "ray", label: "Ray", hint: "Click two points; extends right", points: 2 },
  { tool: "extended", label: "Extended line", hint: "Click two points; extends both ways", points: 2 },
  { tool: "channel", label: "Parallel channel", hint: "Click three points", points: 3 },
  { tool: "rectangle", label: "Rectangle", hint: "Click two corners", points: 2 },
  { tool: "fib", label: "Fibonacci retracement", hint: "Click swing high and low", points: 2 },
  { tool: "fibextension", label: "Fibonacci extension", hint: "Click A, B then C", points: 3 },
  { tool: "text", label: "Text note", hint: "Click and type", points: 1 },
  { tool: "brush", label: "Brush", hint: "Drag to draw freehand", points: 0 },
  { tool: "measure", label: "Measure price", hint: "Click start and end", points: 2 },
  { tool: "timemeasure", label: "Measure time", hint: "Click start and end", points: 2 },
  { tool: "erase", label: "Erase", hint: "Click a drawing to remove it", points: 0 },
];

export type DrawingLineStyle = 0 | 1 | 2;

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: DrawingLineStyle;
  fillOpacity: number;
  text?: string;
  levels?: Record<string, boolean>;
  showLabels?: boolean;
}

export interface ChartPoint {
  time: number;
  price: number;
}

export interface ChartDrawing {
  id: string;
  tool: DrawingTool;
  points: ChartPoint[];
  style: DrawingStyle;
  visible: boolean;
}

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const FIB_EXTENSION_RATIOS = [0.618, 1, 1.618, 2.618, 3.618];

export const DRAWING_COLORS = ["#e9c46a", "#56cfe1", "#c9f75c", "#ff7d7d", "#a78bfa", "#f4a261", "#f8f9fa"];

export function defaultDrawingStyle(tool: DrawingTool): DrawingStyle {
  const isMeasure = tool === "measure" || tool === "timemeasure";
  return {
    color: isMeasure ? "#56cfe1" : "#e9c46a",
    lineWidth: 1,
    lineStyle: tool === "horizontal" || tool === "vertical" ? 2 : 0,
    fillOpacity: 0.08,
    levels: tool === "fib" ? Object.fromEntries(FIB_RATIOS.map((ratio) => [String(ratio), true])) : undefined,
    showLabels: tool === "fib" || tool === "fibextension" || isMeasure,
  };
}

export function parseDrawingStyle(value: unknown): DrawingStyle {
  if (!value || typeof value !== "object") return defaultDrawingStyle("trendline");
  const record = value as Record<string, unknown>;
  const color = typeof record.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(record.color) ? record.color : "#e9c46a";
  const lineWidth = typeof record.lineWidth === "number" && Number.isFinite(record.lineWidth)
    ? Math.min(6, Math.max(1, record.lineWidth))
    : 1;
  const lineStyle = record.lineStyle === 1 || record.lineStyle === 2 ? record.lineStyle : 0;
  const fillOpacity = typeof record.fillOpacity === "number" && Number.isFinite(record.fillOpacity)
    ? Math.min(0.5, Math.max(0, record.fillOpacity))
    : 0.08;
  const levels: Record<string, boolean> | undefined =
    record.levels && typeof record.levels === "object"
      ? Object.fromEntries(
          Object.entries(record.levels as Record<string, unknown>)
            .filter(([key]) => FIB_RATIOS.some((ratio) => String(ratio) === key))
            .map(([key, enabled]) => [key, enabled !== false]),
        )
      : undefined;
  return {
    color,
    lineWidth,
    lineStyle: lineStyle as DrawingLineStyle,
    fillOpacity,
    text: typeof record.text === "string" ? record.text.slice(0, 240) : undefined,
    levels,
    showLabels: record.showLabels !== false,
  };
}

export function parseChartDrawings(value: unknown): ChartDrawing[] {
  if (!Array.isArray(value)) return [];
  const drawings: ChartDrawing[] = [];
  for (const item of value.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const tool = record.tool;
    if (!DRAWING_TOOLS.some((entry) => entry.tool === tool) || tool === "erase") continue;
    if (!Array.isArray(record.points)) continue;
    const points: ChartPoint[] = [];
    for (const point of record.points.slice(0, 500)) {
      if (!point || typeof point !== "object") continue;
      const p = point as Record<string, unknown>;
      if (
        typeof p.time === "number" &&
        Number.isFinite(p.time) &&
        typeof p.price === "number" &&
        Number.isFinite(p.price)
      ) {
        points.push({ time: Math.round(p.time), price: p.price });
      }
    }
    if (points.length === 0) continue;
    drawings.push({
      id: typeof record.id === "string" && record.id.length <= 80 ? record.id : `drawing-${drawings.length}`,
      tool: tool as DrawingTool,
      points,
      style: parseDrawingStyle(record.style),
      visible: record.visible !== false,
    });
  }
  return drawings;
}
