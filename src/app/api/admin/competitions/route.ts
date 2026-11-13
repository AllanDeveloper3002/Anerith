import { requireAdmin } from "@/lib/auth";
import { createCompetition } from "@/lib/competitions";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { competitionCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const body = competitionCreateSchema.parse(await readJson(request));
    const result = createCompetition(body);
    return ok({ id: result.id, message: "Competition created." }, 201);
  } catch (error) {
    return fail(error);
  }
}
