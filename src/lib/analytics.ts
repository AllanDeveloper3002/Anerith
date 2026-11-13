import { all, type PositionRow } from "./db";
import { centsToUsd } from "./format";
import type { AnalyticsDTO } from "./types";

export function computeAnalytics(accountId: string): AnalyticsDTO {
  const rows = all<PositionRow>(
    `SELECT * FROM positions WHERE account_id = ? AND status = 'closed' AND closed_at IS NOT NULL
     ORDER BY closed_at ASC`,
    [accountId],
  );

  const results = rows.map((row) => {
    const profit = centsToUsd(row.profit_cents ?? 0);
    const commission = centsToUsd(row.commission_cents);
    const swap = centsToUsd(row.swap_cents ?? 0);
    return {
      row,
      net: Number((profit + swap - commission).toFixed(2)),
      holdHours:
        (new Date(row.closed_at!).getTime() - new Date(row.opened_at).getTime()) / 3_600_000,
    };
  });

  const wins = results.filter((r) => r.net > 0);
  const losses = results.filter((r) => r.net < 0);
  const grossProfit = wins.reduce((sum, r) => sum + r.net, 0);
  const grossLoss = losses.reduce((sum, r) => sum + Math.abs(r.net), 0);
  const netPnl = results.reduce((sum, r) => sum + r.net, 0);

  let cumulative = 0;
  const equityCurve = results.map((r, index) => {
    cumulative += r.net;
    const seconds = Math.floor(new Date(r.row.closed_at!).getTime() / 1000) + index;
    return { time: seconds, value: Number(cumulative.toFixed(2)) };
  });

  const bySymbolMap = new Map<string, { trades: number; pnl: number }>();
  for (const r of results) {
    const current = bySymbolMap.get(r.row.symbol) ?? { trades: 0, pnl: 0 };
    current.trades += 1;
    current.pnl = Number((current.pnl + r.net).toFixed(2));
    bySymbolMap.set(r.row.symbol, current);
  }

  return {
    totalTrades: results.length,
    wins: wins.length,
    losses: losses.length,
    winRate: results.length > 0 ? Number(((wins.length / results.length) * 100).toFixed(1)) : 0,
    netPnl: Number(netPnl.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null,
    avgTrade: results.length > 0 ? Number((netPnl / results.length).toFixed(2)) : 0,
    avgHoldHours:
      results.length > 0
        ? Number((results.reduce((sum, r) => sum + r.holdHours, 0) / results.length).toFixed(1))
        : 0,
    bestTrade: results.length > 0 ? Number(Math.max(...results.map((r) => r.net)).toFixed(2)) : 0,
    worstTrade: results.length > 0 ? Number(Math.min(...results.map((r) => r.net)).toFixed(2)) : 0,
    longTrades: results.filter((r) => r.row.side === "buy").length,
    shortTrades: results.filter((r) => r.row.side === "sell").length,
    equityCurve,
    bySymbol: [...bySymbolMap.entries()]
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.pnl - a.pnl),
  };
}
