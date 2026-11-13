"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CandlestickChart,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  ShieldCheck,
  Target,
  Trophy,
  WalletCards,
} from "lucide-react";
import { clsx } from "clsx";
import { fmtDate, fmtPct, fmtSignedUsd, fmtUsd, timeAgo } from "@/lib/format";
import { calcProfitUsd } from "@/lib/instruments";
import type {
  AccountDTO,
  AnalyticsDTO,
  CompetitionDTO,
  PositionDTO,
  TradeStateDTO,
  UserDTO,
} from "@/lib/types";
import type { Quote } from "@/lib/market";
import { api } from "@/lib/client";
import { EmptyState, Progress, SectionHeader, StatBlock } from "@/components/ui";
import { phaseLabel, planName } from "@/lib/challenges";

interface QuoteResponse {
  quotes: Quote[];
}

function pnlFor(position: PositionDTO, quotes: Quote[]): number {
  const quote = quotes.find((q) => q.symbol === position.symbol);
  if (!quote) return 0;
  const exit = position.side === "buy" ? quote.bid : quote.ask;
  return calcProfitUsd(position.symbol, position.side, position.lots, position.entryPrice, exit);
}

function ObjectiveRow({
  label,
  pct,
  right,
  tone = "acid",
}: {
  label: string;
  pct: number;
  right: string;
  tone?: "acid" | "gold" | "rose" | "sky";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-fog">{label}</span>
        <span className={clsx("font-mono text-[11px]", tone === "rose" ? "text-rose" : "text-snow")}>{right}</span>
      </div>
      <Progress value={pct} tone={tone} />
    </div>
  );
}

