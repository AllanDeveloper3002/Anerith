"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Banknote,
  Check,
  Clock3,
  Layers,
  Plug,
  Plus,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { RiskAdminClient } from "@/components/risk-admin-client";
import { EngineAdminClient } from "@/components/engine-admin-client";
import { EmptyState, SectionHeader } from "@/components/ui";
import { api, errorMessage, patch, post } from "@/lib/client";
import { fmtDate, fmtDateTime, fmtSignedUsd, fmtUsd, timeAgo } from "@/lib/format";
import type { AdminSummary } from "@/lib/admin";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payouts", label: "Payouts" },
  { key: "kyc", label: "KYC queue" },
  { key: "accounts", label: "Accounts" },
  { key: "users", label: "Users" },
  { key: "brokers", label: "Broker bridge" },
  { key: "competition", label: "Competition" },
  { key: "risk", label: "Risk engine" },
  { key: "engine", label: "Trading engine" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function statusBadge(status: string) {
  if (status === "completed" || status === "verified" || status === "active" || status === "connected")
    return "badge-acid";
  if (status === "processing" || status === "pending") return "badge-gold";
  if (status === "failed" || status === "rejected" || status === "error") return "badge-rose";
  if (status === "passed") return "badge-sky";
  return "badge-muted";
}

export function AdminClient({ initial }: { initial: AdminSummary }) {
  const toast = useToast();
  const [summary, setSummary] = useState(initial);
  const [tab, setTab] = useState<TabKey>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [brokerModal, setBrokerModal] = useState(false);
  const [competitionModal, setCompetitionModal] = useState(false);

  const processing = summary.payouts.filter((payout) => payout.status === "processing");
  const visiblePayouts = useMemo(
    () =>
      summary.payouts.filter((payout) => statusFilter === "all" || payout.status === statusFilter),
    [summary.payouts, statusFilter],
  );

  async function refresh() {
    setRefreshing(true);
    try {
      const data = await api<AdminSummary>("/api/admin/summary");
      setSummary(data);
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function payoutAction(id: string, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Reason for rejecting this payout:");
      if (input === null) return;
      reason = input || "Rejected by the risk desk.";
    }
    setBusy(id);
    try {
      const data = await post<{ message: string }>(`/api/admin/payouts/${id}`, { action, reason });
      toast.push(data.message, "success");
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function kycAction(id: string, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Reason for rejecting this verification:");
      if (input === null) return;
      reason = input || "Document could not be verified.";
    }
    setBusy(id);
    try {
      const data = await post<{ message: string }>(`/api/admin/kyc/${id}`, { action, reason });
      toast.push(data.message, "success");
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function brokerAction(id: string, action: "test" | "pause" | "resume") {
    setBusy(id);
    try {
      if (action === "test") {
        const data = await post<{ message: string }>(`/api/admin/brokers/${id}`);
        toast.push(data.message, "success");
      } else {
        const data = await patch<{ message: string }>(`/api/admin/brokers/${id}`, {
          status: action === "resume" ? "connected" : "disconnected",
        });
        toast.push(data.message, "success");
      }
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function settleCompetition() {
    const competition = summary.competition;
    if (!competition) return;
    if (!window.confirm(`Settle "${competition.name}" now and credit prizes? This cannot be undone.`)) return;
    setBusy(competition.id);
    try {
      const data = await post<{ message: string }>(`/api/admin/competitions/${competition.id}`, {
        action: "settle",
      });
      toast.push(data.message, "success");
      await refresh();
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
          <div className="flex items-center gap-2">
            <span className="eyebrow">Operations</span>
            <span className="badge badge-rose">Restricted</span>
          </div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Anerith command desk</h1>
          <p className="mt-1 text-[12.5px] text-fog">
            Payout review, identity checks, account health and broker routing.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn btn-secondary btn-sm">
          <RefreshCw className={clsx("size-3.5", refreshing && "animate-spin")} /> Refresh data
        </button>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((item) => (
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
            {item.key === "payouts" && processing.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 font-mono text-[9px] text-gold">
                {processing.length}
              </span>
            ) : null}
            {item.key === "kyc" && summary.kycQueue.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 font-mono text-[9px] text-gold">
                {summary.kycQueue.length}
              </span>
            ) : null}
            {item.key === "risk" && summary.metrics.openBreaches > 0 ? (
              <span className="ml-1.5 rounded-full bg-rose/20 px-1.5 py-0.5 font-mono text-[9px] text-rose">
                {summary.metrics.openBreaches}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Traders", value: String(summary.metrics.users), icon: Users },
              { label: "Active accounts", value: String(summary.metrics.activeAccounts), icon: Layers },
              { label: "Funded capital", value: fmtUsd(summary.metrics.fundedCapital), icon: Wallet },
              { label: "Payout volume", value: fmtUsd(summary.metrics.payoutVolume), icon: Banknote },
              { label: "Challenge revenue", value: fmtUsd(summary.metrics.challengeRevenue), icon: Activity },
              {
                label: "Awaiting action",
                value: String(summary.metrics.processingPayouts + summary.metrics.pendingKyc),
                icon: Clock3,
                tone: "text-gold",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="card p-4">
                  <div className="flex items-center justify-between text-fog">
                    <span className="text-[9.5px] tracking-[0.1em] uppercase">{item.label}</span>
                    <Icon className="size-3.5" />
                  </div>
                  <p className={clsx("mt-2 font-mono text-[18px] font-medium", item.tone ?? "text-snow")}>
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Payout review" hint="Processing requests settle after your action." className="mb-0" />
                <button type="button" onClick={() => setTab("payouts")} className="text-[11px] text-acid hover:underline">
                  View all
                </button>
              </div>
              {processing.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">No payouts waiting for review.</p>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {processing.slice(0, 5).map((payout) => (
                    <div key={payout.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-snow">{payout.user}</p>
                        <p className="text-[10px] text-fog">
                          {payout.accountNumber} · {fmtUsd(payout.net)} net · {timeAgo(payout.requestedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => payoutAction(payout.id, "approve")}
                        disabled={busy === payout.id}
                        className="btn btn-primary btn-sm"
                      >
                        <Check className="size-3" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => payoutAction(payout.id, "reject")}
                        disabled={busy === payout.id}
                        className="btn btn-danger btn-sm"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <SectionHeader title="Verification queue" hint="Approve or decline identity checks." className="mb-0" />
                <button type="button" onClick={() => setTab("kyc")} className="text-[11px] text-acid hover:underline">
                  View all
                </button>
              </div>
              {summary.kycQueue.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-fog">Queue is clear.</p>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {summary.kycQueue.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-snow">{entry.full_name}</p>
                        <p className="text-[10px] text-fog">
                          {entry.email} · {entry.kyc_submitted_at ? timeAgo(entry.kyc_submitted_at) : "not submitted"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => kycAction(entry.id, "approve")}
                        disabled={busy === entry.id}
                        className="btn btn-primary btn-sm"
                      >
                        <BadgeCheck className="size-3" /> Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => kycAction(entry.id, "reject")}
                        disabled={busy === entry.id}
                        className="btn btn-danger btn-sm"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card p-5">
              <SectionHeader title="Bridge health" hint="Connected broker routes and sync status." />
              <div className="space-y-2.5">
                {summary.brokers.map((broker) => (
                  <div
                    key={broker.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"
                  >
                    <ServerCog className="size-4 text-fog" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] text-snow">{broker.name}</p>
                      <p className="text-[9.5px] text-fog">
                        {broker.provider} · {broker.environment} · {broker.accountCount} accounts
                      </p>
                    </div>
                    <span className={clsx("badge capitalize", statusBadge(broker.status))}>{broker.status}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <SectionHeader title="Recent bridge events" hint="Handshakes, tests and routing changes." />
              <div className="scroll-area max-h-[240px] space-y-2">
                {summary.brokerEvents.length === 0 ? (
                  <p className="text-[11px] text-fog">No events logged.</p>
                ) : (
                  summary.brokerEvents.slice(0, 10).map((event) => (
                    <div key={event.id} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-black/20 p-2.5">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-acid" />
                      <div>
                        <p className="text-[10.5px] text-snow">{event.message}</p>
                        <p className="text-[9px] text-white/30">
                          {event.connectionName} · {timeAgo(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "payouts" ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
            {["all", "processing", "completed", "rejected"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={clsx(
                  "rounded-lg px-2.5 py-1 text-[10.5px] font-medium capitalize transition",
                  statusFilter === value ? "bg-white/[0.08] text-snow" : "text-fog hover:text-snow",
                )}
              >
                {value}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-fog">{visiblePayouts.length} records</span>
          </div>
          {visiblePayouts.length === 0 ? (
            <EmptyState icon={<Banknote className="size-5" />} title="No payouts in this view" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Trader</th>
                    <th>Account</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Net</th>
                    <th>Method</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePayouts.map((payout) => (
                    <tr key={payout.id}>
                      <td className="text-[10px] text-fog">{fmtDateTime(payout.requestedAt)}</td>
                      <td>
                        <p className="text-[11.5px] text-snow">{payout.user}</p>
                        <p className="text-[9px] text-fog">{payout.email}</p>
                      </td>
                      <td className="font-mono text-[10.5px]">{payout.accountNumber}</td>
                      <td className="text-right font-mono text-[11px]">{fmtUsd(payout.amount)}</td>
                      <td className="text-right font-mono text-[11px] text-acid">{fmtUsd(payout.net)}</td>
                      <td className="text-[10.5px] capitalize text-fog">{payout.method}</td>
                      <td className="max-w-[140px] truncate text-[10px] text-fog" title={payout.destination}>
                        {payout.destination}
                      </td>
                      <td>
                        <span className={clsx("badge capitalize", statusBadge(payout.status))}>{payout.status}</span>
                      </td>
                      <td>
                        {payout.status === "processing" ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => payoutAction(payout.id, "approve")}
                              disabled={busy === payout.id}
                              className="btn btn-primary btn-sm"
                            >
                              <Check className="size-3" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => payoutAction(payout.id, "reject")}
                              disabled={busy === payout.id}
                              className="btn btn-danger btn-sm"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-right font-mono text-[9px] text-white/30">{payout.reference}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "kyc" ? (
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader
              title="Identity verification queue"
              hint="Verified traders can request funded-account payouts."
              className="mb-0"
            />
          </div>
          {summary.kycQueue.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="size-5" />} title="Verification queue clear" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Trader</th>
                    <th>Email</th>
                    <th>Country</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.kycQueue.map((entry) => (
                    <tr key={entry.id}>
                      <td className="text-[11.5px] text-snow">{entry.full_name}</td>
                      <td className="text-[10.5px] text-fog">{entry.email}</td>
                      <td className="text-[10.5px] text-fog">{entry.country ?? "—"}</td>
                      <td className="text-[10px] text-fog">
                        {entry.kyc_submitted_at ? fmtDateTime(entry.kyc_submitted_at) : "Not submitted"}
                      </td>
                      <td>
                        <span className={clsx("badge capitalize", statusBadge(entry.kyc_status))}>
                          {entry.kyc_status}
                        </span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => kycAction(entry.id, "approve")}
                            disabled={busy === entry.id}
                            className="btn btn-primary btn-sm"
                          >
                            <BadgeCheck className="size-3" /> Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => kycAction(entry.id, "reject")}
                            disabled={busy === entry.id}
                            className="btn btn-danger btn-sm"
                          >
                            <X className="size-3" /> Decline
                          </button>
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

      {tab === "accounts" ? (
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader title="All trading accounts" hint="Newest first · balances are mark-to-market." className="mb-0" />
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Owner</th>
                  <th>Program</th>
                  <th>Phase</th>
                  <th>Status</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {summary.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <p className="font-mono text-[11px] text-snow">{account.number}</p>
                      <p className="text-[9px] text-fog">{account.brokerLogin ?? "—"}</p>
                    </td>
                    <td>
                      <p className="text-[11px] text-snow">{account.owner}</p>
                      <p className="text-[9px] text-fog">{account.email}</p>
                    </td>
                    <td className="text-[10.5px] text-fog">{account.plan}</td>
                    <td className="text-[10.5px] text-fog">{account.type === "funded" ? "Funded" : `Phase ${account.phase}`}</td>
                    <td>
                      <span className={clsx("badge capitalize", statusBadge(account.status))}>{account.status}</span>
                    </td>
                    <td className="text-right font-mono text-[10.5px]">${account.size.toLocaleString("en-US")}</td>
                    <td className="text-right font-mono text-[10.5px]">{fmtUsd(account.balance)}</td>
                    <td
                      className={clsx(
                        "text-right font-mono text-[10.5px]",
                        account.profit >= 0 ? "text-acid" : "text-rose",
                      )}
                    >
                      {fmtSignedUsd(account.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHeader title="Registered traders" hint="Latest 80 accounts on the platform." className="mb-0" />
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Country</th>
                  <th>Role</th>
                  <th>KYC</th>
                  <th className="text-right">Accounts</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {summary.users.map((user) => (
                  <tr key={user.id}>
                    <td className="text-[11.5px] text-snow">{user.full_name}</td>
                    <td className="text-[10.5px] text-fog">{user.email}</td>
                    <td className="text-[10.5px] text-fog">{user.country ?? "—"}</td>
                    <td className="text-[10.5px] capitalize text-fog">{user.role}</td>
                    <td>
                      <span className={clsx("badge capitalize", statusBadge(user.kyc_status))}>{user.kyc_status}</span>
                    </td>
                    <td className="text-right font-mono text-[10.5px]">
                      {user.active_count}/{user.account_count}
                    </td>
                    <td className="text-[10px] text-fog">{fmtDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "brokers" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => setBrokerModal(true)} className="btn btn-primary btn-sm">
              <Plug className="size-3.5" /> Connect bridge
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {summary.brokers.map((broker) => (
              <article key={broker.id} className="card overflow-hidden">
                <div className="flex items-start justify-between border-b border-white/[0.06] p-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={clsx("badge capitalize", statusBadge(broker.status))}>{broker.status}</span>
                      <span className="badge badge-muted capitalize">{broker.environment}</span>
                    </div>
                    <h2 className="mt-2 text-[15px] font-semibold">{broker.name}</h2>
                    <p className="text-[10.5px] text-fog">
                      {broker.provider} · {broker.accountCount} routed accounts
                    </p>
                  </div>
                  <ServerCog className="size-5 text-fog" />
                </div>
                <div className="space-y-2 p-5 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-fog">Endpoint</span>
                    <span className="max-w-[230px] truncate font-mono text-snow">{broker.endpoint}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fog">API key</span>
                    <span className="font-mono text-snow">{broker.apiKeyPreview}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fog">Last sync</span>
                    <span className="text-snow">{broker.lastSyncAt ? timeAgo(broker.lastSyncAt) : "Never"}</span>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-white/[0.06] p-4">
                  <button
                    type="button"
                    onClick={() => brokerAction(broker.id, "test")}
                    disabled={busy === broker.id}
                    className="btn btn-secondary btn-sm flex-1"
                  >
                    Test handshake
                  </button>
                  <button
                    type="button"
                    onClick={() => brokerAction(broker.id, broker.status === "connected" ? "pause" : "resume")}
                    disabled={busy === broker.id}
                    className={clsx("btn btn-sm flex-1", broker.status === "connected" ? "btn-danger" : "btn-primary")}
                  >
                    {broker.status === "connected" ? "Pause routing" : "Resume routing"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <section className="card p-5">
            <SectionHeader title="Bridge event log" hint="Operational timeline across every connection." />
            <div className="space-y-2">
              {summary.brokerEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-black/20 p-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-acid" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] text-snow">{event.message}</p>
                    <p className="text-[9px] text-white/30">
                      {event.connectionName} · {fmtDateTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "competition" ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <SectionHeader
                  title={summary.competition?.name ?? "No competition"}
                  hint={
                    summary.competition
                      ? `Prize pool ${fmtUsd(summary.competition.prizePool)} · ${summary.competition.entries.length} entries · ${fmtDate(summary.competition.endAt)} close`
                      : undefined
                  }
                  className="mb-0"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {summary.competition ? (
                <span
                  className={clsx(
                    "badge capitalize",
                    summary.competition.status === "active"
                      ? "badge-acid"
                      : summary.competition.status === "upcoming"
                        ? "badge-gold"
                        : "badge-muted",
                  )}
                >
                  {summary.competition.status}
                </span>
              ) : null}
              {summary.competition && summary.competition.status !== "ended" ? (
                <button
                  type="button"
                  onClick={settleCompetition}
                  disabled={busy === summary.competition.id}
                  className="btn btn-danger btn-sm"
                >
                  <Trophy className="size-3" /> Settle now
                </button>
              ) : null}
              <button type="button" onClick={() => setCompetitionModal(true)} className="btn btn-primary btn-sm">
                <Plus className="size-3" /> New
              </button>
            </div>
          </div>
          {summary.competition ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Trader</th>
                    <th>Account size</th>
                    <th className="text-right">Peak</th>
                    <th className="text-right">Return</th>
                    <th className="text-right">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.competition.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="font-mono text-[11px] text-fog">#{entry.rank}</td>
                      <td className="text-[11.5px] text-snow">
                        {entry.displayName}
                        {entry.isYou ? <span className="ml-2 badge badge-acid">Admin</span> : null}
                      </td>
                      <td className="font-mono text-[10.5px]">${entry.accountSize.toLocaleString("en-US")}</td>
                      <td className="text-right font-mono text-[11px] text-fog">
                        {entry.peakReturnPct.toFixed(2)}%
                      </td>
                      <td
                        className={clsx(
                          "text-right font-mono text-[11px]",
                          entry.returnPct >= 0 ? "text-acid" : "text-rose",
                        )}
                      >
                        {entry.returnPct >= 0 ? "+" : ""}
                        {entry.returnPct.toFixed(2)}%
                      </td>
                      <td className="text-right font-mono text-[11px] text-gold">
                        {entry.prize > 0 ? fmtUsd(entry.prize) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-white/[0.05] px-5 py-3 text-[10.5px] text-fog">
                {summary.competition.settledAt
                  ? `Settled ${fmtDateTime(summary.competition.settledAt)}. Prizes credited to trader ledgers and the next round opened automatically.`
                  : "Returns refresh live from account equity. Settlement runs automatically at close and pays 50 / 30 / 20."}
              </p>
            </div>
          ) : (
            <EmptyState icon={<Trophy className="size-5" />} title="No competition configured" />
          )}
        </section>
      ) : null}

      {tab === "risk" ? <RiskAdminClient initial={null} /> : null}
      {tab === "engine" ? <EngineAdminClient /> : null}

      {brokerModal ? (
        <BrokerForm
          onClose={() => setBrokerModal(false)}
          onCreated={async () => {
            setBrokerModal(false);
            await refresh();
          }}
        />
      ) : null}

      {competitionModal ? (
        <CompetitionForm
          onClose={() => setCompetitionModal(false)}
          onCreated={async () => {
            setCompetitionModal(false);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CompetitionForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState(
    "Trade any Anerith account. Highest verified percentage return over the round wins a share of the prize pool.",
  );
  const [prizePool, setPrizePool] = useState("25000");
  const [durationDays, setDurationDays] = useState("30");
  const [startAt, setStartAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await post<{ message: string }>("/api/admin/competitions", {
        name,
        description,
        prizePool: Number(prizePool),
        durationDays: Number(durationDays),
        startAt: startAt ? new Date(startAt).toISOString() : null,
      });
      toast.push(data.message, "success");
      await onCreated();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold">Open a competition round</p>
            <p className="text-[10.5px] text-fog">Prizes pay 50 / 30 / 20 from verified returns.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow"
            aria-label="Close competition form"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="competition-name">
              Name
            </label>
            <input
              id="competition-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Anerith Spring Sprint"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="competition-description">
              Description
            </label>
            <textarea
              id="competition-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="input resize-none text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="competition-prizepool">
                Prize pool (USD)
              </label>
              <input
                id="competition-prizepool"
                type="number"
                min={100}
                value={prizePool}
                onChange={(event) => setPrizePool(event.target.value)}
                className="input font-mono text-[12px]"
              />
            </div>
            <div>
              <label className="label" htmlFor="competition-duration">
                Duration (days)
              </label>
              <input
                id="competition-duration"
                type="number"
                min={1}
                max={365}
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                className="input font-mono text-[12px]"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="competition-start">
              Start date (optional)
            </label>
            <input
              id="competition-start"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              className="input text-[12px]"
            />
            <p className="mt-1 text-[9px] text-white/30">Leave blank to open the round immediately.</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} className="btn btn-primary flex-1">
              {busy ? "Opening…" : "Open round"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrokerForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("mt5");
  const [environment, setEnvironment] = useState("demo");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await post<{ message: string }>("/api/admin/brokers", {
        name,
        provider,
        environment,
        endpoint,
        apiKey,
      });
      toast.push(data.message, "success");
      await onCreated();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold">Connect broker bridge</p>
            <p className="text-[10.5px] text-fog">Route new evaluations and funded accounts.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow"
            aria-label="Close bridge form"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="bridge-name">
              Bridge name
            </label>
            <input
              id="bridge-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Anerith Eval Bridge"
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bridge-provider">
                Provider
              </label>
              <select
                id="bridge-provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="select"
              >
                <option value="mt5">MetaTrader 5</option>
                <option value="match-trader">Match-Trader</option>
                <option value="ctrader">cTrader</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bridge-env">
                Environment
              </label>
              <select
                id="bridge-env"
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                className="select"
              >
                <option value="demo">Demo</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="bridge-endpoint">
              Endpoint
            </label>
            <input
              id="bridge-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="bridge.anerith.internal:443"
              className="input font-mono text-[12px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="bridge-key">
              API key
            </label>
            <input
              id="bridge-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Minimum 8 characters"
              className="input font-mono text-[12px]"
            />
            <p className="mt-1 text-[9px] text-white/30">
              Only a SHA-256 hash and a masked preview are stored.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} className="btn btn-primary flex-1">
              {busy ? "Connecting…" : "Connect bridge"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
