"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Crown, Medal, Radio, Timer, Trophy, Users } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { EmptyState, SectionHeader } from "@/components/ui";
import { api, errorMessage, post } from "@/lib/client";
import { fmtDate, fmtUsd } from "@/lib/format";
import type { CompetitionDTO } from "@/lib/types";

const PRIZE_ICONS = [Crown, Medal, Medal];
const PRIZE_TONES = ["text-gold", "text-sky", "text-coral"];

export function CompetitionClient({ initial }: { initial: CompetitionDTO | null }) {
  const toast = useToast();
  const [competition, setCompetition] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ competition: CompetitionDTO | null }>("/api/competitions");
      setCompetition(data.competition);
      setSyncedAt(Date.now());
    } catch {
      // keep the last known leaderboard on transient polling failures
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function join() {
    setBusy(true);
    try {
      const data = await post<{ competition: CompetitionDTO; message: string }>("/api/competitions");
      setCompetition(data.competition);
      setSyncedAt(Date.now());
      toast.push(data.message, "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!competition) {
    return (
      <div className="card mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<Trophy className="size-5" />}
          title="No competition running"
          body="The next Anerith competition will appear here. Keep an account active to be eligible."
        />
      </div>
    );
  }

  const you = competition.entries.find((entry) => entry.isYou);
  const live = competition.status === "active";
  const ended = competition.status === "ended";
  const target = live || ended ? new Date(competition.endAt).getTime() : new Date(competition.startAt).getTime();
  const remaining = now === null ? null : Math.max(0, target - now);
  const days = remaining === null ? null : Math.floor(remaining / 86_400_000);
  const hours = remaining === null ? null : Math.floor((remaining % 86_400_000) / 3_600_000);
  const mins = remaining === null ? null : Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div className="space-y-5">
      <section className="card relative overflow-hidden p-6 lg:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(700px_280px_at_85%_-10%,rgba(244,198,93,0.16),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(500px_240px_at_10%_110%,rgba(84,214,255,0.08),transparent_60%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("badge", live ? "badge-acid" : ended ? "badge-muted" : "badge-gold")}>
                {live ? <Radio className="size-3 animate-pulse" /> : ended ? <Trophy className="size-3" /> : <Timer className="size-3" />}
                {live ? "Live now" : ended ? "Results finalised" : "Starts soon"}
              </span>
              <span className="badge badge-muted">
                <Users className="size-3" /> {competition.entries.length} traders
              </span>
              {live ? (
                <span className="flex items-center gap-1 text-[10px] text-fog">
                  <Activity className="size-3 text-mint" />
                  {syncedAt ? "Live returns · syncing" : "Live returns"}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-[28px] leading-tight font-semibold tracking-tight lg:text-[34px]">
              {competition.name}
            </h1>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-fog">{competition.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[9.5px] tracking-[0.14em] text-fog uppercase">Prize pool</p>
                <p className="mt-0.5 font-mono text-[28px] font-medium text-gold">{fmtUsd(competition.prizePool)}</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-[9.5px] tracking-[0.14em] text-fog uppercase">
                  {live ? "Ends" : ended ? "Closed" : "Starts"}
                </p>
                <p className="mt-0.5 font-mono text-[14px]">
                  {fmtDate(ended ? competition.endAt : live ? competition.endAt : competition.startAt)}
                </p>
                <p className="flex items-center gap-1 text-[10px] text-fog">
                  <Timer className="size-3" />
                  {ended
                    ? "Prizes credited automatically"
                    : days === null
                      ? "—"
                      : live
                        ? `${days}d ${hours}h ${mins}m remaining`
                        : `opens in ${days}d ${hours}h ${mins}m`}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-xs rounded-2xl border border-white/[0.08] bg-black/25 p-5">
            <p className="text-[10px] tracking-[0.14em] text-fog uppercase">
              {ended ? "Final standing" : "Your standing"}
            </p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-[26px] font-medium">{you ? `#${you.rank}` : "—"}</span>
              <span
                className={clsx(
                  "font-mono text-[14px]",
                  you && you.returnPct >= 0 ? "text-acid" : "text-rose",
                )}
              >
                {you ? `${you.returnPct >= 0 ? "+" : ""}${you.returnPct.toFixed(2)}%` : "Not joined"}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] text-fog">
              {you
                ? `Competing with a ${fmtUsd(you.accountSize)} account. Peak ${you.peakReturnPct.toFixed(2)}%.`
                : ended
                  ? "You did not enter this round."
                  : "Your best active account's return is tracked from entry automatically."}
            </p>
            {you && you.prize > 0 ? (
              <div className="mt-3 rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-2 text-center">
                <p className="text-[9.5px] tracking-[0.1em] text-gold uppercase">Prize credited</p>
                <p className="font-mono text-[18px] text-gold">{fmtUsd(you.prize)}</p>
              </div>
            ) : null}
            {!competition.joined && competition.canJoin ? (
              <button type="button" onClick={join} disabled={busy} className="btn btn-primary mt-4 w-full">
                {busy ? "Joining…" : "Join competition"}
              </button>
            ) : competition.joined ? (
              <div className="mt-4 rounded-lg border border-acid/20 bg-acid/[0.05] px-3 py-2 text-center text-[11px] text-acid">
                {ended ? "Round complete." : "You are entered. Keep trading."}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-2 text-center text-[11px] text-gold">
                {ended ? "Round closed." : "Entry opens when the round starts."}
              </div>
            )}
            <Link href="/app/terminal" className="btn btn-ghost btn-sm mt-2 w-full">
              Open terminal
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader
              title="Leaderboard"
              hint={ended ? "Final results. Rankings settled at close." : "Live percentage return since entry."}
              className="mb-0"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-16">Rank</th>
                  <th>Trader</th>
                  <th>Account</th>
                  <th className="text-right">Peak</th>
                  <th className="text-right">Return</th>
                  {ended ? <th className="text-right">Prize</th> : null}
                </tr>
              </thead>
              <tbody>
                {competition.entries.map((entry) => (
                  <tr key={entry.id} className={clsx(entry.isYou && "bg-acid/[0.05]")}>
                    <td>
                      <span
                        className={clsx(
                          "grid size-7 place-items-center rounded-lg font-mono text-[11px]",
                          entry.rank === 1
                            ? "bg-gold/15 text-gold"
                            : entry.rank === 2
                              ? "bg-sky/15 text-sky"
                              : entry.rank === 3
                                ? "bg-coral/15 text-coral"
                                : "text-fog",
                        )}
                      >
                        {entry.rank}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={clsx("text-[12px]", entry.isYou ? "font-medium text-acid" : "text-snow")}>
                          {entry.displayName}
                        </span>
                        {entry.isYou ? <span className="badge badge-acid">You</span> : null}
                      </div>
                    </td>
                    <td className="font-mono text-[11px] text-fog">${entry.accountSize.toLocaleString("en-US")}</td>
                    <td className="text-right font-mono text-[11px] text-fog">{entry.peakReturnPct.toFixed(2)}%</td>
                    <td
                      className={clsx(
                        "text-right font-mono text-[12px]",
                        entry.returnPct >= 0 ? "text-acid" : "text-rose",
                      )}
                    >
                      {entry.returnPct >= 0 ? "+" : ""}
                      {entry.returnPct.toFixed(2)}%
                    </td>
                    {ended ? (
                      <td className="text-right font-mono text-[11px] text-gold">
                        {entry.prize > 0 ? fmtUsd(entry.prize) : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-[13px] font-semibold">Prize distribution</h2>
            <div className="mt-3 space-y-2.5">
              {competition.prizeSplit.map((prize, index) => {
                const Icon = PRIZE_ICONS[index] ?? Medal;
                return (
                  <div key={prize.place} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <Icon className={clsx("size-4", PRIZE_TONES[index] ?? "text-fog")} />
                    <div className="flex-1">
                      <p className="text-[11.5px] text-snow">{prize.label} place</p>
                      <p className="text-[10px] text-fog">{prize.sharePct}% of pool</p>
                    </div>
                    <span className="font-mono text-[12px]">{fmtUsd(prize.amount)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[13px] font-semibold">How it works</h2>
            <ul className="mt-3 space-y-2.5 text-[11.5px] leading-relaxed text-fog">
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-mint" />
                Join with any active evaluation or funded account.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-sky" />
                Returns are measured from your account equity at the moment you join.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" />
                The leaderboard refreshes in real time from verified account equity.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-coral" />
                Prize money is credited to your Anerith ledger automatically at settlement.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
