"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  History,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { EmptyState, Progress, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, post } from "@/lib/client";
import { fmtDateTime, fmtUsd, timeAgo } from "@/lib/format";
import type { AdminRiskViewDTO, RiskConfigDTO } from "@/lib/types";

type RiskTab = "accounts" | "profiles" | "enforcement" | "news";

const SUB_TABS: { key: RiskTab; label: string }[] = [
  { key: "accounts", label: "Live risk" },
  { key: "profiles", label: "Rule sets" },
  { key: "enforcement", label: "Breaches & audit" },
  { key: "news", label: "News calendar" },
];

function statusBadge(status: string): string {
  if (status === "active") return "badge-acid";
  if (status === "breached" || status === "failed") return "badge-rose";
  if (status === "suspended") return "badge-gold";
  if (status === "passed") return "badge-sky";
  return "badge-muted";
}

function emptyConfig(): RiskConfigDTO {
  return {
    id: "",
    name: "New risk profile",
    scope: "plan",
    planKey: "one-step",
    accountId: null,
    enabled: true,
    profitTargetPct: 10,
    phase2TargetPct: 5,
    dailyLossPct: 5,
    dailyLossBasis: "equity",
    dailyLimitBasis: "starting_balance",
    drawdownPct: 10,
    drawdownMode: "static",
    drawdownBasis: "equity",
    trailingLockPct: null,
    minTradingDays: 5,
    maxTradingDays: null,
    maxRiskPerTradePct: 1,
    requireStopLoss: true,
    maxOpenPositions: 20,
    maxTotalExposurePct: 300,
    maxInstrumentExposurePct: 100,
    maxPositionLots: 50,
    maxLeverage: 2000,
    restrictedSymbols: [],
    weekendHolding: true,
    weekendCloseHourUtc: 21,
    newsTradingAllowed: true,
    newsBlackoutMinutes: 30,
    closeOnBreach: true,
    resetTimezone: "UTC",
    resetHour: 0,
    resetMinute: 0,
    updatedAt: new Date().toISOString(),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium tracking-wider text-fog uppercase">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[9.5px] leading-relaxed text-white/35">{hint}</p> : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-3.5 accent-[var(--color-acid)]"
      />
      <span>
        <span className="block text-[11px] text-snow">{label}</span>
        {hint ? <span className="block text-[9.5px] leading-relaxed text-white/35">{hint}</span> : null}
      </span>
    </label>
  );
}

