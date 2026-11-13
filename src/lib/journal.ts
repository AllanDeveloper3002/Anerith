import { all, newId, nowIso, one, run, withTransaction } from "./db";
import type { PositionRow } from "./db";
import { ApiError } from "./errors";
import { getEffectiveInstrument } from "./instrument-specs";
import type { Side } from "./instruments";

export interface JournalEntryRow {
  id: string;
  user_id: string;
  account_id: string;
  position_id: string;
  strategy_id: string | null;
  entry_reason: string | null;
  exit_reason: string | null;
  market_conditions: string | null;
  emotions: string | null;
  mistakes: string | null;
  lessons: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalTagRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface JournalStrategyRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  rules: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalAttachmentRow {
  id: string;
  user_id: string;
  entry_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

interface ClosedPositionRow extends PositionRow {
  account_number: string;
  account_plan: string;
  account_size_cents: number;
}

export interface JournalTagDTO {
  id: string;
  name: string;
  color: string;
}

export interface JournalStrategyDTO {
  id: string;
  name: string;
  description: string | null;
  rules: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalAttachmentDTO {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface JournalEntryDTO {
  id: string;
  positionId: string;
  accountId: string;
  accountNumber: string;
  accountPlan: string;
  accountSize: number;
  symbol: string;
  side: Side;
  lots: number;
  entryPrice: number;
  exitPrice: number;
  sl: number | null;
  tp: number | null;
  openedAt: string;
  closedAt: string;
  durationSeconds: number;
  closeReason: string;
  profit: number;
  commission: number;
  swap: number;
  net: number;
  plannedRR: number | null;
  realizedR: number | null;
  strategyId: string | null;
  strategyName: string | null;
  entryReason: string | null;
  exitReason: string | null;
  marketConditions: string | null;
  emotions: string | null;
  mistakes: string | null;
  lessons: string | null;
  notes: string | null;
  tags: JournalTagDTO[];
  attachments: JournalAttachmentDTO[];
  hasAnnotations: boolean;
}

export interface JournalBucket {
  key: string;
  label: string;
  trades: number;
  wins: number;
  net: number;
  winRate: number | null;
}

export interface JournalAnalytics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  averageRR: number | null;
  averageDurationSeconds: number | null;
  bestTrade: { positionId: string; symbol: string; net: number } | null;
  worstTrade: { positionId: string; symbol: string; net: number } | null;
  mostTraded: { symbol: string; trades: number } | null;
  byInstrument: JournalBucket[];
  bySession: JournalBucket[];
  byWeekday: JournalBucket[];
  byStrategy: JournalBucket[];
  rrDistribution: { label: string; count: number }[];
  equityCurve: { date: string; cumulative: number }[];
}

export interface JournalPayload {
  entries: JournalEntryDTO[];
  strategies: JournalStrategyDTO[];
  tags: JournalTagDTO[];
  analytics: JournalAnalytics;
  syncedAt: string;
}

function centsToUsd(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toStrategyDTO(row: JournalStrategyRow): JournalStrategyDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules: row.rules,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function syncJournalEntries(userId: string): void {
  const positions = all<{ id: string; account_id: string; closed_at: string }>(
    `SELECT p.id, p.account_id, p.closed_at
     FROM positions p JOIN accounts a ON a.id = p.account_id
     WHERE a.user_id = ? AND p.status = 'closed'
       AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.position_id = p.id)`,
    [userId, userId],
  );
  if (positions.length === 0) return;
  withTransaction(() => {
    const now = nowIso();
    for (const position of positions) {
      run(
        `INSERT OR IGNORE INTO journal_entries
           (id, user_id, account_id, position_id, strategy_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        [newId(), userId, position.account_id, position.id, position.closed_at || now, now],
      );
    }
  });
}

const SESSION_LABELS: { key: string; label: string; hours: number[] }[] = [
  { key: "asia", label: "Asia", hours: [22, 23, 0, 1, 2, 3, 4, 5, 6] },
  { key: "london", label: "London", hours: [7, 8, 9, 10, 11] },
  { key: "overlap", label: "London–New York", hours: [12, 13, 14, 15] },
  { key: "new-york", label: "New York", hours: [16, 17, 18, 19, 20] },
  { key: "off-hours", label: "Off-hours", hours: [21] },
];

function sessionFor(openedAt: string): { key: string; label: string } {
  const hour = new Date(openedAt).getUTCHours();
  const found = SESSION_LABELS.find((session) => session.hours.includes(hour));
  return found ?? { key: "off-hours", label: "Off-hours" };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayFor(openedAt: string): { key: string; label: string } {
  const day = new Date(openedAt).getUTCDay();
  return { key: String(day), label: WEEKDAYS[day] };
}

function plannedRRFor(position: PositionRow): number | null {
  if (position.sl == null || position.tp == null) return null;
  const risk = Math.abs(position.entry_price - position.sl);
  const reward = Math.abs(position.tp - position.entry_price);
  if (risk <= 0 || reward <= 0) return null;
  return round2(reward / risk);
}

function realizedRFor(position: PositionRow, net: number): number | null {
  if (position.sl == null) return null;
  const priceRisk = Math.abs(position.entry_price - position.sl);
  if (priceRisk <= 0) return null;
  try {
    const contract = getEffectiveInstrument(position.symbol).contractSize;
    const riskUsd = priceRisk * contract * position.lots;
    if (riskUsd <= 0) return null;
    return round2(net / riskUsd);
  } catch {
    return null;
  }
}

function positionNet(position: PositionRow): { profit: number; commission: number; swap: number; net: number } {
  const profit = centsToUsd(position.profit_cents ?? 0);
  const commission = centsToUsd(position.commission_cents);
  const swap = centsToUsd(position.swap_cents ?? 0);
  return { profit, commission, swap, net: round2(profit + swap - commission) };
}

interface EntryContext {
  entries: Map<string, JournalEntryRow>;
  tagsById: Map<string, JournalTagDTO>;
  tagsByEntry: Map<string, string[]>;
  strategiesById: Map<string, JournalStrategyRow>;
  attachmentsByEntry: Map<string, JournalAttachmentDTO[]>;
}

function buildBuckets(
  trades: { key: string; label: string; net: number }[],
): JournalBucket[] {
  const map = new Map<string, JournalBucket>();
  for (const trade of trades) {
    const bucket = map.get(trade.key) ?? { key: trade.key, label: trade.label, trades: 0, wins: 0, net: 0, winRate: null };
    bucket.trades += 1;
    if (trade.net > 0) bucket.wins += 1;
    bucket.net = round2(bucket.net + trade.net);
    map.set(trade.key, bucket);
  }
  return Array.from(map.values())
    .map((bucket) => ({ ...bucket, winRate: bucket.trades > 0 ? round2((bucket.wins / bucket.trades) * 100) : null }))
    .sort((a, b) => b.trades - a.trades);
}

export function getJournal(userId: string): JournalPayload {
  syncJournalEntries(userId);

  const positions = all<ClosedPositionRow>(
    `SELECT p.*, a.number AS account_number, a.plan AS account_plan, a.account_size_cents
     FROM positions p JOIN accounts a ON a.id = p.account_id
     WHERE a.user_id = ? AND p.status = 'closed'
     ORDER BY p.closed_at DESC`,
    [userId],
  );

  const strategies = all<JournalStrategyRow>(
    "SELECT * FROM trading_strategies WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC",
    [userId],
  );

  const tags = all<JournalTagRow>(
    "SELECT * FROM journal_tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC",
    [userId],
  );

  const entryRows = all<JournalEntryRow>("SELECT * FROM journal_entries WHERE user_id = ?", [userId]);
  const entryByPosition = new Map(entryRows.map((row) => [row.position_id, row]));
  const tagsById = new Map(tags.map((tag) => [tag.id, { id: tag.id, name: tag.name, color: tag.color }]));
  const tagLinks = all<{ entry_id: string; tag_id: string }>(
    `SELECT et.entry_id, et.tag_id FROM journal_entry_tags et
     JOIN journal_entries je ON je.id = et.entry_id
     WHERE je.user_id = ?`,
    [userId],
  );
  const tagsByEntry = new Map<string, string[]>();
  for (const link of tagLinks) {
    const list = tagsByEntry.get(link.entry_id) ?? [];
    list.push(link.tag_id);
    tagsByEntry.set(link.entry_id, list);
  }

  const attachmentRows = all<JournalAttachmentRow>(
    "SELECT * FROM journal_attachments WHERE user_id = ? ORDER BY created_at ASC",
    [userId],
  );
  const attachmentsByEntry = new Map<string, JournalAttachmentDTO[]>();
  for (const attachment of attachmentRows) {
    const list = attachmentsByEntry.get(attachment.entry_id) ?? [];
    list.push({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      createdAt: attachment.created_at,
    });
    attachmentsByEntry.set(attachment.entry_id, list);
  }

  const strategiesById = new Map(strategies.map((strategy) => [strategy.id, strategy]));

  const entries: JournalEntryDTO[] = [];
  const tradeFacts: {
    position: ClosedPositionRow;
    net: number;
    rr: number | null;
    session: { key: string; label: string };
    weekday: { key: string; label: string };
  }[] = [];

  for (const position of positions) {
    const entry = entryByPosition.get(position.id);
    if (!entry) continue;
    const money = positionNet(position);
    const plannedRR = plannedRRFor(position);
    const realizedR = realizedRFor(position, money.net);
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(position.closed_at ?? position.opened_at).getTime() - new Date(position.opened_at).getTime()) / 1000),
    );
    const tagIds = tagsByEntry.get(entry.id) ?? [];
    const strategy = entry.strategy_id ? strategiesById.get(entry.strategy_id) : undefined;
    entries.push({
      id: entry.id,
      positionId: position.id,
      accountId: position.account_id,
      accountNumber: position.account_number,
      accountPlan: position.account_plan,
      accountSize: centsToUsd(position.account_size_cents),
      symbol: position.symbol,
      side: position.side,
      lots: position.lots,
      entryPrice: position.entry_price,
      exitPrice: position.close_price ?? 0,
      sl: position.sl,
      tp: position.tp,
      openedAt: position.opened_at,
      closedAt: position.closed_at ?? position.opened_at,
      durationSeconds,
      closeReason: position.close_reason ?? "manual",
      profit: money.profit,
      commission: money.commission,
      swap: money.swap,
      net: money.net,
      plannedRR,
      realizedR,
      strategyId: entry.strategy_id,
      strategyName: strategy?.name ?? null,
      entryReason: entry.entry_reason,
      exitReason: entry.exit_reason,
      marketConditions: entry.market_conditions,
      emotions: entry.emotions,
      mistakes: entry.mistakes,
      lessons: entry.lessons,
      notes: entry.notes,
      tags: tagIds.map((id) => tagsById.get(id)).filter((tag): tag is JournalTagDTO => Boolean(tag)),
      attachments: attachmentsByEntry.get(entry.id) ?? [],
      hasAnnotations: Boolean(
        entry.entry_reason || entry.exit_reason || entry.market_conditions || entry.emotions ||
        entry.mistakes || entry.lessons || entry.notes || entry.strategy_id || tagIds.length > 0,
      ),
    });
    tradeFacts.push({
      position,
      net: money.net,
      rr: plannedRR,
      session: sessionFor(position.opened_at),
      weekday: weekdayFor(position.opened_at),
    });
  }

  const analytics = computeAnalytics(tradeFacts, entries);
  return {
    entries,
    strategies: strategies.map(toStrategyDTO),
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    analytics,
    syncedAt: nowIso(),
  };
}

function computeAnalytics(
  trades: {
    position: ClosedPositionRow;
    net: number;
    rr: number | null;
    session: { key: string; label: string };
    weekday: { key: string; label: string };
  }[],
  entries: JournalEntryDTO[],
): JournalAnalytics {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.net > 0).length;
  const losses = trades.filter((trade) => trade.net < 0).length;
  const breakeven = totalTrades - wins - losses;
  const netPnl = round2(trades.reduce((sum, trade) => sum + trade.net, 0));
  const grossProfit = round2(trades.filter((t) => t.net > 0).reduce((sum, t) => sum + t.net, 0));
  const grossLoss = round2(trades.filter((t) => t.net < 0).reduce((sum, t) => sum + t.net, 0));
  const rrValues = trades.map((trade) => trade.rr).filter((rr): rr is number => rr != null);
  const durations = trades.map((trade) =>
    Math.max(0, (new Date(trade.position.closed_at ?? trade.position.opened_at).getTime() - new Date(trade.position.opened_at).getTime()) / 1000),
  );
  const sortedByNet = [...trades].sort((a, b) => b.net - a.net);

  const symbolCounts = new Map<string, number>();
  for (const trade of trades) symbolCounts.set(trade.position.symbol, (symbolCounts.get(trade.position.symbol) ?? 0) + 1);
  const most = Array.from(symbolCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  const entryByPosition = new Map(entries.map((entry) => [entry.positionId, entry]));
  const byStrategyBuckets = new Map<string, JournalBucket>();
  for (const trade of trades) {
    const entry = entryByPosition.get(trade.position.id);
    if (!entry?.strategyId) continue;
    const key = entry.strategyId;
    const bucket = byStrategyBuckets.get(key) ?? {
      key,
      label: entry.strategyName ?? "Unassigned",
      trades: 0,
      wins: 0,
      net: 0,
      winRate: null,
    };
    bucket.trades += 1;
    if (trade.net > 0) bucket.wins += 1;
    bucket.net = round2(bucket.net + trade.net);
    byStrategyBuckets.set(key, bucket);
  }

  let cumulative = 0;
  const daily = new Map<string, number>();
  for (const trade of [...trades].sort((a, b) =>
    (a.position.closed_at ?? "").localeCompare(b.position.closed_at ?? ""),
  )) {
    const date = (trade.position.closed_at ?? trade.position.opened_at).slice(0, 10);
    daily.set(date, round2((daily.get(date) ?? 0) + trade.net));
  }
  const equityCurve = Array.from(daily.entries()).map(([date, value]) => {
    cumulative = round2(cumulative + value);
    return { date, cumulative };
  });

  const best = sortedByNet[0];
  const worst = sortedByNet[sortedByNet.length - 1];

  return {
    totalTrades,
    wins,
    losses,
    breakeven,
    winRate: totalTrades > 0 ? round2((wins / totalTrades) * 100) : null,
    netPnl,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? round2(grossProfit / Math.abs(grossLoss)) : null,
    avgWin: wins > 0 ? round2(grossProfit / wins) : null,
    avgLoss: losses > 0 ? round2(grossLoss / losses) : null,
    averageRR: rrValues.length > 0 ? round2(rrValues.reduce((sum, rr) => sum + rr, 0) / rrValues.length) : null,
    averageDurationSeconds: durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : null,
    bestTrade: best ? { positionId: best.position.id, symbol: best.position.symbol, net: best.net } : null,
    worstTrade: worst ? { positionId: worst.position.id, symbol: worst.position.symbol, net: worst.net } : null,
    mostTraded: most ? { symbol: most[0], trades: most[1] } : null,
    byInstrument: buildBuckets(trades.map((trade) => ({ key: trade.position.symbol, label: trade.position.symbol, net: trade.net }))),
    bySession: buildBuckets(trades.map((trade) => ({ key: trade.session.key, label: trade.session.label, net: trade.net }))),
    byWeekday: buildBuckets(trades.map((trade) => ({ key: trade.weekday.key, label: trade.weekday.label, net: trade.net })))
      .sort((a, b) => Number(a.key) - Number(b.key)),
    byStrategy: Array.from(byStrategyBuckets.values())
      .map((bucket) => ({ ...bucket, winRate: bucket.trades > 0 ? round2((bucket.wins / bucket.trades) * 100) : null }))
      .sort((a, b) => b.net - a.net),
    rrDistribution: [
      { label: "Below 1R", count: rrValues.filter((rr) => rr < 1).length },
      { label: "1R–2R", count: rrValues.filter((rr) => rr >= 1 && rr < 2).length },
      { label: "2R–3R", count: rrValues.filter((rr) => rr >= 2 && rr < 3).length },
      { label: "3R+", count: rrValues.filter((rr) => rr >= 3).length },
    ],
    equityCurve,
  };
}

function ownedEntry(userId: string, entryId: string): JournalEntryRow {
  const entry = one<JournalEntryRow>("SELECT * FROM journal_entries WHERE id = ? AND user_id = ?", [entryId, userId]);
  if (!entry) throw new ApiError(404, "Journal entry not found.");
  return entry;
}

export interface JournalUpdateInput {
  entryId: string;
  strategyId?: string | null;
  entryReason?: string | null;
  exitReason?: string | null;
  marketConditions?: string | null;
  emotions?: string | null;
  mistakes?: string | null;
  lessons?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

export function updateJournalEntry(userId: string, input: JournalUpdateInput): JournalEntryDTO {
  const entry = ownedEntry(userId, input.entryId);
  if (input.strategyId) {
    const strategy = one<JournalStrategyRow>("SELECT * FROM trading_strategies WHERE id = ? AND user_id = ?", [input.strategyId, userId]);
    if (!strategy) throw new ApiError(404, "Strategy not found.");
  }
  if (input.tagIds) {
    for (const tagId of input.tagIds) {
      const tag = one<JournalTagRow>("SELECT * FROM journal_tags WHERE id = ? AND user_id = ?", [tagId, userId]);
      if (!tag) throw new ApiError(404, "Journal tag not found.");
    }
  }
  const clean = (value: string | null | undefined): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const pick = (value: string | null | undefined, fallback: string | null): string | null => {
    const cleaned = clean(value);
    return cleaned === undefined ? fallback : cleaned;
  };
  const next = {
    strategyId: input.strategyId === undefined ? entry.strategy_id : input.strategyId,
    entryReason: pick(input.entryReason, entry.entry_reason),
    exitReason: pick(input.exitReason, entry.exit_reason),
    marketConditions: pick(input.marketConditions, entry.market_conditions),
    emotions: pick(input.emotions, entry.emotions),
    mistakes: pick(input.mistakes, entry.mistakes),
    lessons: pick(input.lessons, entry.lessons),
    notes: pick(input.notes, entry.notes),
  };
  withTransaction(() => {
    run(
      `UPDATE journal_entries SET strategy_id = ?, entry_reason = ?, exit_reason = ?, market_conditions = ?,
         emotions = ?, mistakes = ?, lessons = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        next.strategyId,
        next.entryReason,
        next.exitReason,
        next.marketConditions,
        next.emotions,
        next.mistakes,
        next.lessons,
        next.notes,
        nowIso(),
        entry.id,
        userId,
      ],
    );
    if (input.tagIds) {
      run("DELETE FROM journal_entry_tags WHERE entry_id = ?", [entry.id]);
      for (const tagId of new Set(input.tagIds)) {
        run("INSERT OR IGNORE INTO journal_entry_tags (entry_id, tag_id) VALUES (?, ?)", [entry.id, tagId]);
      }
    }
  });
  const payload = getJournal(userId);
  const updated = payload.entries.find((item) => item.id === entry.id);
  if (!updated) throw new ApiError(500, "Journal entry could not be reloaded.");
  return updated;
}

export function saveStrategy(
  userId: string,
  input: { id?: string; name: string; description?: string | null; rules?: string | null },
): JournalStrategyDTO {
  const now = nowIso();
  if (input.id) {
    const owned = one<JournalStrategyRow>("SELECT * FROM trading_strategies WHERE id = ? AND user_id = ?", [input.id, userId]);
    if (!owned) throw new ApiError(404, "Strategy not found.");
    const duplicate = one<{ id: string }>(
      "SELECT id FROM trading_strategies WHERE user_id = ? AND name = ? AND id <> ?",
      [userId, input.name, input.id],
    );
    if (duplicate) throw new ApiError(409, "A strategy with that name already exists.");
    run(
      "UPDATE trading_strategies SET name = ?, description = ?, rules = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [input.name, input.description ?? null, input.rules ?? null, now, input.id, userId],
    );
    return toStrategyDTO({ ...owned, name: input.name, description: input.description ?? null, rules: input.rules ?? null, updated_at: now });
  }
  const duplicate = one<{ id: string }>("SELECT id FROM trading_strategies WHERE user_id = ? AND name = ?", [userId, input.name]);
  if (duplicate) throw new ApiError(409, "A strategy with that name already exists.");
  const row: JournalStrategyRow = {
    id: newId(),
    user_id: userId,
    name: input.name,
    description: input.description ?? null,
    rules: input.rules ?? null,
    created_at: now,
    updated_at: now,
  };
  run(
    "INSERT INTO trading_strategies (id, user_id, name, description, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [row.id, row.user_id, row.name, row.description, row.rules, row.created_at, row.updated_at],
  );
  return toStrategyDTO(row);
}

export function deleteStrategy(userId: string, strategyId: string): void {
  const owned = one<{ id: string }>("SELECT id FROM trading_strategies WHERE id = ? AND user_id = ?", [strategyId, userId]);
  if (!owned) throw new ApiError(404, "Strategy not found.");
  withTransaction(() => {
    run("UPDATE journal_entries SET strategy_id = NULL WHERE user_id = ? AND strategy_id = ?", [userId, strategyId]);
    run("DELETE FROM trading_strategies WHERE id = ? AND user_id = ?", [strategyId, userId]);
  });
}

export function saveTag(
  userId: string,
  input: { id?: string; name: string; color?: string },
): JournalTagDTO {
  const color = input.color ?? "#c9f75c";
  if (input.id) {
    const owned = one<JournalTagRow>("SELECT * FROM journal_tags WHERE id = ? AND user_id = ?", [input.id, userId]);
    if (!owned) throw new ApiError(404, "Journal tag not found.");
    const duplicate = one<{ id: string }>("SELECT id FROM journal_tags WHERE user_id = ? AND name = ? AND id <> ?", [userId, input.name, input.id]);
    if (duplicate) throw new ApiError(409, "A tag with that name already exists.");
    run("UPDATE journal_tags SET name = ?, color = ? WHERE id = ? AND user_id = ?", [input.name, color, input.id, userId]);
    return { id: input.id, name: input.name, color };
  }
  const duplicate = one<{ id: string }>("SELECT id FROM journal_tags WHERE user_id = ? AND name = ?", [userId, input.name]);
  if (duplicate) throw new ApiError(409, "A tag with that name already exists.");
  const row: JournalTagRow = { id: newId(), user_id: userId, name: input.name, color, created_at: nowIso() };
  run(
    "INSERT INTO journal_tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
    [row.id, row.user_id, row.name, row.color, row.created_at],
  );
  return { id: row.id, name: row.name, color: row.color };
}

export function deleteTag(userId: string, tagId: string): void {
  const owned = one<{ id: string }>("SELECT id FROM journal_tags WHERE id = ? AND user_id = ?", [tagId, userId]);
  if (!owned) throw new ApiError(404, "Journal tag not found.");
  withTransaction(() => {
    run(
      "DELETE FROM journal_entry_tags WHERE tag_id = ? AND entry_id IN (SELECT id FROM journal_entries WHERE user_id = ?)",
      [tagId, userId],
    );
    run("DELETE FROM journal_tags WHERE id = ? AND user_id = ?", [tagId, userId]);
  });
}
