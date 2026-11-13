import { fail, ok } from "@/lib/http";
import { getAllExecutionQuotes } from "@/lib/market-data";
import { instrumentMeta, listEffectiveInstruments } from "@/lib/instrument-specs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = getAllExecutionQuotes("standard");
    const instruments = listEffectiveInstruments().map(instrumentMeta);
    return ok({
      quotes,
      instruments,
      provider: quotes[0]?.provider ?? "internal-simulated",
      simulated: quotes.every((quote) => quote.simulated),
      serverTime: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    return fail(error);
  }
}