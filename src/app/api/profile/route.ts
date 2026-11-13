import { requireUser, toUserDTO } from "@/lib/auth";
import { one, run, type UserRow } from "@/lib/db";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { profileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = profileSchema.parse(await readJson(request));
    run("UPDATE users SET full_name = ?, country = ?, phone = ? WHERE id = ?", [
      body.fullName,
      body.country ?? null,
      body.phone ?? null,
      user.id,
    ]);
    const updated = one<UserRow>("SELECT * FROM users WHERE id = ?", [user.id])!;
    return ok({ user: toUserDTO(updated), message: "Profile updated." });
  } catch (error) {
    return fail(error);
  }
}
