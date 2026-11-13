import { NextResponse } from "next/server";
import { findPaymentIntent, syncPaymentIntent } from "@/lib/payments";

export const dynamic = "force-dynamic";

function param(url: URL, ...names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value) return value;
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderTrackingId = param(url, "OrderTrackingId", "orderTrackingId");
  const merchantReference = param(url, "OrderMerchantReference", "orderMerchantReference");

  const intent = findPaymentIntent({ orderTrackingId, merchantReference });
  if (!intent) {
    return NextResponse.redirect(new URL("/app/challenges?payment=unknown", url.origin));
  }

  let status = "pending";
  try {
    status = (await syncPaymentIntent(intent.id)).status;
  } catch (error) {
    console.error("[anerith] pesapal callback failed", intent.id, error);
    status = "pending";
  }

  const target = new URL("/app/challenges", url.origin);
  target.searchParams.set("payment", status);
  target.searchParams.set("ref", intent.id);
  return NextResponse.redirect(target);
}
