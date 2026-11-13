import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { completePayout, getPayoutRowForAdmin, rejectPayout } from "@/lib/payouts";
import { adminPayoutSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    const body = adminPayoutSchema.parse(await readJson(request));
    const row = getPayoutRowForAdmin(id);
    if (!row) throw new ApiError(404, "Payout not found.");
    if (row.status !== "processing") throw new ApiError(400, "This payout has already been actioned.");

    if (body.action === "approve") {
      completePayout(id);
      return ok({ message: "Payout approved and settled." });
    }
    rejectPayout(id, body.reason || "Rejected by the risk desk.");
    return ok({ message: "Payout rejected and funds returned." });
  } catch (error) {
    return fail(error);
  }
}
