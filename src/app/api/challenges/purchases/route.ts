import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getPurchasesForUser } from "@/lib/purchases";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ purchases: getPurchasesForUser(user.id) });
  } catch (error) {
    return fail(error);
  }
}
