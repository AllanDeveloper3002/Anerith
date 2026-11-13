import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { SYMBOLS } from "@/lib/instruments";
import { applyChartAction, getChartWorkspace } from "@/lib/charting-service";
import { chartActionSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") ?? "EURUSD";
    if (!SYMBOLS.includes(symbol)) throw new ApiError(400, "Unknown trading instrument.");
    const layoutId = url.searchParams.get("layoutId");
    return ok(getChartWorkspace(user.id, symbol, layoutId));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = chartActionSchema.parse(await readJson(request));
    return ok(applyChartAction(user.id, body));
  } catch (error) {
    return fail(error);
  }
}
