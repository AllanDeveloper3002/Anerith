import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { one } from "@/lib/db";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { approveKyc, rejectKyc } from "@/lib/kyc";
import { adminKycSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    const body = adminKycSchema.parse(await readJson(request));
    if (!one<{ id: string }>("SELECT id FROM users WHERE id = ?", [id])) {
      throw new ApiError(404, "User not found.");
    }
    if (body.action === "approve") {
      const changed = approveKyc(id);
      if (!changed) throw new ApiError(400, "User is already verified.");
      return ok({ message: "Identity verified." });
    }
    const changed = rejectKyc(id, body.reason || "Document could not be verified.");
    if (!changed) throw new ApiError(400, "Only pending verifications can be rejected.");
    return ok({ message: "Verification rejected." });
  } catch (error) {
    return fail(error);
  }
}
