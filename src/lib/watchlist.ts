import { nowIso, one, run } from "./db";
import { SYMBOLS } from "./instruments";

export interface WatchlistRow {
  user_id: string;
  symbols_json: string;
  favourites_json: string;
  updated_at: string;
}

export interface WatchlistDTO {
  symbols: string[];
  favourites: string[];
  updatedAt: string | null;
}

function parseSymbols(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && SYMBOLS.includes(item));
  } catch {
    return [];
  }
}

export function getWatchlist(userId: string): WatchlistDTO {
  const row = one<WatchlistRow>("SELECT * FROM user_watchlists WHERE user_id = ?", [userId]);
  if (!row) return { symbols: [...SYMBOLS], favourites: [], updatedAt: null };
  const symbols = parseSymbols(row.symbols_json);
  return {
    symbols,
    favourites: parseSymbols(row.favourites_json),
    updatedAt: row.updated_at,
  };
}

export function saveWatchlist(userId: string, symbols: string[], favourites: string[]): WatchlistDTO {
  const uniqueSymbols = Array.from(new Set(symbols.filter((symbol) => SYMBOLS.includes(symbol))));
  const uniqueFavourites = Array.from(new Set(favourites.filter((symbol) => uniqueSymbols.includes(symbol))));
  const now = nowIso();
  run(
    `INSERT INTO user_watchlists (user_id, symbols_json, favourites_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET symbols_json = excluded.symbols_json,
       favourites_json = excluded.favourites_json, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(uniqueSymbols), JSON.stringify(uniqueFavourites), now],
  );
  return { symbols: uniqueSymbols, favourites: uniqueFavourites, updatedAt: now };
}
