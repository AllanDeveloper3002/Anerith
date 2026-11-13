import { NextResponse } from "next/server";
import { findPaymentIntent, syncPaymentIntent } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface IpnPayload {
  orderNotificationType: string;
  orderTrackingId: string;
  orderMerchantReference: string;
  status: number;
}

function pick(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method !== "POST") return {};
  try {
    const parsed = (await request.json()) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request): Promise<NextResponse<IpnPayload>> {
  const url = new URL(request.url);
  const body = await readBody(request);

  const orderTrackingId =
    url.searchParams.get("OrderTrackingId") ??
    url.searchParams.get("orderTrackingId") ??
    pick(body, "OrderTrackingId", "orderTrackingId");
  const merchantReference =
    url.searchParams.get("OrderMerchantReference") ??
    url.searchParams.get("orderMerchantReference") ??
    pick(body, "OrderMerchantReference", "orderMerchantReference");
  const notificationType =
    url.searchParams.get("OrderNotificationType") ??
    url.searchParams.get("orderNotificationType") ??
    pick(body, "OrderNotificationType", "orderNotificationType") ??
    "IPNCHANGE";

  const payload: IpnPayload = {
    orderNotificationType: notificationType,
    orderTrackingId: orderTrackingId ?? "",
    orderMerchantReference: merchantReference ?? "",
    status: 200,
  };

  const intent = findPaymentIntent({ orderTrackingId, merchantReference });
  if (!intent) {
    console.warn("[anerith] pesapal IPN for unknown payment", merchantReference, orderTrackingId);
    return NextResponse.json(payload, { status: 200 });
  }

  try {
    await syncPaymentIntent(intent.id);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("[anerith] pesapal IPN processing failed", intent.id, error);
    return NextResponse.json({ ...payload, status: 500 }, { status: 500 });
  }
}
