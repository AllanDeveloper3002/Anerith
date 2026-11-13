"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Eraser,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  Maximize2,
  Minus,
  MousePointer2,
  Palette,
  Pencil,
  Percent,
  Plus,
  Ruler,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingUp,
  Type,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";
import { PriceChart, type PriceMarker } from "@/components/terminal/price-chart";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, post } from "@/lib/client";
import {
  DEFAULT_CHART_SETTINGS,
  DRAWING_COLORS,
  DRAWING_TOOLS,
  defaultIndicators,
  FIB_RATIOS,
  INDICATOR_CATALOG,
  createIndicator,
  indicatorLabel,
  type ChartDrawing,
  type ChartSettings,
  type DrawingTool,
  type IndicatorInstance,
} from "@/lib/charting";
import type { ChartLayoutDTO, ChartWorkspaceDTO, IndicatorTemplateDTO } from "@/lib/charting-service";
import type { Candle, Timeframe } from "@/lib/market";
import type { InstrumentMeta } from "@/components/terminal/order-ticket";

const TOOL_ICONS: Record<DrawingTool, React.ReactNode> = {
  trendline: <TrendingUp className="size-3.5" />,
  horizontal: <Minus className="size-3.5" />,
  vertical: <ArrowUpDown className="size-3.5" />,
  ray: <ArrowUpRight className="size-3.5" />,
  extended: <ArrowLeftRight className="size-3.5" />,
  channel: <Layers className="size-3.5" />,
  rectangle: <Square className="size-3.5" />,
  fib: <Percent className="size-3.5" />,
  fibextension: <GitBranch className="size-3.5" />,
  text: <Type className="size-3.5" />,
  brush: <Pencil className="size-3.5" />,
  measure: <Ruler className="size-3.5" />,
  timemeasure: <Clock3 className="size-3.5" />,
  erase: <Eraser className="size-3.5" />,
};

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: DrawingTool;
  active: boolean;
  onClick: () => void;
}) {
  const meta = DRAWING_TOOLS.find((item) => item.tool === tool);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${meta?.label ?? tool} — ${meta?.hint ?? ""}`}
      className={clsx(
        "grid size-7 place-items-center rounded-md transition",
        active ? "bg-acid/20 text-acid" : "text-fog hover:bg-white/[0.07] hover:text-snow",
      )}
      aria-pressed={active}
      aria-label={meta?.label ?? tool}
    >
      {TOOL_ICONS[tool]}
    </button>
  );
}

function ParamField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-fog">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="h-6 w-16 rounded border border-white/10 bg-black/25 px-1.5 text-right font-mono text-[10px] text-snow"
      />
    </label>
  );
}

export interface ChartSurfaceProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  tick: Candle | null;
  meta: InstrumentMeta | undefined;
  markers?: PriceMarker[];
  onTimeframeChange?: (timeframe: Timeframe) => void;
  expandHref?: string;
  initialTimeframeLocked?: boolean;
  className?: string;
}

export function ChartSurface({
  symbol,
  timeframe,
  candles,
  tick,
  meta,
  markers = [],
  onTimeframeChange,
  expandHref,
  initialTimeframeLocked = false,
  className,
}: ChartSurfaceProps) {
  const toast = useToast();
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({ ...DEFAULT_CHART_SETTINGS });
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [layouts, setLayouts] = useState<ChartLayoutDTO[]>([]);
  const [templates, setTemplates] = useState<IndicatorTemplateDTO[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawingsOpen, setDrawingsOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loadedRef = useRef(false);
  const initialTimeframeLockedRef = useRef(initialTimeframeLocked);
  const layoutIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const applyWorkspace = useCallback(
    (workspace: ChartWorkspaceDTO, applySetup: boolean) => {
      setLayouts(workspace.layouts);
      setTemplates(workspace.templates);
      setDrawings(workspace.drawings);
      setLayoutId(workspace.layoutId);
      layoutIdRef.current = workspace.layoutId;
      if (applySetup) {
        const layout = workspace.layouts.find((item) => item.id === workspace.layoutId);
        setIndicators(layout?.indicators?.length ? layout.indicators : defaultIndicators());
        setChartSettings(layout?.chartSettings ?? { ...DEFAULT_CHART_SETTINGS });
      }
      loadedRef.current = true;
      setDirty(false);
    },
    [],
  );

  const load = useCallback(
    async (targetSymbol: string, targetLayoutId?: string | null, applySetup = false) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ symbol: targetSymbol });
        if (targetLayoutId) query.set("layoutId", targetLayoutId);
        const workspace = await api<ChartWorkspaceDTO>(`/api/chart?${query.toString()}`);
        applyWorkspace(workspace, applySetup);
        if (applySetup) {
          if (!initialTimeframeLockedRef.current) {
            const layout = workspace.layouts.find((item) => item.id === workspace.layoutId);
            if (layout?.timeframe && onTimeframeChange) onTimeframeChange(layout.timeframe as Timeframe);
          }
          initialTimeframeLockedRef.current = false;
        }
      } catch (error) {
        toast.push(errorMessage(error), "error");
      } finally {
        setLoading(false);
      }
    },
    [applyWorkspace, onTimeframeChange, toast],
  );

  useEffect(() => {
    const firstLoad = !loadedRef.current;
    void load(symbol, layoutIdRef.current, firstLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const save = useCallback(
    async (notify: boolean) => {
      if (!layoutIdRef.current) return;
      setSaving(true);
      try {
        await post("/api/chart", {
          action: "save",
          layoutId: layoutIdRef.current,
          symbol,
          timeframe,
          indicators,
          chartSettings,
          drawings,
        });
        setDirty(false);
        if (notify) toast.push("Chart layout saved.", "success");
      } catch (error) {
        if (notify) toast.push(errorMessage(error), "error");
      } finally {
        setSaving(false);
      }
    },
    [chartSettings, drawings, indicators, symbol, timeframe, toast],
  );

  useEffect(() => {
    if (!loadedRef.current) return;
    setDirty(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save(false);
    }, 1800);
    return () => window.clearTimeout(saveTimer.current);
  }, [indicators, chartSettings, drawings, save]);

  const changeIndicators = useCallback((next: IndicatorInstance[]) => setIndicators(next), []);

  const toggleIndicator = useCallback(
    (id: string, visible: boolean) =>
      setIndicators((current) => current.map((item) => (item.id === id ? { ...item, visible } : item))),
    [],
  );

  async function saveTemplate() {
    const name = window.prompt("Name this indicator template");
    if (!name) return;
    try {
      const template = await post<IndicatorTemplateDTO>("/api/chart", {
        action: "template.save",
        name,
        indicators,
      });
      setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
      toast.push(`Template "${template.name}" saved.`, "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!window.confirm("Delete this indicator template?")) return;
    try {
      await post("/api/chart", { action: "template.delete", templateId });
      setTemplates((current) => current.filter((item) => item.id !== templateId));
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  async function createLayout() {
    if (!layoutId) return;
    const name = window.prompt("Name this chart layout");
    if (!name) return;
    try {
      await post<ChartLayoutDTO>("/api/chart", {
        action: "layout.create",
        name,
        symbol,
        timeframe,
        indicators,
        chartSettings,
        drawings,
      });
      setLayoutsOpen(false);
      await load(symbol, layoutIdRef.current, false);
      toast.push(`Layout "${name}" created.`, "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  async function deleteLayout(id: string) {
    if (!window.confirm("Delete this chart layout and its drawings? This cannot be undone.")) return;
    try {
      await post("/api/chart", { action: "layout.delete", layoutId: id });
      setLayoutsOpen(false);
      await load(symbol, null, true);
      toast.push("Chart layout deleted.", "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  async function selectLayout(nextId: string) {
    if (nextId === layoutId) return;
    setLayoutsOpen(false);
    await load(symbol, nextId, true);
  }

  const activeDrawings = useMemo(() => drawings.filter((drawing) => drawing.visible), [drawings]);

  function updateSelected(patch: Partial<ChartDrawing> | ((drawing: ChartDrawing) => ChartDrawing)) {
    if (!selectedId) return;
    setDrawings((current) =>
      current.map((drawing) =>
        drawing.id === selectedId
          ? typeof patch === "function"
            ? patch(drawing)
            : { ...drawing, ...patch }
          : drawing,
      ),
    );
  }

  const selected = drawings.find((drawing) => drawing.id === selectedId) ?? null;

  return (
    <div className={clsx("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] px-2 py-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayoutsOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow"
            title="Chart layouts and templates"
          >
            <Layers className="size-3" />
            {layouts.find((item) => item.id === layoutId)?.name ?? "Layouts"}
            <ChevronDown className="size-3" />
          </button>
          {layoutsOpen ? (
            <div className="absolute top-full left-0 z-40 mt-1 w-64 rounded-xl border border-white/[0.1] bg-ink-850 p-2 shadow-2xl">
              <p className="px-1 pb-1 text-[9px] tracking-wider text-white/35 uppercase">Layouts</p>
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {layouts.map((layout) => (
                  <div key={layout.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void selectLayout(layout.id)}
                      className={clsx(
                        "flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition",
                        layout.id === layoutId ? "bg-acid/10 text-acid" : "text-fog hover:bg-white/[0.05] hover:text-snow",
                      )}
                    >
                      {layout.id === layoutId ? <Check className="size-3" /> : <Layers className="size-3" />}
                      <span className="truncate">{layout.name}</span>
                      {layout.symbol ? <span className="ml-auto font-mono text-[9px] text-white/30">{layout.symbol}</span> : null}
                    </button>
                    {layouts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => void deleteLayout(layout.id)}
                        className="rounded p-1 text-white/20 opacity-0 transition hover:text-rose group-hover:opacity-100"
                        aria-label="Delete layout"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => void createLayout()} className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-fog hover:bg-white/[0.05] hover:text-snow">
                <Plus className="size-3" /> New layout from current chart
              </button>
              <div className="my-1.5 h-px bg-white/[0.06]" />
              <p className="px-1 pb-1 text-[9px] tracking-wider text-white/35 uppercase">Indicator templates</p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {templates.map((template) => (
                  <div key={template.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        changeIndicators(template.indicators);
                        setLayoutsOpen(false);
                        toast.push(`Applied template "${template.name}".`, "success");
                      }}
                      className="flex-1 truncate rounded px-2 py-1.5 text-left text-[11px] text-fog hover:bg-white/[0.05] hover:text-snow"
                    >
                      {template.name}
                      <span className="ml-1.5 text-[9px] text-white/30">{template.indicators.length} studies</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTemplate(template.id)}
                      className="rounded p-1 text-white/20 opacity-0 transition hover:text-rose group-hover:opacity-100"
                      aria-label="Delete template"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                {templates.length === 0 ? <p className="px-2 py-1 text-[10px] text-white/30">No templates yet.</p> : null}
              </div>
              <button type="button" onClick={() => void saveTemplate()} className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-fog hover:bg-white/[0.05] hover:text-snow">
                <Save className="size-3" /> Save current indicators as template
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow"
        >
          <SlidersHorizontal className="size-3" /> Indicators
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow"
        >
          <Settings2 className="size-3" /> Settings
        </button>
        <button
          type="button"
          onClick={() => setDrawingsOpen(true)}
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition hover:bg-white/[0.05]",
            selected ? "text-acid" : "text-fog hover:text-snow",
          )}
        >
          <Pencil className="size-3" /> Drawings
          <span className="font-mono text-[9px] text-white/35">{activeDrawings.length}</span>
        </button>

        <span className="ml-auto flex items-center gap-1">
          <span className={clsx("text-[9px]", dirty ? "text-gold" : "text-white/30")}>{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow"
          >
            <Save className="size-3" /> Save
          </button>
          {expandHref ? (
            <Link href={expandHref} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-fog transition hover:bg-white/[0.05] hover:text-snow">
              <Maximize2 className="size-3" /> Expand chart
            </Link>
          ) : null}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute top-2 left-2 z-20 flex flex-col gap-0.5 rounded-lg border border-white/[0.07] bg-ink-900/85 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setActiveTool(null);
              setSelectedId(null);
            }}
            title="Select and move drawings"
            aria-pressed={!activeTool}
            className={clsx(
              "grid size-7 place-items-center rounded-md transition",
              !activeTool ? "bg-white/10 text-snow" : "text-fog hover:bg-white/[0.07] hover:text-snow",
            )}
          >
            <MousePointer2 className="size-3.5" />
          </button>
          <div className="my-0.5 h-px bg-white/[0.06]" />
          {DRAWING_TOOLS.map((tool) => (
            <ToolButton
              key={tool.tool}
              tool={tool.tool}
              active={activeTool === tool.tool}
              onClick={() => setActiveTool((current) => (current === tool.tool ? null : tool.tool))}
            />
          ))}
          {selected ? (
            <>
              <div className="my-0.5 h-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => {
                  setDrawings((current) => current.filter((drawing) => drawing.id !== selected.id));
                  setSelectedId(null);
                }}
                title="Delete selected drawing"
                className="grid size-7 place-items-center rounded-md text-rose/80 transition hover:bg-rose/10 hover:text-rose"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : null}
        </div>

        {activeTool ? (
          <div className="pointer-events-none absolute top-2 left-12 z-20 rounded-md border border-acid/20 bg-ink-900/85 px-2 py-1 text-[9px] text-acid/80 backdrop-blur">
            {DRAWING_TOOLS.find((tool) => tool.tool === activeTool)?.label} · {DRAWING_TOOLS.find((tool) => tool.tool === activeTool)?.hint}
          </div>
        ) : null}

        <PriceChart
          candles={candles}
          tick={tick}
          precision={meta?.precision ?? 5}
          pipSize={meta?.pipSize ?? 0.0001}
          timeframe={timeframe}
          markers={markers}
          indicators={indicators}
          chartSettings={chartSettings}
          drawings={activeDrawings}
          activeTool={activeTool}
          selectedDrawingId={selectedId}
          onToggleIndicator={toggleIndicator}
          onOpenIndicatorManager={() => setManagerOpen(true)}
          onDrawingsChange={(next) => {
            setDrawings((current) => {
              const hidden = current.filter((drawing) => !drawing.visible);
              return [...next, ...hidden];
            });
            if (selectedId && !next.some((drawing) => drawing.id === selectedId)) setSelectedId(null);
          }}
          onSelectDrawing={setSelectedId}
        />
        {loading ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-ink-900/50 backdrop-blur-[1px]">
            <span className="size-4 animate-spin rounded-full border border-acid/30 border-t-acid" />
          </div>
        ) : null}
      </div>

      {managerOpen ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div>
                <h3 className="text-[14px] font-semibold">Indicators</h3>
                <p className="text-[10.5px] text-fog">Add studies, tune parameters and save reusable templates.</p>
              </div>
              <button type="button" onClick={() => setManagerOpen(false)} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[58vh] space-y-2 overflow-y-auto p-4">
              {indicators.length === 0 ? (
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center text-[11px] text-fog">
                  No studies on the chart. Add one below.
                </p>
              ) : null}
              {indicators.map((instance) => {
                const catalog = INDICATOR_CATALOG.find((entry) => entry.kind === instance.kind);
                return (
                  <div key={instance.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleIndicator(instance.id, !instance.visible)}
                        className="grid size-6 place-items-center rounded text-fog hover:bg-white/[0.06] hover:text-snow"
                        aria-label={instance.visible ? "Hide indicator" : "Show indicator"}
                      >
                        {instance.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-snow">{catalog?.name ?? instance.kind}</p>
                        <p className="text-[9.5px] text-fog">{indicatorLabel(instance)} · {catalog?.pane ? "Lower pane" : "Price overlay"}</p>
                      </div>
                      <input
                        type="color"
                        value={instance.color}
                        onChange={(event) =>
                          setIndicators((current) =>
                            current.map((item) => (item.id === instance.id ? { ...item, color: event.target.value } : item)),
                          )
                        }
                        className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
                        aria-label="Indicator colour"
                      />
                      <button
                        type="button"
                        onClick={() => setIndicators((current) => current.filter((item) => item.id !== instance.id))}
                        className="rounded p-1 text-white/30 hover:text-rose"
                        aria-label="Remove indicator"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      {instance.kind === "macd" ? (
                        <>
                          <ParamField label="Fast" value={instance.params.fast ?? 12} min={1} max={200} onChange={(value) => updateParam(instance.id, "fast", value)} />
                          <ParamField label="Slow" value={instance.params.slow ?? 26} min={2} max={400} onChange={(value) => updateParam(instance.id, "slow", value)} />
                          <ParamField label="Signal" value={instance.params.signal ?? 9} min={1} max={100} onChange={(value) => updateParam(instance.id, "signal", value)} />
                        </>
                      ) : (
                        <>
                          <ParamField label="Period" value={instance.params.period ?? 14} min={1} max={400} onChange={(value) => updateParam(instance.id, "period", value)} />
                          {instance.kind === "bollinger" ? (
                            <ParamField label="Deviation" value={instance.params.multiplier ?? 2} min={0.1} max={10} step={0.1} onChange={(value) => updateParam(instance.id, "multiplier", value)} />
                          ) : null}
                          {instance.kind === "rsi" ? (
                            <>
                              <ParamField label="Overbought" value={instance.params.overbought ?? 70} min={50} max={100} onChange={(value) => updateParam(instance.id, "overbought", value)} />
                              <ParamField label="Oversold" value={instance.params.oversold ?? 30} min={0} max={50} onChange={(value) => updateParam(instance.id, "oversold", value)} />
                            </>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/[0.07] p-4">
              <p className="mb-2 text-[9px] tracking-wider text-white/35 uppercase">Add indicator</p>
              <div className="flex flex-wrap gap-1.5">
                {INDICATOR_CATALOG.map((entry) => (
                  <button
                    key={entry.kind}
                    type="button"
                    onClick={() => setIndicators((current) => [...current, createIndicator(entry.kind)])}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10.5px] text-fog transition hover:border-white/20 hover:text-snow"
                    title={entry.description}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void saveTemplate()} className="btn btn-secondary btn-sm">
                  <Save className="size-3" /> Save as template
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndicators(defaultIndicators());
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Reset defaults
                </button>
                <button type="button" onClick={() => setManagerOpen(false)} className="btn btn-primary btn-sm ml-auto">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.09] bg-ink-850 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[14px] font-semibold">Chart settings</h3>
                <p className="text-[10.5px] text-fog">Presentation only — prices and execution are unchanged.</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between text-[11.5px] text-snow">
                <span>Volume histogram</span>
                <input
                  type="checkbox"
                  checked={chartSettings.showVolume}
                  onChange={(event) => setChartSettings((current) => ({ ...current, showVolume: event.target.checked }))}
                  className="size-4 accent-acid"
                />
              </label>
              <label className="flex items-center justify-between text-[11.5px] text-snow">
                <span>Grid lines</span>
                <input
                  type="checkbox"
                  checked={chartSettings.showGrid}
                  onChange={(event) => setChartSettings((current) => ({ ...current, showGrid: event.target.checked }))}
                  className="size-4 accent-acid"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10.5px] text-fog">
                  Up candle
                  <input
                    type="color"
                    value={chartSettings.upColor ?? "#c9f75c"}
                    onChange={(event) => setChartSettings((current) => ({ ...current, upColor: event.target.value }))}
                    className="mt-1 h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </label>
                <label className="text-[10.5px] text-fog">
                  Down candle
                  <input
                    type="color"
                    value={chartSettings.downColor ?? "#ff7d7d"}
                    onChange={(event) => setChartSettings((current) => ({ ...current, downColor: event.target.value }))}
                    className="mt-1 h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setChartSettings({ ...DEFAULT_CHART_SETTINGS })}
                className="btn btn-secondary flex-1"
              >
                Reset colours
              </button>
              <button type="button" onClick={() => setSettingsOpen(false)} className="btn btn-primary flex-1">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {drawingsOpen ? (
        <div className="fixed inset-0 z-[95] flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div>
                <h3 className="text-[14px] font-semibold">Drawing objects</h3>
                <p className="text-[10.5px] text-fog">{symbol} · saved in price and time coordinates</p>
              </div>
              <button type="button" onClick={() => setDrawingsOpen(false)} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {drawings.length === 0 ? (
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center text-[11px] text-fog">
                  No drawings yet. Pick a tool on the left and click the chart.
                </p>
              ) : null}
              {drawings.map((drawing) => (
                <div
                  key={drawing.id}
                  className={clsx(
                    "rounded-xl border p-3 transition",
                    drawing.id === selectedId ? "border-acid/30 bg-acid/[0.04]" : "border-white/[0.07] bg-white/[0.02]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(drawing.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[11.5px] font-medium text-snow">
                        {DRAWING_TOOLS.find((tool) => tool.tool === drawing.tool)?.label ?? drawing.tool}
                      </p>
                      <p className="text-[9.5px] text-fog">
                        {drawing.points.length} anchor{drawing.points.length === 1 ? "" : "s"} · {drawing.style.color}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDrawings((current) =>
                          current.map((item) => (item.id === drawing.id ? { ...item, visible: !item.visible } : item)),
                        )
                      }
                      className="rounded p-1 text-white/35 hover:text-snow"
                      aria-label="Toggle drawing visibility"
                    >
                      {drawing.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrawings((current) => current.filter((item) => item.id !== drawing.id));
                        if (selectedId === drawing.id) setSelectedId(null);
                      }}
                      className="rounded p-1 text-white/30 hover:text-rose"
                      aria-label="Delete drawing"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {drawing.id === selectedId ? (
                    <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {DRAWING_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateSelected({ style: { ...drawing.style, color } })}
                            className={clsx("size-5 rounded-full border", drawing.style.color === color ? "border-snow" : "border-white/10")}
                            style={{ backgroundColor: color }}
                            aria-label={`Colour ${color}`}
                          />
                        ))}
                        <input
                          type="color"
                          value={drawing.style.color}
                          onChange={(event) => updateSelected({ style: { ...drawing.style, color: event.target.value } })}
                          className="ml-1 h-5 w-7 cursor-pointer rounded border border-white/10 bg-transparent"
                          aria-label="Custom colour"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-fog">
                        <label className="flex items-center gap-1">
                          Width
                          <input
                            type="number"
                            min={1}
                            max={6}
                            value={drawing.style.lineWidth}
                            onChange={(event) =>
                              updateSelected({
                                style: { ...drawing.style, lineWidth: Math.min(6, Math.max(1, Number(event.target.value) || 1)) },
                              })
                            }
                            className="h-6 w-12 rounded border border-white/10 bg-black/25 px-1 text-right font-mono text-[10px] text-snow"
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          Style
                          <select
                            value={drawing.style.lineStyle}
                            onChange={(event) =>
                              updateSelected({
                                style: { ...drawing.style, lineStyle: Number(event.target.value) as 0 | 1 | 2 },
                              })
                            }
                            className="h-6 rounded border border-white/10 bg-ink-850 px-1 text-[10px] text-snow"
                          >
                            <option value={0}>Solid</option>
                            <option value={1}>Dotted</option>
                            <option value={2}>Dashed</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          Fill
                          <input
                            type="range"
                            min={0}
                            max={0.5}
                            step={0.02}
                            value={drawing.style.fillOpacity}
                            onChange={(event) =>
                              updateSelected({ style: { ...drawing.style, fillOpacity: Number(event.target.value) } })
                            }
                            className="w-16 accent-acid"
                          />
                        </label>
                      </div>
                      {drawing.tool === "fib" ? (
                        <div>
                          <p className="mb-1 text-[9px] tracking-wider text-white/35 uppercase">Fibonacci levels</p>
                          <div className="flex flex-wrap gap-1">
                            {FIB_RATIOS.map((ratio) => {
                              const enabled = drawing.style.levels?.[String(ratio)] !== false;
                              return (
                                <button
                                  key={ratio}
                                  type="button"
                                  onClick={() =>
                                    updateSelected({
                                      style: {
                                        ...drawing.style,
                                        levels: { ...(drawing.style.levels ?? {}), [String(ratio)]: !enabled },
                                      },
                                    })
                                  }
                                  className={clsx(
                                    "rounded border px-1.5 py-0.5 font-mono text-[9px] transition",
                                    enabled ? "border-acid/30 bg-acid/10 text-acid" : "border-white/10 text-white/35",
                                  )}
                                >
                                  {(ratio * 100).toFixed(1)}%
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {drawing.tool === "text" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const text = window.prompt("Drawing note", drawing.style.text ?? "");
                            if (text != null) updateSelected({ style: { ...drawing.style, text: text.slice(0, 240) } });
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Edit text
                        </button>
                      ) : null}
                      <p className="text-[9px] text-white/35">
                        Drag the anchor handles on the chart to move this drawing. Press Delete to remove it.
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="border-t border-white/[0.07] p-3 text-[10px] text-fog">
              Drawings are private to your account, saved per layout and instrument, and survive timeframe changes and refreshes.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  function updateParam(id: string, key: keyof IndicatorInstance["params"], value: number) {
    setIndicators((current) =>
      current.map((item) => (item.id === id ? { ...item, params: { ...item.params, [key]: value } } : item)),
    );
  }
}
