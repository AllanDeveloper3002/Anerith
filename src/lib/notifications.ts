import { newId, nowIso, run } from "./db";
import type { NotificationRow } from "./db";
import type { NotificationDTO } from "./types";

export function notify(
  userId: string,
  title: string,
  body: string,
  kind: NotificationRow["kind"] = "info",
): void {
  run(
    `INSERT INTO notifications (id, user_id, title, body, kind, read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [newId(), userId, title, body, kind, nowIso()],
  );
}

export function toNotificationDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    read: Boolean(row.read),
    createdAt: row.created_at,
  };
}
