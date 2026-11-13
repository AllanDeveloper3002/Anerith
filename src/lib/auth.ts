import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { one } from "./db";
import type { UserRow } from "./db";
import { ApiError } from "./errors";
import type { UserDTO } from "./types";

export const SESSION_COOKIE = "anerith_session";
export const ACTIVE_ACCOUNT_COOKIE = "anerith_account";
const SESSION_DAYS = 7;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production.");
    }
    return new TextEncoder().encode("anerith-developer-only-secret-change-me-4f83a9c1b7e2d650");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, role: string): Promise<string> {
  return new SignJWT({ uid: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = typeof payload.uid === "string" ? payload.uid : null;
    if (!userId) return null;
    return one<UserRow>("SELECT * FROM users WHERE id = ?", [userId]) ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  return user;
}

export async function requireAdmin(): Promise<UserRow> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError(403, "Administrator access required.");
  return user;
}

export function toUserDTO(user: UserRow): UserDTO {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    country: user.country,
    phone: user.phone,
    role: user.role,
    kycStatus: user.kyc_status,
    kycSubmittedAt: user.kyc_submitted_at,
    createdAt: user.created_at,
  };
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export const activeAccountCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};
