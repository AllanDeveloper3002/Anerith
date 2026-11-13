"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Filter,
  NotebookPen,
  Plus,
  Search,
  Settings2,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, post } from "@/lib/client";
import { planName, type ChallengePlanKey } from "@/lib/challenges";
import { fmtDateTime, fmtSignedUsd, fmtUsd } from "@/lib/format";
import { formatPrice } from "@/lib/instruments";
import type {
  JournalAnalytics,
  JournalEntryDTO,
  JournalPayload,
  JournalStrategyDTO,
  JournalTagDTO,
} from "@/lib/journal";
import { EmptyState, Pill } from "@/components/ui";

const SESSIONS = [
  { key: "asia", label: "Asia" },
  { key: "london", label: "London" },
  { key: "overlap", label: "London–New York" },
  { key: "new-york", label: "New York" },
  { key: "off-hours", label: "Off-hours" },
];

function sessionKey(openedAt: string): string {
  const hour = new Date(openedAt).getUTCHours();
  if ([22, 23, 0, 1, 2, 3, 4, 5, 6].includes(hour)) return "asia";
  if (hour >= 7 && hour <= 11) return "london";
  if (hour >= 12 && hour <= 15) return "overlap";
  if (hour >= 16 && hour <= 20) return "new-york";
  return "off-hours";
}

function durationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.round((seconds % 86_400) / 3600)}h`;
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "acid" | "rose" | "gold" | "muted";
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <p className="text-[9px] font-medium tracking-[0.1em] text-fog uppercase">{label}</p>
      <p
        className={clsx(
          "mt-1 font-mono text-[18px] font-medium tracking-tight tabular-nums",
          tone === "acid" ? "text-acid" : tone === "rose" ? "text-rose" : tone === "gold" ? "text-gold" : "text-snow",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[9.5px] text-white/35">{hint}</p> : null}
    </div>
  );
}

function BucketList({
  title,
  rows,
  empty = "No closed trades yet.",
}: {
  title: string;
  rows: { key: string; label: string; trades: number; wins: number; net: number; winRate: number | null }[];
  empty?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="mb-2 text-[9px] font-medium tracking-[0.1em] text-fog uppercase">{title}</p>
      {rows.length === 0 ? <p className="py-2 text-[10.5px] text-white/30">{empty}</p> : null}
      <div className="space-y-1.5">
        {rows.slice(0, 6).map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-[10.5px]">
            <span className="w-24 truncate text-fog">{row.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={clsx("h-full rounded-full", row.net >= 0 ? "bg-acid/60" : "bg-rose/60")}
                style={{ width: `${Math.min(100, Math.max(4, Math.abs(row.net) / Math.max(1, Math.abs(rows[0]?.net ?? 1)) * 100))}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono text-white/40">
              {row.winRate == null ? "—" : `${row.winRate.toFixed(0)}%`}
            </span>
            <span className={clsx("w-20 text-right font-mono", row.net >= 0 ? "text-acid" : "text-rose")}>
              {fmtSignedUsd(row.net)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityCurve({ analytics }: { analytics: JournalAnalytics }) {
  const points = analytics.equityCurve;
  const width = 320;
  const height = 86;
  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="text-[9px] font-medium tracking-[0.1em] text-fog uppercase">Performance over time</p>
        <p className="mt-3 text-[10.5px] text-white/30">At least two closed trading days are needed for a curve.</p>
      </div>
    );
  }
  const values = points.map((point) => point.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * (width - 8) + 4;
    const y = height - 8 - ((point.cumulative - min) / span) * (height - 16);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-medium tracking-[0.1em] text-fog uppercase">Performance over time</p>
        <span className={clsx("font-mono text-[11px]", last >= 0 ? "text-acid" : "text-rose")}>{fmtSignedUsd(last)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-[86px] w-full" preserveAspectRatio="none">
        <line x1={0} y1={height - 8} x2={width} y2={height - 8} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <polyline points={coords.join(" ")} fill="none" stroke={last >= 0 ? "#c9f75c" : "#ff7d7d"} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-white/30">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

export function JournalClient({ initial }: { initial: JournalPayload }) {
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [q, setQ] = useState("");
  const [symbol, setSymbol] = useState("all");
  const [side, setSide] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [strategy, setStrategy] = useState("all");
  const [tag, setTag] = useState("all");
  const [session, setSession] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analytics = data.analytics;
  const entries = data.entries;
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  async function refresh() {
    try {
      setData(await api<JournalPayload>("/api/journal"));
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  const symbols = useMemo(() => Array.from(new Set(entries.map((entry) => entry.symbol))).sort(), [entries]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return entries.filter((entry) => {
      if (symbol !== "all" && entry.symbol !== symbol) return false;
      if (side !== "all" && entry.side !== side) return false;
      if (outcome === "win" && !(entry.net > 0)) return false;
      if (outcome === "loss" && !(entry.net < 0)) return false;
      if (outcome === "breakeven" && entry.net !== 0) return false;
      if (strategy !== "all" && entry.strategyId !== strategy) return false;
      if (tag !== "all" && !entry.tags.some((item) => item.id === tag)) return false;
      if (session !== "all" && sessionKey(entry.openedAt) !== session) return false;
      if (from && entry.closedAt.slice(0, 10) < from) return false;
      if (to && entry.closedAt.slice(0, 10) > to) return false;
      if (
        text &&
        !entry.symbol.toLowerCase().includes(text) &&
        !(entry.strategyName ?? "").toLowerCase().includes(text) &&
        !(entry.entryReason ?? "").toLowerCase().includes(text) &&
        !(entry.notes ?? "").toLowerCase().includes(text)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, q, symbol, side, outcome, strategy, tag, session, from, to]);

  const tagsByEntryCount = useMemo(() => {
    const counts = new Map<string, { tag: JournalTagDTO; count: number }>();
    for (const entry of entries) {
      for (const item of entry.tags) {
        const current = counts.get(item.id) ?? { tag: item, count: 0 };
        current.count += 1;
        counts.set(item.id, current);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-snow">Trade journal</h1>
          <p className="mt-0.5 text-[11.5px] text-fog">
            Every closed trade is linked to its execution record. Your notes never modify trade or financial history.
          </p>
        </div>
        <button type="button" onClick={() => setManageOpen(true)} className="btn btn-secondary btn-sm">
          <Settings2 className="size-3.5" /> Strategies & tags
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Closed trades" value={String(analytics.totalTrades)} hint="Across all accounts" />
        <StatCard
          label="Win rate"
          value={analytics.winRate == null ? "—" : `${analytics.winRate.toFixed(1)}%`}
          hint={`${analytics.wins} wins · ${analytics.losses} losses`}
          tone="acid"
        />
        <StatCard
          label="Net P&L"
          value={fmtSignedUsd(analytics.netPnl)}
          hint={analytics.profitFactor == null ? "Profit factor —" : `Profit factor ${analytics.profitFactor.toFixed(2)}`}
          tone={analytics.netPnl >= 0 ? "acid" : "rose"}
        />
        <StatCard
          label="Average R:R"
          value={analytics.averageRR == null ? "—" : `1 : ${analytics.averageRR.toFixed(2)}`}
          hint="Planned risk : reward"
          tone="gold"
        />
        <StatCard
          label="Best trade"
          value={analytics.bestTrade ? fmtSignedUsd(analytics.bestTrade.net) : "—"}
          hint={analytics.bestTrade?.symbol ?? "No closed trades"}
          tone="acid"
        />
        <StatCard
          label="Worst trade"
          value={analytics.worstTrade ? fmtSignedUsd(analytics.worstTrade.net) : "—"}
          hint={analytics.worstTrade?.symbol ?? "No closed trades"}
          tone="rose"
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <EquityCurve analytics={analytics} />
        <BucketList title="Profitability by instrument" rows={analytics.byInstrument} />
        <BucketList title="Profitability by session" rows={analytics.bySession} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <BucketList title="Weekday performance" rows={analytics.byWeekday} />
        <BucketList
          title="Strategy win rate"
          rows={analytics.byStrategy}
          empty="No closed trade is linked to a strategy yet. Open a trade and assign one."
        />
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="mb-2 text-[9px] font-medium tracking-[0.1em] text-fog uppercase">R:R distribution</p>
          <div className="space-y-1.5">
            {analytics.rrDistribution.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-2 text-[10.5px]">
                <span className="w-16 text-fog">{bucket.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-gold/70"
                    style={{ width: `${Math.min(100, (bucket.count / Math.max(1, ...analytics.rrDistribution.map((item) => item.count))) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-white/40">{bucket.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-white/[0.06] pt-2">
            <p className="text-[9px] tracking-wider text-white/35 uppercase">Average duration</p>
            <p className="mt-0.5 font-mono text-[12px] text-snow">
              {analytics.averageDurationSeconds == null ? "—" : durationLabel(analytics.averageDurationSeconds)}
            </p>
            {analytics.mostTraded ? (
              <p className="mt-1 text-[10px] text-fog">Most traded: <span className="font-mono text-snow">{analytics.mostTraded.symbol}</span> · {analytics.mostTraded.trades} trades</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b border-white/[0.06] p-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fog" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search symbol, strategy or notes"
              className="input h-8 py-0 pl-8 text-[11.5px]"
            />
          </div>
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Instrument filter">
            <option value="all">All instruments</option>
            {symbols.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select value={side} onChange={(event) => setSide(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Direction filter">
            <option value="all">All directions</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Outcome filter">
            <option value="all">All outcomes</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="breakeven">Breakeven</option>
          </select>
          <select value={strategy} onChange={(event) => setStrategy(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Strategy filter">
            <option value="all">All strategies</option>
            {data.strategies.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select value={tag} onChange={(event) => setTag(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Tag filter">
            <option value="all">All tags</option>
            {data.tags.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select value={session} onChange={(event) => setSession(event.target.value)} className="input h-8 w-auto py-0 text-[11px]" aria-label="Session filter">
            <option value="all">All sessions</option>
            {SESSIONS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-fog">
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="input h-8 w-auto py-0 text-[10.5px]" />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-fog">
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="input h-8 w-auto py-0 text-[10.5px]" />
          </label>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setSymbol("all");
              setSide("all");
              setOutcome("all");
              setStrategy("all");
              setTag("all");
              setSession("all");
              setFrom("");
              setTo("");
            }}
            className="btn btn-ghost btn-sm"
          >
            <Filter className="size-3" /> Reset
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<NotebookPen className="size-5" />}
            title={entries.length === 0 ? "No closed trades yet" : "No trades match these filters"}
            body={
              entries.length === 0
                ? "Close a position in the terminal and it will appear here automatically with its execution facts."
                : "Adjust or reset the filters to see more journal entries."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>Closed</th>
                  <th>Account</th>
                  <th>Instrument</th>
                  <th>Direction</th>
                  <th>Entry / Exit</th>
                  <th>Lots</th>
                  <th className="text-right">Net P&L</th>
                  <th>R:R</th>
                  <th>Strategy</th>
                  <th>Tags</th>
                  <th>Journal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className={clsx(entry.hasAnnotations ? "" : "opacity-90")}>
                    <td className="whitespace-nowrap text-[10px] text-fog">{fmtDateTime(entry.closedAt)}</td>
                    <td>
                      <p className="font-mono text-[10px] text-fog">{entry.accountNumber}</p>
                      <p className="text-[9px] text-white/30">{planName(entry.accountPlan as ChallengePlanKey)}</p>
                    </td>
                    <td>
                      <p className="font-mono text-[11.5px] text-snow">{entry.symbol}</p>
                      <p className="text-[9px] text-white/30">{durationLabel(entry.durationSeconds)}</p>
                    </td>
                    <td>
                      <span className={clsx("badge", entry.side === "buy" ? "badge-acid" : "badge-rose")}>
                        {entry.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono text-[10.5px] text-fog">
                      {formatPrice(entry.symbol, entry.entryPrice)} → {formatPrice(entry.symbol, entry.exitPrice)}
                    </td>
                    <td className="font-mono text-[11px]">{entry.lots.toFixed(2)}</td>
                    <td className={clsx("text-right font-mono text-[11.5px]", entry.net >= 0 ? "text-acid" : "text-rose")}>
                      {fmtSignedUsd(entry.net)}
                    </td>
                    <td className="font-mono text-[10.5px] text-fog">
                      {entry.plannedRR == null ? "—" : `1:${entry.plannedRR}`}
                    </td>
                    <td className="text-[10.5px] text-fog">{entry.strategyName ?? "—"}</td>
                    <td>
                      <div className="flex max-w-[140px] flex-wrap gap-0.5">
                        {entry.tags.slice(0, 3).map((item) => (
                          <span key={item.id} className="rounded px-1 py-0.5 text-[8.5px]" style={{ backgroundColor: `${item.color}22`, color: item.color }}>
                            {item.name}
                          </span>
                        ))}
                        {entry.tags.length > 3 ? <span className="text-[8.5px] text-white/30">+{entry.tags.length - 3}</span> : null}
                      </div>
                    </td>
                    <td>
                      <span className={clsx("text-[9.5px]", entry.hasAnnotations ? "text-acid" : "text-white/30")}>
                        {entry.hasAnnotations ? "Annotated" : "Not journaled"}
                      </span>
                    </td>
                    <td>
                      <button type="button" onClick={() => setSelectedId(entry.id)} className="btn btn-secondary btn-sm whitespace-nowrap">
                        Open <ChevronRight className="size-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-white/30">
        <span>{filtered.length} of {entries.length} trades shown</span>
        <span>·</span>
        <span>Analytics reflect all closed trades on your accounts, not the active filters.</span>
        <span>·</span>
        <span>{tagsByEntryCount.reduce((sum, item) => sum + item.count, 0)} tag links</span>
      </div>

      {selected ? (
        <EntryDrawer
          entry={selected}
          strategies={data.strategies}
          tags={data.tags}
          attachBusy={attachBusy}
          fileRef={fileRef}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
          onUpload={async (file) => {
            setAttachBusy(true);
            try {
              const form = new FormData();
              form.append("entryId", selected.id);
              form.append("file", file);
              const response = await fetch("/api/journal/attachments", { method: "POST", body: form });
              const payload = (await response.json()) as { ok?: boolean; error?: string };
              if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Upload failed.");
              toast.push("Screenshot attached.", "success");
              await refresh();
            } catch (error) {
              toast.push(errorMessage(error), "error");
            } finally {
              setAttachBusy(false);
              if (fileRef.current) fileRef.current.value = "";
            }
          }}
          onDeleteAttachment={async (id) => {
            try {
              const response = await fetch(`/api/journal/attachments/${id}`, { method: "DELETE" });
              const payload = (await response.json()) as { ok?: boolean; error?: string };
              if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Delete failed.");
              await refresh();
            } catch (error) {
              toast.push(errorMessage(error), "error");
            }
          }}
        />
      ) : null}

      {manageOpen ? (
        <ManageDialog
          strategies={data.strategies}
          tags={data.tags}
          onClose={() => setManageOpen(false)}
          onSaved={refresh}
          tagUsage={tagsByEntryCount}
        />
      ) : null}
    </div>
  );
}

function EntryDrawer({
  entry,
  strategies,
  tags,
  onClose,
  onSaved,
  onUpload,
  onDeleteAttachment,
  attachBusy,
  fileRef,
}: {
  entry: JournalEntryDTO;
  strategies: JournalStrategyDTO[];
  tags: JournalTagDTO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onDeleteAttachment: (id: string) => Promise<void>;
  attachBusy: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    strategyId: entry.strategyId ?? "",
    entryReason: entry.entryReason ?? "",
    exitReason: entry.exitReason ?? "",
    marketConditions: entry.marketConditions ?? "",
    emotions: entry.emotions ?? "",
    mistakes: entry.mistakes ?? "",
    lessons: entry.lessons ?? "",
    notes: entry.notes ?? "",
  });
  const [tagIds, setTagIds] = useState(entry.tags.map((item) => item.id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      strategyId: entry.strategyId ?? "",
      entryReason: entry.entryReason ?? "",
      exitReason: entry.exitReason ?? "",
      marketConditions: entry.marketConditions ?? "",
      emotions: entry.emotions ?? "",
      mistakes: entry.mistakes ?? "",
      lessons: entry.lessons ?? "",
      notes: entry.notes ?? "",
    });
    setTagIds(entry.tags.map((item) => item.id));
  }, [entry]);

  async function save() {
    setBusy(true);
    try {
      await post("/api/journal", {
        action: "entry.update",
        entryId: entry.id,
        strategyId: form.strategyId || null,
        entryReason: form.entryReason,
        exitReason: form.exitReason,
        marketConditions: form.marketConditions,
        emotions: form.emotions,
        mistakes: form.mistakes,
        lessons: form.lessons,
        notes: form.notes,
        tagIds,
      });
      toast.push("Journal entry saved.", "success");
      await onSaved();
      onClose();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder: string, rows = 2) => (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        placeholder={placeholder}
        rows={rows}
        maxLength={4000}
        className="input resize-y text-[11.5px] leading-relaxed"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-black/65 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-white/[0.08] bg-ink-850 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/[0.07] px-4 py-3">
          <div>
            <p className="font-mono text-[13px] font-semibold text-snow">
              {entry.symbol} <span className="text-[10px] text-fog">{entry.side.toUpperCase()} {entry.lots.toFixed(2)}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-fog">
              {fmtDateTime(entry.closedAt)} · account {entry.accountNumber} · {durationLabel(entry.durationSeconds)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10.5px] sm:grid-cols-3">
            <div><p className="text-fog">Entry</p><p className="font-mono text-snow">{formatPrice(entry.symbol, entry.entryPrice)}</p></div>
            <div><p className="text-fog">Exit</p><p className="font-mono text-snow">{formatPrice(entry.symbol, entry.exitPrice)}</p></div>
            <div><p className="text-fog">Net P&L</p><p className={clsx("font-mono", entry.net >= 0 ? "text-acid" : "text-rose")}>{fmtSignedUsd(entry.net)}</p></div>
            <div><p className="text-fog">Commission</p><p className="font-mono text-snow">{fmtUsd(entry.commission)}</p></div>
            <div><p className="text-fog">Swap</p><p className="font-mono text-snow">{fmtSignedUsd(entry.swap)}</p></div>
            <div><p className="text-fog">Close reason</p><p className="capitalize text-snow">{entry.closeReason.replaceAll("_", " ")}</p></div>
            <div><p className="text-fog">Planned R:R</p><p className="font-mono text-snow">{entry.plannedRR == null ? "—" : `1 : ${entry.plannedRR}`}</p></div>
            <div><p className="text-fog">Realized R</p><p className="font-mono text-snow">{entry.realizedR == null ? "—" : entry.realizedR.toFixed(2)}</p></div>
            <div><p className="text-fog">SL / TP</p><p className="font-mono text-snow">{entry.sl == null ? "—" : formatPrice(entry.symbol, entry.sl)} / {entry.tp == null ? "—" : formatPrice(entry.symbol, entry.tp)}</p></div>
          </div>

          <div>
            <label className="label" htmlFor="journal-strategy">Strategy</label>
            <select
              id="journal-strategy"
              value={form.strategyId}
              onChange={(event) => setForm((current) => ({ ...current, strategyId: event.target.value }))}
              className="input text-[11.5px]"
            >
              <option value="">No strategy</option>
              {strategies.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3">
            {field("entryReason", "Entry reasoning", "Why did you enter? Setup, confluence, trigger…")}
            {field("exitReason", "Exit reasoning", "Why did you close here?")}
            {field("marketConditions", "Market conditions", "Volatility, session, news, structure…")}
            {field("emotions", "Emotions", "Confidence, hesitation, fear, discipline…")}
            {field("mistakes", "Mistakes", "What went wrong or was executed poorly?")}
            {field("lessons", "Lessons", "What will you do differently next time?")}
            {field("notes", "Notes", "Anything else worth keeping.", 3)}
          </div>

          <div>
            <p className="label">Tags</p>
            {tags.length === 0 ? (
              <p className="text-[10.5px] text-white/35">No tags yet. Create tags in Strategies & tags.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {tags.map((item) => {
                  const active = tagIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTagIds((current) => (active ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                      className={clsx("rounded-full border px-2 py-0.5 text-[10px] transition", active ? "border-transparent" : "border-white/10 text-fog hover:text-snow")}
                      style={active ? { backgroundColor: `${item.color}33`, color: item.color } : undefined}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="label mb-0">Screenshots</p>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={attachBusy} className="btn btn-secondary btn-sm">
                <Upload className="size-3" /> {attachBusy ? "Uploading…" : "Attach image"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
            </div>
            {entry.attachments.length === 0 ? (
              <p className="text-[10px] text-white/35">PNG, JPEG, WebP or GIF up to 5 MB. Images are private to your account.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {entry.attachments.map((attachment) => (
                  <div key={attachment.id} className="group relative overflow-hidden rounded-lg border border-white/[0.08]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/journal/attachments/${attachment.id}`} alt={attachment.filename} className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void onDeleteAttachment(attachment.id)}
                      className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white/70 opacity-0 transition hover:text-rose group-hover:opacity-100"
                      aria-label="Delete screenshot"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <p className="absolute bottom-0 w-full truncate bg-black/55 px-1.5 py-0.5 text-[8.5px] text-white/60">{attachment.filename}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
          <p className="text-[9px] text-white/30">Trade facts are read-only and come from execution records.</p>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm ml-auto">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="btn btn-primary btn-sm">
            {busy ? "Saving…" : "Save journal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageDialog({
  strategies,
  tags,
  onClose,
  onSaved,
  tagUsage,
}: {
  strategies: JournalStrategyDTO[];
  tags: JournalTagDTO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  tagUsage: { tag: JournalTagDTO; count: number }[];
}) {
  const toast = useToast();
  const [strategyForm, setStrategyForm] = useState({ id: "", name: "", description: "", rules: "" });
  const [tagForm, setTagForm] = useState({ name: "", color: "#c9f75c" });
  const [busy, setBusy] = useState(false);

  async function saveStrategy() {
    if (!strategyForm.name.trim()) return;
    setBusy(true);
    try {
      await post("/api/journal", {
        action: "strategy.save",
        id: strategyForm.id || undefined,
        name: strategyForm.name,
        description: strategyForm.description || null,
        rules: strategyForm.rules || null,
      });
      setStrategyForm({ id: "", name: "", description: "", rules: "" });
      toast.push("Strategy saved.", "success");
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveTag() {
    if (!tagForm.name.trim()) return;
    setBusy(true);
    try {
      await post("/api/journal", { action: "tag.save", name: tagForm.name, color: tagForm.color });
      setTagForm({ name: "", color: "#c9f75c" });
      toast.push("Tag created.", "success");
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "strategy" | "tag", id: string) {
    if (!window.confirm(`Delete this ${kind}? Entries keep their trade data.`)) return;
    try {
      await post("/api/journal", kind === "strategy" ? { action: "strategy.delete", strategyId: id } : { action: "tag.delete", tagId: id });
      await onSaved();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  return (
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div>
            <h3 className="text-[14px] font-semibold">Strategies & tags</h3>
            <p className="text-[10.5px] text-fog">Named strategies and tags help you review patterns across real closed trades.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-fog hover:bg-white/5 hover:text-snow">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <section>
            <p className="mb-2 text-[9px] tracking-wider text-white/35 uppercase">Strategies</p>
            <div className="space-y-1.5">
              {strategies.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-medium text-snow">{item.name}</p>
                    {item.description ? <p className="text-[10px] text-fog">{item.description}</p> : null}
                    {item.rules ? <p className="mt-0.5 line-clamp-2 text-[9.5px] text-white/35">{item.rules}</p> : null}
                  </div>
                  <button type="button" onClick={() => setStrategyForm({ id: item.id, name: item.name, description: item.description ?? "", rules: item.rules ?? "" })} className="rounded p-1 text-white/35 hover:text-snow" aria-label="Edit strategy">
                    <Settings2 className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => void remove("strategy", item.id)} className="rounded p-1 text-white/30 hover:text-rose" aria-label="Delete strategy">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {strategies.length === 0 ? <p className="text-[10.5px] text-white/30">No strategies yet.</p> : null}
            </div>
            <div className="mt-2 grid gap-2 rounded-xl border border-white/[0.06] p-2.5 sm:grid-cols-2">
              <input value={strategyForm.name} onChange={(event) => setStrategyForm((current) => ({ ...current, name: event.target.value }))} placeholder="Strategy name" className="input h-8 py-0 text-[11px]" maxLength={60} />
              <input value={strategyForm.description} onChange={(event) => setStrategyForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short description" className="input h-8 py-0 text-[11px]" maxLength={1000} />
              <textarea value={strategyForm.rules} onChange={(event) => setStrategyForm((current) => ({ ...current, rules: event.target.value }))} placeholder="Entry and exit rules" rows={2} className="input resize-y text-[11px] sm:col-span-2" maxLength={4000} />
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" onClick={() => void saveStrategy()} disabled={busy || !strategyForm.name.trim()} className="btn btn-primary btn-sm">
                  <Plus className="size-3" /> {strategyForm.id ? "Update strategy" : "Create strategy"}
                </button>
                {strategyForm.id ? (
                  <button type="button" onClick={() => setStrategyForm({ id: "", name: "", description: "", rules: "" })} className="btn btn-ghost btn-sm">
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 text-[9px] tracking-wider text-white/35 uppercase">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tagUsage.map(({ tag: item, count }) => (
                <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${item.color}18`, color: item.color }}>
                  <TagIcon className="size-2.5" /> {item.name} <span className="text-white/30">{count}</span>
                  <button type="button" onClick={() => void remove("tag", item.id)} className="ml-0.5 text-white/30 hover:text-rose" aria-label="Delete tag">
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              {tags.length === 0 ? <p className="text-[10.5px] text-white/30">No tags yet.</p> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-white/[0.06] p-2.5">
              <input value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} placeholder="Tag name" className="input h-8 w-40 py-0 text-[11px]" maxLength={30} />
              <input type="color" value={tagForm.color} onChange={(event) => setTagForm((current) => ({ ...current, color: event.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent" aria-label="Tag colour" />
              <button type="button" onClick={() => void saveTag()} disabled={busy || !tagForm.name.trim()} className="btn btn-primary btn-sm">
                <Plus className="size-3" /> Add tag
              </button>
            </div>
          </section>
        </div>
        <div className="flex justify-end border-t border-white/[0.07] px-4 py-3">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
