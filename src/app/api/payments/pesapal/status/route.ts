import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { getPaymentIntentForUser, syncPaymentIntent } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const intentId = new URL(request.url).searchParams.get("intentId");
    if (!intentId) throw new ApiError(400, "Missing payment reference.");

    const current = getPaymentIntentForUser(user.id, intentId);
    if (current.status === "pending" || current.status === "processing") {
      return ok({ intent: await syncPaymentIntent(current.id) });
    }
    return ok({ intent: current });
  } catch (error) {
    return fail(error);
  }
}
