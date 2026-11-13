import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { newId, nowIso, one, run } from "./db";
import { ApiError } from "./errors";
import type { JournalAttachmentRow } from "./journal";

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function storageRoot(): string {
  return process.env.JOURNAL_ATTACHMENTS_DIR ?? path.join(process.cwd(), "data", "journal-attachments");
}

function matchesSignature(mime: string, buffer: Buffer): boolean {
  if (mime === "image/png") return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/gif") {
    const head = buffer.subarray(0, 6).toString("ascii");
    return head === "GIF87a" || head === "GIF89a";
  }
  if (mime === "image/webp") {
    return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

export interface AttachmentInput {
  entryId: string;
  file: File;
}

export async function saveAttachment(userId: string, input: AttachmentInput): Promise<JournalAttachmentRow> {
  const entry = one<{ id: string }>("SELECT id FROM journal_entries WHERE id = ? AND user_id = ?", [input.entryId, userId]);
  if (!entry) throw new ApiError(404, "Journal entry not found.");

  const mime = input.file.type.toLowerCase();
  const extension = ALLOWED[mime];
  if (!extension) throw new ApiError(400, "Attach a PNG, JPEG, WebP or GIF image.");
  if (input.file.size <= 0) throw new ApiError(400, "The attachment is empty.");
  if (input.file.size > MAX_BYTES) throw new ApiError(400, "Attachments must be 5 MB or smaller.");

  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new ApiError(400, "Attachments must be 5 MB or smaller.");
  if (!matchesSignature(mime, buffer)) throw new ApiError(400, "The file contents do not match an image format.");

  const id = newId();
  const relative = path.posix.join(userId, input.entryId, `${id}.${extension}`);
  const absolute = path.join(storageRoot(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { mode: 0o600 });

  const original = input.file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120) || `screenshot.${extension}`;
  const row: JournalAttachmentRow = {
    id,
    user_id: userId,
    entry_id: input.entryId,
    filename: original,
    mime_type: mime,
    size_bytes: buffer.byteLength,
    storage_path: relative,
    created_at: nowIso(),
  };
  run(
    `INSERT INTO journal_attachments (id, user_id, entry_id, filename, mime_type, size_bytes, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, row.entry_id, row.filename, row.mime_type, row.size_bytes, row.storage_path, row.created_at],
  );
  return row;
}

export async function readAttachment(userId: string, attachmentId: string): Promise<{ row: JournalAttachmentRow; data: Buffer }> {
  const row = one<JournalAttachmentRow>("SELECT * FROM journal_attachments WHERE id = ? AND user_id = ?", [attachmentId, userId]);
  if (!row) throw new ApiError(404, "Attachment not found.");
  const absolute = path.join(storageRoot(), row.storage_path);
  try {
    const data = await readFile(absolute);
    return { row, data };
  } catch {
    throw new ApiError(404, "Attachment file is unavailable.");
  }
}

export async function deleteAttachment(userId: string, attachmentId: string): Promise<void> {
  const row = one<JournalAttachmentRow>("SELECT * FROM journal_attachments WHERE id = ? AND user_id = ?", [attachmentId, userId]);
  if (!row) throw new ApiError(404, "Attachment not found.");
  run("DELETE FROM journal_attachments WHERE id = ? AND user_id = ?", [attachmentId, userId]);
  try {
    await unlink(path.join(storageRoot(), row.storage_path));
  } catch {
    // The record is gone; a missing file is already the desired end state.
  }
}
