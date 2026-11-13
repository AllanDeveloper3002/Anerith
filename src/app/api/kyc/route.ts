import { requireUser } from "@/lib/auth";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { submitKyc } from "@/lib/kyc";
import { kycSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = kycSchema.parse(await readJson(request));
    submitKyc(user, body);
    return ok({ message: "Verification submitted.", status: "pending" });
  } catch (error) {
    return fail(error);
  }
}
