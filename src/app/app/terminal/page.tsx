import Link from "next/link";
import { CandlestickChart } from "lucide-react";
import { getActiveAccountOrNull } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { getAllExecutionQuotes, loadExecutionCandles } from "@/lib/market-data";
import { instrumentMeta, listEffectiveInstruments } from "@/lib/instrument-specs";
import { getTradeState } from "@/lib/trading";
import { EmptyState } from "@/components/ui";
import { TerminalClient } from "@/components/terminal/terminal-client";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const active = await getActiveAccountOrNull(user.id);
  if (!active) {
    return (
      <div className="card mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<CandlestickChart className="size-5" />}
          title="Terminal locked"
          body="Open an active evaluation or funded account to place orders."
          action={
            <Link href="/app/challenges" className="btn btn-primary">
              Start a challenge
            </Link>
          }
        />
      </div>
    );
  }

  const initial = await getTradeState(user.id);
  const initialSymbol = initial.positions[0]?.symbol ?? "EURUSD";
  const initialSeries = await loadExecutionCandles(initialSymbol, "1m", 400);
  return (
    <TerminalClient
      initial={initial}
      initialQuotes={getAllExecutionQuotes("standard")}
      initialInstruments={listEffectiveInstruments().map(instrumentMeta)}
      initialCandles={initialSeries.candles}
      initialCandlesSimulated={initialSeries.simulated}
      initialSymbol={initialSymbol}
    />
  );
}
