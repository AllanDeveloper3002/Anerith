import { compareSync, hashSync } from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = changePasswordSchema.parse(await readJson(request));
    if (!compareSync(body.currentPassword, user.password_hash)) {
      throw new ApiError(400, "Current password is incorrect.");
    }
    run("UPDATE users SET password_hash = ? WHERE id = ?", [hashSync(body.newPassword, 11), user.id]);
    return ok({ message: "Password updated." });
  } catch (error) {
    return fail(error);
  }
}
