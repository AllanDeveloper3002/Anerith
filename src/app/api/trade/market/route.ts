import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { placeMarketOrder } from "@/lib/trading";
import { marketOrderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = marketOrderSchema.parse(await readJson(request));
    const account = await getActiveAccount(user.id);
    const result = placeMarketOrder(account, body);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
