import { requireUser } from "@/lib/auth";
import { all, one, run, type NotificationRow } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { toNotificationDTO } from "@/lib/notifications";
import { notificationsReadSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = all<NotificationRow>(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [user.id],
    );
    const unread = one<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0",
      [user.id],
    );
    return ok({ notifications: rows.map(toNotificationDTO), unread: unread?.c ?? 0 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const text = await request.text();
    let body: { ids?: string[]; all?: boolean } = {};
    if (text.trim()) {
      try {
        body = notificationsReadSchema.parse(JSON.parse(text));
      } catch (error) {
        if (error instanceof SyntaxError) throw new ApiError(400, "Invalid JSON body.");
        throw error;
      }
    }
    if (body.ids && body.ids.length > 0) {
      for (const id of body.ids) {
        run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [id, user.id]);
      }
    } else {
      run("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", [user.id]);
    }
    return ok({ message: "Notifications updated." });
  } catch (error) {
    return fail(error);
  }
}
