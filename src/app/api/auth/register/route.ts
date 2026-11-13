import { hashSync } from "bcryptjs";
import { ApiError } from "@/lib/errors";
import {
  ACTIVE_ACCOUNT_COOKIE,
  activeAccountCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";
import { provisionTrial } from "@/lib/accounts";
import { newId, nowIso, one, run, type UserRow, withTransaction } from "@/lib/db";
import { assertSameOrigin, fail, ok, readJson } from "@/lib/http";
import { notify } from "@/lib/notifications";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = rateLimit(clientKey(request, "register"), 6, 10 * 60 * 1000);
    if (!limit.allowed) throw new ApiError(429, "Too many sign-up attempts. Please try again shortly.");

    const body = registerSchema.parse(await readJson(request));
    const email = body.email.toLowerCase();
    if (one<UserRow>("SELECT id FROM users WHERE email = ?", [email])) {
      throw new ApiError(409, "An account with this email already exists.");
    }

    const userId = newId();
    let accountId = "";
    withTransaction(() => {
      run(
        `INSERT INTO users (id, email, password_hash, full_name, country, phone, role, kyc_status, kyc_submitted_at, kyc_data, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'user', 'unverified', NULL, NULL, ?)`,
        [userId, email, hashSync(body.password, 11), body.fullName, body.country ?? null, nowIso()],
      );
      const account = provisionTrial(userId);
      accountId = account.id;
      notify(
        userId,
        "Welcome to Anerith",
        "Your free $10,000 trial account is ready. Trade the objectives or choose a challenge to get funded.",
        "info",
      );
    });

    const token = await signSession(userId, "user");
    const response = ok({ redirect: "/app", trialAccountId: accountId });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    if (accountId) response.cookies.set(ACTIVE_ACCOUNT_COOKIE, accountId, activeAccountCookieOptions);
    return response;
  } catch (error) {
    return fail(error);
  }
}
