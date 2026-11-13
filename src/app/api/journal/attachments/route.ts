import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { saveAttachment } from "@/lib/journal-attachments";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const entryId = form.get("entryId");
    const file = form.get("file");
    if (typeof entryId !== "string" || entryId.length === 0) throw new ApiError(400, "Choose a journal entry.");
    if (!(file instanceof File)) throw new ApiError(400, "Choose an image to attach.");
    const row = await saveAttachment(user.id, { entryId, file });
    return ok(
      {
        id: row.id,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      },
      201,
    );
  } catch (error) {
    return fail(error);
  }
}
