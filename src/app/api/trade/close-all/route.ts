import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { closeAllPositions } from "@/lib/trading";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const account = await getActiveAccount(user.id);
    return ok(closeAllPositions(account));
  } catch (error) {
    return fail(error);
  }
}
