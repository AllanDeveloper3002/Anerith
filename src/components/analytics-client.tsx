"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChartNoAxesCombined, Target, TrendingDown, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { EmptyState, Progress, SectionHeader, StatBlock } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { fmtSignedUsd, fmtUsd } from "@/lib/format";
import { phaseLabel } from "@/lib/challenges";
import type { AccountDTO, AnalyticsDTO } from "@/lib/types";

function EquityCurve({ points }: { points: { time: number; value: number }[] }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const width = 640;
    const height = 200;
    const values = points.map((point) => point.value);
    const min = Math.min(0, ...values);
    const max = Math.max(0.01, ...values);
    const range = max - min || 1;
    const coords = points.map((point, index) => ({
      x: (index / (points.length - 1)) * width,
      y: height - ((point.value - min) / range) * height,
      value: point.value,
    }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    const zeroY = height - ((0 - min) / range) * height;
    return { width, height, line, area, zeroY, coords };
  }, [points]);

  if (!geometry) {
    return (
      <div className="grid h-[200px] place-items-center text-[11px] text-fog">
        Close at least two trades to draw your equity curve.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="h-[200px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9f75c" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#c9f75c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1="0"
          x2={geometry.width}
          y1={geometry.height * fraction}
          y2={geometry.height * fraction}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      <line
        x1="0"
        x2={geometry.width}
        y1={geometry.zeroY}
        y2={geometry.zeroY}
        stroke="rgba(255,255,255,0.15)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <path d={geometry.area} fill="url(#equity-fill)" />
      <path d={geometry.line} fill="none" stroke="#c9f75c" strokeWidth="2" strokeLinejoin="round" />
      <circle
        cx={geometry.coords[geometry.coords.length - 1].x}
        cy={geometry.coords[geometry.coords.length - 1].y}
        r="3.5"
        fill="#c9f75c"
      />
    </svg>
  );
}

export function AnalyticsClient({
  initialAccounts,
  initialAccountId,
  initialAnalytics,
}: {
  initialAccounts: AccountDTO[];
  initialAccountId: string;
  initialAnalytics: AnalyticsDTO | null;
}) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [loading, setLoading] = useState(false);

  const loadAccount = useCallback(
    async (id: string) => {
      setAccountId(id);
      setLoading(true);
      try {
        const data = await api<{ analytics: AnalyticsDTO }>(`/api/analytics?accountId=${encodeURIComponent(id)}`);
        setAnalytics(data.analytics);
      } catch (error) {
        toast.push(errorMessage(error), "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const maxSymbolPnl = analytics
    ? Math.max(1, ...analytics.bySymbol.map((item) => Math.abs(item.pnl)))
    : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Execution intelligence</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Your edge, quantified.</h1>
          <p className="mt-1 text-[12.5px] text-fog">Realized performance from closed trades on one account.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={accountId}
            onChange={(event) => loadAccount(event.target.value)}
            className="select h-9 w-auto min-w-[220px] py-0 text-[11.5px]"
            aria-label="Analytics account"
          >
            {initialAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.number} · {phaseLabel(account)} · ${account.size.toLocaleString("en-US")}
              </option>
            ))}
          </select>
          <Link href="/app/history" className="btn btn-ghost btn-sm">
            History →
          </Link>
        </div>
      </div>

      {!analytics ? (
        <div className="card">
          <EmptyState
            icon={<ChartNoAxesCombined className="size-5" />}
            title="No account selected"
            body="Choose an account to review its analytics."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Net realized P&L",
                value: fmtSignedUsd(analytics.netPnl),
                tone: analytics.netPnl >= 0 ? "text-acid" : "text-rose",
                hint: `${analytics.totalTrades} closed trades`,
              },
              { label: "Win rate", value: `${analytics.winRate}%`, tone: "", hint: `${analytics.wins}W / ${analytics.losses}L` },
              {
                label: "Profit factor",
                value: analytics.profitFactor === null ? "—" : String(analytics.profitFactor),
                tone: "",
                hint: `Gross ${fmtUsd(analytics.grossProfit)} / ${fmtUsd(analytics.grossLoss)}`,
              },
              { label: "Avg trade", value: fmtSignedUsd(analytics.avgTrade), tone: analytics.avgTrade >= 0 ? "text-acid" : "text-rose", hint: `${analytics.avgHoldHours}h average hold` },
            ].map((item) => (
              <div key={item.label} className="card p-4">
                <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
                <p className={clsx("mt-1 font-mono text-[19px] font-medium", item.tone || "text-snow")}>{item.value}</p>
                <p className="mt-0.5 truncate text-[10px] text-white/35">{item.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <section className="card p-5">
              <SectionHeader
                title="Cumulative realized P&L"
                hint="Running sum of closed-trade results, oldest to newest."
                action={loading ? <span className="text-[10px] text-fog">Loading…</span> : null}
              />
              <EquityCurve points={analytics.equityCurve} />
              <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-3 text-[10.5px] text-fog">
                <span>First close</span>
                <span className="font-mono text-snow">{fmtSignedUsd(analytics.netPnl)}</span>
                <span>Latest close</span>
              </div>
            </section>

            <section className="card p-5">
              <SectionHeader title="Win distribution" hint="Share of profitable closed trades." />
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-mono text-[26px] font-medium text-acid">{analytics.winRate}%</span>
                <span className="text-[11px] text-fog">{analytics.wins} of {analytics.totalTrades}</span>
              </div>
              <Progress value={analytics.winRate} tone="acid" className="h-2" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatBlock label="Best trade" value={fmtSignedUsd(analytics.bestTrade)} tone="acid" />
                <StatBlock label="Worst trade" value={fmtSignedUsd(analytics.worstTrade)} tone="rose" />
                <StatBlock label="Long trades" value={String(analytics.longTrades)} tone="muted" />
                <StatBlock label="Short trades" value={String(analytics.shortTrades)} tone="muted" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[10.5px] text-fog">
                {analytics.netPnl >= 0 ? (
                  <TrendingUp className="size-3.5 text-acid" />
                ) : (
                  <TrendingDown className="size-3.5 text-rose" />
                )}
                {analytics.netPnl >= 0
                  ? "Positive expectancy — focus on consistency and risk discipline."
                  : "Negative expectancy — reduce size and review losing setups."}
              </div>
            </section>
          </div>

          <section className="card p-5">
            <SectionHeader title="Performance by instrument" hint="Net realized P&L across every symbol traded." />
            {analytics.bySymbol.length === 0 ? (
              <EmptyState icon={<Target className="size-5" />} title="No instrument data" body="Close a trade to populate instrument analytics." />
            ) : (
              <div className="space-y-3">
                {analytics.bySymbol.map((item) => {
                  const width = Math.max(2, (Math.abs(item.pnl) / maxSymbolPnl) * 100);
                  return (
                    <div key={item.symbol} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-snow">{item.symbol}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className={clsx("h-full rounded-full", item.pnl >= 0 ? "bg-acid" : "bg-rose")}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[9.5px] text-fog">{item.trades}</span>
                      <span
                        className={clsx(
                          "w-20 text-right font-mono text-[11px]",
                          item.pnl >= 0 ? "text-acid" : "text-rose",
                        )}
                      >
                        {fmtSignedUsd(item.pnl)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
