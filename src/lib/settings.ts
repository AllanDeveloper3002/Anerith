import { nowIso, one, run } from "./db";

export function getSetting(key: string): string | null {
  const row = one<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

export function deleteSetting(key: string): void {
  run("DELETE FROM app_settings WHERE key = ?", [key]);
}
