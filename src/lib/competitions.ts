import {
  all,
  type AccountRow,
  type CompetitionEntryRow,
  type CompetitionRow,
  newId,
  nowIso,
  one,
  run,
  type UserRow,
  withTransaction,
} from "./db";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import { notify } from "./notifications";
import { accountMath } from "./accounts";
import type { CompetitionDTO, CompetitionEntryDTO } from "./types";

const PRIZE_SHARES = [0.5, 0.3, 0.2];
const ORDINALS = ["1st", "2nd", "3rd"];

function competitionStatus(row: CompetitionRow): "upcoming" | "active" | "ended" {
  if (row.settled_at) return "ended";
  const now = Date.now();
  if (now < new Date(row.start_at).getTime()) return "upcoming";
  if (now > new Date(row.end_at).getTime()) return "ended";
  return "active";
}

function ordinal(rank: number): string {
  return ORDINALS[rank - 1] ?? `#${rank}`;
}

function entryReturnPct(entry: CompetitionEntryRow, account: AccountRow): number {
  const baseline = entry.baseline_equity_cents > 0 ? entry.baseline_equity_cents : account.account_size_cents;
  if (baseline <= 0) return 0;
  const equity = accountMath(account).equityCents;
  return Number((((equity - baseline) / baseline) * 100).toFixed(2));
}

export function getCurrentCompetitionRow(): CompetitionRow | undefined {
  const now = nowIso();
  return (
    one<CompetitionRow>(
      `SELECT * FROM competitions WHERE settled_at IS NULL
       ORDER BY CASE
         WHEN start_at <= ? AND end_at >= ? THEN 0
         WHEN start_at > ? THEN 1
         ELSE 2
       END, end_at ASC LIMIT 1`,
      [now, now, now],
    ) ?? one<CompetitionRow>("SELECT * FROM competitions ORDER BY settled_at DESC, created_at DESC LIMIT 1")
  );
}

interface RankedEntry extends CompetitionEntryRow {
  rank: number;
}

