"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColorType,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  LogicalRange,
  Time,
} from "lightweight-charts";
import { clsx } from "clsx";
import { SlidersHorizontal } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { DrawingLayer } from "@/components/terminal/drawing-layer";
import type { Candle, Timeframe } from "@/lib/market";
import { atr, bollinger, ema, macd, rsi, sma, withTick, type IndicatorPoint } from "@/lib/indicators";
import {
  DEFAULT_CHART_SETTINGS,
  indicatorLabel,
  type ChartDrawing,
  type ChartSettings,
  type DrawingTool,
  type IndicatorInstance,
} from "@/lib/charting";

export interface PriceMarker {
  price: number;
  title: string;
  color: string;
  dashed?: boolean;
}

interface ChartColors {
  up: string;
  down: string;
  grid: string;
  border: string;
  text: string;
  signal: string;
}

function colorsFor(light: boolean): ChartColors {
  return {
    up: light ? "#4f7a00" : "#c9f75c",
    down: light ? "#c0362f" : "#ff7d7d",
    grid: light ? "rgba(17,23,17,0.06)" : "rgba(255,255,255,0.035)",
    border: light ? "rgba(17,23,17,0.12)" : "rgba(255,255,255,0.07)",
    text: light ? "#5c685a" : "#7e8882",
    signal: light ? "#b35c00" : "#ffb703",
  };
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14_400,
  "1d": 86_400,
};

function chartOptions(
  element: HTMLElement,
  light: boolean,
  colors: ChartColors,
  visibleTimeScale: boolean,
  backgroundType: ColorType,
  crosshairMode: CrosshairMode,
  showGrid: boolean,
) {
  return {
    autoSize: false,
    width: element.clientWidth,
    height: element.clientHeight,
    layout: {
      background: { type: backgroundType, color: "transparent" },
      textColor: colors.text,
      fontFamily: "'JetBrains Mono Variable', monospace",
      fontSize: 10,
    },
    grid: {
      vertLines: { color: showGrid ? colors.grid : "transparent" },
      horzLines: { color: showGrid ? colors.grid : "transparent" },
    },
    rightPriceScale: {
      borderColor: colors.border,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderColor: colors.border,
      visible: visibleTimeScale,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 7,
    },
    crosshair: {
      mode: crosshairMode,
      vertLine: {
        color: light ? "rgba(79,122,0,0.35)" : "rgba(201,247,92,0.3)",
        labelBackgroundColor: light ? "#ffffff" : "#1f272a",
      },
      horzLine: {
        color: light ? "rgba(79,122,0,0.35)" : "rgba(201,247,92,0.3)",
        labelBackgroundColor: light ? "#ffffff" : "#1f272a",
      },
    },
    localization: { locale: "en-US" },
  };
}

function lineData(points: IndicatorPoint[]) {
  return points.map((point) => ({ time: point.time as Time, value: point.value }));
}

function lastText(points: IndicatorPoint[]): string {
  return points.length === 0 ? "—" : points[points.length - 1].value.toFixed(2);
}

function withOpacity(color: string, light: boolean): string {
  return color.startsWith("#") ? `${color}${light ? "22" : "33"}` : color;
}

function StudyShell({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative h-[112px] shrink-0 border-t border-white/[0.06]">
      <div className="pointer-events-none absolute top-1.5 left-2 z-10 flex items-center gap-2 rounded bg-ink-900/55 px-1.5 py-0.5 text-[9px] backdrop-blur-sm">
        <span className="font-semibold tracking-wider text-fog uppercase">{title}</span>
        <span className="font-mono text-snow">{value}</span>
      </div>
      <div className="h-full w-full">{children}</div>
    </section>
  );
}

interface PaneProps {
  instance: IndicatorInstance;
  data: IndicatorPoint[];
  macdData?: { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: IndicatorPoint[] };
  visibleTimeScale: boolean;
  registerChart: (id: string, chart: IChartApi) => () => void;
  light: boolean;
  colors: ChartColors;
  showGrid: boolean;
}

