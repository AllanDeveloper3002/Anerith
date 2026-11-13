import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildBillingAddress,
  centsToAmount,
  getTransactionStatus,
  isoCountryCode,
  makeMerchantReference,
  mapPesapalState,
  pesapalConfig,
  registerIpn,
  requestToken,
  submitOrder,
} from "@/lib/pesapal";

interface Captured {
  method: string;
  path: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
}

const captured: Captured[] = [];
let server: Server;

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => {
      data += String(chunk);
    });
    request.on("end", () => resolve(data));
  });
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const path = (request.url ?? "").split("?")[0];
    const raw = await readBody(request);
    let body: Record<string, unknown> | null = null;
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    captured.push({
      method: request.method ?? "",
      path,
      authorization: request.headers.authorization ?? null,
      body,
    });

    const send = (payload: unknown) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    };

    if (path.endsWith("/api/Auth/RequestToken")) {
      send({ token: "test-token", expiryDate: new Date(Date.now() + 5 * 60_000).toISOString() });
      return;
    }
    if (path.endsWith("/api/URLSetup/GetIpnList")) {
      send([]);
      return;
    }
    if (path.endsWith("/api/URLSetup/RegisterIPN")) {
      send({
        ipn_id: "ipn-test-1",
        url: body?.url ?? "",
        ipn_notification_type: body?.ipn_notification_type ?? "GET",
        created_date: new Date().toISOString(),
      });
      return;
    }
    if (path.endsWith("/api/Transactions/SubmitOrderRequest")) {
      send({
        order_tracking_id: "track-1",
        merchant_reference: body?.id ?? "",
        redirect_url: "https://sandbox.example/checkout/track-1",
      });
      return;
    }
    if (path.endsWith("/api/Transactions/GetTransactionStatus")) {
      send({
        order_tracking_id: "track-1",
        merchant_reference: "AN-PAY-TEST",
        status_code: 1,
        payment_status_description: "Completed",
        amount: 219,
        payment_amount: 219,
        currency: "USD",
        confirmation_code: "CONF-1",
        payment_method: "Visa",
      });
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.PESAPAL_BASE_URL = `http://127.0.0.1:${port}/pesapalv3`;
  process.env.PESAPAL_CONSUMER_KEY = "test-key";
  process.env.PESAPAL_CONSUMER_SECRET = "test-secret";
  process.env.PESAPAL_ENV = "sandbox";
  process.env.PESAPAL_CURRENCY = "USD";
});

afterAll(async () => {
  delete process.env.PESAPAL_BASE_URL;
  delete process.env.PESAPAL_CONSUMER_KEY;
  delete process.env.PESAPAL_CONSUMER_SECRET;
  delete process.env.PESAPAL_ENV;
  delete process.env.PESAPAL_CURRENCY;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("pesapal helpers", () => {
  it("maps PesaPal status codes to settlement states", () => {
    expect(mapPesapalState(1, "Completed")).toBe("completed");
    expect(mapPesapalState(2, "Failed")).toBe("failed");
    expect(mapPesapalState(3, "Reversed")).toBe("reversed");
    expect(mapPesapalState(0, "Invalid")).toBe("invalid");
    expect(mapPesapalState(0, "Pending")).toBe("pending");
    expect(mapPesapalState(-1)).toBe("pending");
    expect(mapPesapalState(-1, "Completed")).toBe("completed");
  });

  it("converts integer cents to gateway amounts", () => {
    expect(centsToAmount(21_900)).toBe(219);
    expect(centsToAmount(4_999)).toBe(49.99);
  });

  it("normalizes country names and codes", () => {
    expect(isoCountryCode("KE")).toBe("KE");
    expect(isoCountryCode("Kenya")).toBe("KE");
    expect(isoCountryCode("United Kingdom")).toBe("GB");
    expect(isoCountryCode(null, "TZ")).toBe("TZ");
  });

  it("builds a billing address from the trader profile", () => {
    const address = buildBillingAddress(
      {
        fullName: "Jordan Ellis",
        email: "demo@anerith.local",
        phone: null,
        country: "Kenya",
      },
      { ...pesapalConfig(), countryCode: "KE" },
    );
    expect(address.first_name).toBe("Jordan");
    expect(address.last_name).toBe("Ellis");
    expect(address.country_code).toBe("KE");
    expect(address.email_address).toBe("demo@anerith.local");
    expect(address.phone_number.length).toBeGreaterThan(4);
  });

  it("generates unique merchant references", () => {
    const first = makeMerchantReference();
    const second = makeMerchantReference();
    expect(first).toMatch(/^AN-PAY-[0-9A-F]{12}$/);
    expect(first).not.toBe(second);
  });
});

describe("pesapal client", () => {
  it("reads configuration and requests a token once", async () => {
    const config = pesapalConfig();
    expect(config.enabled).toBe(true);
    expect(config.baseUrl).toContain("/pesapalv3");

    const first = await requestToken(config);
    const second = await requestToken(config);
    expect(first).toBe("test-token");
    expect(second).toBe("test-token");

    const tokenCalls = captured.filter((item) => item.path.endsWith("/api/Auth/RequestToken"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].body).toEqual({ consumer_key: "test-key", consumer_secret: "test-secret" });
  });

  it("registers an IPN endpoint with a bearer token", async () => {
    const config = pesapalConfig();
    const ipn = await registerIpn(config, "https://anerith.example/api/payments/pesapal/ipn");
    expect(ipn.ipn_id).toBe("ipn-test-1");

    const call = captured.filter((item) => item.path.endsWith("/api/URLSetup/RegisterIPN")).at(-1);
    expect(call?.authorization).toBe("Bearer test-token");
    expect(call?.body).toEqual({
      url: "https://anerith.example/api/payments/pesapal/ipn",
      ipn_notification_type: "GET",
    });
  });

  it("submits an order with the expected amount and callback", async () => {
    const config = pesapalConfig();
    const result = await submitOrder(config, {
      merchantReference: "AN-PAY-TEST",
      amountCents: 21_900,
      currency: "USD",
      description: "Horizon · $50,000 account",
      callbackUrl: "https://anerith.example/api/payments/pesapal/callback",
      ipnId: "ipn-test-1",
      billingAddress: buildBillingAddress(
        {
          fullName: "Jordan Ellis",
          email: "demo@anerith.local",
          phone: "+254700000000",
          country: "Kenya",
        },
        config,
      ),
    });

    expect(result.order_tracking_id).toBe("track-1");
    expect(result.redirect_url).toContain("sandbox.example");

    const call = captured
      .filter((item) => item.path.endsWith("/api/Transactions/SubmitOrderRequest"))
      .at(-1);
    expect(call?.authorization).toBe("Bearer test-token");
    expect(call?.body?.id).toBe("AN-PAY-TEST");
    expect(call?.body?.amount).toBe(219);
    expect(call?.body?.currency).toBe("USD");
    expect(call?.body?.notification_id).toBe("ipn-test-1");
    expect(call?.body?.callback_url).toContain("/api/payments/pesapal/callback");
  });

  it("parses a completed transaction status", async () => {
    const config = pesapalConfig();
    const status = await getTransactionStatus(config, "track-1");
    expect(status.state).toBe("completed");
    expect(status.status_code).toBe(1);
    expect(status.currency).toBe("USD");
    expect(status.payment_amount).toBe(219);
  });
});
