import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.errors[0];
    const field = first?.path?.join(".");
    const message = first ? `${field ? `${field}: ` : ""}${first.message}` : "Invalid request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  console.error("[veyra] unhandled api error", error);
  return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    if (new URL(origin).host !== host) {
      throw new ApiError(403, "Request origin not allowed.");
    }
  } catch {
    throw new ApiError(403, "Request origin not allowed.");
  }
}
