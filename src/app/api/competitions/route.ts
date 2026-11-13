import { requireUser } from "@/lib/auth";
import { getCompetitionView, joinCompetition } from "@/lib/competitions";
import { assertSameOrigin, fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ competition: getCompetitionView(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return ok({ competition: joinCompetition(user), message: "You are in. Good luck." });
  } catch (error) {
    return fail(error);
  }
}
