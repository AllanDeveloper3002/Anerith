import { requireAdmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { assertSameOrigin, fail, ok } from "@/lib/http";
import { ApiError } from "@/lib/errors";
import { checkSupabase, supabaseConfig, syncSnapshot } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await checkSupabase());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    if (!supabaseConfig().configured) {
      throw new ApiError(400, "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    const counts = await syncSnapshot({
      profiles: all(
        `SELECT id, email, full_name, country, role, kyc_status, created_at FROM users ORDER BY created_at LIMIT 1000`,
      ),
      accounts: all(
        `SELECT id, user_id, number, type, plan, phase, account_size_cents, balance_cents, status,
          profit_target_pct, daily_loss_pct, max_drawdown_pct, drawdown_mode, start_balance_cents,
          created_at, ended_at FROM accounts ORDER BY created_at LIMIT 2000`,
      ),
      transactions: all(
        `SELECT id, user_id, account_id, type, amount_cents, status, method, reference, note,
          created_at, completed_at FROM transactions ORDER BY created_at DESC LIMIT 5000`,
      ),
      payouts: all(
        `SELECT id, user_id, account_id, amount_cents, fee_cents, net_cents, status, method,
          destination, reference, requested_at, processed_at FROM payouts ORDER BY requested_at DESC LIMIT 2000`,
      ),
      paymentIntents: all(
        `SELECT id, user_id, plan, account_size_cents, amount_cents, currency, provider, method,
          status, merchant_reference, order_tracking_id, challenge_id, account_id, failure_reason,
          created_at, updated_at, completed_at
         FROM payment_intents ORDER BY created_at DESC LIMIT 5000`,
      ),
      competitions: all(
        `SELECT id, name, description, prize_pool_cents, start_at, end_at, status, settled_at, created_at
         FROM competitions ORDER BY created_at DESC LIMIT 200`,
      ),
      competitionEntries: all(
        `SELECT id, competition_id, user_id, display_name, account_size_cents, return_pct,
          peak_return_pct, prize_cents, joined_at, updated_at
         FROM competition_entries ORDER BY joined_at DESC LIMIT 5000`,
      ),
    });
    return ok({ counts, message: "Snapshot mirrored to Supabase." });
  } catch (error) {
    return fail(error);
  }
}
