import { requireUser } from "@/lib/auth";
import { getAccountSummaries } from "@/lib/accounts";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const data = await getAccountSummaries(user.id);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
