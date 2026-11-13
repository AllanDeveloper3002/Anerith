"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  ShieldCheck,
  SidebarClose,
  SidebarOpen,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { ChartSurface } from "@/components/terminal/chart-surface";
import { OrderTicket, type InstrumentMeta } from "@/components/terminal/order-ticket";
import { WatchlistPanel } from "@/components/terminal/watchlist-panel";
import type { PriceMarker } from "@/components/terminal/price-chart";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage } from "@/lib/client";
import { formatPrice } from "@/lib/instruments";
import { fmtSignedUsd, fmtUsd } from "@/lib/format";
import { phaseLabel } from "@/lib/challenges";
import { TIMEFRAMES, type Candle, type Quote, type Timeframe } from "@/lib/market";
import type { TradeStateDTO } from "@/lib/types";

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

export function ExpandedChartClient({
  initial,
  initialQuotes,
  initialInstruments,
  initialCandles,
  initialCandlesSimulated,
  initialSymbol,
  initialTimeframe,
  initialTimeframeFromUrl = false,
}: {
  initial: TradeStateDTO;
  initialQuotes: Quote[];
  initialInstruments: InstrumentMeta[];
  initialCandles: Candle[];
  initialCandlesSimulated: boolean;
  initialSymbol: string;
  initialTimeframe: Timeframe;
  initialTimeframeFromUrl?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [quotes, setQuotes] = useState(initialQuotes);
  const instruments = initialInstruments;
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [candles, setCandles] = useState(initialCandles);
  const candlesRef = useRef<Candle[]>(initialCandles);
  const [candlesSimulated, setCandlesSimulated] = useState(initialCandlesSimulated);
  const [tick, setTick] = useState<Candle | null>(null);
  const [streamLive, setStreamLive] = useState(false);
  const [watchOpen, setWatchOpen] = useState(true);
  const [ticketOpen, setTicketOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const account = state.account;
  const meta = instruments.find((item) => item.symbol === symbol);
  const quote = quotes.find((item) => item.symbol === symbol);
  const hasPosition = state.positions.some((item) => item.symbol === symbol);

  const refreshState = useCallback(async () => {
    try {
      setState(await api<TradeStateDTO>("/api/trade/state"));
    } catch {
      /* keep the last snapshot */
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refreshState, 5000);
    return () => window.clearInterval(timer);
  }, [refreshState]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<QuotesResponse>("/api/market/quotes");
        setQuotes(data.quotes);
      } catch {
        /* quote polling is best effort */
      }
    };
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTick(null);
    api<{ candles: Candle[]; simulated: boolean }>(`/api/market/candles?symbol=${symbol}&tf=${timeframe}&limit=800`)
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
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("timeframe", timeframe);
    window.history.replaceState(null, "", url.toString());
  }, [symbol, timeframe]);

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
          /* ignore malformed frames */
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

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const markers = useMemo(() => {
    const result: PriceMarker[] = [];
    for (const item of state.positions.filter((position) => position.symbol === symbol)) {
      result.push({ price: item.entryPrice, title: `${item.side.toUpperCase()} ${item.lots.toFixed(2)}`, color: "#56cfe1" });
      if (item.sl) result.push({ price: item.sl, title: `SL ${item.lots.toFixed(2)}`, color: "#ff7d7d", dashed: true });
      if (item.tp) result.push({ price: item.tp, title: `TP ${item.lots.toFixed(2)}`, color: "#c9f75c", dashed: true });
    }
    return result;
  }, [state.positions, symbol]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      toast.push("Fullscreen is not available in this browser.", "warning");
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
        <Link href="/app/terminal" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fog transition hover:text-snow">
          <ArrowLeft className="size-3.5" /> Back to Trade
        </Link>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <div className="relative">
          <select
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            className="h-7 appearance-none rounded-md border border-white/10 bg-ink-850 pr-6 pl-2 font-mono text-[11.5px] text-snow focus:border-acid/50 focus:outline-none"
            aria-label="Instrument"
          >
            {instruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.symbol}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-fog" />
        </div>
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTimeframe(item.key)}
              className={clsx(
                "rounded px-1.5 py-1 font-mono text-[10px] transition",
                timeframe === item.key ? "bg-acid/15 text-acid" : "text-fog hover:bg-white/[0.05] hover:text-snow",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="hidden items-center gap-3 text-[10px] text-fog md:flex">
          <span>
            Bid <span className="font-mono text-rose">{quote ? formatPrice(symbol, quote.bid) : "—"}</span>
          </span>
          <span>
            Ask <span className="font-mono text-acid">{quote ? formatPrice(symbol, quote.ask) : "—"}</span>
          </span>
          <span>
            Spread <span className="font-mono text-snow">{quote && meta ? `${(quote.spread / (meta.pipSize || 0.0001)).toFixed(1)}p` : "—"}</span>
          </span>
        </span>
        <span className="badge badge-muted hidden lg:inline-flex">{phaseLabel(account)}</span>
        <span className="hidden font-mono text-[10px] text-fog lg:inline">{account.number}</span>
        <span className="hidden text-[10px] text-fog sm:inline">
          Equity <span className="font-mono text-snow">{fmtUsd(account.equity)}</span>
        </span>
        <span className="hidden text-[10px] text-fog md:inline">
          Margin <span className="font-mono text-snow">{fmtUsd(account.margin)}</span>
        </span>
        <span className={clsx("ml-auto flex items-center gap-1.5 text-[10px]", streamLive ? "text-acid" : "text-gold")}>
          <span className={streamLive ? "live-dot" : "size-1.5 rounded-full bg-gold"} />
          {streamLive ? "Stream live" : "Reconnecting"}
        </span>
        <button
          type="button"
          onClick={() => setWatchOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-fog hover:text-snow"
        >
          {watchOpen ? <SidebarClose className="size-3" /> : <SidebarOpen className="size-3" />}
          Watchlist
        </button>
        <button
          type="button"
          onClick={() => setTicketOpen((value) => !value)}
          className="hidden items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-fog hover:text-snow xl:inline-flex"
        >
          Order panel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[9.5px] text-white/35">
        <span>24h high {quote ? formatPrice(symbol, quote.high24h) : "—"}</span>
        <span>24h low {quote ? formatPrice(symbol, quote.low24h) : "—"}</span>
        <span>Leverage 1:{account.leverage}</span>
        <span>{meta?.session} session · {meta?.tradingStatus}</span>
        <span className="ml-auto flex items-center gap-1">
          <Zap className="size-3 text-acid" />
          {quote?.simulated ? "Internal simulated market data" : quote?.provider ?? "Price feed"}
        </span>
        {candlesSimulated && quote && !quote.simulated ? (
          <span className="text-amber-300/80">Chart history: internally simulated</span>
        ) : null}
      </div>

      <div ref={stageRef} className="flex min-h-0 gap-3 bg-ink-950">
        {watchOpen ? (
          <WatchlistPanel
            instruments={instruments}
            quotes={quotes}
            symbol={symbol}
            onSelect={setSymbol}
            className="hidden w-[270px] shrink-0 lg:flex"
          />
        ) : null}
        <section className="card min-w-0 flex-1 overflow-hidden">
          <ChartSurface
            symbol={symbol}
            timeframe={timeframe}
            candles={candles}
            tick={tick}
            meta={meta}
            markers={markers}
            onTimeframeChange={setTimeframe}
            initialTimeframeLocked={initialTimeframeFromUrl}
            className="h-[calc(100vh-230px)] min-h-[520px]"
          />
          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[9.5px] text-white/35">
              <ShieldCheck className="size-3 text-gold" />
              Simulated execution · chart drawings stay private to your account
            </span>
            <div className="flex items-center gap-1">
              <span className={clsx("text-[10px]", account.floating >= 0 ? "text-acid" : "text-rose")}>
                Floating {fmtSignedUsd(account.floating)}
              </span>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-fog hover:bg-white/[0.05] hover:text-snow"
              >
                {fullscreen ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                {fullscreen ? "Exit full screen" : "Full screen"}
              </button>
            </div>
          </div>
        </section>
        {ticketOpen ? (
          <div className="hidden w-[320px] shrink-0 xl:block">
            <OrderTicket
              account={account}
              symbol={symbol}
              quote={quote}
              meta={meta}
              hasPosition={hasPosition}
              onPlaced={refreshState}
            />
          </div>
        ) : null}
      </div>
      <div className="xl:hidden">
        <OrderTicket
          account={account}
          symbol={symbol}
          quote={quote}
          meta={meta}
          hasPosition={hasPosition}
          onPlaced={refreshState}
        />
      </div>
    </div>
  );
}
