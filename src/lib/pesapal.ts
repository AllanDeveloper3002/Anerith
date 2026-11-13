import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";

const SANDBOX_BASE = "https://cybqa.pesapal.com/pesapalv3";
const PRODUCTION_BASE = "https://pay.pesapal.com/v3";

export interface PesapalConfig {
  enabled: boolean;
  environment: "sandbox" | "production";
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  currency: string;
  countryCode: string;
  ipnMethod: "GET" | "POST";
}

export interface PesapalBillingAddress {
  email_address: string;
  phone_number: string;
  country_code: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  line_1: string;
  line_2: string;
  city: string;
  state: string;
  postal_code: string;
  zip_code: string;
}

export interface PesapalIpn {
  ipn_id: string;
  url: string;
  ipn_notification_type?: string;
  created_date?: string;
}

export interface PesapalOrderResult {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
}

export type PesapalPaymentState = "pending" | "completed" | "failed" | "reversed" | "invalid";

export interface PesapalTransactionStatus {
  order_tracking_id: string;
  merchant_reference: string;
  status_code: number;
  payment_status_description: string;
  amount?: number | string;
  payment_amount?: number | string;
  currency?: string;
  confirmation_code?: string | null;
  payment_method?: string | null;
  created_date?: string;
  message?: string;
  state: PesapalPaymentState;
}

