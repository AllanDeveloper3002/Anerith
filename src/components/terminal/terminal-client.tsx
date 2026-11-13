"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  History,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import type { PriceMarker } from "@/components/terminal/price-chart";
import { ChartSurface } from "@/components/terminal/chart-surface";
import { OrderTicket, type InstrumentMeta } from "@/components/terminal/order-ticket";
import { WatchlistPanel } from "@/components/terminal/watchlist-panel";
import { useToast } from "@/components/toast-provider";
import { EmptyState, Progress } from "@/components/ui";
import { api, errorMessage, patch, post } from "@/lib/client";
import { formatPrice } from "@/lib/instruments";
import { fmtDateTime, fmtSignedUsd, fmtUsd, timeAgo } from "@/lib/format";
import { phaseLabel, planName } from "@/lib/challenges";
import type { Candle, Quote, Timeframe } from "@/lib/market";
import { TIMEFRAMES } from "@/lib/market";
import type { ExecutionEventDTO, OrderDTO, PositionDTO, TradeStateDTO } from "@/lib/types";

interface QuotesResponse {
  quotes: Quote[];
  instruments: InstrumentMeta[];
  provider: string;
  simulated: boolean;
  serverTime: number;
}

interface StreamTick {
  quote: Quote;
  candle: Candle | null;
  serverTime: number;
}

type TerminalTab = "positions" | "orders" | "history" | "events";

function newClientOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function roundToStep(value: number, step: number): number {
  const safeStep = step > 0 ? step : 0.01;
  return Number((Math.round(value / safeStep) * safeStep).toFixed(8));
}

function toLocalDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function closeReasonLabel(reason: string): string {
  return reason.replaceAll("_", " ");
}

