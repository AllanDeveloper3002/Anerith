import Link from "next/link";
import { CandlestickChart } from "lucide-react";
import { getActiveAccountOrNull } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { getAllExecutionQuotes, loadExecutionCandles } from "@/lib/market-data";
import { instrumentMeta, listEffectiveInstruments } from "@/lib/instrument-specs";
import { SYMBOLS } from "@/lib/instruments";
import { TIMEFRAMES, type Timeframe } from "@/lib/market";
import { getTradeState } from "@/lib/trading";
import { EmptyState } from "@/components/ui";
import { ExpandedChartClient } from "@/components/terminal/expanded-chart-client";

export const dynamic = "force-dynamic";

export default async function ExpandedChartPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; timeframe?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const active = await getActiveAccountOrNull(user.id);
  if (!active) {
    return (
      <div className="card mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<CandlestickChart className="size-5" />}
          title="Chart locked"
          body="Open an active evaluation or funded account to use the professional chart."
          action={
            <Link href="/app/challenges" className="btn btn-primary">
              Start a challenge
            </Link>
          }
        />
      </div>
    );
  }

  const params = await searchParams;
  const initial = await getTradeState(user.id);
  const requested = params.symbol;
  const symbol =
    requested && SYMBOLS.includes(requested) ? requested : initial.positions[0]?.symbol ?? "EURUSD";
  const requestedTimeframe = params.timeframe;
  const timeframeFromUrl = TIMEFRAMES.some((item) => item.key === requestedTimeframe);
  const timeframe: Timeframe = timeframeFromUrl ? (requestedTimeframe as Timeframe) : "1m";
  const initialSeries = await loadExecutionCandles(symbol, timeframe, 800);

  return (
    <ExpandedChartClient
      initial={initial}
      initialQuotes={getAllExecutionQuotes("standard")}
      initialInstruments={listEffectiveInstruments().map(instrumentMeta)}
      initialCandles={initialSeries.candles}
      initialCandlesSimulated={initialSeries.simulated}
      initialSymbol={symbol}
      initialTimeframe={timeframe}
      initialTimeframeFromUrl={timeframeFromUrl}
    />
  );
}