interface TokenCache {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

const globalRef = globalThis as unknown as { __anerithPesapalToken?: TokenCache };

export function pesapalConfig(): PesapalConfig {
  const consumerKey = (process.env.PESAPAL_CONSUMER_KEY ?? "").trim();
  const consumerSecret = (process.env.PESAPAL_CONSUMER_SECRET ?? "").trim();
  const environment =
    (process.env.PESAPAL_ENV ?? "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox";
  const override = (process.env.PESAPAL_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const ipnMethod =
    (process.env.PESAPAL_IPN_METHOD ?? "GET").trim().toUpperCase() === "POST" ? "POST" : "GET";

  return {
    enabled: Boolean(consumerKey && consumerSecret),
    environment,
    baseUrl: override || (environment === "production" ? PRODUCTION_BASE : SANDBOX_BASE),
    consumerKey,
    consumerSecret,
    currency: (process.env.PESAPAL_CURRENCY ?? "USD").trim().toUpperCase() || "USD",
    countryCode: (process.env.PESAPAL_DEFAULT_COUNTRY_CODE ?? "KE").trim().toUpperCase() || "KE",
    ipnMethod,
  };
}

export function resolveAppUrl(request?: Request): string {
  const configured = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!request) return "http://localhost:3000";

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // fall through to host-derived URL
    }
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      (() => {
        try {
          return new URL(request.url).protocol.replace(":", "");
        } catch {
          return "http";
        }
      })();
    return `${proto}://${host}`;
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function errorText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    const message = nested.message ?? nested.code ?? nested.error_type;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (record.status != null && String(record.status) !== "200") {
    const message = record.message ?? record.error;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return null;
}

async function pesapalFetch<T>(config: PesapalConfig, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError(502, "Could not reach PesaPal. Please try again in a moment.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const message = errorText(payload);
  if (!response.ok || message) {
    console.error("[anerith] pesapal request failed", path, response.status, payload);
    throw new ApiError(502, `PesaPal: ${message ?? `request failed (${response.status})`}`);
  }
  return payload as T;
}

export async function requestToken(config: PesapalConfig): Promise<string> {
  const cacheKey = `${config.baseUrl}|${config.consumerKey}`;
  const cached = globalRef.__anerithPesapalToken;
  if (cached && cached.cacheKey === cacheKey && cached.expiresAt > Date.now()) return cached.token;

  const payload = await pesapalFetch<{ token?: string; expiryDate?: string }>(
    config,
    "/api/Auth/RequestToken",
    {
      method: "POST",
      body: JSON.stringify({
        consumer_key: config.consumerKey,
        consumer_secret: config.consumerSecret,
      }),
    },
  );

  if (!payload?.token) throw new ApiError(502, "PesaPal did not return an access token.");
  const parsedExpiry = payload.expiryDate ? Date.parse(payload.expiryDate) : NaN;
  const expiresAt = Number.isFinite(parsedExpiry)
    ? Math.max(parsedExpiry - 30_000, Date.now() + 30_000)
    : Date.now() + 4 * 60_000;

  globalRef.__anerithPesapalToken = { cacheKey, token: payload.token, expiresAt };
  return payload.token;
}

async function authorized(config: PesapalConfig): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await requestToken(config)}` };
}

export async function listIpnUrls(config: PesapalConfig): Promise<PesapalIpn[]> {
  const headers = await authorized(config);
  const payload = await pesapalFetch<unknown>(config, "/api/URLSetup/GetIpnList", {
    method: "GET",
    headers,
  });
  if (Array.isArray(payload)) return payload as PesapalIpn[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const list = record.ipn_list ?? record.ipns ?? record.data;
    if (Array.isArray(list)) return list as PesapalIpn[];
  }
  return [];
}

export async function registerIpn(
  config: PesapalConfig,
  url: string,
  notificationType: "GET" | "POST" = config.ipnMethod,
): Promise<PesapalIpn> {
  const headers = await authorized(config);
  const payload = await pesapalFetch<PesapalIpn>(config, "/api/URLSetup/RegisterIPN", {
    method: "POST",
    headers,
    body: JSON.stringify({ url, ipn_notification_type: notificationType }),
  });
  if (!payload?.ipn_id) throw new ApiError(502, "PesaPal did not return an IPN identifier.");
  return payload;
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function makeMerchantReference(): string {
  return `AN-PAY-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

const COUNTRY_CODES: Record<string, string> = {
  kenya: "KE",
  uganda: "UG",
  tanzania: "TZ",
  rwanda: "RW",
  burundi: "BI",
  zambia: "ZM",
  malawi: "MW",
  mozambique: "MZ",
  nigeria: "NG",
  ghana: "GH",
  "south africa": "ZA",
  botswana: "BW",
  zimbabwe: "ZW",
  namibia: "NA",
  ethiopia: "ET",
  somalia: "SO",
  egypt: "EG",
  morocco: "MA",
  "united kingdom": "GB",
  "great britain": "GB",
  "united states": "US",
  "united states of america": "US",
  canada: "CA",
  australia: "AU",
  india: "IN",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  germany: "DE",
  france: "FR",
  spain: "ES",
  netherlands: "NL",
  ireland: "IE",
};

export function isoCountryCode(value: string | null | undefined, fallback = "KE"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_CODES[trimmed.toLowerCase()] ?? fallback;
}

export function buildBillingAddress(
  customer: { fullName: string; email: string; phone: string | null; country: string | null },
  config: PesapalConfig,
): PesapalBillingAddress {
  const parts = customer.fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "Customer";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "Client";
  return {
    email_address: customer.email,
    phone_number:
      customer.phone?.trim() ||
      (process.env.PESAPAL_DEFAULT_PHONE ?? "").trim() ||
      "0700000000",
    country_code: isoCountryCode(customer.country, config.countryCode),
    first_name: first,
    middle_name: "",
    last_name: last,
    line_1: "N/A",
    line_2: "",
    city: "N/A",
    state: "N/A",
    postal_code: "00000",
    zip_code: "00000",
  };
}

export async function submitOrder(
  config: PesapalConfig,
  input: {
    merchantReference: string;
    amountCents: number;
    currency: string;
    description: string;
    callbackUrl: string;
    ipnId: string;
    billingAddress: PesapalBillingAddress;
  },
): Promise<PesapalOrderResult> {
  const headers = await authorized(config);
  const payload = await pesapalFetch<PesapalOrderResult>(
    config,
    "/api/Transactions/SubmitOrderRequest",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: input.merchantReference,
        currency: input.currency,
        amount: centsToAmount(input.amountCents),
        description: input.description.slice(0, 100),
        callback_url: input.callbackUrl,
        notification_id: input.ipnId,
        billing_address: input.billingAddress,
      }),
    },
  );

  if (!payload?.redirect_url || !payload?.order_tracking_id) {
    throw new ApiError(502, "PesaPal did not return a checkout link.");
  }
  return payload;
}

export function mapPesapalState(statusCode: number, description?: string): PesapalPaymentState {
  if (statusCode === 1) return "completed";
  if (statusCode === 2) return "failed";
  if (statusCode === 3) return "reversed";

  const normalized = (description ?? "").trim().toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "failed") return "failed";
  if (normalized === "reversed") return "reversed";
  if (normalized === "pending") return "pending";
  if (statusCode === 0) return "invalid";
  return "pending";
}

export async function getTransactionStatus(
  config: PesapalConfig,
  orderTrackingId: string,
): Promise<PesapalTransactionStatus> {
  const headers = await authorized(config);
  const payload = await pesapalFetch<
    Omit<PesapalTransactionStatus, "state"> & { status_code?: number | string }
  >(
    config,
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { method: "GET", headers },
  );

  const parsed = Number(payload?.status_code);
  const statusCode = Number.isFinite(parsed) ? parsed : -1;
  const description = payload?.payment_status_description ?? "";
  return {
    ...payload,
    order_tracking_id: payload?.order_tracking_id ?? orderTrackingId,
    merchant_reference: payload?.merchant_reference ?? "",
    status_code: statusCode,
    payment_status_description: description,
    state: mapPesapalState(statusCode, description),
  };
}
