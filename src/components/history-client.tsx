"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Download, History, ReceiptText } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { EmptyState } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { fmtDateTime, fmtSignedUsd, fmtUsd } from "@/lib/format";
import { phaseLabel } from "@/lib/challenges";
import type { AccountDTO, ClosedTradeDTO, TransactionDTO } from "@/lib/types";

const TRANSACTION_LABELS: Record<TransactionDTO["type"], string> = {
  challenge_purchase: "Challenge purchase",
  payout: "Payout",
  payout_reversal: "Payout reversal",
  competition_prize: "Competition prize",
  commission: "Commission",
  trade: "Trade settlement",
  adjustment: "Adjustment",
};

export function HistoryClient({
  initialAccounts,
  initialAccountId,
  initialTrades,
  initialTransactions,
}: {
  initialAccounts: AccountDTO[];
  initialAccountId: string;
  initialTrades: ClosedTradeDTO[];
  initialTransactions: TransactionDTO[];
}) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [trades, setTrades] = useState(initialTrades);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [tab, setTab] = useState<"trades" | "ledger">("trades");
  const [loading, setLoading] = useState(false);

  const stats = useMemo(() => {
    const wins = trades.filter((trade) => trade.net > 0);
    const losses = trades.filter((trade) => trade.net < 0);
    const net = trades.reduce((sum, trade) => sum + trade.net, 0);
    return {
      net,
      count: trades.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      volume: trades.reduce((sum, trade) => sum + trade.lots, 0),
      wins: wins.length,
      losses: losses.length,
    };
  }, [trades]);

  const loadAccount = useCallback(
    async (id: string) => {
      setAccountId(id);
      setLoading(true);
      try {
        const data = await api<{
          trades: ClosedTradeDTO[];
          transactions: TransactionDTO[];
        }>(`/api/history?accountId=${encodeURIComponent(id)}`);
        setTrades(data.trades);
        setTransactions(data.transactions);
      } catch (error) {
        toast.push(errorMessage(error), "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  function exportCsv() {
    const header = "opened,closed,symbol,side,lots,entry,exit,profit,commission,swap,net,reason";
    const rows = trades.map((trade) =>
      [
        trade.openedAt,
        trade.closedAt,
        trade.symbol,
        trade.side,
        trade.lots,
        trade.entryPrice,
        trade.closePrice,
        trade.profit,
        trade.commission,
        trade.swap,
        trade.net,
        trade.closeReason,
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anerith-trades-${accountId.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.push("Trade history exported.", "success");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Trade & ledger history</h1>
          <p className="mt-1 text-[12.5px] text-fog">Every execution and cash movement, per account.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountId}
            onChange={(event) => loadAccount(event.target.value)}
            className="select h-9 w-auto min-w-[220px] py-0 text-[11.5px]"
            aria-label="History account"
          >
            {initialAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.number} · {phaseLabel(account)} · ${account.size.toLocaleString("en-US")}
              </option>
            ))}
          </select>
          <button type="button" onClick={exportCsv} disabled={trades.length === 0} className="btn btn-secondary btn-sm">
            <Download className="size-3.5" /> CSV
          </button>
          <Link href="/app/analytics" className="btn btn-ghost btn-sm">
            Analytics →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Net realized P&L", value: fmtSignedUsd(stats.net), tone: stats.net >= 0 ? "text-acid" : "text-rose" },
          { label: "Closed trades", value: String(stats.count), tone: "" },
          { label: "Win rate", value: `${stats.winRate.toFixed(1)}%`, tone: "" },
          { label: "Volume traded", value: `${stats.volume.toFixed(2)} lots`, tone: "" },
        ].map((item) => (
          <div key={item.label} className="card p-4">
            <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
            <p className={clsx("mt-1 font-mono text-[18px] font-medium", item.tone || "text-snow")}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
          {(
            [
              { key: "trades", label: "Closed trades", count: trades.length, icon: History },
              { key: "ledger", label: "Account ledger", count: transactions.length, icon: ReceiptText },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition",
                  tab === item.key ? "bg-white/[0.07] text-snow" : "text-fog hover:bg-white/[0.04] hover:text-snow",
                )}
              >
                <Icon className="size-3.5" /> {item.label}
                <span className="font-mono text-[10px] text-white/35">{item.count}</span>
              </button>
            );
          })}
          {loading ? <span className="ml-auto text-[10px] text-fog">Loading…</span> : null}
        </div>

        {tab === "trades" ? (
          trades.length === 0 ? (
            <EmptyState title="No closed trades on this account" body="Trade from the terminal and close a position to build history." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Instrument</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Reason</th>
                    <th className="text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="text-[10.5px] text-fog">{fmtDateTime(trade.openedAt)}</td>
                      <td className="text-[10.5px] text-fog">{fmtDateTime(trade.closedAt)}</td>
                      <td className="font-mono text-[12px] text-snow">{trade.symbol}</td>
                      <td>
                        <span className={clsx("badge", trade.side === "buy" ? "badge-acid" : "badge-rose")}>
                          {trade.side === "buy" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono text-[11.5px]">{trade.lots.toFixed(2)}</td>
                      <td className="font-mono text-[11px] text-fog">{trade.entryPrice}</td>
                      <td className="font-mono text-[11px] text-fog">{trade.closePrice}</td>
                      <td className="text-[10.5px] capitalize text-fog">{trade.closeReason}</td>
                      <td className={clsx("text-right font-mono text-[12px]", trade.net >= 0 ? "text-acid" : "text-rose")}>
                        {fmtSignedUsd(trade.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : transactions.length === 0 ? (
          <EmptyState title="No ledger entries" body="Deposits, challenge purchases, commission and payouts appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="text-[10.5px] text-fog">{fmtDateTime(transaction.createdAt)}</td>
                    <td className="text-[11.5px] text-snow">{TRANSACTION_LABELS[transaction.type]}</td>
                    <td className="font-mono text-[10px] text-fog">{transaction.reference ?? "—"}</td>
                    <td className="max-w-[280px] truncate text-[10.5px] text-fog" title={transaction.note ?? ""}>
                      {transaction.note ?? "—"}
                    </td>
                    <td>
                      <span
                        className={clsx(
                          "badge capitalize",
                          transaction.status === "completed"
                            ? "badge-acid"
                            : transaction.status === "processing"
                              ? "badge-gold"
                              : "badge-rose",
                        )}
                      >
                        {transaction.status}
                      </span>
                    </td>
                    <td
                      className={clsx(
                        "text-right font-mono text-[12px]",
                        transaction.amount >= 0 ? "text-acid" : "text-snow",
                      )}
                    >
                      {fmtSignedUsd(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-[11px] text-fog">
          Payouts above {fmtUsd(100)} are reviewed by the risk desk before settling.
        </p>
        <Link href="/app/payouts" className="btn btn-secondary btn-sm">
          Payout center
        </Link>
      </div>
    </div>
  );
}
