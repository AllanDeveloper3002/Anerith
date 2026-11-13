import { requireUser } from "@/lib/auth";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { getWatchlist, saveWatchlist } from "@/lib/watchlist";
import { watchlistSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(getWatchlist(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = watchlistSchema.parse(await readJson(request));
    return ok(saveWatchlist(user.id, body.symbols, body.favourites));
  } catch (error) {
    return fail(error);
  }
}
