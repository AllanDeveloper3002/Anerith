"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gauge,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldX,
  TrendingDown,
} from "lucide-react";
import { clsx } from "clsx";
import { EmptyState, Progress, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage } from "@/lib/client";
import { fmtDateTime, fmtSignedUsd, fmtUsd, timeAgo } from "@/lib/format";
import type { AccountDTO, EquityPointDTO, RiskDashboardDTO } from "@/lib/types";

const REFRESH_MS = 15_000;

function accountLabel(account: AccountDTO): string {
  return `${account.number} · ${account.status} · $${account.size.toLocaleString("en-US")}`;
}

function complianceTone(compliance: "safe" | "warning" | "breached") {
  if (compliance === "breached") return { badge: "badge-rose", text: "Breached", icon: ShieldX, box: "border-rose/30 bg-rose/[0.07]" };
  if (compliance === "warning") return { badge: "badge-gold", text: "Warning", icon: AlertTriangle, box: "border-gold/30 bg-gold/[0.06]" };
  return { badge: "badge-acid", text: "Compliant", icon: CheckCircle2, box: "border-acid/25 bg-acid/[0.05]" };
}

function statusBadge(status: string): string {
  if (status === "active") return "badge-acid";
  if (status === "breached") return "badge-rose";
  if (status === "suspended") return "badge-gold";
  if (status === "passed") return "badge-sky";
  return "badge-muted";
}

function basisLabel(basis: string): string {
  if (basis === "day_start_equity") return "day-start equity";
  if (basis === "starting_balance") return "starting balance";
  return basis;
}

function EquityCurve({ points }: { points: EquityPointDTO[] }) {
  if (points.length < 2) {
    return (
      <div className="grid h-[170px] place-items-center rounded-xl border border-dashed border-white/[0.08] text-[11px] text-fog">
        The equity curve records every minute of trading activity.
      </div>
    );
  }
  const width = 900;
  const height = 170;
  const pad = 8;
  const values = points.map((point) => point.equity);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const stepX = (width - pad * 2) / (points.length - 1);
  const toY = (value: number) => pad + (1 - (value - min) / (max - min)) * (height - pad * 2);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${(pad + index * stepX).toFixed(2)},${toY(point.equity).toFixed(2)}`).join(" ");
  const area = `${line} L${(pad + (points.length - 1) * stepX).toFixed(2)},${height - pad} L${pad},${height - pad} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const up = last.equity >= first.equity;
  const stroke = up ? "var(--color-acid, #b6f36a)" : "#fb7185";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[170px] w-full" role="img" aria-label="Equity curve">
        <defs>
          <linearGradient id="riskEquityFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={up ? "#b6f36a" : "#fb7185"} stopOpacity="0.22" />
            <stop offset="100%" stopColor={up ? "#b6f36a" : "#fb7185"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#riskEquityFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-fog">
        <span>{fmtDateTime(first.time)}</span>
        <span>{fmtDateTime(last.time)}</span>
      </div>
    </div>
  );
}

