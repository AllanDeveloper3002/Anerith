"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock3,
  Landmark,
  Printer,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { EmptyState, SectionHeader, StatBlock } from "@/components/ui";
import { api, errorMessage, post } from "@/lib/client";
import { fmtDate, fmtDateTime, fmtUsd } from "@/lib/format";
import type { AccountDTO, PayoutDTO } from "@/lib/types";

export function PayoutsClient({
  initialPayouts,
  initialAccounts,
  kycStatus,
  minPayout,
}: {
  initialPayouts: PayoutDTO[];
  initialAccounts: AccountDTO[];
  kycStatus: "unverified" | "pending" | "verified" | "rejected";
  minPayout: number;
}) {
  const toast = useToast();
  const [payouts, setPayouts] = useState(initialPayouts);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState(
    initialAccounts.find((account) => account.type === "funded" && account.status === "active" && account.payoutAvailable > 0)?.id ??
      initialAccounts.find((account) => account.type === "funded" && account.status === "active")?.id ??
      "",
  );
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"card" | "bank" | "crypto">("card");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [certificate, setCertificate] = useState<PayoutDTO | null>(null);

  const eligible = accounts.filter((account) => account.type === "funded" && account.status === "active");
  const account = accounts.find((item) => item.id === accountId) ?? eligible[0] ?? null;
  const amountNumber = Number(amount);
  const available = account?.payoutAvailable ?? 0;
  const split = account?.profitSplitPct ?? 80;
  const gross = Number.isFinite(amountNumber) ? Math.max(0, amountNumber) : 0;
  const net = gross * (split / 100);
  const platformShare = gross - net;

  const totals = useMemo(() => {
    const completed = payouts.filter((payout) => payout.status === "completed");
    const pending = payouts.filter((payout) => payout.status === "processing");
    return {
      paid: completed.reduce((sum, payout) => sum + payout.net, 0),
      pending: pending.reduce((sum, payout) => sum + payout.net, 0),
      available: eligible.reduce((sum, item) => sum + item.payoutAvailable, 0),
      count: completed.length,
    };
  }, [payouts, eligible]);

  const verified = kycStatus === "verified";
  const canSubmit =
    verified &&
    Boolean(account) &&
    gross >= minPayout &&
    gross <= available &&
    destination.trim().length >= 4 &&
    !busy;

  async function refresh() {
    try {
      const data = await api<{ payouts: PayoutDTO[]; accounts: AccountDTO[]; kycStatus: string }>(
        "/api/payouts",
      );
      setPayouts(data.payouts);
      setAccounts(data.accounts);
    } catch {
      /* ignore refresh failure */
    }
  }

  async function submit() {
    if (!account) return;
    setBusy(true);
    try {
      const data = await post<{ payout: PayoutDTO; message: string }>("/api/payouts", {
        accountId: account.id,
        amount: gross,
        method,
        destination: destination.trim(),
      });
      setPayouts((current) => [data.payout, ...current]);
      setAmount("");
      setDestination("");
      toast.push(data.message, "success");
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function printCertificate(payout: PayoutDTO) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${payout.reference}</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;background:#f3f5f2;margin:0;padding:48px;color:#0b0f10}
        .sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dfe5df;border-radius:18px;padding:56px;position:relative;overflow:hidden}
        .glow{position:absolute;right:-120px;top:-120px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,#d9ff9a55,transparent 70%)}
        .brand{display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.22em;font-size:14px}
        .mark{width:34px;height:34px;border-radius:9px;background:#0b0f10;color:#c9f75c;display:grid;place-items:center;font-size:17px}
        h1{font-size:30px;letter-spacing:-.03em;margin:38px 0 6px}
        .eyebrow{letter-spacing:.24em;font-size:10px;text-transform:uppercase;color:#7b857e}
        .amount{font-size:46px;font-weight:600;margin:22px 0 4px;font-variant-numeric:tabular-nums}
        .subject{color:#5d6862;font-size:13px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:34px;border-top:1px solid #e6eae6;padding-top:24px;font-size:12px}
        .lbl{color:#8a948d;text-transform:uppercase;letter-spacing:.12em;font-size:9px;margin-bottom:4px}
        .sig{margin-top:52px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#5d6862}
        .line{width:200px;border-top:1px solid #b9c2bb;padding-top:6px}
        .foot{position:absolute;bottom:24px;left:56px;font-size:9px;color:#a3aca6}
        @media print{body{background:#fff;padding:0}.sheet{border:none}}
      </style></head><body><div class="sheet">
      <div class="glow"></div>
      <div class="brand"><div class="mark">A</div>ANERITH CAPITAL</div>
      <p class="eyebrow" style="margin-top:36px">Profit payout certificate</p>
      <h1>Withdrawal confirmed.</h1>
      <p class="amount">$${payout.net.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
      <p class="subject">Paid to ${payout.destination}</p>
      <div class="grid">
        <div><p class="lbl">Account</p><p>${payout.accountNumber} · $${payout.accountSize.toLocaleString("en-US")}</p></div>
        <div><p class="lbl">Reference</p><p>${payout.reference}</p></div>
        <div><p class="lbl">Gross profit</p><p>$${payout.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p></div>
        <div><p class="lbl">Profit split</p><p>${Math.round((payout.net / Math.max(0.01, payout.amount)) * 100)}% trader share</p></div>
        <div><p class="lbl">Method</p><p>${payout.method}</p></div>
        <div><p class="lbl">Processed</p><p>${payout.processedAt ? new Date(payout.processedAt).toLocaleString("en-US") : "—"}</p></div>
      </div>
      <div class="sig"><div class="line">Anerith Payouts Desk</div><div style="text-align:right">Verified payout<br/><strong>${payout.reference}</strong></div></div>
      <p class="foot">Anerith Capital · Payout certificate · Verified by the Anerith payouts desk.</p>
      </div><script>window.onload=()=>{window.print()}</script></body></html>`;
    const win = window.open("", "_blank", "width=860,height=900");
    if (!win) {
      toast.push("Allow pop-ups to print your certificate.", "warning");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Profit withdrawals</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Turn performance into payouts.</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-fog">
          Request a withdrawal from any active funded account. Payouts settle after risk review,
          with a printable certificate for every completed withdrawal.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Lifetime paid", value: fmtUsd(totals.paid), icon: Award },
          { label: "In review", value: fmtUsd(totals.pending), icon: Clock3 },
          { label: "Available now", value: fmtUsd(totals.available), icon: Wallet },
          { label: "Completed payouts", value: String(totals.count), icon: CheckCircle2 },
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

      {!verified ? (
        <div className="card flex flex-wrap items-center gap-3 border-gold/20 bg-gold/[0.04] p-4">
          <ShieldAlert className="size-5 text-gold" />
          <div className="flex-1">
            <p className="text-[12.5px] font-medium text-gold">
              {kycStatus === "pending" ? "Identity verification under review" : "Verify your identity to unlock payouts"}
            </p>
            <p className="text-[11px] text-fog">
              Anerith requires a verified profile before releasing profit withdrawals.
            </p>
          </div>
          <Link href="/app/settings" className="btn btn-secondary btn-sm">
            Go to verification
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <section className="card p-5">
          <SectionHeader title="Request a payout" hint="Minimum $100 · paid at your profit split." />
          {eligible.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-5" />}
              title="No funded account yet"
              body="Complete an evaluation or choose an Instant program to unlock profit withdrawals."
              action={
                <Link href="/app/challenges" className="btn btn-primary btn-sm">
                  View programs
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="payout-account">
                  Funded account
                </label>
                <select
                  id="payout-account"
                  value={account?.id ?? ""}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="select"
                >
                  {eligible.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.number} · ${item.size.toLocaleString("en-US")} · {fmtUsd(item.payoutAvailable)} available
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="label mb-0" htmlFor="payout-amount">
                      Amount (USD)
                    </label>
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.max(0, Math.floor(available * 100) / 100)))}
                      className="text-[10px] font-medium text-acid hover:underline"
                    >
                      Max {fmtUsd(available)}
                    </button>
                  </div>
                  <input
                    id="payout-amount"
                    type="number"
                    min={minPayout}
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="100.00"
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="payout-destination">
                    Destination
                  </label>
                  <input
                    id="payout-destination"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder={method === "crypto" ? "USDT wallet address" : method === "bank" ? "IBAN / account number" : "Card ending 4242"}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <p className="label">Method</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: "card", label: "Card" },
                      { key: "bank", label: "Bank transfer" },
                      { key: "crypto", label: "Crypto" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMethod(item.key)}
                      className={clsx(
                        "rounded-lg border py-2 text-[11px] font-medium transition",
                        method === item.key
                          ? "border-acid/40 bg-acid/[0.07] text-acid"
                          : "border-white/[0.08] text-fog hover:border-white/20 hover:text-snow",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-black/20 p-3.5 text-[11.5px]">
                <div className="flex justify-between text-fog">
                  <span>Gross profit</span>
                  <span className="font-mono text-snow">{fmtUsd(gross)}</span>
                </div>
                <div className="flex justify-between text-fog">
                  <span>Profit split ({split}% to you)</span>
                  <span className="font-mono text-snow">{fmtUsd(platformShare)} retained</span>
                </div>
                <div className="flex justify-between border-t border-white/[0.06] pt-2 text-[13px]">
                  <span className="text-snow">You receive</span>
                  <span className="font-mono font-medium text-acid">{fmtUsd(net)}</span>
                </div>
              </div>

              {gross > available ? (
                <p className="text-[10.5px] text-rose">Amount exceeds available profit of {fmtUsd(available)}.</p>
              ) : null}

              <button type="button" onClick={submit} disabled={!canSubmit} className="btn btn-primary w-full">
                {busy ? "Submitting…" : `Request ${fmtUsd(net)} payout`}
              </button>
              <p className="text-center text-[9.5px] text-white/30">
                Payouts over {fmtUsd(100)} are reviewed by the risk desk before funds are released.
              </p>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="p-5 pb-0">
            <SectionHeader title="Payout history" hint="Certificates are available for completed payouts." />
          </div>
          {payouts.length === 0 ? (
            <EmptyState icon={<Banknote className="size-5" />} title="No payouts yet" body="Your completed funded-account withdrawals appear here." />
          ) : (
            <div className="scroll-area max-h-[520px] divide-y divide-white/[0.05]">
              {payouts.map((payout) => (
                <div key={payout.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div
                    className={clsx(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      payout.status === "completed"
                        ? "bg-acid/10 text-acid"
                        : payout.status === "processing"
                          ? "bg-gold/10 text-gold"
                          : "bg-rose/10 text-rose",
                    )}
                  >
                    {payout.status === "completed" ? <BadgeCheck className="size-4" /> : payout.status === "processing" ? <Clock3 className="size-4" /> : <X className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12.5px] text-snow">{fmtUsd(payout.net)}</p>
                    <p className="text-[10px] text-fog">
                      {payout.accountNumber} · {payout.method} · {fmtDateTime(payout.requestedAt)}
                    </p>
                    <p className="font-mono text-[9px] text-white/30">{payout.reference}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={clsx(
                        "badge capitalize",
                        payout.status === "completed"
                          ? "badge-acid"
                          : payout.status === "processing"
                            ? "badge-gold"
                            : "badge-rose",
                      )}
                    >
                      {payout.status}
                    </span>
                    {payout.status === "completed" ? (
                      <button
                        type="button"
                        onClick={() => setCertificate(payout)}
                        className="flex items-center gap-1 text-[10px] text-acid hover:underline"
                      >
                        <Award className="size-3" /> Certificate
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <StatBlock label="Eligible accounts" value={String(eligible.length)} tone="muted" />
        <StatBlock label="Minimum payout" value={fmtUsd(minPayout)} tone="muted" />
        <StatBlock label="Verification" value={kycStatus === "verified" ? "Verified" : kycStatus === "pending" ? "Pending" : "Required"} tone={verified ? "acid" : "gold"} />
      </div>

      {certificate ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
              <p className="text-[12.5px] font-medium">Payout certificate</p>
              <button
                type="button"
                onClick={() => setCertificate(null)}
                className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow"
                aria-label="Close certificate"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="bg-[#f4f6f2] p-7 text-[#0b0f10]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em]">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#0b0f10] text-acid">A</span>
                  ANERITH CAPITAL
                </div>
                <Award className="size-7 text-[#7e9a35]" />
              </div>
              <p className="mt-8 text-[9px] tracking-[0.24em] text-[#7b857e] uppercase">Profit payout certificate</p>
              <p className="mt-2 font-mono text-[34px] font-semibold tracking-tight">{fmtUsd(certificate.net)}</p>
              <p className="mt-1 text-[12px] text-[#5d6862]">
                Paid to {certificate.destination} · {fmtDate(certificate.processedAt)}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#dfe5df] pt-5 text-[11px]">
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-[#8a948d] uppercase">Account</p>
                  <p className="mt-0.5">{certificate.accountNumber}</p>
                </div>
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-[#8a948d] uppercase">Reference</p>
                  <p className="mt-0.5 font-mono">{certificate.reference}</p>
                </div>
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-[#8a948d] uppercase">Gross profit</p>
                  <p className="mt-0.5">{fmtUsd(certificate.amount)}</p>
                </div>
                <div>
                  <p className="text-[8.5px] tracking-[0.12em] text-[#8a948d] uppercase">Method</p>
                  <p className="mt-0.5">{certificate.method}</p>
                </div>
              </div>
              <p className="mt-6 text-[8.5px] text-[#a3aca6]">
                Anerith Capital · Verified payout certificate
              </p>
            </div>
            <div className="flex gap-2 p-4">
              <button type="button" onClick={() => setCertificate(null)} className="btn btn-secondary flex-1">
                Close
              </button>
              <button type="button" onClick={() => printCertificate(certificate)} className="btn btn-primary flex-1">
                <Printer className="size-4" /> Print / PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
