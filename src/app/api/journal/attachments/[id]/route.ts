import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { deleteAttachment, readAttachment } from "@/lib/journal-attachments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { row, data } = await readAttachment(user.id, id);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": String(row.size_bytes),
        "Content-Disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    await deleteAttachment(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
