import { requireAdmin } from "@/lib/auth";
import { settleCompetitionNow } from "@/lib/competitions";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { competitionSettleSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    competitionSettleSchema.parse(await readJson(request));
    const { paid } = settleCompetitionNow(id);
    return ok({
      message:
        paid > 0
          ? `Competition settled. ${paid} prize ${paid === 1 ? "payout" : "payouts"} credited.`
          : "Competition settled. No prize-eligible returns were recorded.",
    });
  } catch (error) {
    return fail(error);
  }
}
