"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Logical, Time } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import {
  defaultDrawingStyle,
  FIB_EXTENSION_RATIOS,
  FIB_RATIOS,
  type ChartDrawing,
  type ChartPoint,
  type DrawingStyle,
  type DrawingTool,
} from "@/lib/charting";

interface DrawingLayerProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  candles: Candle[];
  intervalSeconds: number;
  precision: number;
  pipSize: number;
  drawings: ChartDrawing[];
  activeTool: DrawingTool | null;
  selectedId: string | null;
  onAdd: (drawing: ChartDrawing) => void;
  onUpdate: (id: string, points: ChartPoint[]) => void;
  onErase: (id: string) => void;
  onSelect: (id: string | null) => void;
}

interface Size {
  width: number;
  height: number;
}

function drawingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `d-${crypto.randomUUID()}`;
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function requiredPoints(tool: DrawingTool): number {
  switch (tool) {
    case "horizontal":
    case "vertical":
    case "text":
      return 1;
    case "channel":
    case "fibextension":
      return 3;
    case "brush":
    case "erase":
      return 0;
    default:
      return 2;
  }
}

function dashFor(style: DrawingStyle): string | undefined {
  if (style.lineStyle === 1) return "2 3";
  if (style.lineStyle === 2) return "7 5";
  return undefined;
}

function segmentExtent(p0: { x: number; y: number }, p1: { x: number; y: number }, width: number, both: boolean) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (Math.abs(dx) < 0.0001) return { x1: p0.x, y1: p0.y, x2: p0.x, y2: p1.y };
  const leftX = both ? 0 : p0.x;
  const rightX = width;
  const yAt = (x: number) => p0.y + ((x - p0.x) / dx) * dy;
  return { x1: leftX, y1: yAt(leftX), x2: rightX, y2: yAt(rightX) };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  const days = Math.floor(seconds / 86_400);
  const hours = Math.round((seconds % 86_400) / 3600);
  return `${days}d ${hours}h`;
}

