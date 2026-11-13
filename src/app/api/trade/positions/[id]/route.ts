import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { modifyPosition } from "@/lib/trading";
import { modifyPositionSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = modifyPositionSchema.parse(await readJson(request));
    const account = await getActiveAccount(user.id);
    return ok(modifyPosition(account, id, body.sl, body.tp));
  } catch (error) {
    return fail(error);
  }
}
