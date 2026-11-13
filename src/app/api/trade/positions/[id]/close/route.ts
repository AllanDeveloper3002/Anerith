import { requireUser } from "@/lib/auth";
import { getActiveAccount } from "@/lib/accounts";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { closePosition } from "@/lib/trading";
import { closePositionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const text = await request.text();
    let payload: unknown = {};
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError(400, "Invalid JSON body.");
      }
    }
    const body = closePositionSchema.parse(payload);
    const account = await getActiveAccount(user.id);
    return ok(
      closePosition(account, id, {
        lots: body.lots ?? null,
        clientOrderId: body.clientOrderId ?? null,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}