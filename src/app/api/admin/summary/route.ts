import { requireAdmin } from "@/lib/auth";
import { getAdminSummary } from "@/lib/admin";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    return ok(getAdminSummary(admin.id));
  } catch (error) {
    return fail(error);
  }
}