export function RiskDashboardClient({
  initialAccounts,
  initialAccountId,
  initial,
}: {
  initialAccounts: AccountDTO[];
  initialAccountId: string;
  initial: RiskDashboardDTO | null;
}) {
  const toast = useToast();
  const [accounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [data, setData] = useState<RiskDashboardDTO | null>(initial);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(
    async (id: string, silent: boolean) => {
      if (!id || inFlight.current) return;
      inFlight.current = true;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await api<RiskDashboardDTO>(`/api/risk?accountId=${encodeURIComponent(id)}`);
        setData(next);
      } catch (error) {
        if (!silent) toast.push(errorMessage(error), "error");
      } finally {
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!data && accountId) load(accountId, false);
  }, [accountId, data, load]);

  useEffect(() => {
    if (!accountId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(accountId, true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [accountId, load]);

  const metrics = data?.metrics;
  const tone = complianceTone(metrics?.compliance ?? "safe");
  const ToneIcon = tone.icon;

  const targetPct = useMemo(() => {
    if (!metrics || metrics.profitTarget == null || metrics.profitTarget <= 0) return 0;
    return Math.max(0, Math.min(100, (metrics.realizedPnl / metrics.profitTarget) * 100));
  }, [metrics]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-5" />}
        title="No trading account yet"
        body="Risk monitoring starts as soon as you have an evaluation or funded account."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="eyebrow">Risk engine</span>
            {data ? <span className={clsx("badge", statusBadge(data.account.status))}>{data.account.status}</span> : null}
            {metrics ? <span className={clsx("badge", tone.badge)}>{tone.text}</span> : null}
          </div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Risk & compliance</h1>
          <p className="mt-1 text-[12.5px] text-fog">
            Server-authoritative limits, recalculated on every tick. Browser values are display only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Account</span>
            <select
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                load(event.target.value, false);
              }}
              className="input h-9 max-w-[280px] cursor-pointer pr-8 font-mono text-[11.5px]"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => accountId && load(accountId, true)}
            disabled={refreshing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw className={clsx("size-3.5", (refreshing || loading) && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {!data || !metrics ? (
        <div className="card p-8 text-center text-[12px] text-fog">Loading risk state…</div>
      ) : (
        <>
          {metrics.compliance !== "safe" || data.account.status !== "active" ? (
            <div className={clsx("card flex flex-wrap items-start gap-3 border p-4", tone.box)}>
              <ToneIcon className={clsx("mt-0.5 size-5", metrics.compliance === "breached" ? "text-rose" : "text-gold")} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-snow">
                  {metrics.compliance === "breached"
                    ? "Risk limit breached — trading is locked"
                    : data.account.status === "suspended"
                      ? "Account suspended by an administrator"
                      : "Approaching a risk limit"}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-fog">
                  {metrics.compliance === "breached"
                    ? metrics.violations.length > 0
                      ? metrics.violations.join(" ")
                      : data.account.breachDetail ?? "A hard risk limit was exceeded. The account remains locked until an administrator reviews the breach."
                    : data.account.status === "suspended"
                      ? data.account.suspensionReason ?? "New trading is disabled. Existing positions can still be closed."
                      : "You have used at least 80% of a limit. Reduce exposure to preserve the account."}
                </p>
                {data.account.breachRule ? (
                  <p className="mt-1 font-mono text-[10px] tracking-wide text-white/40 uppercase">
                    Rule: {data.account.breachRule} · {data.account.breachedAt ? fmtDateTime(data.account.breachedAt) : "—"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Balance", value: fmtUsd(metrics.balance), hint: `Start ${fmtUsd(metrics.startBalance)}` },
              { label: "Equity", value: fmtUsd(metrics.equity), hint: `${metrics.floating >= 0 ? "+" : ""}${fmtUsd(metrics.floating)} floating` },
              { label: "Realized P&L", value: fmtSignedUsd(metrics.realizedPnl), hint: `Risk/trade ${fmtUsd(metrics.riskPerTradeLimit)}`, tone: metrics.realizedPnl >= 0 ? "text-mint" : "text-rose" },
              { label: "Open positions", value: String(metrics.openPositions), hint: `${metrics.pendingOrders} pending · ${fmtUsd(metrics.exposure)} exposure` },
              { label: "Trading days", value: `${metrics.tradingDays}/${metrics.minTradingDays}`, hint: metrics.maxTradingDays == null ? "No maximum" : `Max ${metrics.maxTradingDays}` },
              { label: "Next reset", value: fmtDateTime(metrics.nextResetAt), hint: `${metrics.timezone} · ${String(metrics.resetHour).padStart(2, "0")}:${String(metrics.resetMinute).padStart(2, "0")}`, small: true },
            ].map((item) => (
              <div key={item.label} className="card p-4">
                <p className="text-[9.5px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
                <p className={clsx("mt-1.5 font-mono font-medium tracking-tight", item.small ? "text-[13px]" : "text-[18px]", item.tone ?? "text-snow")}>
                  {item.value}
                </p>
                <p className="mt-0.5 text-[10px] text-fog">{item.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card p-5">
              <SectionHeader
                title="Daily loss allowance"
                hint={`${data.config.dailyLossPct}% · ${metrics.dailyLossBasis === "equity" ? "equity" : "balance"} basis · measured from ${basisLabel(metrics.dailyLimitBasis)}`}
                action={<span className="badge badge-muted">{metrics.dayKey}</span>}
              />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[26px] font-medium tracking-tight text-snow">{fmtUsd(metrics.dailyLossRemaining)}</p>
                  <p className="mt-0.5 text-[10.5px] text-fog">remaining before the daily loss lock</p>
                </div>
                <p className={clsx("font-mono text-[15px]", metrics.dailyLossProgressPct >= 80 ? "text-rose" : "text-fog")}>
                  {Math.min(100, metrics.dailyLossProgressPct).toFixed(1)}%
                </p>
              </div>
              <Progress
                value={metrics.dailyLossProgressPct}
                tone={metrics.dailyLossProgressPct >= 80 ? "rose" : metrics.dailyLossProgressPct >= 50 ? "gold" : "acid"}
                className="mt-3"
              />
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Used</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.dailyLossUsed)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Limit</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.dailyLossLimit)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Commission today</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.dailyCommission)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Swap today</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.dailySwap)}</p>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionHeader
                title="Overall drawdown"
                hint={`${metrics.drawdownMode} · ${metrics.drawdownBasis} basis · floor ${fmtUsd(metrics.drawdownFloor)}`}
                action={<TrendingDown className="size-4 text-fog" />}
              />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[26px] font-medium tracking-tight text-snow">{fmtUsd(metrics.drawdownRemaining)}</p>
                  <p className="mt-0.5 text-[10.5px] text-fog">remaining before the hard drawdown breach</p>
                </div>
                <p className={clsx("font-mono text-[15px]", metrics.drawdownProgressPct >= 80 ? "text-rose" : "text-fog")}>
                  {Math.min(100, metrics.drawdownProgressPct).toFixed(1)}%
                </p>
              </div>
              <Progress
                value={metrics.drawdownProgressPct}
                tone={metrics.drawdownProgressPct >= 80 ? "rose" : metrics.drawdownProgressPct >= 50 ? "gold" : "acid"}
                className="mt-3"
              />
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Used</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.drawdownUsed)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Limit</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.drawdownLimit)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">High-water mark</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.highWaterMark)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                  <p className="text-[9px] tracking-wider text-fog uppercase">Baseline</p>
                  <p className="mt-0.5 font-mono text-snow">{fmtUsd(metrics.drawdownBaseline)}</p>
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <section className="card p-5">
              <SectionHeader
                title="Profit target"
                hint={
                  metrics.profitTarget == null
                    ? "Funded accounts do not carry a profit target."
                    : `${fmtUsd(metrics.realizedPnl)} of ${fmtUsd(metrics.profitTarget)} realized`
                }
                action={metrics.profitTarget != null ? <ArrowUpRight className="size-4 text-acid" /> : null}
              />
              {metrics.profitTarget != null ? (
                <>
                  <div className="flex items-end justify-between">
                    <p className="font-mono text-[26px] font-medium tracking-tight text-snow">{Math.min(100, targetPct).toFixed(1)}%</p>
                    <p className={clsx("text-[11px]", metrics.tradingDays >= metrics.minTradingDays ? "text-acid" : "text-gold")}>
                      {metrics.tradingDays >= metrics.minTradingDays
                        ? `Minimum days met (${metrics.tradingDays}/${metrics.minTradingDays})`
                        : `${metrics.minTradingDays - metrics.tradingDays} more trading day(s) required`}
                    </p>
                  </div>
                  <Progress value={targetPct} tone="sky" className="mt-3" />
                  {metrics.maxTradingDays != null ? (
                    <p className="mt-2 text-[10.5px] text-fog">
                      Maximum period: {metrics.maxTradingDays} days ·{" "}
                      {metrics.tradingDaysRemaining === 0 ? "limit reached" : `${metrics.tradingDaysRemaining} remaining`}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[11.5px] text-fog">
                  <Gauge className="size-4" /> Funded — payouts and drawdown rules apply.
                </div>
              )}

              <SectionHeader title="Exposure" hint="Notional exposure against current equity." className="mt-6" />
              <div className="space-y-2">
                {metrics.exposureBySymbol.length === 0 ? (
                  <p className="text-[11px] text-fog">No open exposure.</p>
                ) : (
                  metrics.exposureBySymbol.map((item) => (
                    <div key={item.symbol} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-snow">{item.symbol}</span>
                      <Progress value={Math.min(100, item.pct)} tone={item.pct > 70 ? "rose" : "gold"} className="flex-1" />
                      <span className="w-28 shrink-0 text-right font-mono text-[10.5px] text-fog">
                        {fmtUsd(item.notional)} · {item.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
                <span className="text-fog">Total exposure</span>
                <span className="font-mono text-snow">
                  {fmtUsd(metrics.exposure)} ({metrics.exposurePct.toFixed(1)}% of equity)
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-fog">Margin used / free</span>
                <span className="font-mono text-snow">
                  {fmtUsd(metrics.margin)} / {fmtUsd(metrics.freeMargin)}
                  {metrics.marginLevelPct != null ? ` · ${metrics.marginLevelPct.toFixed(0)}% level` : ""}
                </span>
              </div>
            </section>

            <section className="card p-5">
              <SectionHeader title="Active rule set" hint={data.config.name} action={<span className="badge badge-muted">{data.config.scope}</span>} />
              <dl className="space-y-2 text-[11.5px]">
                {[
                  ["Daily loss", `${data.config.dailyLossPct}% · ${data.config.dailyLossBasis} basis · limit ${basisLabel(data.config.dailyLimitBasis)}`],
                  ["Max drawdown", `${data.config.drawdownPct}% · ${data.config.drawdownMode} · ${data.config.drawdownBasis} basis`],
                  ["Trailing lock", data.config.trailingLockPct == null ? "—" : `${data.config.trailingLockPct}% above start`],
                  ["Profit target", data.config.profitTargetPct == null ? "—" : `${data.config.profitTargetPct}% (phase 2 ${data.config.phase2TargetPct ?? "—"}%)`],
                  ["Min / max days", `${data.config.minTradingDays} / ${data.config.maxTradingDays ?? "unlimited"}`],
                  ["Risk per trade", `${data.config.maxRiskPerTradePct}%${data.config.requireStopLoss ? " · stop loss required" : ""}`],
                  ["Open positions", `max ${data.config.maxOpenPositions}`],
                  ["Exposure cap", `${data.config.maxTotalExposurePct}% total · ${data.config.maxInstrumentExposurePct}% per instrument`],
                  ["Weekend holding", data.config.weekendHolding ? "Allowed" : `Flat from ${String(data.config.weekendCloseHourUtc).padStart(2, "0")}:00 UTC Friday`],
                  ["News trading", data.config.newsTradingAllowed ? "Allowed" : `Blocked ${data.config.newsBlackoutMinutes} min around events`],
                  ["Breach policy", data.config.closeOnBreach ? "Close positions and lock account" : "Lock account (positions retained)"],
                  ["Reset", `${data.config.resetTimezone} · ${String(data.config.resetHour).padStart(2, "0")}:${String(data.config.resetMinute).padStart(2, "0")}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                    <dt className="shrink-0 text-fog">{label}</dt>
                    <dd className="text-right text-snow">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={clsx("badge", data.config.weekendHolding ? "badge-acid" : "badge-gold")}>
                  {data.config.weekendHolding ? "Weekend OK" : "Weekend flat"}
                </span>
                <span className={clsx("badge", metrics.newsBlackout ? "badge-rose" : "badge-muted")}>
                  {metrics.newsBlackout ? "News blackout active" : "No news blackout"}
                </span>
                {metrics.weekendWindow ? <span className="badge badge-gold">Weekend window</span> : null}
                {metrics.violations.map((violation) => (
                  <span key={violation} className="badge badge-rose">
                    {violation}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section className="card p-5">
            <SectionHeader title="Equity curve" hint="Recorded at least once per minute and whenever equity moves materially." />
            <EquityCurve points={data.equityCurve} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Daily snapshots" hint="Day-start values, realised P&L and costs." className="mb-0" />
              </div>
              {data.dailySnapshots.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">Snapshots appear after the first engine tick.</p>
              ) : (
                <div className="scroll-area max-h-[320px] overflow-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-ink-850 text-[9px] tracking-wider text-fog uppercase">
                      <tr>
                        <th className="px-4 py-2 font-medium">Day</th>
                        <th className="px-3 py-2 font-medium">Start eq.</th>
                        <th className="px-3 py-2 font-medium">End eq.</th>
                        <th className="px-3 py-2 font-medium">Realized</th>
                        <th className="px-3 py-2 font-medium">Comm.</th>
                        <th className="px-3 py-2 font-medium">Swap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {data.dailySnapshots.map((snapshot) => (
                        <tr key={snapshot.dayKey}>
                          <td className="px-4 py-2 font-mono text-snow">{snapshot.dayKey}</td>
                          <td className="px-3 py-2 font-mono text-fog">{fmtUsd(snapshot.startEquity)}</td>
                          <td className="px-3 py-2 font-mono text-snow">{fmtUsd(snapshot.endEquity)}</td>
                          <td className={clsx("px-3 py-2 font-mono", snapshot.realizedPnl >= 0 ? "text-mint" : "text-rose")}>
                            {fmtSignedUsd(snapshot.realizedPnl)}
                          </td>
                          <td className="px-3 py-2 font-mono text-fog">{fmtUsd(snapshot.commission)}</td>
                          <td className="px-3 py-2 font-mono text-fog">{fmtUsd(snapshot.swap)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Risk event log" hint="Every warning, rejection and enforcement action." className="mb-0" />
              </div>
              <div className="scroll-area max-h-[320px]">
                {data.events.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[11.5px] text-fog">No risk events recorded.</p>
                ) : (
                  data.events.map((event) => (
                    <div key={event.id} className="flex items-start gap-2.5 border-b border-white/[0.05] px-5 py-3 last:border-0">
                      <span
                        className={clsx(
                          "mt-1 size-1.5 shrink-0 rounded-full",
                          event.severity === "danger" ? "bg-rose" : event.severity === "warning" ? "bg-gold" : "bg-sky",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] leading-relaxed text-snow">{event.message}</p>
                        <p className="mt-0.5 font-mono text-[9.5px] text-white/35">
                          {event.rule} · {event.actorRole ?? "system"} · {timeAgo(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Rule violations" hint="Immutable evidence of every enforcement action." className="mb-0" />
              </div>
              {data.breaches.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">No breaches on this account.</p>
              ) : (
                data.breaches.map((breach) => (
                  <div key={breach.id} className="border-b border-white/[0.05] px-5 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-rose">{breach.rule}</p>
                      <span className={clsx("badge", breach.status === "open" ? "badge-gold" : "badge-muted")}>{breach.status}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-snow">{breach.detail}</p>
                    <p className="mt-0.5 text-[10px] text-fog">
                      {fmtDateTime(breach.occurredAt)} · {breach.actionTaken.replace(/_/g, " ")}
                      {breach.resolvedBy ? ` · resolved by ${breach.resolvedBy}` : ""}
                    </p>
                  </div>
                ))
              )}
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Status history" hint="Append-only account lifecycle." className="mb-0" />
              </div>
              {data.statusHistory.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">No status changes recorded.</p>
              ) : (
                data.statusHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5 border-b border-white/[0.05] px-5 py-3 last:border-0">
                    <Clock3 className="mt-0.5 size-3.5 shrink-0 text-fog" />
                    <div className="min-w-0">
                      <p className="text-[11.5px] text-snow">
                        {entry.fromStatus} → <span className="font-medium">{entry.toStatus}</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-fog">{entry.reason}</p>
                      <p className="mt-0.5 font-mono text-[9.5px] text-white/30">
                        {entry.actorRole ?? "system"} · {fmtDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[10px] text-white/30">
            <Layers className="size-3" /> Generated {fmtDateTime(data.generatedAt)} · server time · refresh every 15 seconds
          </p>
        </>
      )}
    </div>
  );
}