export function DrawingLayer({
  chart,
  series,
  candles,
  intervalSeconds,
  precision,
  pipSize,
  drawings,
  activeTool,
  selectedId,
  onAdd,
  onUpdate,
  onErase,
  onSelect,
}: DrawingLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [, setVersion] = useState(0);
  const [pending, setPending] = useState<ChartPoint[]>([]);
  const [cursor, setCursor] = useState<ChartPoint | null>(null);
  const [brushPoints, setBrushPoints] = useState<ChartPoint[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);
  const dragRef = useRef<{ id: string; index: number } | null>(null);
  const brushRef = useRef<ChartPoint[] | null>(null);
  const toolRef = useRef<DrawingTool | null>(activeTool);
  const drawingsRef = useRef<ChartDrawing[]>(drawings);
  const onAddRef = useRef(onAdd);
  const onUpdateRef = useRef(onUpdate);
  const onEraseRef = useRef(onErase);
  const pendingRef = useRef<ChartPoint[]>([]);

  useEffect(() => {
    toolRef.current = activeTool;
    setPending([]);
    pendingRef.current = [];
    setCursor(null);
  }, [activeTool]);
  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);
  useEffect(() => {
    onAddRef.current = onAdd;
    onUpdateRef.current = onUpdate;
    onEraseRef.current = onErase;
  }, [onAdd, onUpdate, onErase]);

  useEffect(() => {
    if (!chart || !series) return;
    const element = svgRef.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      setVersion((value) => value + 1);
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    const bump = () => setVersion((value) => value + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    chart.timeScale().subscribeSizeChange?.(bump);
    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
    };
  }, [chart, series]);

  const timeStep = useMemo(() => {
    if (intervalSeconds > 0) return intervalSeconds;
    if (candles.length > 1) return candles[candles.length - 1].time - candles[candles.length - 2].time;
    return 60;
  }, [candles, intervalSeconds]);

  const xForTime = useCallback(
    (time: number): number | null => {
      if (!chart) return null;
      const scale = chart.timeScale();
      const direct = scale.timeToCoordinate(time as Time);
      if (direct != null) return direct;
      if (candles.length === 0) return null;
      const first = candles[0].time;
      const last = candles[candles.length - 1].time;
      let logical: number;
      if (time <= first) logical = (time - first) / timeStep;
      else if (time >= last) logical = candles.length - 1 + (time - last) / timeStep;
      else {
        let low = 0;
        let high = candles.length - 1;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (candles[mid].time < time) low = mid + 1;
          else high = mid;
        }
        logical = low;
      }
      return scale.logicalToCoordinate(logical as Logical);
    },
    [candles, chart, timeStep],
  );

  const yForPrice = useCallback(
    (price: number): number | null => (series ? series.priceToCoordinate(price) : null),
    [series],
  );

  const pointFromClient = useCallback(
    (clientX: number, clientY: number): ChartPoint | null => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !chart || !series) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (price == null || !Number.isFinite(price)) return null;
      let time: number | null = null;
      const direct = chart.timeScale().coordinateToTime(x);
      if (direct != null) time = Number(direct);
      else {
        const logical = chart.timeScale().coordinateToLogical(x);
        if (logical == null) return null;
        if (candles.length > 0) {
          const last = candles[candles.length - 1].time;
          if (logical > candles.length - 1) time = last + Math.round(logical - (candles.length - 1)) * timeStep;
          else if (logical < 0) time = candles[0].time + Math.round(logical) * timeStep;
          else time = candles[Math.max(0, Math.round(logical))].time;
        }
      }
      if (time == null || !Number.isFinite(time)) return null;
      return { time: Math.round(time), price };
    },
    [candles, chart, series, timeStep],
  );

  useEffect(() => {
    if (!chart) return;
    const handleClick = (param: { point?: { x: number; y: number } }) => {
      const tool = toolRef.current;
      if (!tool || tool === "brush" || tool === "erase" || !param.point) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = pointFromClient(rect.left + param.point.x, rect.top + param.point.y);
      if (!point) return;
      const needed = requiredPoints(tool);
      const next = [...pendingRef.current, point].slice(0, needed);
      if (next.length < needed) {
        pendingRef.current = next;
        setPending(next);
        return;
      }
      const style = defaultDrawingStyle(tool);
      onAddRef.current({ id: drawingId(), tool, points: next, style, visible: true });
      pendingRef.current = [];
      setPending([]);
    };
    const handleMove = (param: { point?: { x: number; y: number } }) => {
      if (!param.point || pendingRef.current.length === 0) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCursor(pointFromClient(rect.left + param.point.x, rect.top + param.point.y));
    };
    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleMove);
    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleMove);
    };
  }, [chart, pointFromClient]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const point = pointFromClient(event.clientX, event.clientY);
      const target = dragRef.current;
      if (!point || !target) return;
      const drawing = drawingsRef.current.find((item) => item.id === target.id);
      if (!drawing) return;
      const points = drawing.points.map((anchor, index) => (index === target.index ? point : anchor));
      onUpdateRef.current(target.id, points);
    };
    const up = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, pointFromClient]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelect(null);
      if ((event.key === "Delete" || event.key === "Backspace") && !activeTool) {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
        onEraseRef.current(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, onSelect, selectedId]);

  const renderLine = (
    drawing: ChartDrawing,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: { dashed?: string; width?: number; color?: string; opacity?: number } = {},
  ) => (
    <line
      key={`${drawing.id}-line`}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={options.color ?? drawing.style.color}
      strokeWidth={options.width ?? drawing.style.lineWidth}
      strokeDasharray={options.dashed}
      opacity={options.opacity}
    />
  );

  const label = (drawing: ChartDrawing, x: number, y: number, text: string, key: string) => (
    <g key={key} pointerEvents="none">
      <rect x={x} y={y - 11} width={Math.max(30, text.length * 5.6 + 8)} height={15} rx={2} fill="rgba(5,10,12,0.78)" />
      <text x={x + 4} y={y} fill={drawing.style.color} fontSize={9.5} fontFamily="'JetBrains Mono Variable', monospace">
        {text}
      </text>
    </g>
  );

  const renderDrawing = (drawing: ChartDrawing) => {
    if (!drawing.visible) return null;
    const coords = drawing.points
      .map((point) => ({ x: xForTime(point.time), y: yForPrice(point.price), point }))
      .filter((entry): entry is { x: number; y: number; point: ChartPoint } => entry.x != null && entry.y != null);
    if (coords.length === 0) return null;
    const selected = drawing.id === selectedId;
    const dash = dashFor(drawing.style);
    const width = drawing.style.lineWidth;
    const parts: React.ReactNode[] = [];
    const [p0, p1, p2] = coords;

    switch (drawing.tool) {
      case "trendline":
        if (coords.length >= 2) parts.push(renderLine(drawing, p0.x, p0.y, p1.x, p1.y, { dashed: dash, width }));
        break;
      case "horizontal":
        parts.push(renderLine(drawing, 0, p0.y, size.width, p0.y, { dashed: dash, width }));
        if (drawing.style.showLabels !== false) {
          parts.push(label(drawing, 6, p0.y - 4, `${drawing.points[0].price.toFixed(precision)}`, `${drawing.id}-l`));
        }
        break;
      case "vertical":
        parts.push(renderLine(drawing, p0.x, 0, p0.x, size.height, { dashed: dash, width }));
        break;
      case "ray":
        if (coords.length >= 2) {
          const extent = segmentExtent(p0, p1, size.width, false);
          parts.push(renderLine(drawing, extent.x1, extent.y1, extent.x2, extent.y2, { dashed: dash, width }));
        }
        break;
      case "extended":
        if (coords.length >= 2) {
          const extent = segmentExtent(p0, p1, size.width, true);
          parts.push(renderLine(drawing, extent.x1, extent.y1, extent.x2, extent.y2, { dashed: dash, width }));
        }
        break;
      case "channel": {
        if (coords.length >= 2) {
          const extent = segmentExtent(p0, p1, size.width, false);
          parts.push(
            <line key={`${drawing.id}-main`} x1={extent.x1} y1={extent.y1} x2={extent.x2} y2={extent.y2} stroke={drawing.style.color} strokeWidth={width} strokeDasharray={dash} />,
          );
          if (p2) {
            const offset = p2.point.price - drawing.points[0].price -
              ((drawing.points[1].price - drawing.points[0].price) *
                (p2.point.time - drawing.points[0].time)) /
                Math.max(1, drawing.points[1].time - drawing.points[0].time);
            const parallelStart = yForPrice(drawing.points[0].price + offset);
            const parallelEnd = yForPrice(drawing.points[1].price + offset);
            if (parallelStart != null && parallelEnd != null) {
              const parallel = segmentExtent({ x: p0.x, y: parallelStart }, { x: p1.x, y: parallelEnd }, size.width, false);
              parts.push(
                <polygon
                  key={`${drawing.id}-fill`}
                  points={`${extent.x1},${extent.y1} ${extent.x2},${extent.y2} ${parallel.x2},${parallel.y2} ${parallel.x1},${parallel.y1}`}
                  fill={drawing.style.color}
                  opacity={drawing.style.fillOpacity}
                />,
              );
              parts.push(
                <line key={`${drawing.id}-parallel`} x1={parallel.x1} y1={parallel.y1} x2={parallel.x2} y2={parallel.y2} stroke={drawing.style.color} strokeWidth={width} strokeDasharray={dash} />,
              );
            }
          }
        }
        break;
      }
      case "rectangle": {
        if (coords.length >= 2) {
          const x = Math.min(p0.x, p1.x);
          const y = Math.min(p0.y, p1.y);
          const w = Math.abs(p1.x - p0.x);
          const h = Math.abs(p1.y - p0.y);
          parts.push(
            <rect key={`${drawing.id}-rect`} x={x} y={y} width={w} height={h} fill={drawing.style.color} fillOpacity={drawing.style.fillOpacity} stroke={drawing.style.color} strokeWidth={width} strokeDasharray={dash} />,
          );
        }
        break;
      }
      case "fib": {
        if (coords.length >= 2) {
          const startPrice = drawing.points[0].price;
          const endPrice = drawing.points[1].price;
          const levels = drawing.style.levels ?? {};
          for (const ratio of FIB_RATIOS) {
            if (levels[String(ratio)] === false) continue;
            const price = startPrice + (endPrice - startPrice) * ratio;
            const y = yForPrice(price);
            if (y == null) continue;
            const left = Math.min(p0.x, p1.x);
            parts.push(
              <line key={`${drawing.id}-fib-${ratio}`} x1={left} y1={y} x2={Math.max(p0.x + 70, size.width - 62)} y2={y} stroke={drawing.style.color} strokeWidth={ratio === 0 || ratio === 1 ? width : Math.max(1, width - 0.3)} opacity={ratio === 0.618 ? 1 : 0.78} strokeDasharray={ratio === 0 ? undefined : "4 3"} />,
            );
            if (drawing.style.showLabels !== false) {
              parts.push(label(drawing, left + 2, y - 4, `${(ratio * 100).toFixed(1)}% ${price.toFixed(precision)}`, `${drawing.id}-fib-l-${ratio}`));
            }
          }
          parts.push(renderLine(drawing, p0.x, p0.y, p1.x, p1.y, { dashed: "3 3", opacity: 0.45 }));
        }
        break;
      }
      case "fibextension": {
        if (coords.length >= 3) {
          const a = drawing.points[0].price;
          const b = drawing.points[1].price;
          const c = drawing.points[2].price;
          const right = Math.max(p1.x + 70, size.width - 62);
          for (const ratio of FIB_EXTENSION_RATIOS) {
            const price = c + (b - a) * ratio;
            const y = yForPrice(price);
            if (y == null) continue;
            parts.push(
              <line key={`${drawing.id}-ext-${ratio}`} x1={p1.x} y1={y} x2={right} y2={y} stroke={drawing.style.color} strokeWidth={width} strokeDasharray="5 3" opacity={0.8} />,
            );
            if (drawing.style.showLabels !== false) {
              parts.push(label(drawing, p1.x + 2, y - 4, `${ratio.toFixed(3)} ${price.toFixed(precision)}`, `${drawing.id}-ext-l-${ratio}`));
            }
          }
          parts.push(renderLine(drawing, p0.x, p0.y, p1.x, p1.y, { dashed: "3 3", opacity: 0.4 }));
          parts.push(renderLine(drawing, p1.x, p1.y, p2.x, p2.y, { dashed: "3 3", opacity: 0.4 }));
        }
        break;
      }
      case "text": {
        const text = drawing.style.text ?? "Note";
        const lines = text.split("\n").slice(0, 6);
        parts.push(
          <g key={`${drawing.id}-text`}>
            <rect x={p0.x + 4} y={p0.y - 14} width={Math.max(...lines.map((line) => line.length)) * 6.2 + 10} height={lines.length * 14 + 6} rx={3} fill="rgba(5,10,12,0.8)" stroke={drawing.style.color} strokeOpacity={0.5} />
            {lines.map((line, index) => (
              <text key={index} x={p0.x + 9} y={p0.y + index * 14} fill={drawing.style.color} fontSize={10.5} fontFamily="'JetBrains Mono Variable', monospace">
                {line}
              </text>
            ))}
          </g>,
        );
        break;
      }
      case "brush": {
        if (coords.length >= 2) {
          parts.push(
            <polyline key={`${drawing.id}-brush`} points={coords.map((entry) => `${entry.x},${entry.y}`).join(" ")} fill="none" stroke={drawing.style.color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />,
          );
        }
        break;
      }
      case "measure": {
        if (coords.length >= 2) {
          const delta = drawing.points[1].price - drawing.points[0].price;
          const pct = drawing.points[0].price !== 0 ? (delta / drawing.points[0].price) * 100 : 0;
          const pips = pipSize > 0 ? delta / pipSize : delta;
          parts.push(renderLine(drawing, p0.x, p0.y, p1.x, p1.y, { dashed: "4 3", color: delta >= 0 ? "#4ade80" : "#ff7d7d" }));
          parts.push(
            <rect key={`${drawing.id}-m-box`} x={p1.x + 6} y={p1.y - 12} width={140} height={18} rx={3} fill="rgba(5,10,12,0.85)" stroke={drawing.style.color} strokeOpacity={0.4} />,
          );
          parts.push(
            <text key={`${drawing.id}-m-text`} x={p1.x + 10} y={p1.y} fill={delta >= 0 ? "#4ade80" : "#ff7d7d"} fontSize={9.5} fontFamily="'JetBrains Mono Variable', monospace">
              {`${delta >= 0 ? "+" : ""}${delta.toFixed(precision)} (${pips.toFixed(1)}p) ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
            </text>,
          );
        }
        break;
      }
      case "timemeasure": {
        if (coords.length >= 2) {
          const seconds = Math.abs(drawing.points[1].time - drawing.points[0].time);
          const y = Math.min(p0.y, size.height - 24);
          parts.push(
            <g key={`${drawing.id}-t`}>
              <line x1={p0.x} y1={y} x2={p1.x} y2={y} stroke={drawing.style.color} strokeWidth={width} />
              <line x1={p0.x} y1={y - 5} x2={p0.x} y2={y + 5} stroke={drawing.style.color} strokeWidth={width} />
              <line x1={p1.x} y1={y - 5} x2={p1.x} y2={y + 5} stroke={drawing.style.color} strokeWidth={width} />
              <rect x={(p0.x + p1.x) / 2 - 40} y={y - 24} width={80} height={16} rx={3} fill="rgba(5,10,12,0.85)" stroke={drawing.style.color} strokeOpacity={0.4} />
              <text x={(p0.x + p1.x) / 2 - 35} y={y - 12} fill={drawing.style.color} fontSize={9.5} fontFamily="'JetBrains Mono Variable', monospace">
                {formatDuration(seconds)}
              </text>
            </g>,
          );
        }
        break;
      }
      default:
        break;
    }

    const hitTarget = !activeTool ? (
      <g
        key={`${drawing.id}-hit`}
        style={{ cursor: "pointer" }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(drawing.id);
        }}
        pointerEvents="auto"
      >
        {coords.length >= 2 ? (
          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="transparent" strokeWidth={Math.max(14, width + 10)} />
        ) : (
          <circle cx={p0.x} cy={p0.y} r={10} fill="transparent" />
        )}
      </g>
    ) : activeTool === "erase" ? (
      <g
        key={`${drawing.id}-erase`}
        style={{ cursor: "crosshair" }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onErase(drawing.id);
        }}
        pointerEvents="auto"
      >
        {coords.length >= 2 ? (
          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="transparent" strokeWidth={Math.max(16, width + 12)} />
        ) : (
          <circle cx={p0.x} cy={p0.y} r={11} fill="transparent" />
        )}
      </g>
    ) : null;

    return (
      <g key={drawing.id} opacity={selected ? 1 : 0.96}>
        {selected ? <rect x={0} y={0} width={size.width} height={size.height} fill="none" /> : null}
        {parts}
        {selected && !activeTool
          ? coords.map((entry, index) => (
              <circle
                key={`${drawing.id}-anchor-${index}`}
                cx={entry.x}
                cy={entry.y}
                r={4.5}
                fill="#0b1214"
                stroke={drawing.style.color}
                strokeWidth={2}
                pointerEvents="auto"
                style={{ cursor: "grab" }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dragRef.current = { id: drawing.id, index };
                  setDrag({ id: drawing.id, index });
                }}
              />
            ))
          : null}
        {hitTarget}
      </g>
    );
  };

  const activeToolMeta = activeTool;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-10 h-full w-full"
      style={{ pointerEvents: activeTool === "brush" ? "auto" : "none", cursor: activeTool ? "crosshair" : undefined }}
      onPointerMove={(event) => {
        if (activeTool !== "brush" || !brushRef.current) return;
        const point = pointFromClient(event.clientX, event.clientY);
        if (!point) return;
        const last = brushRef.current[brushRef.current.length - 1];
        if (last && Math.abs(last.time - point.time) < timeStep && Math.abs(last.price - point.price) < 1e-9) return;
        brushRef.current = [...brushRef.current, point].slice(-500);
        setBrushPoints(brushRef.current);
      }}
      onPointerDown={(event) => {
        if (activeTool !== "brush") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = pointFromClient(event.clientX, event.clientY);
        if (!point) return;
        brushRef.current = [point];
        setBrushPoints([point]);
      }}
      onPointerUp={() => {
        if (activeTool !== "brush") return;
        const points = brushRef.current;
        brushRef.current = null;
        setBrushPoints(null);
        if (points && points.length >= 2) {
          onAddRef.current({
            id: drawingId(),
            tool: "brush",
            points,
            style: defaultDrawingStyle("brush"),
            visible: true,
          });
        }
      }}
    >
      {drawings.map(renderDrawing)}

      {pending.length > 0 ? (
        <g>
          {pending.map((point, index) => {
            const x = xForTime(point.time);
            const y = yForPrice(point.price);
            if (x == null || y == null) return null;
            return <circle key={index} cx={x} cy={y} r={4} fill="#c9f75c" stroke="#0b1214" strokeWidth={1.5} />;
          })}
          {cursor && (() => {
            const last = pending[pending.length - 1];
            const x1 = xForTime(last.time);
            const y1 = yForPrice(last.price);
            const x2 = xForTime(cursor.time);
            const y2 = yForPrice(cursor.price);
            if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9f75c" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />;
          })()}
        </g>
      ) : null}

      {brushPoints && brushPoints.length >= 2 ? (
        <polyline
          points={brushPoints
            .map((point) => {
              const x = xForTime(point.time);
              const y = yForPrice(point.price);
              return x != null && y != null ? `${x},${y}` : null;
            })
            .filter(Boolean)
            .join(" ")}
          fill="none"
          stroke="#e9c46a"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ) : null}

      {activeToolMeta && pending.length === 0 && activeToolMeta !== "brush" && activeToolMeta !== "erase" ? (
        <text x={8} y={16} fill="rgba(201,247,92,0.7)" fontSize={9} fontFamily="'JetBrains Mono Variable', monospace" pointerEvents="none">
          {activeToolMeta === "horizontal" ? "Click a price level" : "Click to place anchors"}
        </text>
      ) : null}
    </svg>
  );
}
