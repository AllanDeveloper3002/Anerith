import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { initiatePesapalCheckout } from "@/lib/payments";
import { resolveAppUrl } from "@/lib/pesapal";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { paymentInitiateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limit = rateLimit(clientKey(request, "pesapal-initiate"), 8, 60_000);
    if (!limit.allowed) throw new ApiError(429, "Too many payment attempts. Please wait a moment.");

    const body = paymentInitiateSchema.parse(await readJson(request));
    const { intent, redirectUrl } = await initiatePesapalCheckout(user, body, resolveAppUrl(request));
    return ok({ intent, redirectUrl }, 201);
  } catch (error) {
    return fail(error);
  }
}