function ChangeChip({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={clsx("badge font-mono", positive ? "badge-acid" : "badge-rose")}>
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function RiskMeter({
  label,
  value,
  limit,
  progress,
  detail,
}: {
  label: string;
  value: string;
  limit: string;
  progress: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-medium tracking-wider text-fog uppercase">{label}</span>
        <span className="font-mono text-snow">{value}</span>
      </div>
      <Progress
        value={progress}
        tone={progress >= 80 ? "rose" : progress >= 50 ? "gold" : "acid"}
        className="mt-2"
      />
      <div className="mt-1 flex items-center justify-between text-[9px] text-white/35">
        <span>{detail}</span>
        <span className="font-mono">{limit}</span>
      </div>
    </div>
  );
}

export function TerminalClient({
  initial,
  initialQuotes,
  initialInstruments,
  initialCandles,
  initialCandlesSimulated = true,
  initialSymbol,
}: {
  initial: TradeStateDTO;
  initialQuotes: Quote[];
  initialInstruments: InstrumentMeta[];
  initialCandles: Candle[];
  initialCandlesSimulated?: boolean;
  initialSymbol: string;
}) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [instruments] = useState(initialInstruments);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [candles, setCandles] = useState(initialCandles);
  const candlesRef = useRef<Candle[]>(initialCandles);
  const [candlesSimulated, setCandlesSimulated] = useState(initialCandlesSimulated);
  const [tick, setTick] = useState<Candle | null>(null);
  const [streamLive, setStreamLive] = useState(false);
  const [tab, setTab] = useState<TerminalTab>("positions");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<PositionDTO | null>(null);
  const [closeTarget, setCloseTarget] = useState<PositionDTO | null>(null);
  const [pendingTarget, setPendingTarget] = useState<OrderDTO | null>(null);
  const [events, setEvents] = useState<ExecutionEventDTO[]>(initial.recentEvents);
  const [eventsLoading, setEventsLoading] = useState(false);

  const account = state.account;
  const meta = instruments.find((item) => item.symbol === symbol);
  const quote = quotes.find((item) => item.symbol === symbol);
  const hasPosition = state.positions.some((item) => item.symbol === symbol);

  const refreshState = useCallback(async () => {
    try {
      const next = await api<TradeStateDTO>("/api/trade/state");
      setState(next);
      setEvents((current) => (current.length === 0 ? next.recentEvents : current));
    } catch {
      /* keep the last server snapshot */
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await api<{ events: ExecutionEventDTO[] }>("/api/trade/events?limit=100");
      setEvents(data.events);
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setEventsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(refreshState, 4000);
    return () => window.clearInterval(timer);
  }, [refreshState]);

  useEffect(() => {
    if (tab === "events") void loadEvents();
  }, [tab, loadEvents]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<QuotesResponse>("/api/market/quotes");
        setQuotes(data.quotes);
      } catch {
        /* quote polling is best effort; stale prices fail closed server-side */
      }
    };
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTick(null);
    api<{ candles: Candle[]; simulated: boolean }>(`/api/market/candles?symbol=${symbol}&tf=${timeframe}&limit=500`)
      .then((data) => {
        if (!cancelled) {
          setCandles(data.candles);
          setCandlesSimulated(data.simulated);
        }
      })
      .catch((error) => {
        if (!cancelled) toast.push(errorMessage(error), "error");
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, toast]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retry: number | undefined;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(`/api/market/stream?symbol=${symbol}&tf=${timeframe}`);
      source.addEventListener("open", () => {
        if (!cancelled) setStreamLive(true);
      });
      source.addEventListener("tick", (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse((event as MessageEvent).data) as StreamTick;
          if (payload.candle) {
            setTick(payload.candle);
          } else {
            const latest = candlesRef.current[candlesRef.current.length - 1];
            setTick(
              latest
                ? {
                    ...latest,
                    close: payload.quote.mid,
                    high: Math.max(latest.high, payload.quote.mid),
                    low: Math.min(latest.low, payload.quote.mid),
                  }
                : null,
            );
          }
          setQuotes((current) =>
            current.map((item) => (item.symbol === payload.quote.symbol ? payload.quote : item)),
          );
        } catch {
          /* ignore malformed stream frames */
        }
      });
      source.onerror = () => {
        setStreamLive(false);
        source?.close();
        source = null;
        if (!cancelled) retry = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
      source?.close();
      setStreamLive(false);
    };
  }, [symbol, timeframe]);

  const markers = useMemo(() => {
    const result: PriceMarker[] = [];
    for (const item of state.positions.filter((position) => position.symbol === symbol)) {
      result.push({
        price: item.entryPrice,
        title: `${item.side.toUpperCase()} ${item.lots.toFixed(2)}`,
        color: "#56cfe1",
      });
      if (item.sl) {
        result.push({ price: item.sl, title: `SL ${item.lots.toFixed(2)}`, color: "#ff7d7d", dashed: true });
      }
      if (item.tp) {
        result.push({ price: item.tp, title: `TP ${item.lots.toFixed(2)}`, color: "#c9f75c", dashed: true });
      }
    }
    return result;
  }, [state.positions, symbol]);

  async function closeAll() {
    if (!window.confirm("Close every open position at the current market price?")) return;
    setClosingAll(true);
    try {
      const result = await post<{ message: string }>("/api/trade/close-all");
      toast.push(result.message, "success");
      await refreshState();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setClosingAll(false);
    }
  }

  async function cancelOrder(orderId: string) {
    setBusyId(orderId);
    try {
      const result = await post<{ message: string }>(`/api/trade/orders/${orderId}/cancel`);
      toast.push(result.message, "success");
      await refreshState();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusyId(null);
    }
  }

  const objectives = account.objectives;
  const executable = meta?.tradingStatus === "open" && account.status === "active";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
        <span className="badge badge-acid">{phaseLabel(account)}</span>
        <span className="badge badge-muted capitalize">{account.status}</span>
        <span className="hidden text-[11px] text-fog sm:inline">{planName(account.plan)}</span>
        <span className="hidden font-mono text-[11px] text-fog sm:inline">{account.number}</span>
        <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
        <span className="text-[11px] text-fog">
          Equity <span className="font-mono text-snow">{fmtUsd(account.equity)}</span>
        </span>
        <span className="hidden text-[11px] text-fog md:inline">
          Balance <span className="font-mono text-snow">{fmtUsd(account.balance)}</span>
        </span>
        <span
          className={clsx(
            "hidden text-[11px] md:inline",
            account.floating >= 0 ? "text-acid" : "text-rose",
          )}
        >
          Floating <span className="font-mono">{fmtSignedUsd(account.floating)}</span>
        </span>
        <span className="hidden text-[11px] text-fog lg:inline">
          Margin <span className="font-mono text-snow">{fmtUsd(account.margin)}</span>
        </span>
        <span className="hidden text-[11px] text-fog xl:inline">
          Free <span className="font-mono text-snow">{fmtUsd(account.freeMargin)}</span>
        </span>
        <span
          className={clsx(
            "badge ml-auto",
            account.simulatedExecution ? "badge-gold" : "badge-sky",
          )}
          title={`Execution provider: ${account.executionProvider}`}
        >
          <ShieldCheck className="size-3" />
          {account.simulatedExecution ? "Simulated execution" : account.executionProvider}
        </span>
        <span
          className={clsx(
            "flex items-center gap-1.5 text-[10.5px] font-medium",
            streamLive ? "text-acid" : "text-gold",
          )}
        >
          <span className={streamLive ? "live-dot" : "size-1.5 rounded-full bg-gold"} />
          {streamLive ? "Stream live" : "Reconnecting"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <RiskMeter
          label="Daily loss"
          value={`${fmtUsd(objectives.dailyLossUsedUsd)} used`}
          limit={`Limit ${fmtUsd(objectives.dailyLossLimitUsd)}`}
          progress={objectives.dailyLossProgressPct}
          detail={`${objectives.dailyLossPct.toFixed(1)}% · resets ${String(objectives.dailyResetHour).padStart(2, "0")}:${String(objectives.dailyResetMinute).padStart(2, "0")} ${objectives.dailyResetTimezone}`}
        />
        <RiskMeter
          label="Drawdown"
          value={`${fmtUsd(objectives.drawdownUsedUsd)} used`}
          limit={`Limit ${fmtUsd(objectives.maxDrawdownLimitUsd)}`}
          progress={objectives.drawdownProgressPct}
          detail={`${objectives.maxDrawdownPct.toFixed(1)}% ${objectives.drawdownMode}`}
        />
        <RiskMeter
          label="Profit target"
          value={objectives.profitTargetUsd == null ? "Funded" : fmtUsd(objectives.profitCurrentUsd)}
          limit={objectives.profitTargetUsd == null ? "No target" : `Target ${fmtUsd(objectives.profitTargetUsd)}`}
          progress={objectives.profitProgressPct}
          detail={`${objectives.tradingDays}/${objectives.minTradingDays} trading days`}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            <p className="text-[9px] tracking-wider text-fog uppercase">Margin level</p>
            <p className="mt-1 font-mono text-[15px] text-snow">
              {account.marginLevel == null ? "—" : `${account.marginLevel.toFixed(1)}%`}
            </p>
            <p className="text-[9px] text-white/35">1:{account.leverage}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            <p className="text-[9px] tracking-wider text-fog uppercase">Open positions</p>
            <p className="mt-1 font-mono text-[15px] text-snow">{state.positions.length}</p>
            <p className="text-[9px] text-white/35">{state.orders.length} pending</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_332px]">
        <WatchlistPanel
          instruments={instruments}
          quotes={quotes}
          symbol={symbol}
          onSelect={setSymbol}
          className="hidden xl:flex xl:max-h-[820px]"
        />

        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value)}
                    className="h-8 appearance-none rounded-lg border border-white/10 bg-ink-850 pr-7 pl-2.5 font-mono text-[12px] text-snow focus:border-acid/50 focus:outline-none"
                    aria-label="Trading instrument"
                  >
                    {instruments.map((item) => (
                      <option key={item.symbol} value={item.symbol}>
                        {item.symbol}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-fog" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] text-fog">{meta?.name}</p>
                  <p className="text-[9px] tracking-wider text-white/30 uppercase">
                    {meta?.session} · {meta?.tradingStatus}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-fog uppercase">Bid</p>
                  <p className="font-mono text-[14px] text-rose">
                    {quote ? formatPrice(symbol, quote.bid) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-fog uppercase">Ask</p>
                  <p className="font-mono text-[14px] text-acid">
                    {quote ? formatPrice(symbol, quote.ask) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-fog uppercase">Spread</p>
                  <p className="font-mono text-[11px] text-snow">
                    {quote ? `${(quote.spread / (meta?.pipSize ?? 0.0001)).toFixed(1)}p` : "—"}
                  </p>
                </div>
                {quote ? <ChangeChip value={quote.changePct} /> : null}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-1">
                {TIMEFRAMES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTimeframe(item.key)}
                    className={clsx(
                      "rounded-md px-1.5 py-1 font-mono text-[10px] transition",
                      timeframe === item.key
                        ? "bg-acid/15 text-acid"
                        : "text-fog hover:bg-white/[0.05] hover:text-snow",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9.5px] text-white/35">
              <span>24h high {quote ? formatPrice(symbol, quote.high24h) : "—"}</span>
              <span>24h low {quote ? formatPrice(symbol, quote.low24h) : "—"}</span>
              <span>Leverage 1:{account.leverage}</span>
              <span>
                Updated{" "}
                {quote ? new Date(quote.timestamp).toLocaleTimeString("en-US", { hour12: false }) : "—"}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Zap className="size-3 text-acid" />
                {quote?.simulated ? "Internal simulated market data" : quote?.provider ?? "Market data"}
              </span>
              {candlesSimulated && quote && !quote.simulated ? (
                <span className="text-amber-300/80">Chart history: internally simulated</span>
              ) : null}
            </div>
          </div>

          <ChartSurface
            symbol={symbol}
            timeframe={timeframe}
            candles={candles}
            tick={tick}
            meta={meta}
            markers={markers}
            expandHref={`/app/chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`}
            className="h-[620px] xl:h-[700px]"
          />
        </section>

        <OrderTicket
          account={account}
          symbol={symbol}
          quote={quote}
          meta={meta}
          hasPosition={hasPosition}
          onPlaced={refreshState}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] px-3 py-2">
          {(
            [
              { key: "positions", label: "Positions", count: state.positions.length },
              { key: "orders", label: "Pending orders", count: state.orders.length },
              { key: "history", label: "Recent closes", count: state.recentClosed.length },
              { key: "events", label: "Trade history", count: events.length },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition",
                tab === item.key
                  ? "bg-white/[0.07] text-snow"
                  : "text-fog hover:bg-white/[0.04] hover:text-snow",
              )}
            >
              {item.label}
              <span className="ml-1.5 font-mono text-[10px] text-white/35">{item.count}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className={clsx("text-[10.5px]", account.floating >= 0 ? "text-acid" : "text-rose")}>
              Floating {fmtSignedUsd(account.floating)}
            </span>
            {state.positions.length > 0 ? (
              <button type="button" onClick={closeAll} disabled={closingAll} className="btn btn-danger btn-sm">
                {closingAll ? "Closing…" : "Close all"}
              </button>
            ) : null}
            {tab === "events" ? (
              <button
                type="button"
                onClick={loadEvents}
                disabled={eventsLoading}
                className="btn btn-secondary btn-sm"
              >
                <RefreshCw className={clsx("size-3", eventsLoading && "animate-spin")} />
              </button>
            ) : null}
            <Link href="/app/history" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Full history
            </Link>
          </div>
        </div>

        {tab === "positions" ? (
          state.positions.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal className="size-5" />}
              title="No open positions"
              body="Use the ticket on the right to place a market, limit or stop order."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1040px]">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Market</th>
                    <th>SL / TP</th>
                    <th>Margin</th>
                    <th className="text-right">Floating P&L</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.positions.map((item) => {
                    const current = item.currentPrice ?? quote?.mid ?? null;
                    return (
                      <tr key={item.id} title={item.executionRef ? `Execution ${item.executionRef}` : undefined}>
                        <td>
                          <p className="font-mono text-[12px] text-snow">{item.symbol}</p>
                          <p className="text-[9.5px] text-fog">{timeAgo(item.openedAt)}</p>
                        </td>
                        <td>
                          <span className={clsx("badge", item.side === "buy" ? "badge-acid" : "badge-rose")}>
                            {item.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="font-mono text-[12px]">{item.lots.toFixed(2)}</td>
                        <td className="font-mono text-[12px] text-fog">
                          {formatPrice(item.symbol, item.entryPrice)}
                        </td>
                        <td className="font-mono text-[12px]">
                          {current != null ? formatPrice(item.symbol, current) : "—"}
                        </td>
                        <td className="font-mono text-[11px] text-fog">
                          {item.sl ? formatPrice(item.symbol, item.sl) : "—"} /{" "}
                          {item.tp ? formatPrice(item.symbol, item.tp) : "—"}
                        </td>
                        <td className="font-mono text-[11px] text-fog">{fmtUsd(item.margin)}</td>
                        <td
                          className={clsx(
                            "text-right font-mono text-[12px]",
                            item.floating >= 0 ? "text-acid" : "text-rose",
                          )}
                        >
                          {fmtSignedUsd(item.floating)}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setModifyTarget(item)}
                              className="btn btn-secondary btn-sm"
                            >
                              <ShieldCheck className="size-3" /> Modify
                            </button>
                            <button
                              type="button"
                              onClick={() => setCloseTarget(item)}
                              className="btn btn-danger btn-sm"
                            >
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "orders" ? (
          state.orders.length === 0 ? (
            <EmptyState
              icon={<Clock3 className="size-5" />}
              title="No pending orders"
              body="Limit and stop orders wait here until the market reaches your trigger."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[960px]">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Type</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Trigger</th>
                    <th>SL / TP</th>
                    <th>Placed</th>
                    <th>Expires</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono text-[12px] text-snow">{order.symbol}</td>
                      <td className="text-[11px] text-fog uppercase">{order.type}</td>
                      <td>
                        <span className={clsx("badge", order.side === "buy" ? "badge-acid" : "badge-rose")}>
                          {order.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono text-[12px]">{order.lots.toFixed(2)}</td>
                      <td className="font-mono text-[12px]">{formatPrice(order.symbol, order.price)}</td>
                      <td className="font-mono text-[11px] text-fog">
                        {order.sl ? formatPrice(order.symbol, order.sl) : "—"} /{" "}
                        {order.tp ? formatPrice(order.symbol, order.tp) : "—"}
                      </td>
                      <td className="text-[10px] text-fog">{timeAgo(order.createdAt)}</td>
                      <td className="text-[10px] text-fog">
                        {order.expiresAt ? fmtDateTime(order.expiresAt) : "GTC"}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPendingTarget(order)}
                            disabled={busyId === order.id}
                            className="btn btn-secondary btn-sm"
                          >
                            <Pencil className="size-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelOrder(order.id)}
                            disabled={busyId === order.id}
                            className="btn btn-danger btn-sm"
                          >
                            {busyId === order.id ? "…" : "Cancel"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "history" ? (
          state.recentClosed.length === 0 ? (
            <EmptyState title="No closed trades" body="Closed positions and their results will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Closed</th>
                    <th>Reason</th>
                    <th className="text-right">Commission</th>
                    <th className="text-right">Swap</th>
                    <th className="text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {state.recentClosed.map((trade) => (
                    <tr key={trade.id}>
                      <td className="font-mono text-[12px] text-snow">{trade.symbol}</td>
                      <td>
                        <span className={clsx("badge", trade.side === "buy" ? "badge-acid" : "badge-rose")}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono text-[12px]">{trade.lots.toFixed(2)}</td>
                      <td className="font-mono text-[11px] text-fog">
                        {formatPrice(trade.symbol, trade.entryPrice)}
                      </td>
                      <td className="font-mono text-[11px] text-fog">
                        {formatPrice(trade.symbol, trade.closePrice)}
                      </td>
                      <td className="text-[10px] text-fog">{timeAgo(trade.closedAt)}</td>
                      <td className="text-[10px] text-fog capitalize">{closeReasonLabel(trade.closeReason)}</td>
                      <td className="text-right font-mono text-[11px] text-fog">{fmtUsd(trade.commission)}</td>
                      <td className="text-right font-mono text-[11px] text-fog">{fmtSignedUsd(trade.swap)}</td>
                      <td
                        className={clsx(
                          "text-right font-mono text-[12px]",
                          trade.net >= 0 ? "text-acid" : "text-rose",
                        )}
                      >
                        {fmtSignedUsd(trade.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "events" ? (
          events.length === 0 ? (
            <EmptyState
              icon={<History className="size-5" />}
              title={eventsLoading ? "Loading trade history" : "No trade history yet"}
              body="Every order, fill, modification and close is recorded here with its engine reference."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1050px]">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Instrument</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Price</th>
                    <th className="text-right">Commission</th>
                    <th>Provider</th>
                    <th>Execution ref</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="text-[10px] whitespace-nowrap text-fog">{fmtDateTime(event.createdAt)}</td>
                      <td>
                        <span className="badge badge-muted capitalize">
                          {event.eventType.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="font-mono text-[11px] text-snow">{event.symbol ?? "—"}</td>
                      <td>
                        {event.side ? (
                          <span className={clsx("badge", event.side === "buy" ? "badge-acid" : "badge-rose")}>
                            {event.side.toUpperCase()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="font-mono text-[11px] text-fog">
                        {event.lots == null ? "—" : event.lots.toFixed(2)}
                      </td>
                      <td className="font-mono text-[11px] text-fog">
                        {event.price == null
                          ? "—"
                          : event.symbol
                            ? formatPrice(event.symbol, event.price)
                            : event.price.toFixed(5)}
                      </td>
                      <td className="text-right font-mono text-[11px] text-fog">{fmtUsd(event.commission)}</td>
                      <td className="text-[10px] text-fog">{event.provider}</td>
                      <td className="max-w-[130px] truncate font-mono text-[9.5px] text-white/35">
                        {event.executionRef ?? "—"}
                      </td>
                      <td className="text-[10px] text-fog">{event.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {modifyTarget ? (
        <ModifyDialog
          position={modifyTarget}
          onClose={() => setModifyTarget(null)}
          onSaved={async () => {
            setModifyTarget(null);
            await refreshState();
          }}
        />
      ) : null}

      {closeTarget ? (
        <PartialCloseDialog
          position={closeTarget}
          meta={instruments.find((item) => item.symbol === closeTarget.symbol)}
          onClose={() => setCloseTarget(null)}
          onSaved={async () => {
            setCloseTarget(null);
            await refreshState();
          }}
        />
      ) : null}

      {pendingTarget ? (
        <PendingOrderDialog
          order={pendingTarget}
          meta={instruments.find((item) => item.symbol === pendingTarget.symbol)}
          onClose={() => setPendingTarget(null)}
          onSaved={async () => {
            setPendingTarget(null);
            await refreshState();
          }}
        />
      ) : null}

      {!executable ? (
        <p className="rounded-lg border border-gold/20 bg-gold/[0.06] px-3 py-2 text-[10.5px] text-gold">
          {account.status !== "active"
            ? `Trading is disabled because this account is ${account.status}.`
            : `${symbol} is currently ${meta?.tradingStatus ?? "unavailable"} for new orders.`}
        </p>
      ) : null}
    </div>
  );
}

function ModifyDialog({
  position,
  onClose,
  onSaved,
}: {
  position: PositionDTO;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [sl, setSl] = useState(position.sl ? String(position.sl) : "");
  const [tp, setTp] = useState(position.tp ? String(position.tp) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const result = await patch<{ message: string }>(`/api/trade/positions/${position.id}`, {
        sl: sl.trim() ? Number(sl) : null,
        tp: tp.trim() ? Number(tp) : null,
      });
      toast.push(result.message, "success");
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.09] bg-ink-850 p-5 shadow-2xl">
        <h3 className="text-[15px] font-semibold">Modify {position.symbol}</h3>
        <p className="mt-0.5 text-[11.5px] text-fog">
          {position.side.toUpperCase()} {position.lots.toFixed(2)} lots · entry{" "}
          {formatPrice(position.symbol, position.entryPrice)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="modify-sl">
              Stop loss
            </label>
            <input
              id="modify-sl"
              type="number"
              step="any"
              value={sl}
              onChange={(event) => setSl(event.target.value)}
              className="input font-mono text-[12px]"
              placeholder="None"
            />
          </div>
          <div>
            <label className="label" htmlFor="modify-tp">
              Take profit
            </label>
            <input
              id="modify-tp"
              type="number"
              step="any"
              value={tp}
              onChange={(event) => setTp(event.target.value)}
              className="input font-mono text-[12px]"
              placeholder="None"
            />
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-white/35">
          Leave a field empty to remove protection. Levels are validated against the live server price.
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary flex-1">
            {busy ? "Saving…" : "Update levels"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartialCloseDialog({
  position,
  meta,
  onClose,
  onSaved,
}: {
  position: PositionDTO;
  meta: InstrumentMeta | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const lotStep = meta?.lotStep ?? 0.01;
  const [lots, setLots] = useState(position.lots.toFixed(2));
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<{ fingerprint: string; clientOrderId: string } | null>(null);
  const lotsNumber = Number(lots);
  const valid =
    Number.isFinite(lotsNumber) &&
    lotsNumber > 0 &&
    lotsNumber <= position.lots &&
    Math.abs(lotsNumber / lotStep - Math.round(lotsNumber / lotStep)) < 1e-6;
  const remaining = valid ? roundToStep(position.lots - lotsNumber, lotStep) : position.lots;
  const remainingInvalid = remaining > 0 && remaining < (meta?.minLots ?? 0.01);
  const portion = valid ? lotsNumber / position.lots : 0;
  const estimated = position.floating * portion;

  function setPortion(percent: number) {
    setLots(roundToStep(position.lots * percent, lotStep).toFixed(2));
  }

  async function close() {
    if (!valid) {
      toast.push("Enter a valid close volume.", "error");
      return;
    }
    if (remainingInvalid) {
      toast.push(`Remaining volume would be below the ${meta?.minLots ?? 0.01} lot minimum.`, "error");
      return;
    }
    const fingerprint = JSON.stringify({ positionId: position.id, lotsNumber });
    const clientOrderId =
      requestRef.current?.fingerprint === fingerprint
        ? requestRef.current.clientOrderId
        : newClientOrderId();
    requestRef.current = { fingerprint, clientOrderId };
    setBusy(true);
    try {
      const result = await post<{ message: string }>(`/api/trade/positions/${position.id}/close`, {
        lots: lotsNumber >= position.lots ? null : lotsNumber,
        clientOrderId,
      });
      requestRef.current = null;
      toast.push(result.message, "success");
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-ink-850 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">Close {position.symbol}</h3>
            <p className="mt-0.5 text-[11.5px] text-fog">
              {position.side.toUpperCase()} {position.lots.toFixed(2)} lots · floating{" "}
              <span className={position.floating >= 0 ? "text-acid" : "text-rose"}>
                {fmtSignedUsd(position.floating)}
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
            <X className="size-4" />
          </button>
        </div>

        <label className="label mt-4" htmlFor="close-lots">
          Volume to close
        </label>
        <input
          id="close-lots"
          type="number"
          min={meta?.minLots ?? 0.01}
          max={position.lots}
          step={lotStep}
          value={lots}
          onChange={(event) => setLots(event.target.value)}
          className="input font-mono text-[13px]"
        />
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[0.25, 0.5, 0.75, 1].map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => setPortion(percent)}
              className="rounded-md border border-white/[0.07] py-1.5 font-mono text-[10px] text-fog hover:border-white/20 hover:text-snow"
            >
              {percent === 1 ? "Full" : `${percent * 100}%`}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1.5 rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[10.5px]">
          <div className="flex justify-between text-fog">
            <span>Remaining</span>
            <span className="font-mono text-snow">{remaining.toFixed(2)} lots</span>
          </div>
          <div className="flex justify-between text-fog">
            <span>Estimated P&L share</span>
            <span className={clsx("font-mono", estimated >= 0 ? "text-acid" : "text-rose")}>
              {fmtSignedUsd(estimated)}
            </span>
          </div>
          <p className="pt-1 text-[9px] leading-relaxed text-white/30">
            The server calculates final realized profit, commission and swap from the live execution price.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Keep position
          </button>
          <button type="button" onClick={close} disabled={busy || !valid} className="btn btn-danger flex-1">
            {busy ? "Closing…" : lotsNumber >= position.lots ? "Close position" : "Close portion"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingOrderDialog({
  order,
  meta,
  onClose,
  onSaved,
}: {
  order: OrderDTO;
  meta: InstrumentMeta | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [price, setPrice] = useState(String(order.price));
  const [lots, setLots] = useState(order.lots.toFixed(2));
  const [sl, setSl] = useState(order.sl ? String(order.sl) : "");
  const [tp, setTp] = useState(order.tp ? String(order.tp) : "");
  const [expiry, setExpiry] = useState(toLocalDateTime(order.expiresAt));
  const [busy, setBusy] = useState(false);

  async function save() {
    const priceNumber = Number(price);
    const lotsNumber = Number(lots);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      toast.push("Enter a valid trigger price.", "error");
      return;
    }
    if (!Number.isFinite(lotsNumber) || lotsNumber <= 0) {
      toast.push("Enter a valid volume.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await patch<{ message: string }>(`/api/trade/orders/${order.id}`, {
        price: priceNumber,
        lots: lotsNumber,
        sl: sl.trim() ? Number(sl) : null,
        tp: tp.trim() ? Number(tp) : null,
        expiresAt: expiry ? new Date(expiry).toISOString() : null,
      });
      toast.push(result.message, "success");
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-ink-850 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">Edit pending {order.symbol}</h3>
            <p className="mt-0.5 text-[11.5px] text-fog capitalize">
              {order.side} {order.type} · {meta?.minLots ?? 0.01}–{meta?.maxLots ?? 50} lots
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pending-price">
              Trigger price
            </label>
            <input
              id="pending-price"
              type="number"
              step="any"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="input font-mono text-[12px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="pending-lots">
              Volume
            </label>
            <input
              id="pending-lots"
              type="number"
              min={meta?.minLots ?? 0.01}
              max={meta?.maxLots ?? 50}
              step={meta?.lotStep ?? 0.01}
              value={lots}
              onChange={(event) => setLots(event.target.value)}
              className="input font-mono text-[12px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="pending-sl">
              Stop loss
            </label>
            <input
              id="pending-sl"
              type="number"
              step="any"
              value={sl}
              onChange={(event) => setSl(event.target.value)}
              className="input font-mono text-[12px]"
              placeholder="None"
            />
          </div>
          <div>
            <label className="label" htmlFor="pending-tp">
              Take profit
            </label>
            <input
              id="pending-tp"
              type="number"
              step="any"
              value={tp}
              onChange={(event) => setTp(event.target.value)}
              className="input font-mono text-[12px]"
              placeholder="None"
            />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="pending-expiry">
              Expiry
            </label>
            <input
              id="pending-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className="input font-mono text-[12px]"
            />
            <p className="mt-1 text-[9.5px] text-white/35">Leave blank for good-till-cancelled.</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary flex-1">
            {busy ? "Saving…" : "Update order"}
          </button>
        </div>
      </div>
    </div>
  );
}
