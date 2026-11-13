"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CandlestickChart,
  CircleDollarSign,
  Layers,
  Plus,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { EmptyState, Progress, StatBlock } from "@/components/ui";
import { api, errorMessage, post } from "@/lib/client";
import { fmtDate, fmtUsd } from "@/lib/format";
import { phaseLabel, planName } from "@/lib/challenges";
import type { AccountDTO } from "@/lib/types";

export function AccountsClient({
  initial,
  initialActiveId,
}: {
  initial: AccountDTO[];
  initialActiveId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accounts, setAccounts] = useState(initial);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      accounts.filter((account) =>
        filter === "all" ? true : filter === "active" ? account.status === "active" : account.status !== "active",
      ),
    [accounts, filter],
  );

  const totals = useMemo(() => {
    const active = accounts.filter((account) => account.status === "active");
    return {
      capital: active.reduce((sum, account) => sum + account.size, 0),
      equity: active.reduce((sum, account) => sum + account.equity, 0),
      payouts: accounts.reduce((sum, account) => sum + account.totalPayouts, 0),
      available: accounts.reduce((sum, account) => sum + account.payoutAvailable, 0),
    };
  }, [accounts]);

  async function activate(account: AccountDTO) {
    setBusy(account.id);
    try {
      const data = await api<{ accounts: AccountDTO[]; activeId: string }>("/api/accounts/activate", {
        method: "POST",
        body: JSON.stringify({ accountId: account.id }),
      });
      setAccounts(data.accounts);
      setActiveId(data.activeId);
      toast.push(`${account.number} is now your active desk.`, "success");
      router.refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Your trading accounts</h1>
          <p className="mt-1 text-[12.5px] text-fog">
            Switch desks, review objectives and launch the terminal on any active account.
          </p>
        </div>
        <Link href="/app/challenges" className="btn btn-primary">
          <Plus className="size-4" /> New challenge
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active capital", value: fmtUsd(totals.capital), icon: Building2 },
          { label: "Combined equity", value: fmtUsd(totals.equity), icon: Layers },
          { label: "Payouts received", value: fmtUsd(totals.payouts), icon: CircleDollarSign },
          { label: "Available to withdraw", value: fmtUsd(totals.available), icon: WalletCards },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card flex items-center gap-3 p-4">
              <div className="grid size-9 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-fog">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
                <p className="mt-0.5 font-mono text-[16px] font-medium">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        {(
          [
            { key: "all", label: "All accounts" },
            { key: "active", label: "Active" },
            { key: "closed", label: "Closed" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition",
              filter === item.key ? "bg-white/[0.07] text-snow" : "text-fog hover:bg-white/[0.04] hover:text-snow",
            )}
          >
            {item.label}
            <span className="ml-1.5 font-mono text-[10px] text-white/35">
              {item.key === "all"
                ? accounts.length
                : item.key === "active"
                  ? accounts.filter((a) => a.status === "active").length
                  : accounts.filter((a) => a.status !== "active").length}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<WalletCards className="size-5" />}
            title="No accounts in this view"
            body="Purchase a challenge to open a new evaluation, or start with the free trial."
            action={
              <Link href="/app/challenges" className="btn btn-primary btn-sm">
                Browse challenges
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((account) => {
            const active = account.status === "active";
            return (
              <article key={account.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={clsx(
                          "badge",
                          active
                            ? account.type === "funded"
                              ? "badge-gold"
                              : "badge-acid"
                            : account.status === "passed"
                              ? "badge-sky"
                              : "badge-rose",
                        )}
                      >
                        {active ? phaseLabel(account) : account.status === "passed" ? "Passed" : "Failed"}
                      </span>
                      <span className="badge badge-muted">{planName(account.plan)}</span>
                      {account.type === "funded" ? (
                        <span className="badge badge-gold">{account.profitSplitPct}% split</span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 font-mono text-[18px] font-medium tracking-tight">
                      ${account.size.toLocaleString("en-US")}
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-fog">
                      {account.number} · {account.leverage}:1
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] tracking-wider text-fog uppercase">Equity</p>
                    <p className="mt-0.5 font-mono text-[22px] font-medium">{fmtUsd(account.equity)}</p>
                    <p className={clsx("font-mono text-[11px]", account.floating >= 0 ? "text-acid" : "text-rose")}>
                      {account.floating >= 0 ? "+" : ""}
                      {fmtUsd(account.floating)} floating
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] px-5 py-3.5">
                  <StatBlock label="Balance" value={fmtUsd(account.balance)} tone="muted" />
                  <StatBlock label="Free margin" value={fmtUsd(account.freeMargin)} tone="muted" />
                  <StatBlock
                    label="Payout available"
                    value={fmtUsd(account.payoutAvailable)}
                    tone={account.payoutAvailable > 0 ? "acid" : "muted"}
                  />
                </div>

                <div className="space-y-3 px-5 py-4">
                  <div>
                    <div className="mb-1 flex justify-between text-[10.5px] text-fog">
                      <span>{account.type === "funded" ? "Profit" : "Target progress"}</span>
                      <span className="font-mono">
                        {account.type === "funded"
                          ? fmtUsd(account.payoutAvailable)
                          : `${account.objectives.profitProgressPct.toFixed(0)}% of ${fmtUsd(account.objectives.profitTargetUsd ?? 0)}`}
                      </span>
                    </div>
                    <Progress
                      value={
                        account.type === "funded"
                          ? Math.min(100, (account.payoutAvailable / Math.max(1, account.size * 0.1)) * 100)
                          : account.objectives.profitProgressPct
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-fog">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" /> {account.objectives.tradingDays}/
                      {account.objectives.minTradingDays} days
                    </span>
                    <span>Daily loss {account.objectives.dailyLossPct}%</span>
                    <span>Drawdown {account.objectives.maxDrawdownPct}%</span>
                    <span>Opened {fmtDate(account.createdAt)}</span>
                    {account.broker ? (
                      <span className="flex items-center gap-1">
                        <BadgeCheck className="size-3 text-sky" /> {account.broker.login}
                      </span>
                    ) : null}
                  </div>
                  {account.status === "failed" && account.failReason ? (
                    <p className="flex items-start gap-1.5 rounded-lg border border-rose/20 bg-rose/[0.05] p-2.5 text-[10.5px] leading-relaxed text-rose">
                      <ShieldAlert className="mt-0.5 size-3 shrink-0" /> {account.failReason}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3.5">
                  {active && account.id === activeId ? (
                    <>
                      <span className="badge badge-acid">Active desk</span>
                      <Link href="/app/terminal" className="btn btn-secondary btn-sm">
                        <CandlestickChart className="size-3.5" /> Trade
                      </Link>
                      {account.type === "funded" ? (
                        <Link href="/app/payouts" className="btn btn-ghost btn-sm">
                          Request payout
                        </Link>
                      ) : null}
                    </>
                  ) : active ? (
                    <button
                      type="button"
                      onClick={() => activate(account)}
                      disabled={busy === account.id}
                      className="btn btn-secondary btn-sm"
                    >
                      {busy === account.id ? "Switching…" : "Use this desk"}
                      <ArrowRight className="size-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10.5px] text-white/30">Account closed</span>
                  )}
                  <span className="ml-auto text-[10px] text-white/30">
                    {account.openPositions} open position{account.openPositions === 1 ? "" : "s"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-snow">Need more allocated capital?</p>
          <p className="mt-0.5 text-[11.5px] text-fog">
            Scale up to $200,000 with a One-Step, Two-Step or Instant funded program.
          </p>
        </div>
        <Link href="/app/challenges" className="btn btn-primary btn-sm">
          Explore challenges <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