function num(value: string): number {
  if (value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function RiskAdminClient({ initial }: { initial: AdminRiskViewDTO | null }) {
  const toast = useToast();
  const [view, setView] = useState<AdminRiskViewDTO>(
    initial ?? {
      configs: [],
      accounts: [],
      breaches: [],
      events: [],
      audit: [],
      news: [],
      statusHistory: [],
      configHistory: [],
      generatedAt: new Date().toISOString(),
    },
  );
  const [tab, setTab] = useState<RiskTab>("accounts");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<RiskConfigDTO | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<RiskConfigDTO>(emptyConfig());
  const [newsForm, setNewsForm] = useState({
    title: "",
    symbol: "",
    impact: "high",
    startsAt: "",
    endsAt: "",
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api<AdminRiskViewDTO>("/api/admin/risk");
      setView(data);
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(id);
    try {
      const data = await post<{ view: AdminRiskViewDTO }>("/api/admin/risk", body);
      setView(data.view);
      toast.push(success, "success");
      return true;
    } catch (error) {
      toast.push(errorMessage(error), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function openEditor(config?: RiskConfigDTO) {
    setEditor(config ?? null);
    setForm(config ? { ...config } : emptyConfig());
    setEditorOpen(true);
  }

  function update<K extends keyof RiskConfigDTO>(key: K, value: RiskConfigDTO[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    const payload = {
      ...form,
      id: form.id || null,
      planKey: form.scope === "plan" ? form.planKey : null,
      accountId: form.scope === "account" ? form.accountId : null,
    };
    const ok = await runAction("config-save", { action: "config.save", config: payload }, "Risk profile saved and audited.");
    if (ok) {
      setEditorOpen(false);
      setEditor(null);
    }
  }

  async function assignProfile(accountId: string, configId: string) {
    await runAction(
      `assign:${accountId}`,
      { action: "config.assign", accountId, configId: configId || null },
      "Risk profile assignment updated.",
    );
  }

  async function suspend(accountId: string, number: string) {
    const reason = window.prompt(`Reason for suspending ${number}? This is written to the audit trail.`);
    if (reason === null) return;
    if (reason.trim().length < 5) {
      toast.push("Document the suspension reason (at least 5 characters).", "error");
      return;
    }
    await runAction(`account:${accountId}`, { action: "account.suspend", accountId, reason }, `${number} suspended.`);
  }

  async function reactivate(accountId: string, number: string) {
    const note = window.prompt(`Authorization note for reactivating ${number}? This is written to the audit trail.`);
    if (note === null) return;
    if (note.trim().length < 5) {
      toast.push("Document the authorization (at least 5 characters).", "error");
      return;
    }
    await runAction(`account:${accountId}`, { action: "account.reactivate", accountId, note }, `${number} reactivated.`);
  }

  async function close(accountId: string, number: string) {
    const reason = window.prompt(`Reason for closing ${number}? Open positions will be closed and the account locked.`);
    if (reason === null) return;
    if (reason.trim().length < 5) {
      toast.push("Document the closure reason (at least 5 characters).", "error");
      return;
    }
    if (!window.confirm(`Close ${number}? This cannot be undone.`)) return;
    await runAction(`account:${accountId}`, { action: "account.close", accountId, reason }, `${number} closed.`);
  }

  async function resolveBreach(id: string, rule: string) {
    const note = window.prompt(`Resolution note for the ${rule} breach? The breach record stays immutable; account status does not change automatically.`);
    if (note === null) return;
    if (note.trim().length < 5) {
      toast.push("Document the resolution (at least 5 characters).", "error");
      return;
    }
    await runAction(`breach:${id}`, { action: "breach.resolve", breachId: id, note }, "Breach marked resolved.");
  }

  async function createNews() {
    if (!newsForm.title.trim() || !newsForm.startsAt || !newsForm.endsAt) {
      toast.push("Title, start and end are required.", "error");
      return;
    }
    const ok = await runAction(
      "news-create",
      {
        action: "news.create",
        title: newsForm.title,
        symbol: newsForm.symbol || null,
        impact: newsForm.impact,
        startsAt: new Date(newsForm.startsAt).toISOString(),
        endsAt: new Date(newsForm.endsAt).toISOString(),
      },
      "News event added.",
    );
    if (ok) setNewsForm({ title: "", symbol: "", impact: "high", startsAt: "", endsAt: "" });
  }

  async function cancelNews(id: string, title: string) {
    if (!window.confirm(`Cancel "${title}"? It will no longer trigger blackouts.`)) return;
    await runAction(`news:${id}`, { action: "news.cancel", id }, "News event cancelled.");
  }

  const openBreaches = useMemo(() => view.breaches.filter((breach) => breach.status === "open"), [view.breaches]);
  const atRisk = useMemo(
    () => view.accounts.filter((account) => account.compliance !== "safe" || account.status === "breached" || account.status === "suspended"),
    [view.accounts],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {openBreaches.length > 0 ? (
            <span className="badge badge-rose">
              <ShieldAlert className="mr-1 size-3" /> {openBreaches.length} open breach{openBreaches.length === 1 ? "" : "es"}
            </span>
          ) : (
            <span className="badge badge-acid">
              <ShieldCheck className="mr-1 size-3" /> No open breaches
            </span>
          )}
          <span className="badge badge-muted">{view.configs.length} rule sets</span>
          <span className="badge badge-muted">{atRisk.length} accounts under watch</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => openEditor()} className="btn btn-primary btn-sm">
            <Plus className="size-3.5" /> New rule set
          </button>
          <button type="button" onClick={load} disabled={refreshing} className="btn btn-secondary btn-sm">
            <RefreshCw className={clsx("size-3.5", refreshing && "animate-spin")} /> Refresh risk
          </button>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {SUB_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition",
              tab === item.key ? "bg-white/[0.08] text-snow" : "text-fog hover:bg-white/[0.04] hover:text-snow",
            )}
          >
            {item.label}
            {item.key === "enforcement" && openBreaches.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-rose/20 px-1.5 py-0.5 font-mono text-[9px] text-rose">
                {openBreaches.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader
              title="Live account risk"
              hint="Server-computed limits. Use the profile selector to pin a rule set to an account."
              className="mb-0"
            />
          </div>
          {view.accounts.length === 0 ? (
            <EmptyState title="No trading accounts" body="Accounts appear here as soon as they are provisioned." />
          ) : (
            <div className="scroll-area overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-[11px]">
                <thead className="bg-ink-850 text-[9px] tracking-wider text-fog uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Account</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Balance / equity</th>
                    <th className="px-3 py-2.5 font-medium">Daily loss</th>
                    <th className="px-3 py-2.5 font-medium">Drawdown</th>
                    <th className="px-3 py-2.5 font-medium">Days</th>
                    <th className="px-3 py-2.5 font-medium">Risk profile</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {view.accounts.map((account) => (
                    <tr key={account.id} className={clsx(account.compliance === "breached" && "bg-rose/[0.04]")}>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-[11px] text-snow">{account.number}</p>
                        <p className="text-[9.5px] text-fog">
                          {account.owner} · {account.plan} · phase {account.phase}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={clsx("badge capitalize", statusBadge(account.status))}>{account.status}</span>
                        {account.breachRule ? (
                          <p className="mt-0.5 font-mono text-[9px] text-rose">{account.breachRule}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 font-mono">
                        <p className="text-snow">{fmtUsd(account.balance)}</p>
                        <p className="text-[9.5px] text-fog">eq {fmtUsd(account.equity)}</p>
                      </td>
                      <td className="w-32 px-3 py-2.5">
                        <div className="flex items-center justify-between font-mono text-[9.5px] text-fog">
                          <span>{fmtUsd(account.dailyLossUsed)}</span>
                          <span>{Math.min(100, account.dailyLossProgressPct).toFixed(0)}%</span>
                        </div>
                        <Progress
                          value={account.dailyLossProgressPct}
                          tone={account.dailyLossProgressPct >= 80 ? "rose" : account.dailyLossProgressPct >= 50 ? "gold" : "acid"}
                          className="mt-1"
                        />
                        <p className="mt-0.5 font-mono text-[9px] text-white/30">limit {fmtUsd(account.dailyLossLimit)}</p>
                      </td>
                      <td className="w-32 px-3 py-2.5">
                        <div className="flex items-center justify-between font-mono text-[9.5px] text-fog">
                          <span>{fmtUsd(account.drawdownUsed)}</span>
                          <span>{Math.min(100, account.drawdownProgressPct).toFixed(0)}%</span>
                        </div>
                        <Progress
                          value={account.drawdownProgressPct}
                          tone={account.drawdownProgressPct >= 80 ? "rose" : account.drawdownProgressPct >= 50 ? "gold" : "acid"}
                          className="mt-1"
                        />
                        <p className="mt-0.5 font-mono text-[9px] text-white/30">limit {fmtUsd(account.drawdownLimit)}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-fog">
                        {account.tradingDays}/{account.minTradingDays}
                        {account.maxTradingDays != null ? <span className="block text-white/30">max {account.maxTradingDays}</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={account.riskConfigId ?? ""}
                          onChange={(event) => assignProfile(account.id, event.target.value)}
                          disabled={busy === `assign:${account.id}`}
                          className="input h-7 max-w-[180px] cursor-pointer px-2 text-[10px]"
                        >
                          <option value="">Plan / default</option>
                          {view.configs.map((config) => (
                            <option key={config.id} value={config.id}>
                              {config.name} · {config.scope}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          {account.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => suspend(account.id, account.number)}
                              disabled={busy === `account:${account.id}`}
                              className="btn btn-secondary btn-sm px-2 py-1 text-[9.5px]"
                              title="Suspend trading with an audited reason"
                            >
                              <Ban className="size-3" /> Suspend
                            </button>
                          ) : null}
                          {account.status === "suspended" || account.status === "breached" ? (
                            <button
                              type="button"
                              onClick={() => reactivate(account.id, account.number)}
                              disabled={busy === `account:${account.id}`}
                              className="btn btn-secondary btn-sm px-2 py-1 text-[9.5px]"
                              title="Reactivate with documented authorization"
                            >
                              <RotateCcw className="size-3" /> Reactivate
                            </button>
                          ) : null}
                          {account.status !== "closed" ? (
                            <button
                              type="button"
                              onClick={() => close(account.id, account.number)}
                              disabled={busy === `account:${account.id}`}
                              className="btn btn-danger btn-sm px-2 py-1 text-[9.5px]"
                              title="Close positions and lock the account"
                            >
                              <X className="size-3" /> Close
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "profiles" ? (
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader
              title="Rule sets"
              hint="Precedence: account profile → plan profile → default profile → built-in institutional defaults."
              className="mb-0"
            />
          </div>
          {view.configs.length === 0 ? (
            <EmptyState title="No rule sets" body="Create a profile to override the built-in defaults." />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {view.configs.map((config) => (
                <div key={config.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[12px] font-medium text-snow">{config.name}</p>
                      <span className="badge badge-muted">{config.scope}</span>
                      {config.planKey ? <span className="badge badge-sky">{config.planKey}</span> : null}
                      {config.accountId ? <span className="badge badge-violet">{config.accountId.slice(0, 8)}</span> : null}
                      {!config.enabled ? <span className="badge badge-rose">disabled</span> : null}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-fog">
                      daily {config.dailyLossPct}% {config.dailyLossBasis} · DD {config.drawdownPct}% {config.drawdownMode} · {config.minTradingDays}
                      {config.maxTradingDays != null ? `–${config.maxTradingDays}` : "+"} days · risk {config.maxRiskPerTradePct}% · target{" "}
                      {config.profitTargetPct ?? "—"}%
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-white/30">
                      Reset {config.resetTimezone} {String(config.resetHour).padStart(2, "0")}:{String(config.resetMinute).padStart(2, "0")} · updated{" "}
                      {fmtDateTime(config.updatedAt)}
                    </p>
                  </div>
                  <button type="button" onClick={() => openEditor(config)} className="btn btn-secondary btn-sm">
                    <Pencil className="size-3" /> Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "enforcement" ? (
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <SectionHeader
                title="Breach history"
                hint="Breaches are immutable. Resolving one records an administrative finding without rewriting the event."
                className="mb-0"
              />
            </div>
            {view.breaches.length === 0 ? (
              <p className="px-5 py-8 text-center text-[11.5px] text-fog">No breaches recorded.</p>
            ) : (
              <div className="scroll-area max-h-[360px] overflow-auto">
                <table className="w-full min-w-[900px] text-left text-[11px]">
                  <thead className="sticky top-0 bg-ink-850 text-[9px] tracking-wider text-fog uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 font-medium">Rule</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">Occurred</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {view.breaches.map((breach) => (
                      <tr key={breach.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-snow">{breach.accountNumber}</p>
                          <p className="text-[9.5px] text-fog">{breach.owner}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-rose">{breach.rule}</td>
                        <td className="max-w-[320px] px-3 py-2.5 text-[10.5px] text-fog">
                          <p className="line-clamp-2">{breach.detail}</p>
                          <p className="mt-0.5 text-[9px] text-white/30">{breach.actionTaken.replace(/_/g, " ")}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-fog">{fmtDateTime(breach.occurredAt)}</td>
                        <td className="px-3 py-2.5">
                          <span className={clsx("badge", breach.status === "open" ? "badge-gold" : "badge-muted")}>{breach.status}</span>
                          {breach.resolvedBy ? (
                            <p className="mt-0.5 text-[9px] text-white/30">
                              {breach.resolvedBy} · {fmtDateTime(breach.resolvedAt)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {breach.status === "open" ? (
                            <button
                              type="button"
                              onClick={() => resolveBreach(breach.id, breach.rule)}
                              disabled={busy === `breach:${breach.id}`}
                              className="btn btn-secondary btn-sm"
                            >
                              <Check className="size-3" /> Resolve
                            </button>
                          ) : (
                            <span className="text-[9.5px] text-white/30">{breach.resolutionNote ? breach.resolutionNote.slice(0, 60) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Administrator audit trail" hint="Every privileged action, actor and timestamp." className="mb-0" />
              </div>
              <div className="scroll-area max-h-[360px]">
                {view.audit.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[11.5px] text-fog">No administrator actions recorded.</p>
                ) : (
                  view.audit.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2.5 border-b border-white/[0.05] px-5 py-2.5 last:border-0">
                      <UserCog className="mt-0.5 size-3.5 shrink-0 text-fog" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-snow">
                          <span className="font-mono text-[10px] text-acid">{entry.adminEmail}</span> · {entry.action}
                        </p>
                        <p className="text-[9.5px] text-fog">
                          {entry.targetType} {entry.targetId.slice(0, 10)}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                        <p className="text-[9px] text-white/30">{timeAgo(entry.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Rule-set change log" hint="Previous and new values for every configuration change." className="mb-0" />
              </div>
              <div className="scroll-area max-h-[360px]">
                {view.configHistory.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[11.5px] text-fog">No configuration changes recorded.</p>
                ) : (
                  view.configHistory.map((entry) => (
                    <details key={entry.id} className="border-b border-white/[0.05] px-5 py-2.5 last:border-0">
                      <summary className="cursor-pointer text-[11px] text-snow">
                        <span className="font-mono text-[10px] text-acid">{entry.adminEmail}</span> · {entry.action} ·{" "}
                        <span className="text-fog">{fmtDateTime(entry.createdAt)}</span>
                      </summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-[9px] tracking-wider text-fog uppercase">Previous</p>
                          <pre className="scroll-area mt-1 max-h-40 overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-2 font-mono text-[9px] text-white/50">
                            {entry.before ? JSON.stringify(entry.before, null, 1) : "none"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-[9px] tracking-wider text-fog uppercase">New</p>
                          <pre className="scroll-area mt-1 max-h-40 overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-2 font-mono text-[9px] text-white/50">
                            {JSON.stringify(entry.after, null, 1)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="card overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <SectionHeader title="Risk engine event stream" hint="Warnings, trade rejections, breaches and admin actions." className="mb-0" />
            </div>
            <div className="scroll-area max-h-[320px]">
              {view.events.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">No risk events recorded.</p>
              ) : (
                view.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-2.5 border-b border-white/[0.05] px-5 py-2.5 last:border-0">
                    <span
                      className={clsx(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        event.severity === "danger" ? "bg-rose" : event.severity === "warning" ? "bg-gold" : "bg-sky",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-snow">{event.message}</p>
                      <p className="font-mono text-[9px] text-white/30">
                        {event.accountNumber ?? "system"} · {event.rule} · {event.actorRole ?? "system"} · {timeAgo(event.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <SectionHeader title="Status transition history" hint="Account lifecycle changes across the firm." className="mb-0" />
            </div>
            <div className="scroll-area max-h-[280px]">
              {view.statusHistory.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">No status transitions recorded.</p>
              ) : (
                view.statusHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5 border-b border-white/[0.05] px-5 py-2.5 last:border-0">
                    <History className="mt-0.5 size-3.5 shrink-0 text-fog" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-snow">
                        <span className="font-mono">{entry.accountNumber ?? "—"}</span> {entry.fromStatus} → {entry.toStatus}
                      </p>
                      <p className="text-[9.5px] text-fog">{entry.reason}</p>
                      <p className="text-[9px] text-white/30">
                        {entry.actorRole ?? "system"} · {fmtDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "news" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <section className="card p-5">
            <SectionHeader title="Add news window" hint="Blackout applies when an account disallows news trading." />
            <div className="space-y-3">
              <Field label="Title">
                <input
                  className="input"
                  value={newsForm.title}
                  onChange={(event) => setNewsForm({ ...newsForm, title: event.target.value })}
                  placeholder="US CPI release"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Instrument" hint="Leave blank for all instruments.">
                  <input
                    className="input"
                    value={newsForm.symbol}
                    onChange={(event) => setNewsForm({ ...newsForm, symbol: event.target.value.toUpperCase() })}
                    placeholder="XAUUSD"
                  />
                </Field>
                <Field label="Impact">
                  <select
                    className="input"
                    value={newsForm.impact}
                    onChange={(event) => setNewsForm({ ...newsForm, impact: event.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </Field>
              </div>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  className="input"
                  value={newsForm.startsAt}
                  onChange={(event) => setNewsForm({ ...newsForm, startsAt: event.target.value })}
                />
              </Field>
              <Field label="Ends" hint="Blackout window is the event interval plus the configured buffer.">
                <input
                  type="datetime-local"
                  className="input"
                  value={newsForm.endsAt}
                  onChange={(event) => setNewsForm({ ...newsForm, endsAt: event.target.value })}
                />
              </Field>
              <button type="button" onClick={createNews} disabled={busy === "news-create"} className="btn btn-primary w-full">
                <Plus className="size-4" /> Add event
              </button>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <SectionHeader title="Calendar" hint="Cancelled events no longer trigger blackouts; history is retained." className="mb-0" />
            </div>
            {view.news.length === 0 ? (
              <EmptyState icon={<Newspaper className="size-5" />} title="No news events" body="Add releases to enforce news blackout rules." />
            ) : (
              <div className="scroll-area max-h-[460px]">
                {view.news.map((event) => (
                  <div key={event.id} className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] px-5 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] text-snow">
                        {event.title} {event.symbol ? <span className="font-mono text-[10px] text-fog">· {event.symbol}</span> : null}
                      </p>
                      <p className="text-[9.5px] text-fog">
                        {fmtDateTime(event.startsAt)} → {fmtDateTime(event.endsAt)} · {event.impact} impact
                      </p>
                    </div>
                    {event.cancelledAt ? (
                      <span className="badge badge-muted">cancelled</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cancelNews(event.id, event.title)}
                        disabled={busy === `news:${event.id}`}
                        className="btn btn-danger btn-sm"
                      >
                        <X className="size-3" /> Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {editorOpen
        ? openEditorModal(editor, form, update, saveProfile, () => {
            setEditorOpen(false);
            setEditor(null);
          }, busy)
        : null}
    </div>
  );
}

function openEditorModal(
  editor: RiskConfigDTO | null,
  form: RiskConfigDTO,
  update: <K extends keyof RiskConfigDTO>(key: K, value: RiskConfigDTO[K]) => void,
  save: () => void,
  closeEditor: () => void,
  busy: string | null,
) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card flex max-h-[90dvh] w-full max-w-[860px] flex-col overflow-hidden">
        <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <p className="eyebrow">Risk rule set</p>
            <h2 className="mt-0.5 text-[16px] font-semibold text-snow">{editor ? "Edit profile" : "New profile"}</h2>
            <p className="mt-0.5 text-[10.5px] text-fog">Every save is versioned with the administrator identity and previous values.</p>
          </div>
          <button type="button" onClick={closeEditor} className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="scroll-area flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Profile name">
              <input className="input" value={form.name} onChange={(event) => update("name", event.target.value)} />
            </Field>
            <Field label="Scope">
              <select
                className="input"
                value={form.scope}
                onChange={(event) => {
                  const scope = event.target.value as RiskConfigDTO["scope"];
                  update("scope", scope);
                  if (scope === "plan" && !form.planKey) update("planKey", "one-step");
                }}
              >
                <option value="default">Firm default</option>
                <option value="plan">Challenge plan</option>
                <option value="account">Single account</option>
              </select>
            </Field>
            {form.scope === "plan" ? (
              <Field label="Plan">
                <select className="input" value={form.planKey ?? ""} onChange={(event) => update("planKey", event.target.value || null)}>
                  <option value="trial">Trial</option>
                  <option value="one-step">One step</option>
                  <option value="two-step">Two step</option>
                  <option value="instant">Instant</option>
                </select>
              </Field>
            ) : form.scope === "account" ? (
              <Field label="Account ID">
                <input
                  className="input font-mono text-[11px]"
                  value={form.accountId ?? ""}
                  onChange={(event) => update("accountId", event.target.value || null)}
                  placeholder="Paste the account id"
                />
              </Field>
            ) : (
              <Field label="Enabled">
                <Toggle label="Profile active" checked={form.enabled} onChange={(value) => update("enabled", value)} />
              </Field>
            )}
          </div>

          {form.scope !== "default" ? (
            <Toggle label="Profile active" checked={form.enabled} onChange={(value) => update("enabled", value)} />
          ) : null}

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-white/40 uppercase">Profit targets</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Phase 1 target %" hint="Blank disables the target (funded-style).">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.profitTargetPct ?? ""}
                  onChange={(event) => update("profitTargetPct", nullableNum(event.target.value))}
                />
              </Field>
              <Field label="Phase 2 target %">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.phase2TargetPct ?? ""}
                  onChange={(event) => update("phase2TargetPct", nullableNum(event.target.value))}
                />
              </Field>
              <Field label="Minimum trading days">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={form.minTradingDays}
                  onChange={(event) => update("minTradingDays", num(event.target.value))}
                />
              </Field>
              <Field label="Maximum trading days" hint="Blank means unlimited.">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.maxTradingDays ?? ""}
                  onChange={(event) => update("maxTradingDays", nullableNum(event.target.value))}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-white/40 uppercase">Daily loss</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Daily loss %" hint="0 disables the daily limit.">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.dailyLossPct}
                  onChange={(event) => update("dailyLossPct", num(event.target.value))}
                />
              </Field>
              <Field label="Measured on">
                <select
                  className="input"
                  value={form.dailyLossBasis}
                  onChange={(event) => update("dailyLossBasis", event.target.value as RiskConfigDTO["dailyLossBasis"])}
                >
                  <option value="equity">Equity (realized + floating)</option>
                  <option value="balance">Balance (realized only)</option>
                </select>
              </Field>
              <Field label="Limit basis">
                <select
                  className="input"
                  value={form.dailyLimitBasis}
                  onChange={(event) => update("dailyLimitBasis", event.target.value as RiskConfigDTO["dailyLimitBasis"])}
                >
                  <option value="starting_balance">Initial account balance</option>
                  <option value="day_start_equity">Day-start equity</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-white/40 uppercase">Overall drawdown</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Drawdown %">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.drawdownPct}
                  onChange={(event) => update("drawdownPct", num(event.target.value))}
                />
              </Field>
              <Field label="Mode">
                <select
                  className="input"
                  value={form.drawdownMode}
                  onChange={(event) => update("drawdownMode", event.target.value as RiskConfigDTO["drawdownMode"])}
                >
                  <option value="static">Static (initial balance)</option>
                  <option value="trailing">Trailing (high-water mark)</option>
                </select>
              </Field>
              <Field label="Measured on">
                <select
                  className="input"
                  value={form.drawdownBasis}
                  onChange={(event) => update("drawdownBasis", event.target.value as RiskConfigDTO["drawdownBasis"])}
                >
                  <option value="equity">Equity</option>
                  <option value="balance">Balance</option>
                </select>
              </Field>
              <Field label="Trailing lock %" hint="Trailing only. Floor never drops below initial + lock %.">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.trailingLockPct ?? ""}
                  onChange={(event) => update("trailingLockPct", nullableNum(event.target.value))}
                  disabled={form.drawdownMode !== "trailing"}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-white/40 uppercase">Trade controls</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Max risk per trade %">
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.maxRiskPerTradePct}
                  onChange={(event) => update("maxRiskPerTradePct", num(event.target.value))}
                />
              </Field>
              <Field label="Max open positions">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.maxOpenPositions}
                  onChange={(event) => update("maxOpenPositions", num(event.target.value))}
                />
              </Field>
              <Field label="Max total exposure %">
                <input
                  type="number"
                  className="input"
                  value={form.maxTotalExposurePct}
                  onChange={(event) => update("maxTotalExposurePct", num(event.target.value))}
                />
              </Field>
              <Field label="Max per-instrument exposure %">
                <input
                  type="number"
                  className="input"
                  value={form.maxInstrumentExposurePct}
                  onChange={(event) => update("maxInstrumentExposurePct", num(event.target.value))}
                />
              </Field>
              <Field label="Max position lots">
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  className="input"
                  value={form.maxPositionLots}
                  onChange={(event) => update("maxPositionLots", num(event.target.value))}
                />
              </Field>
              <Field label="Max leverage (1:N)">
                <input
                  type="number"
                  min={1}
                  step="1"
                  className="input"
                  value={form.maxLeverage}
                  onChange={(event) => update("maxLeverage", num(event.target.value))}
                />
              </Field>
              <Field label="Restricted instruments" hint="Comma-separated symbols, e.g. XAUUSD, USDJPY.">
                <input
                  className="input font-mono text-[11px]"
                  value={form.restrictedSymbols.join(", ")}
                  onChange={(event) =>
                    update(
                      "restrictedSymbols",
                      event.target.value
                        .split(",")
                        .map((symbol) => symbol.trim().toUpperCase())
                        .filter(Boolean),
                    )
                  }
                  placeholder="None"
                />
              </Field>
              <Field label="Weekend close hour (UTC Friday)">
                <input
                  type="number"
                  min={0}
                  max={23}
                  className="input"
                  value={form.weekendCloseHourUtc}
                  onChange={(event) => update("weekendCloseHourUtc", num(event.target.value))}
                />
              </Field>
              <Field label="News blackout minutes">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={form.newsBlackoutMinutes}
                  onChange={(event) => update("newsBlackoutMinutes", num(event.target.value))}
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Toggle label="Require stop loss" checked={form.requireStopLoss} onChange={(value) => update("requireStopLoss", value)} />
              <Toggle label="Weekend holding allowed" checked={form.weekendHolding} onChange={(value) => update("weekendHolding", value)} />
              <Toggle label="News trading allowed" checked={form.newsTradingAllowed} onChange={(value) => update("newsTradingAllowed", value)} />
              <Toggle
                label="Close positions on breach"
                hint="When off, the account is locked but open positions remain."
                checked={form.closeOnBreach}
                onChange={(value) => update("closeOnBreach", value)}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-white/40 uppercase">Daily reset</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Timezone" hint="IANA name, e.g. UTC or Africa/Nairobi. DST-safe.">
                <input className="input" value={form.resetTimezone} onChange={(event) => update("resetTimezone", event.target.value)} />
              </Field>
              <Field label="Reset hour">
                <input
                  type="number"
                  min={0}
                  max={23}
                  className="input"
                  value={form.resetHour}
                  onChange={(event) => update("resetHour", num(event.target.value))}
                />
              </Field>
              <Field label="Reset minute">
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="input"
                  value={form.resetMinute}
                  onChange={(event) => update("resetMinute", num(event.target.value))}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-5 py-3">
          <p className="text-[10px] text-fog">Changes apply to new and existing evaluations of the affected accounts.</p>
          <div className="flex gap-2">
            <button type="button" onClick={closeEditor} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy === "config-save"} className="btn btn-primary btn-sm">
              <Save className="size-3.5" /> Save profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
