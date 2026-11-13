import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { modifyPendingOrder } from "@/lib/trading";
import { modifyPendingSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = modifyPendingSchema.parse(await readJson(request));
    const account = await getActiveAccount(user.id);
    return ok(modifyPendingOrder(account, id, body));
  } catch (error) {
    return fail(error);
  }
}