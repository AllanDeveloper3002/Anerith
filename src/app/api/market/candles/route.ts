import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { TF_SECONDS, type Timeframe } from "@/lib/market";
import { loadExecutionCandles } from "@/lib/market-data";
import { SYMBOLS } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") ?? "EURUSD").toUpperCase();
    const tf = (url.searchParams.get("tf") ?? "1m") as Timeframe;
    const rawLimit = Number(url.searchParams.get("limit") ?? 400);
    if (!SYMBOLS.includes(symbol)) throw new ApiError(400, "Unknown trading instrument.");
    if (!(tf in TF_SECONDS)) throw new ApiError(400, "Unsupported timeframe.");
    if (!Number.isFinite(rawLimit)) throw new ApiError(400, "Invalid candle limit.");
    const limit = Math.min(1000, Math.max(1, Math.floor(rawLimit)));
    const series = await loadExecutionCandles(symbol, tf, limit);
    return ok({ symbol, timeframe: tf, ...series });
  } catch (error) {
    return fail(error);
  }
}