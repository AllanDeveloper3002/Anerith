import { requireUser, toUserDTO } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ user: toUserDTO(user) });
  } catch (error) {
    return fail(error);
  }
}
