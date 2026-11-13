import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { placePendingOrder } from "@/lib/trading";
import { pendingOrderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = pendingOrderSchema.parse(await readJson(request));
    const account = await getActiveAccount(user.id);
    const result = placePendingOrder(account, body);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
