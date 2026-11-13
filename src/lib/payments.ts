import { all, newId, nowIso, one, type PaymentIntentRow, run, type UserRow, withTransaction } from "./db";
import { ApiError } from "./errors";
import { centsToUsd } from "./format";
import { getPlan, getSizeOption } from "./challenges";
import type { PaymentGatewayInfo, PaymentIntentDTO, PaymentIntentStatus } from "./types";
import { completeChallengePurchase } from "./purchases";
import { getSetting, setSetting } from "./settings";
import {
  buildBillingAddress,
  getTransactionStatus,
  listIpnUrls,
  makeMerchantReference,
  pesapalConfig,
  registerIpn,
  submitOrder,
  type PesapalConfig,
  type PesapalTransactionStatus,
} from "./pesapal";

export type PaymentCheckoutInput = {
  plan: "one-step" | "two-step" | "instant";
  size: number;
  method?: "card" | "mobile";
};

function mapIntent(row: PaymentIntentRow): PaymentIntentDTO {
  return {
    id: row.id,
    plan: row.plan,
    accountSize: centsToUsd(row.account_size_cents),
    amount: centsToUsd(row.amount_cents),
    currency: row.currency,
    provider: "pesapal",
    method: row.method,
    status: row.status as PaymentIntentStatus,
    reference: row.merchant_reference,
    redirectUrl: row.redirect_url,
    accountId: row.account_id,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function paymentGatewayInfo(): PaymentGatewayInfo {
  const config = pesapalConfig();
  return {
    provider: "pesapal",
    name: "PesaPal",
    enabled: config.enabled,
    environment: config.environment,
    currency: config.currency,
    methods: [
      { key: "card", label: "Card" },
      { key: "mobile", label: "Mobile money" },
    ],
  };
}

export function getPaymentIntentsForUser(userId: string): PaymentIntentDTO[] {
  return all<PaymentIntentRow>(
    "SELECT * FROM payment_intents WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [userId],
  ).map(mapIntent);
}

export function getPaymentIntentForUser(userId: string, intentId: string): PaymentIntentDTO {
  const row = one<PaymentIntentRow>("SELECT * FROM payment_intents WHERE id = ? AND user_id = ?", [
    intentId,
    userId,
  ]);
  if (!row) throw new ApiError(404, "Payment not found.");
  return mapIntent(row);
}

export function getPaymentIntentRow(intentId: string): PaymentIntentRow {
  const row = one<PaymentIntentRow>("SELECT * FROM payment_intents WHERE id = ?", [intentId]);
  if (!row) throw new ApiError(404, "Payment not found.");
  return row;
}

export function findPaymentIntent(input: {
  orderTrackingId?: string | null;
  merchantReference?: string | null;
}): PaymentIntentRow | null {
  if (input.orderTrackingId) {
    const byTracking = one<PaymentIntentRow>(
      "SELECT * FROM payment_intents WHERE order_tracking_id = ?",
      [input.orderTrackingId],
    );
    if (byTracking) return byTracking;
  }
  if (input.merchantReference) {
    return (
      one<PaymentIntentRow>("SELECT * FROM payment_intents WHERE merchant_reference = ?", [
        input.merchantReference,
      ]) ?? null
    );
  }
  return null;
}

function createPendingIntent(user: UserRow, input: PaymentCheckoutInput): PaymentIntentRow {
  const plan = getPlan(input.plan);
  const size = getSizeOption(input.plan, input.size);
  if (!size) throw new ApiError(400, "This account size is not available for the selected plan.");
  if (size.price <= 0) throw new ApiError(400, "This program does not require checkout.");

  const config = pesapalConfig();
  const id = newId();
  const now = nowIso();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = makeMerchantReference();
    try {
      run(
        `INSERT INTO payment_intents (
          id, user_id, plan, account_size_cents, amount_cents, currency, provider, method, status,
          merchant_reference, order_tracking_id, redirect_url, challenge_id, account_id, failure_reason,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pesapal', ?, 'pending', ?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
        [
          id,
          user.id,
          plan.key,
          size.size * 100,
          size.price * 100,
          config.currency,
          input.method ?? "card",
          reference,
          now,
          now,
        ],
      );
      return getPaymentIntentRow(id);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new ApiError(500, "Could not create a payment reference. Please try again.");
}

async function ensureIpn(config: PesapalConfig, appUrl: string): Promise<string> {
  const override = (process.env.PESAPAL_IPN_ID ?? "").trim();
  if (override) return override;

  const ipnUrl = (process.env.PESAPAL_IPN_URL ?? "").trim() || `${appUrl}/api/payments/pesapal/ipn`;
  const cacheKey = `pesapal_ipn:${config.baseUrl}:${ipnUrl}`;
  const cached = getSetting(cacheKey);
  if (cached) return cached;

  try {
    const existing = (await listIpnUrls(config)).find((item) => item.url === ipnUrl);
    if (existing?.ipn_id) {
      setSetting(cacheKey, existing.ipn_id);
      return existing.ipn_id;
    }
  } catch (error) {
    console.warn("[anerith] pesapal IPN lookup failed, registering a new endpoint", error);
  }

  const created = await registerIpn(config, ipnUrl, config.ipnMethod);
  setSetting(cacheKey, created.ipn_id);
  return created.ipn_id;
}

export async function initiatePesapalCheckout(
  user: UserRow,
  input: PaymentCheckoutInput,
  appUrl: string,
): Promise<{ intent: PaymentIntentDTO; redirectUrl: string }> {
  const config = pesapalConfig();
  if (!config.enabled) {
    throw new ApiError(
      503,
      "PesaPal is not configured. Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET on the server.",
    );
  }

  const intent = createPendingIntent(user, input);
  try {
    const ipnId = await ensureIpn(config, appUrl);
    const plan = getPlan(intent.plan);
    const result = await submitOrder(config, {
      merchantReference: intent.merchant_reference,
      amountCents: intent.amount_cents,
      currency: intent.currency,
      description: `${plan.name} · $${centsToUsd(intent.account_size_cents).toLocaleString("en-US")} account`,
      callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
      ipnId,
      billingAddress: buildBillingAddress(
        {
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          country: user.country,
        },
        config,
      ),
    });

    run(
      `UPDATE payment_intents SET order_tracking_id = ?, redirect_url = ?, updated_at = ? WHERE id = ?`,
      [result.order_tracking_id, result.redirect_url, nowIso(), intent.id],
    );

    return {
      intent: mapIntent(getPaymentIntentRow(intent.id)),
      redirectUrl: result.redirect_url,
    };
  } catch (error) {
    run(
      `UPDATE payment_intents SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`,
      [
        (error instanceof Error ? error.message : "PesaPal checkout could not be created.").slice(0, 300),
        nowIso(),
        intent.id,
      ],
    );
    throw error;
  }
}

function amountToCents(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function markFailed(intentId: string, reason: string): PaymentIntentDTO {
  run(
    `UPDATE payment_intents SET status = 'failed', failure_reason = ?, updated_at = ?
     WHERE id = ? AND status != 'completed'`,
    [reason.slice(0, 300), nowIso(), intentId],
  );
  return mapIntent(getPaymentIntentRow(intentId));
}

function fulfillPaidIntent(intent: PaymentIntentRow): PaymentIntentDTO {
  try {
    return withTransaction(() => {
      const current = one<PaymentIntentRow>("SELECT * FROM payment_intents WHERE id = ?", [intent.id]);
      if (!current) throw new ApiError(404, "Payment not found.");
      if (current.status === "completed") return mapIntent(current);
      if (current.status !== "pending" && current.status !== "processing") {
        throw new ApiError(409, "This payment is no longer awaiting settlement.");
      }

      const now = nowIso();
      run("UPDATE payment_intents SET status = 'processing', updated_at = ? WHERE id = ?", [
        now,
        current.id,
      ]);

      const { account } = completeChallengePurchase(current.user_id, {
        plan: current.plan,
        size: Math.round(current.account_size_cents / 100),
        method: "PesaPal",
        id: current.id,
        reference: current.merchant_reference,
        createdAt: current.created_at,
        noticeTitle: "Payment confirmed",
        priceCents: current.amount_cents,
      });

      run(
        `UPDATE payment_intents
         SET status = 'completed', challenge_id = ?, account_id = ?, completed_at = ?, updated_at = ?, failure_reason = NULL
         WHERE id = ?`,
        [current.id, account.id, now, now, current.id],
      );

      return mapIntent(getPaymentIntentRow(current.id));
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw error;
    console.error("[anerith] payment fulfillment failed", intent.id, error);
    run(
      `UPDATE payment_intents SET status = 'pending', failure_reason = ?, updated_at = ?
       WHERE id = ? AND status != 'completed'`,
      [
        (error instanceof Error ? error.message : "Fulfillment failed.").slice(0, 300),
        nowIso(),
        intent.id,
      ],
    );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Payment was received but the account could not be provisioned. Contact support with your payment reference.",
    );
  }
}

function applyGatewayStatus(intent: PaymentIntentRow, status: PesapalTransactionStatus): PaymentIntentDTO {
  if (status.state === "completed") {
    if (status.merchant_reference && status.merchant_reference !== intent.merchant_reference) {
      return markFailed(intent.id, "Payment reference did not match the order.");
    }

    if (status.currency && status.currency.trim().toUpperCase() !== intent.currency.toUpperCase()) {
      return markFailed(intent.id, "Payment currency did not match the order.");
    }

    const paidCents = amountToCents(status.amount ?? status.payment_amount);
    if (paidCents != null && paidCents !== intent.amount_cents) {
      return markFailed(intent.id, "Payment amount did not match the order total.");
    }

    return fulfillPaidIntent(intent);
  }

  if (status.state === "failed" || status.state === "reversed" || status.state === "invalid") {
    const reason =
      status.message?.trim() ||
      status.payment_status_description?.trim() ||
      "The payment was not completed.";
    return markFailed(intent.id, reason);
  }

  run("UPDATE payment_intents SET updated_at = ? WHERE id = ? AND status = 'pending'", [
    nowIso(),
    intent.id,
  ]);
  return mapIntent(getPaymentIntentRow(intent.id));
}

export async function syncPaymentIntent(intentId: string): Promise<PaymentIntentDTO> {
  const intent = getPaymentIntentRow(intentId);
  if (intent.status === "completed") return mapIntent(intent);
  if (!intent.order_tracking_id) throw new ApiError(409, "This payment has not reached PesaPal yet.");

  const config = pesapalConfig();
  if (!config.enabled) throw new ApiError(503, "PesaPal is not configured on this server.");

  const status = await getTransactionStatus(config, intent.order_tracking_id);
  return applyGatewayStatus(intent, status);
}
