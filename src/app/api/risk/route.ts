import { requireUser } from "@/lib/auth";
import { getRiskDashboard } from "@/lib/risk-view";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const accountId = new URL(request.url).searchParams.get("accountId");
    return ok(await getRiskDashboard(user.id, accountId));
  } catch (error) {
    return fail(error);
  }
}
