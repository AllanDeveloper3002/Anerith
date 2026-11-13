import { requireAdmin } from "@/lib/auth";
import {
  assignAccountRiskConfig,
  cancelNewsEvent,
  closeAccount,
  createNewsEvent,
  getAdminRiskView,
  reactivateAccount,
  resolveBreach,
  saveRiskConfig,
  suspendAccount,
} from "@/lib/risk-view";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { adminRiskActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return ok(getAdminRiskView());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertSameOrigin(request);
    const body = adminRiskActionSchema.parse(await readJson(request));

    switch (body.action) {
      case "config.save":
        saveRiskConfig(admin, body.config);
        break;
      case "config.assign":
        assignAccountRiskConfig(admin, body.accountId, body.configId, body.note ?? null);
        break;
      case "breach.resolve":
        resolveBreach(admin, body.breachId, body.note);
        break;
      case "account.suspend":
        suspendAccount(admin, body.accountId, body.reason);
        break;
      case "account.reactivate":
        reactivateAccount(admin, body.accountId, body.note);
        break;
      case "account.close":
        closeAccount(admin, body.accountId, body.reason);
        break;
      case "news.create":
        createNewsEvent(admin, {
          title: body.title,
          symbol: body.symbol ?? null,
          impact: body.impact,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
        });
        break;
      case "news.cancel":
        cancelNewsEvent(admin, body.id);
        break;
    }

    return ok({ view: getAdminRiskView() });
  } catch (error) {
    return fail(error);
  }
}
