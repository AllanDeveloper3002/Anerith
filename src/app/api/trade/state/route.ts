import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getTradeState } from "@/lib/trading";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const state = await getTradeState(user.id);
    return ok(state);
  } catch (error) {
    return fail(error);
  }
}
