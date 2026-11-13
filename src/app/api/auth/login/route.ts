import { compareSync } from "bcryptjs";
import { ApiError } from "@/lib/errors";
import {
  ACTIVE_ACCOUNT_COOKIE,
  activeAccountCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";
import { one, type AccountRow, type UserRow } from "@/lib/db";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = rateLimit(clientKey(request, "login"), 10, 5 * 60 * 1000);
    if (!limit.allowed) throw new ApiError(429, "Too many sign-in attempts. Please wait a few minutes.");

    const body = loginSchema.parse(await readJson(request));
    const user = one<UserRow>("SELECT * FROM users WHERE email = ?", [body.email.toLowerCase()]);
    if (!user || !compareSync(body.password, user.password_hash)) {
      throw new ApiError(401, "Incorrect email or password.");
    }

    const active = one<AccountRow>(
      "SELECT * FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [user.id],
    );
    const token = await signSession(user.id, user.role);
    const response = ok({ redirect: "/app" });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    if (active) response.cookies.set(ACTIVE_ACCOUNT_COOKIE, active.id, activeAccountCookieOptions);
    return response;
  } catch (error) {
    return fail(error);
  }
}
