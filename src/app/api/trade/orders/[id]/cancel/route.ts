import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { cancelPendingOrder } from "@/lib/trading";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const account = await getActiveAccount(user.id);
    return ok(cancelPendingOrder(account, id));
  } catch (error) {
    return fail(error);
  }
}
