import { requireAdmin } from "@/lib/auth";
import { listExecutionProviders, saveExecutionSettings } from "@/lib/execution";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { listEffectiveInstruments, saveInstrumentSpec } from "@/lib/instrument-specs";
import { executionSettings, listMarketDataProviders, marketDataProviderStatus } from "@/lib/market-data";
import { adminEngineActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function engineView() {
  return {
    settings: executionSettings(),
    instruments: listEffectiveInstruments(true),
    executionProviders: listExecutionProviders(),
    marketDataProviders: listMarketDataProviders(),
    marketDataStatus: marketDataProviderStatus(),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return ok(engineView());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertSameOrigin(request);
    const body = adminEngineActionSchema.parse(await readJson(request));
    if (body.action === "settings.save") {
      saveExecutionSettings(admin, body.settings);
    } else {
      saveInstrumentSpec(admin, body.instrument);
    }
    return ok(engineView());
  } catch (error) {
    return fail(error);
  }
}