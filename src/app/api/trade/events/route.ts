import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { fail, ok } from "@/lib/http";
import { getExecutionEvents } from "@/lib/trading";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const account = await getActiveAccount(user.id);
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 50;
    return ok({ events: getExecutionEvents(account.id, limit) });
  } catch (error) {
    return fail(error);
  }
}