function rankedEntries(competitionId: string): RankedEntry[] {
  return all<CompetitionEntryRow>(
    "SELECT * FROM competition_entries WHERE competition_id = ? ORDER BY return_pct DESC, joined_at ASC",
    [competitionId],
  ).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function refreshCompetitionLeaderboard(): void {
  const competition = getCurrentCompetitionRow();
  if (!competition || competition.settled_at) return;
  refreshEntries(competition.id);
}

function refreshEntries(competitionId: string): void {
  const entries = all<CompetitionEntryRow>(
    "SELECT * FROM competition_entries WHERE competition_id = ?",
    [competitionId],
  );
  if (entries.length === 0) return;
  const now = nowIso();
  for (const entry of entries) {
    if (!entry.user_id) continue;
    let accountId = entry.account_id;
    if (!accountId) {
      const account = one<AccountRow>(
        "SELECT * FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY account_size_cents DESC LIMIT 1",
        [entry.user_id],
      );
      if (!account) continue;
      run(
        "UPDATE competition_entries SET account_id = ?, baseline_equity_cents = ?, return_pct = 0, peak_return_pct = 0, updated_at = ? WHERE id = ?",
        [account.id, accountMath(account).equityCents, now, entry.id],
      );
      accountId = account.id;
    }
    const account = one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
    if (!account || account.status !== "active") continue;
    const next = entryReturnPct(entry, account);
    const peak = Math.max(entry.peak_return_pct, next);
    if (Math.abs(next - entry.return_pct) < 0.005 && peak === entry.peak_return_pct) continue;
    run(
      "UPDATE competition_entries SET return_pct = ?, peak_return_pct = ?, updated_at = ? WHERE id = ?",
      [next, peak, now, entry.id],
    );
  }
}

function toEntryDTO(entry: RankedEntry, userId: string): CompetitionEntryDTO {
  return {
    id: entry.id,
    displayName: entry.display_name,
    accountSize: centsToUsd(entry.account_size_cents),
    returnPct: Number(entry.return_pct.toFixed(2)),
    peakReturnPct: Number(Math.max(entry.peak_return_pct, entry.return_pct).toFixed(2)),
    prize: centsToUsd(entry.prize_cents),
    isYou: Boolean(entry.user_id && entry.user_id === userId),
    rank: entry.rank,
  };
}

export function getCompetitionView(userId: string): CompetitionDTO | null {
  const row = getCurrentCompetitionRow();
  if (!row) return null;
  refreshEntries(row.id);
  const entries = rankedEntries(row.id);
  const status = competitionStatus(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prizePool: centsToUsd(row.prize_pool_cents),
    startAt: row.start_at,
    endAt: row.end_at,
    status,
    settledAt: row.settled_at,
    joined: entries.some((entry) => entry.user_id === userId),
    canJoin: status === "active",
    prizeSplit: PRIZE_SHARES.map((share, index) => ({
      place: index + 1,
      label: ordinal(index + 1),
      sharePct: Math.round(share * 100),
      amount: centsToUsd(Math.round(row.prize_pool_cents * share)),
    })),
    entries: entries.map((entry) => toEntryDTO(entry, userId)),
  };
}

export function joinCompetition(user: UserRow): CompetitionDTO {
  const competition = getCurrentCompetitionRow();
  if (!competition) throw new ApiError(400, "No competition is running right now.");
  const status = competitionStatus(competition);
  if (status === "upcoming") throw new ApiError(400, "This competition has not started yet.");
  if (status === "ended") throw new ApiError(400, "This competition has ended.");

  const existing = one<CompetitionEntryRow>(
    "SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?",
    [competition.id, user.id],
  );
  if (existing) return getCompetitionView(user.id)!;

  const accounts = all<AccountRow>(
    "SELECT * FROM accounts WHERE user_id = ? AND status = 'active'",
    [user.id],
  );
  if (accounts.length === 0) {
    throw new ApiError(400, "Open an active challenge account to join the competition.");
  }
  let best = accounts[0];
  let bestReturn = -Infinity;
  for (const account of accounts) {
    const math = accountMath(account);
    const ret = ((math.equityCents - account.start_balance_cents) / account.start_balance_cents) * 100;
    if (ret > bestReturn) {
      bestReturn = ret;
      best = account;
    }
  }
  const baseline = accountMath(best).equityCents;
  const now = nowIso();

  withTransaction(() => {
    run(
      `INSERT INTO competition_entries
        (id, competition_id, user_id, account_id, display_name, account_size_cents, return_pct,
         baseline_equity_cents, peak_return_pct, prize_cents, joined_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?)`,
      [
        newId(),
        competition.id,
        user.id,
        best.id,
        user.full_name,
        best.account_size_cents,
        baseline,
        now,
        now,
      ],
    );
    notify(
      user.id,
      "Competition entry confirmed",
      `You are entered in ${competition.name} trading account ${best.number}. Returns are tracked live from your entry equity.`,
      "success",
    );
  });

  return getCompetitionView(user.id)!;
}

function settleCompetitionRow(competition: CompetitionRow, force: boolean): number {
  if (competition.settled_at) return 0;
  if (!force && new Date(competition.end_at).getTime() > Date.now()) return 0;

  refreshEntries(competition.id);
  const entries = rankedEntries(competition.id);
  const winners = entries.filter((entry) => entry.return_pct > 0).slice(0, PRIZE_SHARES.length);
  const now = nowIso();
  let paid = 0;

  withTransaction(() => {
    winners.forEach((entry, index) => {
      const share = PRIZE_SHARES[index] ?? 0;
      const prizeCents = Math.round(competition.prize_pool_cents * share);
      run(
        "UPDATE competition_entries SET prize_cents = ?, updated_at = ? WHERE id = ?",
        [prizeCents, now, entry.id],
      );
      if (!entry.user_id || prizeCents <= 0) return;
      const reference = `AN-CP-${newId().slice(0, 6).toUpperCase()}`;
      run(
        `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
         VALUES (?, ?, NULL, 'competition_prize', ?, 'completed', 'competition', ?, ?, ?, ?)`,
        [
          newId(),
          entry.user_id,
          prizeCents,
          reference,
          `${competition.name} · ${ordinal(index + 1)} place`,
          now,
          now,
        ],
      );
      notify(
        entry.user_id,
        `${ordinal(index + 1)} place finish`,
        `You finished ${ordinal(index + 1)} in ${competition.name} with a ${entry.return_pct.toFixed(2)}% return. ${centsToUsd(prizeCents)} has been credited to your ledger.`,
        "success",
      );
      paid += 1;
    });

    for (const entry of entries) {
      if (!entry.user_id) continue;
      if (winners.some((winner) => winner.id === entry.id)) continue;
      notify(
        entry.user_id,
        "Competition finalised",
        `${competition.name} has closed. You finished #${entry.rank} with a ${entry.return_pct.toFixed(2)}% return.`,
        "info",
      );
    }

    run("UPDATE competitions SET status = 'ended', settled_at = ? WHERE id = ?", [now, competition.id]);
  });

  ensureNextCompetition(competition);
  return paid;
}

export function settleCompetitions(): number {
  const now = nowIso();
  const due = all<CompetitionRow>(
    "SELECT * FROM competitions WHERE settled_at IS NULL AND end_at <= ?",
    [now],
  );
  let paid = 0;
  for (const competition of due) paid += settleCompetitionRow(competition, false);
  return paid;
}

export function settleCompetitionNow(id: string): { paid: number } {
  const competition = one<CompetitionRow>("SELECT * FROM competitions WHERE id = ?", [id]);
  if (!competition) throw new ApiError(404, "Competition not found.");
  if (competition.settled_at) throw new ApiError(400, "This competition has already been settled.");
  return { paid: settleCompetitionRow(competition, true) };
}

function ensureNextCompetition(previous: CompetitionRow): void {
  const existing = one<CompetitionRow>(
    "SELECT * FROM competitions WHERE settled_at IS NULL ORDER BY start_at DESC LIMIT 1",
  );
  if (existing) return;
  const start = Math.max(Date.now(), new Date(previous.end_at).getTime());
  const end = start + 30 * 86_400_000;
  const label = new Date(start).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  run(
    `INSERT INTO competitions (id, name, description, prize_pool_cents, start_at, end_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      newId(),
      `Anerith Monthly Sprint — ${label}`,
      "Trade any Anerith account. Highest verified percentage return at month end wins a share of the prize pool.",
      previous.prize_pool_cents,
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      nowIso(),
    ],
  );
}

export function createCompetition(input: {
  name: string;
  description: string;
  prizePool: number;
  durationDays: number;
  startAt?: string | null;
}): { id: string } {
  const start = input.startAt ? new Date(input.startAt).getTime() : Date.now();
  if (Number.isNaN(start)) throw new ApiError(400, "Enter a valid start date.");
  const end = start + input.durationDays * 86_400_000;
  const id = newId();
  run(
    `INSERT INTO competitions (id, name, description, prize_pool_cents, start_at, end_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description,
      Math.round(input.prizePool * 100),
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      start <= Date.now() ? "active" : "upcoming",
      nowIso(),
    ],
  );
  return { id };
}

export function getCompetitionRowForAdmin(id: string): CompetitionRow | undefined {
  return one<CompetitionRow>("SELECT * FROM competitions WHERE id = ?", [id]);
}
