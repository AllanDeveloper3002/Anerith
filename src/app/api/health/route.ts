import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { engineRunning } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    return NextResponse.json({
      ok: true,
      data: {
        status: "ok",
        engine: engineRunning() ? "running" : "stopped",
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable." }, { status: 503 });
  }
}
