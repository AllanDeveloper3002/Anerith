const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

export type SupabaseTable =
  | "profiles"
  | "accounts"
  | "positions"
  | "transactions"
  | "payouts"
  | "payment_intents"
  | "competitions"
  | "competition_entries";

export interface SupabaseStatus {
  configured: boolean;
  reachable: boolean | null;
  keyType: "service_role" | "anon" | "none";
  host: string | null;
  latencyMs: number | null;
  message: string;
  tables: SupabaseTable[];
}

export const SUPABASE_TABLES: SupabaseTable[] = [
  "profiles",
  "accounts",
  "positions",
  "transactions",
  "payouts",
  "payment_intents",
  "competitions",
  "competition_entries",
];

export function supabaseConfig() {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    keyType: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? ("service_role" as const)
      : process.env.SUPABASE_ANON_KEY
        ? ("anon" as const)
        : ("none" as const),
    host: SUPABASE_URL ? safeHost(SUPABASE_URL) : null,
  };
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

export async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { configured, keyType } = supabaseConfig();
  if (!configured) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (keyType !== "service_role") {
    throw new Error("Supabase writes require SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { message?: string; hint?: string };
      detail = payload.message ?? payload.hint ?? detail;
    } catch {
      // keep the status text
    }
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function checkSupabase(): Promise<SupabaseStatus> {
  const config = supabaseConfig();
  if (!config.configured) {
    return {
      ...config,
      reachable: null,
      latencyMs: null,
      message: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable mirroring.",
      tables: SUPABASE_TABLES,
    };
  }
  const started = Date.now();
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    return {
      ...config,
      reachable: response.ok,
      latencyMs: Date.now() - started,
      message: response.ok
        ? "Supabase REST endpoint is reachable. Run supabase/schema.sql to provision mirror tables."
        : `Supabase responded with ${response.status}. Check the project URL and API key.`,
      tables: SUPABASE_TABLES,
    };
  } catch {
    return {
      ...config,
      reachable: false,
      latencyMs: Date.now() - started,
      message: "Could not reach the Supabase project. Confirm the URL and network access.",
      tables: SUPABASE_TABLES,
    };
  }
}

export async function upsertSupabaseRows<T extends Record<string, unknown>>(
  table: SupabaseTable,
  rows: T[],
  onConflict = "id",
): Promise<T[]> {
  if (rows.length === 0) return [];
  return supabaseRequest<T[]>(`/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}

/**
 * Mirrors the current SQLite state of the platform into Supabase.
 * Intended for scheduled jobs or an operator-triggered sync; the local
 * SQLite database remains the authoritative write path.
 */
export async function syncSnapshot(snapshot: {
  profiles: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  paymentIntents: Record<string, unknown>[];
  competitions: Record<string, unknown>[];
  competitionEntries: Record<string, unknown>[];
}): Promise<Record<SupabaseTable, number>> {
  const counts: Record<SupabaseTable, number> = {
    profiles: 0,
    accounts: 0,
    positions: 0,
    transactions: 0,
    payouts: 0,
    payment_intents: 0,
    competitions: 0,
    competition_entries: 0,
  };
  counts.profiles = (await upsertSupabaseRows("profiles", snapshot.profiles)).length;
  counts.accounts = (await upsertSupabaseRows("accounts", snapshot.accounts)).length;
  counts.transactions = (await upsertSupabaseRows("transactions", snapshot.transactions)).length;
  counts.payouts = (await upsertSupabaseRows("payouts", snapshot.payouts)).length;
  counts.payment_intents = (
    await upsertSupabaseRows("payment_intents", snapshot.paymentIntents)
  ).length;
  counts.competitions = (await upsertSupabaseRows("competitions", snapshot.competitions)).length;
  counts.competition_entries = (
    await upsertSupabaseRows("competition_entries", snapshot.competitionEntries)
  ).length;
  return counts;
}
