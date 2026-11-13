import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { fail } from "@/lib/http";
import { TF_SECONDS, type Timeframe } from "@/lib/market";
import { getExecutionCandles, getExecutionQuote } from "@/lib/market-data";
import { SYMBOLS } from "@/lib/instruments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") ?? "EURUSD").toUpperCase();
    const tf = (url.searchParams.get("tf") ?? "1m") as Timeframe;
    if (!SYMBOLS.includes(symbol)) throw new ApiError(400, "Unknown trading instrument.");
    if (!(tf in TF_SECONDS)) throw new ApiError(400, "Unsupported timeframe.");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const send = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };
        const push = () => {
          const nowMs = Date.now();
          try {
            const quote = getExecutionQuote(symbol, "standard", nowMs);
            const candle = quote.simulated ? getExecutionCandles(symbol, tf, 2, nowMs / 1000).at(-1) ?? null : null;
            send("tick", { quote, candle, serverTime: Math.floor(nowMs / 1000) });
          } catch (error) {
            send("error", {
              message: error instanceof ApiError ? error.message : "Market data is unavailable.",
            });
          }
        };
        push();
        const interval = setInterval(push, 1000);
        const stop = () => {
          clearInterval(interval);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        };
        request.signal.addEventListener("abort", stop);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return fail(error);
  }
}