function StudyPane({ instance, data, macdData, visibleTimeScale, registerChart, light, colors, showGrid }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const signalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const histogramRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [ready, setReady] = useState(false);
  const isMacd = instance.kind === "macd";
  const overbought = instance.params.overbought ?? 70;
  const oversold = instance.params.oversold ?? 30;

  useEffect(() => {
    let cancelled = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let unregister: (() => void) | null = null;
    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode }) => {
      if (cancelled || !containerRef.current) return;
      const element = containerRef.current;
      chart = createChart(element, chartOptions(element, light, colors, visibleTimeScale, ColorType.Solid, CrosshairMode.Normal, showGrid));
      if (isMacd) {
        const histogram = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        const line = chart.addLineSeries({ color: instance.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        const signal = chart.addLineSeries({ color: colors.signal, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        histogramRef.current = histogram;
        lineRef.current = line;
        signalRef.current = signal;
      } else {
        const line = chart.addLineSeries({ color: instance.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
        if (instance.kind === "rsi") {
          line.createPriceLine({ price: overbought, color: light ? "rgba(192,54,47,0.35)" : "rgba(255,125,125,0.3)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
          line.createPriceLine({ price: oversold, color: light ? "rgba(79,122,0,0.35)" : "rgba(201,247,92,0.3)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
        }
        lineRef.current = line;
      }
      chartRef.current = chart;
      observer = new ResizeObserver(() => {
        if (chart) chart.applyOptions({ width: element.clientWidth, height: element.clientHeight });
      });
      observer.observe(element);
      unregister = registerChart(instance.id, chart);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      unregister?.();
      observer?.disconnect();
      chart?.remove();
      chartRef.current = null;
      lineRef.current = null;
      signalRef.current = null;
      histogramRef.current = null;
      setReady(false);
    };
  }, [colors, instance.color, instance.id, instance.kind, isMacd, light, overbought, oversold, registerChart, showGrid, visibleTimeScale]);

  useEffect(() => {
    if (!ready) return;
    if (isMacd && macdData) {
      histogramRef.current?.setData(
        macdData.histogram.map((point) => ({
          time: point.time as Time,
          value: point.value,
          color: point.value >= 0 ? withOpacity(colors.up, light) : withOpacity(colors.down, light),
        })),
      );
      lineRef.current?.setData(lineData(macdData.macd));
      signalRef.current?.setData(lineData(macdData.signal));
    } else {
      lineRef.current?.setData(lineData(data));
      lineRef.current?.applyOptions({ color: instance.color });
    }
  }, [colors.down, colors.up, data, instance.color, isMacd, light, macdData, ready]);

  useEffect(() => {
    if (!ready) return;
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: showGrid ? colors.grid : "transparent" },
        horzLines: { color: showGrid ? colors.grid : "transparent" },
      },
    });
  }, [colors.grid, ready, showGrid]);

  const value = isMacd ? lastText(macdData?.macd ?? []) : lastText(data);

  return (
    <StudyShell title={indicatorLabel(instance)} value={value}>
      <div ref={containerRef} className="h-full w-full" />
    </StudyShell>
  );
}

export function PriceChart({
  candles,
  tick,
  precision,
  pipSize = 0.0001,
  timeframe = "1m",
  markers = [],
  indicators,
  chartSettings = DEFAULT_CHART_SETTINGS,
  drawings = [],
  activeTool = null,
  selectedDrawingId = null,
  onToggleIndicator,
  onOpenIndicatorManager,
  onDrawingsChange,
  onSelectDrawing,
}: {
  candles: Candle[];
  tick: Candle | null;
  precision: number;
  pipSize?: number;
  timeframe?: Timeframe;
  markers?: PriceMarker[];
  indicators: IndicatorInstance[];
  chartSettings?: ChartSettings;
  drawings?: ChartDrawing[];
  activeTool?: DrawingTool | null;
  selectedDrawingId?: string | null;
  onToggleIndicator?: (id: string, visible: boolean) => void;
  onOpenIndicatorManager?: () => void;
  onDrawingsChange?: (drawings: ChartDrawing[]) => void;
  onSelectDrawing?: (id: string | null) => void;
}) {
  const { resolved } = useTheme();
  const light = resolved === "light";
  const colors = useMemo(() => colorsFor(light), [light]);
  const [ready, setReady] = useState(false);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<"Candlestick"> | null>(null);

  const mainContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const studySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const currentLineRef = useRef<IPriceLine | null>(null);
  const markerLinesRef = useRef<IPriceLine[]>([]);
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const syncingRef = useRef(false);

  const registerChart = useCallback((id: string, chart: IChartApi) => {
    chartsRef.current.set(id, chart);
    const handleRange = (range: LogicalRange | null) => {
      if (!range || syncingRef.current) return;
      syncingRef.current = true;
      for (const [otherId, other] of chartsRef.current) {
        if (otherId === id) continue;
        const current = other.timeScale().getVisibleLogicalRange();
        if (!current || Math.abs(current.from - range.from) > 0.01 || Math.abs(current.to - range.to) > 0.01) {
          other.timeScale().setVisibleLogicalRange(range);
        }
      }
      syncingRef.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    const anchor = mainChartRef.current?.timeScale().getVisibleLogicalRange();
    if (anchor && id !== "main") chart.timeScale().setVisibleLogicalRange(anchor);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
      chartsRef.current.delete(id);
    };
  }, []);

  const sourceCandles = useMemo(() => withTick(candles, tick), [candles, tick]);

  const studies = useMemo(() => {
    const result = new Map<string, { series: { key: string; data: IndicatorPoint[]; lineStyle?: LineStyle }[]; pane: "rsi" | "macd" | "atr" | null; paneData?: IndicatorPoint[]; macdData?: { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: IndicatorPoint[] } }>();
    for (const instance of indicators) {
      const params = instance.params;
      if (instance.kind === "sma") {
        result.set(instance.id, { series: [{ key: "line", data: sma(sourceCandles, params.period ?? 20) }], pane: null });
      } else if (instance.kind === "ema") {
        result.set(instance.id, { series: [{ key: "line", data: ema(sourceCandles, params.period ?? 50) }], pane: null });
      } else if (instance.kind === "bollinger") {
        const bands = bollinger(sourceCandles, params.period ?? 20, params.multiplier ?? 2);
        result.set(instance.id, {
          series: [
            { key: "upper", data: bands.upper, lineStyle: 2 },
            { key: "middle", data: bands.middle, lineStyle: 1 },
            { key: "lower", data: bands.lower, lineStyle: 2 },
          ],
          pane: null,
        });
      } else if (instance.kind === "rsi") {
        result.set(instance.id, { series: [], pane: "rsi", paneData: rsi(sourceCandles, params.period ?? 14) });
      } else if (instance.kind === "macd") {
        result.set(instance.id, {
          series: [],
          pane: "macd",
          macdData: macd(sourceCandles, params.fast ?? 12, params.slow ?? 26, params.signal ?? 9),
        });
      } else if (instance.kind === "atr") {
        result.set(instance.id, { series: [], pane: "atr", paneData: atr(sourceCandles, params.period ?? 14) });
      }
    }
    return result;
  }, [indicators, sourceCandles]);

  const paneInstances = useMemo(
    () => indicators.filter((instance) => instance.visible && studies.get(instance.id)?.pane),
    [indicators, studies],
  );
  const lastPaneId = paneInstances[paneInstances.length - 1]?.id ?? null;

  const latest = sourceCandles[sourceCandles.length - 1];

  useEffect(() => {
    let cancelled = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let unregister: (() => void) | null = null;

    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode }) => {
      if (cancelled || !mainContainerRef.current) return;
      const element = mainContainerRef.current;
      chart = createChart(element, chartOptions(element, light, colors, true, ColorType.Solid, CrosshairMode.Normal, true));
      const candleSeries = chart.addCandlestickSeries({
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: light ? "rgba(79,122,0,0.65)" : "rgba(201,247,92,0.7)",
        wickDownColor: light ? "rgba(192,54,47,0.65)" : "rgba(255,125,125,0.7)",
        borderVisible: false,
        priceLineColor: colors.up,
        priceLineStyle: 3,
      });
      const volume = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

      chart.applyOptions({
        watermark: {
          visible: true,
          text: "ANERITH · CHART",
          color: light ? "rgba(17,23,17,0.05)" : "rgba(255,255,255,0.035)",
          fontSize: 42,
          fontFamily: "'Inter Variable', sans-serif",
        },
      });

      mainChartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volume;
      setChartApi(chart);
      setSeriesApi(candleSeries);

      observer = new ResizeObserver(() => {
        if (!chart || !element) return;
        chart.applyOptions({ width: element.clientWidth, height: element.clientHeight });
      });
      observer.observe(element);
      unregister = registerChart("main", chart);
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      unregister?.();
      observer?.disconnect();
      chart?.remove();
      mainChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      currentLineRef.current = null;
      markerLinesRef.current = [];
      setChartApi(null);
      setSeriesApi(null);
      setReady(false);
    };
  }, [colors, light, registerChart]);

  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    volumeSeriesRef.current.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? withOpacity(colors.up, light) : withOpacity(colors.down, light),
      })),
    );
    if (candles.length > 0 && mainChartRef.current) {
      mainChartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 115),
        to: candles.length + 6,
      });
    }
  }, [candles, colors.down, colors.up, light, ready]);

  useEffect(() => {
    if (!ready || !tick || !candleSeriesRef.current) return;
    candleSeriesRef.current.update({
      time: tick.time as Time,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
    });
    volumeSeriesRef.current?.update({
      time: tick.time as Time,
      value: tick.volume,
      color: tick.close >= tick.open ? withOpacity(colors.up, light) : withOpacity(colors.down, light),
    });
  }, [colors.down, colors.up, light, ready, tick]);

  useEffect(() => {
    if (!ready || !mainChartRef.current) return;
    const chart = mainChartRef.current;
    chart.applyOptions({
      grid: {
        vertLines: { color: chartSettings.showGrid ? colors.grid : "transparent" },
        horzLines: { color: chartSettings.showGrid ? colors.grid : "transparent" },
      },
    });
    volumeSeriesRef.current?.applyOptions({ visible: chartSettings.showVolume });
    candleSeriesRef.current?.applyOptions({
      upColor: chartSettings.upColor ?? colors.up,
      downColor: chartSettings.downColor ?? colors.down,
    });
  }, [chartSettings, colors.down, colors.grid, colors.up, ready]);

  useEffect(() => {
    if (!ready || !mainChartRef.current) return;
    const chart = mainChartRef.current;
    const active = new Set<string>();
    for (const instance of indicators) {
      const study = studies.get(instance.id);
      if (!study || study.pane) continue;
      if (!instance.visible) continue;
      for (const entry of study.series) {
        const key = `${instance.id}:${entry.key}`;
        active.add(key);
        let series = studySeriesRef.current.get(key);
        if (!series) {
          series = chart.addLineSeries({
            color: instance.color,
            lineWidth: 1,
            lineStyle: (entry.lineStyle ?? 0) as LineStyle,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          studySeriesRef.current.set(key, series);
        }
        series.applyOptions({ color: instance.color });
        series.setData(lineData(entry.data));
      }
    }
    for (const [key, series] of Array.from(studySeriesRef.current.entries())) {
      if (active.has(key)) continue;
      try {
        chart.removeSeries(series);
      } catch {
        /* already removed */
      }
      studySeriesRef.current.delete(key);
    }
  }, [indicators, ready, studies]);

  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;
    const series = candleSeriesRef.current;
    if (currentLineRef.current) {
      try {
        series.removePriceLine(currentLineRef.current);
      } catch {
        /* already removed */
      }
    }
    if (latest) {
      currentLineRef.current = series.createPriceLine({
        price: latest.close,
        color: light ? "rgba(79,122,0,0.6)" : "rgba(201,247,92,0.55)",
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "",
      });
    }
  }, [latest, light, ready]);

  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;
    const series = candleSeriesRef.current;
    for (const line of markerLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* already removed */
      }
    }
    markerLinesRef.current = markers.map((marker) =>
      series.createPriceLine({
        price: marker.price,
        color: marker.color,
        lineWidth: 1,
        lineStyle: (marker.dashed ? 2 : 0) as LineStyle,
        axisLabelVisible: true,
        title: marker.title,
      }),
    );
  }, [markers, ready]);

  useEffect(() => {
    if (!ready) return;
    return () => {
      for (const series of studySeriesRef.current.values()) {
        try {
          mainChartRef.current?.removeSeries(series);
        } catch {
          /* chart already removed */
        }
      }
      studySeriesRef.current.clear();
    };
  }, [ready]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.05] px-2 py-1.5">
        {indicators.map((instance) => (
          <button
            key={instance.id}
            type="button"
            onClick={() => onToggleIndicator?.(instance.id, !instance.visible)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[9px] font-medium transition",
              instance.visible
                ? "border-white/15 bg-white/[0.06] text-snow"
                : "border-transparent text-white/35 hover:bg-white/[0.03] hover:text-fog",
            )}
            title={instance.visible ? "Hide indicator" : "Show indicator"}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: instance.color }} />
            {indicatorLabel(instance)}
          </button>
        ))}
        {onOpenIndicatorManager ? (
          <button
            type="button"
            onClick={onOpenIndicatorManager}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow"
            title="Manage indicators"
          >
            <SlidersHorizontal className="size-3" />
            Indicators
          </button>
        ) : null}
        <span className="ml-auto hidden items-center gap-3 font-mono text-[9px] text-white/35 sm:flex">
          {latest ? (
            <>
              <span>O {latest.open.toFixed(precision)}</span>
              <span>H {latest.high.toFixed(precision)}</span>
              <span>L {latest.low.toFixed(precision)}</span>
              <span>C {latest.close.toFixed(precision)}</span>
            </>
          ) : null}
        </span>
      </div>

      <div className="relative min-h-[260px] flex-1">
        <div ref={mainContainerRef} className="h-full w-full" />
        <DrawingLayer
          chart={chartApi}
          series={seriesApi}
          candles={candles}
          intervalSeconds={TIMEFRAME_SECONDS[timeframe]}
          precision={precision}
          pipSize={pipSize}
          drawings={drawings}
          activeTool={activeTool}
          selectedId={selectedDrawingId}
          onAdd={(drawing) => onDrawingsChange?.([...drawings, drawing])}
          onUpdate={(id, points) =>
            onDrawingsChange?.(drawings.map((drawing) => (drawing.id === id ? { ...drawing, points } : drawing)))
          }
          onErase={(id) => onDrawingsChange?.(drawings.filter((drawing) => drawing.id !== id))}
          onSelect={(id) => onSelectDrawing?.(id)}
        />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex items-center gap-2 text-[11px] text-fog">
              <span className="size-3 animate-spin rounded-full border border-acid/30 border-t-acid" />
              Loading chart
            </div>
          </div>
        ) : null}
        {candles.length === 0 && ready ? (
          <div className="absolute inset-0 grid place-items-center">
            <p className="text-[11px] text-fog">No candles are available for this timeframe.</p>
          </div>
        ) : null}
      </div>

      {paneInstances.map((instance) => {
        const study = studies.get(instance.id);
        if (!study?.pane) return null;
        return (
          <StudyPane
            key={instance.id}
            instance={instance}
            data={study.paneData ?? []}
            macdData={study.macdData}
            visibleTimeScale={lastPaneId === instance.id}
            registerChart={registerChart}
            light={light}
            colors={colors}
            showGrid={chartSettings.showGrid}
          />
        );
      })}
      {paneInstances.length === 0 ? (
        <div className="flex h-7 shrink-0 items-center justify-center border-t border-white/[0.04] text-[9px] text-white/25">
          Add RSI, MACD or ATR from Indicators to open a synced lower pane.
        </div>
      ) : null}
    </div>
  );
}
