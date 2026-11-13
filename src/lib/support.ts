import { all, newId, nowIso, run } from "./db";
import type { supportTicketSchema } from "./validation";
import type { z } from "zod";

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketDTO {
  id: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

type SupportTicketInput = z.infer<typeof supportTicketSchema>;

function toDTO(row: SupportTicketRow): SupportTicketDTO {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSupportTickets(userId: string): SupportTicketDTO[] {
  return all<SupportTicketRow>(
    "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 25",
    [userId],
  ).map(toDTO);
}

export function createSupportTicket(userId: string, input: SupportTicketInput): SupportTicketDTO {
  const id = newId();
  const now = nowIso();
  run(
    `INSERT INTO support_tickets (id, user_id, subject, body, category, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    [id, userId, input.subject, input.body, input.category, now, now],
  );
  return toDTO({
    id,
    user_id: userId,
    subject: input.subject,
    body: input.body,
    category: input.category,
    status: "open",
    created_at: now,
    updated_at: now,
  });
}
