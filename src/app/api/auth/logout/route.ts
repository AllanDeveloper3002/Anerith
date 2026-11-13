import { ACTIVE_ACCOUNT_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function POST() {
  try {
    const response = ok({ redirect: "/" });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return fail(error);
  }
}