export function DashboardClient({
  user,
  initial,
  competition,
  greeting,
}: {
  user: UserDTO;
  initial: TradeStateDTO;
  competition: CompetitionDTO | null;
  greeting: string;
}) {
  const [state, setState] = useState(initial);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsDTO | null>(null);
  const [competitionState, setCompetitionState] = useState(competition);

  const account = state.account;

  const refresh = useCallback(async () => {
    try {
      const [nextState, quoteData] = await Promise.all([
        api<TradeStateDTO>("/api/trade/state"),
        api<QuoteResponse>("/api/market/quotes"),
      ]);
      setState(nextState);
      setQuotes(quoteData.quotes);
    } catch {
      /* dashboard keeps last good snapshot */
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    api<{ analytics: AnalyticsDTO }>("/api/analytics")
      .then((data) => setAnalytics(data.analytics))
      .catch(() => setAnalytics(null));
    api<{ competition: CompetitionDTO | null }>("/api/competitions")
      .then((data) => setCompetitionState(data.competition))
      .catch(() => undefined);
  }, [account.id]);

  const floating = useMemo(
    () => state.positions.reduce((sum, position) => sum + pnlFor(position, quotes), 0),
    [state.positions, quotes],
  );

  const objectives = account.objectives;
  const you = competitionState?.entries.find((entry) => entry.isYou);
  const funded = account.type === "funded";
  const targetProgress = funded
    ? Math.min(100, (account.payoutAvailable / Math.max(1, account.size * 0.1)) * 100)
    : objectives.profitProgressPct;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{greeting}</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-snow lg:text-[30px]">
            {user.fullName.split(" ")[0]}, your desk is ready.
          </h1>
          <p className="mt-1 text-[12.5px] text-fog">
            {planName(account.plan)} · {phaseLabel(account)} · Account {account.number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/terminal" className="btn btn-primary">
            <CandlestickChart className="size-4" /> Open Trade
          </Link>
          <Link href="/app/payouts" className="btn btn-secondary">
            <Banknote className="size-4" /> Payouts
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        {/* Equity hero */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-acid">{phaseLabel(account)}</span>
                <span className="badge badge-muted">{planName(account.plan)}</span>
                {funded ? <span className="badge badge-gold">{account.profitSplitPct}% split</span> : null}
              </div>
              <p className="mt-4 text-[10px] font-medium tracking-[0.14em] text-fog uppercase">Account equity</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[34px] leading-none font-medium tracking-tight tabular-nums">
                  {fmtUsd(account.equity)}
                </span>
                <span
                  className={clsx(
                    "font-mono text-[13px]",
                    account.floating >= 0 ? "text-acid" : "text-rose",
                  )}
                >
                  {fmtSignedUsd(floating)} floating
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                <StatBlock label="Balance" value={fmtUsd(account.balance)} tone="muted" />
                <StatBlock label="Free margin" value={fmtUsd(account.freeMargin)} tone="muted" />
                <StatBlock label="Margin used" value={fmtUsd(account.margin)} tone="muted" />
                <StatBlock
                  label="Margin level"
                  value={account.marginLevel === null ? "—" : `${account.marginLevel.toFixed(0)}%`}
                  tone={account.marginLevel !== null && account.marginLevel < 150 ? "rose" : "muted"}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-right">
              <p className="text-[10px] tracking-[0.1em] text-fog uppercase">Account size</p>
              <p className="mt-1 font-mono text-lg font-medium">${account.size.toLocaleString("en-US")}</p>
              <p className="mt-1 text-[10px] text-fog">
                {account.leverage}:1 leverage · swap-free
              </p>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-fog uppercase">
                  {funded ? "Profit available for payout" : "Profit target"}
                </p>
                <span className="font-mono text-[11px] text-fog">
                  {funded ? fmtUsd(account.payoutAvailable) : `${objectives.profitCurrentUsd >= 0 ? "" : "−"}${fmtUsd(Math.abs(objectives.profitCurrentUsd))} / ${fmtUsd(objectives.profitTargetUsd ?? 0)}`}
                </span>
              </div>
              <Progress value={targetProgress} tone="acid" className="h-2" />
            </div>
            <ObjectiveRow
              label="Daily loss used"
              pct={objectives.dailyLossProgressPct}
              right={`${fmtUsd(objectives.dailyLossUsedUsd)} / ${fmtUsd(objectives.dailyLossLimitUsd)}`}
              tone={objectives.dailyLossProgressPct >= 80 ? "rose" : "gold"}
            />
            <ObjectiveRow
              label={objectives.drawdownMode === "trailing" ? "Trailing drawdown" : "Max drawdown"}
              pct={objectives.drawdownProgressPct}
              right={`${fmtUsd(objectives.drawdownUsedUsd)} / ${fmtUsd(objectives.maxDrawdownLimitUsd)}`}
              tone={objectives.drawdownProgressPct >= 80 ? "rose" : "gold"}
            />
            <ObjectiveRow
              label="Minimum trading days"
              pct={objectives.minTradingDays === 0 ? 100 : (objectives.tradingDays / objectives.minTradingDays) * 100}
              right={`${objectives.tradingDays} / ${objectives.minTradingDays} days`}
              tone={objectives.minDaysMet ? "acid" : "sky"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3.5">
            <span
              className={clsx(
                "badge",
                objectives.dailyLossProgressPct >= 80 || objectives.drawdownProgressPct >= 80
                  ? "badge-rose"
                  : "badge-acid",
              )}
            >
              <ShieldCheck className="size-3" />
              {objectives.dailyLossProgressPct >= 80 || objectives.drawdownProgressPct >= 80
                ? "Risk buffer thin"
                : "Within risk limits"}
            </span>
            <span className="badge badge-muted">
              <Clock3 className="size-3" /> Daily reset 00:00 UTC
            </span>
            {account.broker ? (
              <span className="badge badge-sky">
                <Gauge className="size-3" /> {account.broker.name} · {account.broker.login}
              </span>
            ) : null}
            <Link href="/app/accounts" className="ml-auto text-[11.5px] text-acid hover:underline">
              Account details →
            </Link>
          </div>
        </section>

        {/* Right rail */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium tracking-wider text-fog uppercase">Next milestone</p>
              <Target className="size-4 text-acid" />
            </div>
            <p className="mt-2 text-[17px] font-medium text-snow">
              {funded
                ? "Grow profit and request a payout"
                : objectives.minDaysMet
                  ? "Hit the profit target"
                  : `Complete ${Math.max(0, objectives.minTradingDays - objectives.tradingDays)} more trading day${objectives.minTradingDays - objectives.tradingDays === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-fog">
              {funded
                ? `You keep ${account.profitSplitPct}% of profits. Payouts are available from ${fmtUsd(100)}.`
                : `Reach ${fmtUsd(objectives.profitTargetUsd ?? 0)} profit while respecting the ${objectives.dailyLossPct}% daily loss and ${objectives.maxDrawdownPct}% drawdown limits.`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <p className="text-[10px] tracking-wider text-fog uppercase">{funded ? "Available" : "Progress"}</p>
                <p className="mt-1 font-mono text-[16px] text-acid">
                  {funded ? fmtUsd(account.payoutAvailable) : `${objectives.profitProgressPct.toFixed(0)}%`}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <p className="text-[10px] tracking-wider text-fog uppercase">{funded ? "Paid out" : "Trading days"}</p>
                <p className="mt-1 font-mono text-[16px]">
                  {funded ? fmtUsd(account.totalPayouts) : `${objectives.tradingDays}/${objectives.minTradingDays}`}
                </p>
              </div>
            </div>
            <Link
              href={funded ? "/app/payouts" : "/app/terminal"}
              className="btn btn-secondary btn-sm mt-4 w-full"
            >
              {funded ? "Request payout" : "Continue evaluation"} <ChevronRight className="size-3.5" />
            </Link>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium tracking-wider text-fog uppercase">Competition</p>
              <Trophy className="size-4 text-gold" />
            </div>
            {competitionState ? (
              <>
                <p className="mt-2 text-[15px] font-medium text-snow">{competitionState.name}</p>
                <p className="mt-0.5 text-[11.5px] text-fog">
                  Prize pool {fmtUsd(competitionState.prizePool)} · ends {fmtDate(competitionState.endAt)}
                </p>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <div>
                    <p className="text-[10px] tracking-wider text-fog uppercase">Your rank</p>
                    <p className="mt-0.5 font-mono text-lg">{you ? `#${you.rank}` : "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] tracking-wider text-fog uppercase">Return</p>
                    <p className={clsx("mt-0.5 font-mono text-lg", you && you.returnPct >= 0 ? "text-acid" : "text-rose")}>
                      {you ? fmtPct(you.returnPct) : "Not joined"}
                    </p>
                  </div>
                </div>
                <Link href="/app/competitions" className="btn btn-ghost btn-sm mt-3 w-full">
                  {you ? "View leaderboard" : "Join competition"} <ChevronRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <p className="mt-3 text-[12px] text-fog">No active competition.</p>
            )}
          </section>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Open positions",
            value: String(state.positions.length),
            hint: `${state.orders.length} pending order${state.orders.length === 1 ? "" : "s"}`,
            icon: CandlestickChart,
          },
          {
            label: "Closed trades",
            value: String(analytics?.totalTrades ?? "—"),
            hint: analytics ? `${analytics.winRate}% win rate` : "Loading stats",
            icon: CircleDollarSign,
          },
          {
            label: "Net P&L",
            value: analytics ? fmtSignedUsd(analytics.netPnl) : "—",
            hint: analytics ? `Profit factor ${analytics.profitFactor ?? "—"}` : "",
            icon: analytics && analytics.netPnl >= 0 ? ArrowUpRight : ArrowDownRight,
            tone: analytics ? (analytics.netPnl >= 0 ? "text-acid" : "text-rose") : "",
          },
          {
            label: "Payouts received",
            value: fmtUsd(account.totalPayouts),
            hint: `${account.profitSplitPct}% profit split`,
            icon: WalletCards,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card card-hover flex items-center gap-3 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-fog">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
                <p className={clsx("truncate font-mono text-[16px] font-medium", item.tone ?? "text-snow")}>{item.value}</p>
                <p className="truncate text-[10px] text-white/35">{item.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="card overflow-hidden">
          <div className="px-5 pt-5">
            <SectionHeader
              title="Open positions"
              hint="Marks are live from the market feed."
              action={
                <Link href="/app/terminal" className="text-[11.5px] text-acid hover:underline">
                  Manage →
                </Link>
              }
            />
          </div>
          {state.positions.length === 0 ? (
            <EmptyState
              icon={<CandlestickChart className="size-5" />}
              title="No open positions"
              body="Place your first trade from Trade — market, limit or stop."
              action={
                <Link href="/app/terminal" className="btn btn-primary btn-sm">
                  Open Trade
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th className="text-right">Floating P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {state.positions.map((position) => {
                    const pnl = pnlFor(position, quotes);
                    return (
                      <tr key={position.id}>
                        <td>
                          <span className="font-mono text-[12px] text-snow">{position.symbol}</span>
                          <span className="ml-2 text-[10px] text-fog">{timeAgo(position.openedAt)}</span>
                        </td>
                        <td>
                          <span className={clsx("badge", position.side === "buy" ? "badge-acid" : "badge-rose")}>
                            {position.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="font-mono text-[12px]">{position.lots.toFixed(2)}</td>
                        <td className="font-mono text-[12px] text-fog">{position.entryPrice}</td>
                        <td className={clsx("text-right font-mono text-[12px]", pnl >= 0 ? "text-acid" : "text-rose")}>
                          {fmtSignedUsd(pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="px-5 pt-5">
            <SectionHeader
              title="Recent closes"
              hint="Your latest closed trades."
              action={
                <Link href="/app/history" className="text-[11.5px] text-acid hover:underline">
                  Full history →
                </Link>
              }
            />
          </div>
          {state.recentClosed.length === 0 ? (
            <EmptyState title="No closed trades yet" body="Results appear here once you close a position." />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {state.recentClosed.slice(0, 6).map((trade) => (
                <div key={trade.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className={clsx(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      trade.net >= 0 ? "bg-acid/10 text-acid" : "bg-rose/10 text-rose",
                    )}
                  >
                    {trade.side === "buy" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] text-snow">{trade.symbol}</p>
                    <p className="text-[10px] text-fog">
                      {trade.lots.toFixed(2)} lots · {timeAgo(trade.closedAt)}
                    </p>
                  </div>
                  <span className={clsx("font-mono text-[12px]", trade.net >= 0 ? "text-acid" : "text-rose")}>
                    {fmtSignedUsd(trade.net)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {account.status !== "active" ? (
        <div className="card border-gold/20 bg-gold/[0.04] p-5">
          <p className="text-sm font-medium text-gold">This account is no longer active</p>
          <p className="mt-1 text-[12px] text-fog">
            Start a new challenge to keep trading, or switch to another active account from the top bar.
          </p>
          <Link href="/app/challenges" className="btn btn-primary btn-sm mt-3">
            Browse challenges
          </Link>
        </div>
      ) : null}
    </div>
  );
}
