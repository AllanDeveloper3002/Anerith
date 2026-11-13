import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import { calcProfitUsd, INSTRUMENTS, type Side } from "./instruments";
import { priceAt } from "./market";
import type { AccountStatus, AccountType, ChallengePlanKey, DrawdownMode } from "./challenges";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  country: string | null;
  phone: string | null;
  role: "user" | "admin";
  kyc_status: "unverified" | "pending" | "verified" | "rejected";
  kyc_submitted_at: string | null;
  kyc_data: string | null;
  created_at: string;
}

export interface AccountRow {
  id: string;
  user_id: string;
  number: string;
  type: AccountType;
  plan: ChallengePlanKey;
  phase: number;
  account_size_cents: number;
  balance_cents: number;
  leverage: number;
  status: AccountStatus;
  profit_target_pct: number | null;
  daily_loss_pct: number;
  max_drawdown_pct: number;
  drawdown_mode: DrawdownMode;
  min_trading_days: number;
  profit_split_pct: number;
  start_balance_cents: number;
  high_water_mark_cents: number;
  day_start_equity_cents: number;
  day_start_date: string;
  day_start_balance_cents: number;
  total_payouts_cents: number;
  challenge_id: string | null;
  broker_connection_id: string | null;
  broker_login: string | null;
  risk_config_id: string | null;
  max_trading_days: number | null;
  breached_at: string | null;
  breach_rule: string | null;
  breach_detail: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  status_before_suspension: string | null;
  last_evaluated_at: string | null;
  created_at: string;
  ended_at: string | null;
  fail_reason: string | null;
}

export interface PositionRow {
  id: string;
  account_id: string;
  symbol: string;
  side: Side;
  lots: number;
  entry_price: number;
  sl: number | null;
  tp: number | null;
  commission_cents: number;
  swap_cents: number | null;
  profit_cents: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  close_reason: string | null;
  client_order_id: string | null;
  order_id: string | null;
  parent_position_id: string | null;
  execution_provider: string;
  execution_ref: string | null;
  current_price: number | null;
  floating_cents: number;
  margin_cents: number;
  modified_at: string | null;
}

export interface OrderRow {
  id: string;
  account_id: string;
  symbol: string;
  side: Side;
  type: "limit" | "stop";
  lots: number;
  price: number;
  sl: number | null;
  tp: number | null;
  status: "pending" | "filled" | "cancelled" | "rejected" | "expired";
  created_at: string;
  triggered_at: string | null;
  client_order_id: string | null;
  expires_at: string | null;
  execution_provider: string;
  execution_ref: string | null;
  filled_price: number | null;
  rejection_reason: string | null;
  modified_at: string | null;
  cancelled_at: string | null;
}

export interface ExecutionEventRow {
  id: string;
  account_id: string;
  position_id: string | null;
  order_id: string | null;
  event_type: string;
  provider: string;
  execution_ref: string | null;
  symbol: string | null;
  side: Side | null;
  lots: number | null;
  price: number | null;
  commission_cents: number;
  reason: string | null;
  metrics_json: string | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface MarketQuoteRow {
  symbol: string;
  provider: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  last_price: number;
  change_pct: number;
  high_24h: number;
  low_24h: number;
  status: "open" | "closed" | "halted";
  timestamp: number;
  received_at: string;
}

export interface ExecutionSettingsRow {
  id: string;
  provider: string;
  market_data_provider: string;
  policy: "instant" | "reject_on_gap";
  slippage_pips: number;
  max_quote_age_ms: number;
  max_gap_pips: number;
  swap_enabled: number;
  updated_by: string | null;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string | null;
  account_id: string | null;
  type:
    | "challenge_purchase"
    | "payout"
    | "payout_reversal"
    | "competition_prize"
    | "commission"
    | "trade"
    | "adjustment";
  amount_cents: number;
  status: "completed" | "processing" | "rejected";
  method: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PayoutRow {
  id: string;
  user_id: string;
  account_id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  status: "processing" | "completed" | "rejected";
  method: string;
  destination: string;
  reference: string;
  requested_at: string;
  processed_at: string | null;
  note: string | null;
}

export interface ChallengeRow {
  id: string;
  user_id: string;
  plan: ChallengePlanKey;
  account_size_cents: number;
  price_cents: number;
  status: "completed" | "processing" | "rejected";
  method: string;
  reference: string;
  account_id: string | null;
  created_at: string;
}

export interface PaymentIntentRow {
  id: string;
  user_id: string;
  plan: ChallengePlanKey;
  account_size_cents: number;
  amount_cents: number;
  currency: string;
  provider: string;
  method: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  merchant_reference: string;
  order_tracking_id: string | null;
  redirect_url: string | null;
  challenge_id: string | null;
  account_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BrokerConnectionRow {
  id: string;
  name: string;
  provider: string;
  environment: "demo" | "live";
  endpoint: string;
  api_key_preview: string;
  api_key_hash: string;
  status: "connected" | "disconnected" | "error";
  last_sync_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  kind: "info" | "success" | "warning" | "danger";
  read: number;
  created_at: string;
}

export interface CompetitionRow {
  id: string;
  name: string;
  description: string;
  prize_pool_cents: number;
  start_at: string;
  end_at: string;
  status: "upcoming" | "active" | "ended";
  created_at: string;
  settled_at: string | null;
}

export interface CompetitionEntryRow {
  id: string;
  competition_id: string;
  user_id: string | null;
  account_id: string | null;
  display_name: string;
  account_size_cents: number;
  return_pct: number;
  baseline_equity_cents: number;
  peak_return_pct: number;
  prize_cents: number;
  joined_at: string;
  updated_at: string | null;
}

type SqlParam = string | number | bigint | null;

const globalRef = globalThis as unknown as { __anerithDb?: DatabaseSync };

function schema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      country TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      kyc_status TEXT NOT NULL DEFAULT 'unverified',
      kyc_submitted_at TEXT,
      kyc_data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broker_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      environment TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key_preview TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      last_sync_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      plan TEXT NOT NULL,
      phase INTEGER NOT NULL DEFAULT 1,
      account_size_cents INTEGER NOT NULL,
      balance_cents INTEGER NOT NULL,
      leverage INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'active',
      profit_target_pct REAL,
      daily_loss_pct REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      drawdown_mode TEXT NOT NULL DEFAULT 'static',
      min_trading_days INTEGER NOT NULL DEFAULT 0,
      profit_split_pct REAL NOT NULL DEFAULT 0,
      start_balance_cents INTEGER NOT NULL,
      high_water_mark_cents INTEGER NOT NULL,
      day_start_equity_cents INTEGER NOT NULL,
      day_start_date TEXT NOT NULL,
      total_payouts_cents INTEGER NOT NULL DEFAULT 0,
      challenge_id TEXT,
      broker_connection_id TEXT,
      broker_login TEXT,
      created_at TEXT NOT NULL,
      ended_at TEXT,
      fail_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      lots REAL NOT NULL,
      entry_price REAL NOT NULL,
      sl REAL,
      tp REAL,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      swap_cents INTEGER,
      profit_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      close_price REAL,
      close_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id, status);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      lots REAL NOT NULL,
      price REAL NOT NULL,
      sl REAL,
      tp REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      triggered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id, status);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      account_id TEXT,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      method TEXT,
      reference TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at);

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      net_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      method TEXT NOT NULL,
      destination TEXT NOT NULL,
      reference TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      processed_at TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id, requested_at);

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      account_size_cents INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      account_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_user ON challenges(user_id, created_at);

    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL,
      account_size_cents INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      provider TEXT NOT NULL DEFAULT 'pesapal',
      method TEXT NOT NULL DEFAULT 'card',
      status TEXT NOT NULL DEFAULT 'pending',
      merchant_reference TEXT NOT NULL UNIQUE,
      order_tracking_id TEXT,
      redirect_url TEXT,
      challenge_id TEXT,
      account_id TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON payment_intents(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_tracking ON payment_intents(order_tracking_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      prize_pool_cents INTEGER NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      settled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS competition_entries (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      user_id TEXT,
      account_id TEXT,
      display_name TEXT NOT NULL,
      account_size_cents INTEGER NOT NULL,
      return_pct REAL NOT NULL,
      baseline_equity_cents INTEGER NOT NULL DEFAULT 0,
      peak_return_pct REAL NOT NULL DEFAULT 0,
      prize_cents INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_competition_entries ON competition_entries(competition_id);

    CREATE TABLE IF NOT EXISTS broker_events (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_broker_events ON broker_events(connection_id, created_at);

    CREATE TABLE IF NOT EXISTS risk_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'plan',
      plan_key TEXT,
      account_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      profit_target_pct REAL,
      phase2_target_pct REAL,
      daily_loss_pct REAL NOT NULL DEFAULT 5,
      daily_loss_basis TEXT NOT NULL DEFAULT 'equity',
      daily_limit_basis TEXT NOT NULL DEFAULT 'starting_balance',
      drawdown_pct REAL NOT NULL DEFAULT 10,
      drawdown_mode TEXT NOT NULL DEFAULT 'static',
      drawdown_basis TEXT NOT NULL DEFAULT 'equity',
      trailing_lock_pct REAL,
      min_trading_days INTEGER NOT NULL DEFAULT 0,
      max_trading_days INTEGER,
      max_risk_per_trade_pct REAL NOT NULL DEFAULT 1,
      require_stop_loss INTEGER NOT NULL DEFAULT 1,
      max_open_positions INTEGER NOT NULL DEFAULT 20,
      max_total_exposure_pct REAL NOT NULL DEFAULT 300,
      max_instrument_exposure_pct REAL NOT NULL DEFAULT 100,
      weekend_holding INTEGER NOT NULL DEFAULT 1,
      weekend_close_hour_utc INTEGER NOT NULL DEFAULT 21,
      news_trading_allowed INTEGER NOT NULL DEFAULT 1,
      news_blackout_minutes INTEGER NOT NULL DEFAULT 30,
      close_on_breach INTEGER NOT NULL DEFAULT 1,
      reset_timezone TEXT NOT NULL DEFAULT 'UTC',
      reset_hour INTEGER NOT NULL DEFAULT 0,
      reset_minute INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_configs_default
      ON risk_configs(scope) WHERE scope = 'default' AND enabled = 1;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_configs_plan
      ON risk_configs(plan_key) WHERE scope = 'plan' AND enabled = 1;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_configs_account
      ON risk_configs(account_id) WHERE scope = 'account' AND enabled = 1;

    CREATE TABLE IF NOT EXISTS risk_config_history (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_config_history_config
      ON risk_config_history(config_id, created_at);

    CREATE TABLE IF NOT EXISTS account_daily_snapshots (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      timezone TEXT NOT NULL,
      reset_hour INTEGER NOT NULL DEFAULT 0,
      reset_minute INTEGER NOT NULL DEFAULT 0,
      start_balance_cents INTEGER NOT NULL,
      start_equity_cents INTEGER NOT NULL,
      end_balance_cents INTEGER NOT NULL,
      end_equity_cents INTEGER NOT NULL,
      peak_equity_cents INTEGER NOT NULL,
      trough_equity_cents INTEGER NOT NULL,
      realized_pnl_cents INTEGER NOT NULL DEFAULT 0,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      swap_cents INTEGER NOT NULL DEFAULT 0,
      open_positions INTEGER NOT NULL DEFAULT 0,
      traded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finalized_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_snapshots_account_day
      ON account_daily_snapshots(account_id, day_key);
    CREATE INDEX IF NOT EXISTS idx_daily_snapshots_account
      ON account_daily_snapshots(account_id, day_key DESC);

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      balance_cents INTEGER NOT NULL,
      equity_cents INTEGER NOT NULL,
      floating_cents INTEGER NOT NULL,
      margin_cents INTEGER NOT NULL,
      exposure_cents INTEGER NOT NULL,
      open_positions INTEGER NOT NULL,
      daily_loss_cents INTEGER NOT NULL,
      drawdown_cents INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'tick',
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_equity_snapshots_account
      ON equity_snapshots(account_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS risk_events (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      user_id TEXT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      rule TEXT NOT NULL,
      message TEXT NOT NULL,
      metrics_json TEXT,
      dedupe_key TEXT,
      actor_id TEXT,
      actor_role TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_events_dedupe
      ON risk_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_risk_events_account
      ON risk_events(account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS breaches (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rule TEXT NOT NULL,
      detail TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      dedupe_key TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_breaches_dedupe ON breaches(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_breaches_account ON breaches(account_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS account_status_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      reason TEXT NOT NULL,
      actor_id TEXT,
      actor_role TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_status_history_account
      ON account_status_history(account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created
      ON admin_audit_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS news_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      symbol TEXT,
      impact TEXT NOT NULL DEFAULT 'high',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_news_events_window ON news_events(starts_at, ends_at);

    CREATE TRIGGER IF NOT EXISTS risk_events_no_update
      BEFORE UPDATE ON risk_events
      BEGIN SELECT RAISE(ABORT, 'risk_events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS risk_events_no_delete
      BEFORE DELETE ON risk_events
      BEGIN SELECT RAISE(ABORT, 'risk_events are immutable'); END;

    CREATE TABLE IF NOT EXISTS execution_events (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      position_id TEXT,
      order_id TEXT,
      event_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      execution_ref TEXT,
      symbol TEXT,
      side TEXT,
      lots REAL,
      price REAL,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      metrics_json TEXT,
      dedupe_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_events_dedupe
      ON execution_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_execution_events_account
      ON execution_events(account_id, created_at DESC);
    CREATE TRIGGER IF NOT EXISTS execution_events_no_update
      BEFORE UPDATE ON execution_events
      BEGIN SELECT RAISE(ABORT, 'execution_events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS execution_events_no_delete
      BEFORE DELETE ON execution_events
      BEGIN SELECT RAISE(ABORT, 'execution_events are immutable'); END;

    CREATE TABLE IF NOT EXISTS market_quotes (
      symbol TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      mid REAL NOT NULL,
      spread REAL NOT NULL,
      last_price REAL NOT NULL,
      change_pct REAL NOT NULL DEFAULT 0,
      high_24h REAL NOT NULL,
      low_24h REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      timestamp INTEGER NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instrument_specs (
      symbol TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      trading_status TEXT NOT NULL DEFAULT 'open',
      min_lots REAL NOT NULL,
      max_lots REAL NOT NULL,
      lot_step REAL NOT NULL,
      contract_size REAL NOT NULL,
      tick_size REAL NOT NULL,
      pip_size REAL NOT NULL,
      precision INTEGER NOT NULL,
      max_leverage INTEGER NOT NULL,
      spread_standard REAL NOT NULL,
      spread_raw REAL NOT NULL,
      spread_zero REAL NOT NULL,
      commission_standard REAL NOT NULL,
      commission_raw REAL NOT NULL,
      commission_zero REAL NOT NULL,
      swap_long REAL NOT NULL,
      swap_short REAL NOT NULL,
      session TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_settings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'internal-simulated',
      market_data_provider TEXT NOT NULL DEFAULT 'internal-simulated',
      policy TEXT NOT NULL DEFAULT 'instant',
      slippage_pips REAL NOT NULL DEFAULT 0,
      max_quote_age_ms INTEGER NOT NULL DEFAULT 5000,
      max_gap_pips REAL NOT NULL DEFAULT 50,
      swap_enabled INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_chart_layouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      symbol TEXT,
      timeframe TEXT NOT NULL DEFAULT '1m',
      indicators_json TEXT NOT NULL DEFAULT '[]',
      chart_settings_json TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_layouts_user_name ON user_chart_layouts(user_id, name);
    CREATE INDEX IF NOT EXISTS idx_chart_layouts_user ON user_chart_layouts(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_chart_drawings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      layout_id TEXT NOT NULL REFERENCES user_chart_layouts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      tool TEXT NOT NULL,
      points_json TEXT NOT NULL,
      style_json TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chart_drawings_scope
      ON user_chart_drawings(user_id, layout_id, symbol);

    CREATE TABLE IF NOT EXISTS user_indicator_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      indicators_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_templates_user_name
      ON user_indicator_templates(user_id, name);

    CREATE TABLE IF NOT EXISTS user_watchlists (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      symbols_json TEXT NOT NULL DEFAULT '[]',
      favourites_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trading_strategies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      rules TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strategies_user_name ON trading_strategies(user_id, name);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      position_id TEXT NOT NULL,
      strategy_id TEXT,
      entry_reason TEXT,
      exit_reason TEXT,
      market_conditions TEXT,
      emotions TEXT,
      mistakes TEXT,
      lessons TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_position
      ON journal_entries(user_id, position_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS journal_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#c9f75c',
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_tags_user_name ON journal_tags(user_id, name);

    CREATE TABLE IF NOT EXISTS journal_entry_tags (
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES journal_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS journal_attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_attachments_entry ON journal_attachments(entry_id);

    CREATE TABLE IF NOT EXISTS backtest_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      strategy_id TEXT,
      instrument TEXT,
      timeframe TEXT,
      settings_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_projects_user ON backtest_projects(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC);
  `);
}

export function getDb(): DatabaseSync {
  if (globalRef.__anerithDb) return globalRef.__anerithDb;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "anerith.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  schema(db);
  migrateCompetitionColumns(db);
  migrateRiskColumns(db);
  migrateEngineColumns(db);
  seedRiskConfigs(db);
  seedEngineDefaults(db);
  if (demoSeedsEnabled()) {
    seedBrokers(db);
    seedCompetition(db);
  }
  seedAdmin(db);
  if (demoSeedsEnabled()) seedDemoUser(db);
  globalRef.__anerithDb = db;
  return db;
}

/** Demo traders, accounts, brokers and leaderboard rows are development fixtures. */
function demoSeedsEnabled(): boolean {
  if (process.env.SEED_DEMO_DATA === "false") return false;
  return process.env.NODE_ENV !== "production" || process.env.SEED_DEMO_DATA === "true";
}

function migrateCompetitionColumns(db: DatabaseSync): void {
  const column = (table: string, name: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((item) => item.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  column("competitions", "settled_at", "TEXT");
  column("competition_entries", "account_id", "TEXT");
  column("competition_entries", "baseline_equity_cents", "INTEGER NOT NULL DEFAULT 0");
  column("competition_entries", "peak_return_pct", "REAL NOT NULL DEFAULT 0");
  column("competition_entries", "prize_cents", "INTEGER NOT NULL DEFAULT 0");
  column("competition_entries", "updated_at", "TEXT");
}

function migrateRiskColumns(db: DatabaseSync): void {
  const column = (table: string, name: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((item) => item.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  column("accounts", "risk_config_id", "TEXT");
  column("accounts", "max_trading_days", "INTEGER");
  column("accounts", "day_start_balance_cents", "INTEGER NOT NULL DEFAULT 0");
  column("accounts", "breached_at", "TEXT");
  column("accounts", "breach_rule", "TEXT");
  column("accounts", "breach_detail", "TEXT");
  column("accounts", "suspended_at", "TEXT");
  column("accounts", "suspended_by", "TEXT");
  column("accounts", "suspension_reason", "TEXT");
  column("accounts", "status_before_suspension", "TEXT");
  column("accounts", "last_evaluated_at", "TEXT");
  db.exec(
    "UPDATE accounts SET day_start_balance_cents = balance_cents WHERE day_start_balance_cents = 0",
  );
}

function migrateEngineColumns(db: DatabaseSync): void {
  const column = (table: string, name: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((item) => item.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  column("positions", "client_order_id", "TEXT");  column("positions", "order_id", "TEXT");
  column("positions", "parent_position_id", "TEXT");
  column("positions", "execution_provider", "TEXT NOT NULL DEFAULT 'internal-simulated'");
  column("positions", "execution_ref", "TEXT");
  column("positions", "current_price", "REAL");
  column("positions", "floating_cents", "INTEGER NOT NULL DEFAULT 0");
  column("positions", "margin_cents", "INTEGER NOT NULL DEFAULT 0");
  column("positions", "modified_at", "TEXT");
  column("orders", "client_order_id", "TEXT");
  column("orders", "expires_at", "TEXT");
  column("orders", "execution_provider", "TEXT NOT NULL DEFAULT 'internal-simulated'");
  column("orders", "execution_ref", "TEXT");
  column("orders", "filled_price", "REAL");
  column("orders", "rejection_reason", "TEXT");
  column("orders", "modified_at", "TEXT");
  column("orders", "cancelled_at", "TEXT");
  column("risk_configs", "max_position_lots", "REAL NOT NULL DEFAULT 50");
  column("risk_configs", "max_leverage", "INTEGER NOT NULL DEFAULT 2000");
  column("risk_configs", "restricted_symbols", "TEXT NOT NULL DEFAULT '[]'");
  column("execution_settings", "market_data_provider", "TEXT NOT NULL DEFAULT 'internal-simulated'");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_client_order ON positions(account_id, client_order_id) WHERE client_order_id IS NOT NULL",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_order ON orders(account_id, client_order_id) WHERE client_order_id IS NOT NULL",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_expiry ON orders(status, expires_at)");
}

function seedEngineDefaults(db: DatabaseSync): void {
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO execution_settings (id, provider, market_data_provider, policy, slippage_pips, max_quote_age_ms, max_gap_pips, swap_enabled, updated_by, updated_at)
     VALUES ('default', 'internal-simulated', 'internal-simulated', 'instant', 0, 5000, 50, 0, 'system', ?)`,
  ).run(now);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO instrument_specs (
      symbol, enabled, trading_status, min_lots, max_lots, lot_step, contract_size, tick_size, pip_size,
      precision, max_leverage, spread_standard, spread_raw, spread_zero, commission_standard, commission_raw,
      commission_zero, swap_long, swap_short, session, base_currency, quote_currency, updated_by, updated_at
    ) VALUES (?, 1, 'open', 0.01, 50, 0.01, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?)`,
  );
  for (const inst of INSTRUMENTS) {
    const baseCurrency = inst.symbol.length === 6 ? inst.symbol.slice(0, 3) : "USD";
    const quoteCurrency = inst.symbol.length === 6 ? inst.symbol.slice(3, 6) : "USD";
    insert.run(
      inst.symbol,
      inst.contractSize,
      Number(Math.pow(10, -inst.precision).toFixed(inst.precision)),
      inst.pipSize,
      inst.precision,
      inst.maxLeverage,
      inst.spreads.standard,
      inst.spreads.raw,
      inst.spreads.zero,
      inst.commissions.standard,
      inst.commissions.raw,
      inst.commissions.zero,
      inst.swapLong,
      inst.swapShort,
      inst.session,
      baseCurrency,
      quoteCurrency,
      now,
    );
  }
}

interface SeedRiskProfile {
  profitTargetPct: number | null;
  phase2TargetPct: number | null;
  dailyLossPct: number;
  drawdownPct: number;
  drawdownMode: DrawdownMode;
  trailingLockPct: number | null;
  minTradingDays: number;
}

function seedRiskConfigs(db: DatabaseSync): void {
  const profiles: Record<string, SeedRiskProfile> = {
    trial: {
      profitTargetPct: 6,
      phase2TargetPct: null,
      dailyLossPct: 3,
      drawdownPct: 6,
      drawdownMode: "static",
      trailingLockPct: null,
      minTradingDays: 3,
    },
    "one-step": {
      profitTargetPct: 10,
      phase2TargetPct: null,
      dailyLossPct: 3,
      drawdownPct: 6,
      drawdownMode: "static",
      trailingLockPct: null,
      minTradingDays: 5,
    },
    "two-step": {
      profitTargetPct: 8,
      phase2TargetPct: 5,
      dailyLossPct: 5,
      drawdownPct: 10,
      drawdownMode: "static",
      trailingLockPct: null,
      minTradingDays: 5,
    },
    instant: {
      profitTargetPct: null,
      phase2TargetPct: null,
      dailyLossPct: 3,
      drawdownPct: 6,
      drawdownMode: "trailing",
      trailingLockPct: 0,
      minTradingDays: 0,
    },
  };

  const insert = db.prepare(
    `INSERT INTO risk_configs (
      id, name, scope, plan_key, account_id, enabled, profit_target_pct, phase2_target_pct,
      daily_loss_pct, daily_loss_basis, daily_limit_basis, drawdown_pct, drawdown_mode, drawdown_basis,
      trailing_lock_pct, min_trading_days, max_trading_days, max_risk_per_trade_pct, require_stop_loss,
      max_open_positions, max_total_exposure_pct, max_instrument_exposure_pct, weekend_holding,
      weekend_close_hour_utc, news_trading_allowed, news_blackout_minutes, close_on_breach,
      reset_timezone, reset_hour, reset_minute, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?, ?, 'equity', 'starting_balance', ?, ?, 'equity', ?, ?, NULL, 1, 1, 20, 300, 100, 1, 21, 1, 30, 1, 'UTC', 0, 0, 'system', 'system', ?, ?)`,
  );

  const now = nowIso();
  const defaultExists = db
    .prepare("SELECT id FROM risk_configs WHERE scope = 'default' AND enabled = 1")
    .get();
  if (!defaultExists) {
    insert.run(
      randomUUID(),
      "Institutional default",
      "default",
      null,
      null,
      null,
      5,
      10,
      "static",
      null,
      5,
      now,
      now,
    );
  }

  for (const [planKey, profile] of Object.entries(profiles)) {
    const exists = db
      .prepare("SELECT id FROM risk_configs WHERE scope = 'plan' AND plan_key = ? AND enabled = 1")
      .get(planKey);
    if (exists) continue;
    insert.run(
      randomUUID(),
      `${planKey} risk profile`,
      "plan",
      planKey,
      profile.profitTargetPct,
      profile.phase2TargetPct,
      profile.dailyLossPct,
      profile.drawdownPct,
      profile.drawdownMode,
      profile.trailingLockPct,
      profile.minTradingDays,
      now,
      now,
    );
  }
}

export function all<T>(sql: string, params: SqlParam[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T>(sql: string, params: SqlParam[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: SqlParam[] = []): number {
  const result = getDb().prepare(sql).run(...params);
  return Number(result.changes);
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function nextAccountNumber(): string {
  for (let i = 0; i < 30; i++) {
    const candidate = `AN-${String(100_000 + Math.floor(Math.random() * 899_999))}`;
    if (!one("SELECT id FROM accounts WHERE number = ?", [candidate])) return candidate;
  }
  return `AN-${String(Date.now()).slice(-6)}`;
}

function nextBrokerLogin(): string {
  return String(80_000_000 + Math.floor(Math.random() * 19_999_999));
}

function createSeedBroker(
  db: DatabaseSync,
  name: string,
  provider: string,
  environment: "demo" | "live",
  endpoint: string,
  keyPreview: string,
): string {
  const existing = db.prepare("SELECT id FROM broker_connections WHERE name = ?").get(name) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO broker_connections (id, name, provider, environment, endpoint, api_key_preview, api_key_hash, status, last_sync_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)`,
  ).run(
    id,
    name,
    provider,
    environment,
    endpoint,
    keyPreview,
    createHash("sha256").update(`seed-${name}`).digest("hex"),
    new Date(Date.now() - 12_000).toISOString(),
    now,
  );
  db.prepare(
    `INSERT INTO broker_events (id, connection_id, kind, message, created_at) VALUES (?, ?, 'sync', ?, ?)`,
  ).run(
    randomUUID(),
    id,
    `Bridge heartbeat acknowledged · ${Math.floor(Math.random() * 40 + 8)} accounts routed`,
    now,
  );
  return id;
}

function seedBrokers(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) as c FROM broker_connections").get() as { c: number };
  if (count.c > 0) return;
  createSeedBroker(
    db,
    "Anerith Eval Bridge",
    "match-trader",
    "demo",
    "wss://eval-bridge.anerith.internal",
    "pk_eval_••••7f2a",
  );
  createSeedBroker(
    db,
    "Anerith Live Bridge",
    "mt5",
    "live",
    "mt5://live-bridge.anerith.internal:443",
    "pk_live_••••8f2a",
  );
}

function seedCompetition(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) as c FROM competitions").get() as { c: number };
  if (count.c > 0) return;
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO competitions (id, name, description, prize_pool_cents, start_at, end_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    "Anerith Monthly Sprint",
    "Trade any Anerith account. Highest verified percentage return at month end wins a share of the prize pool.",
    2_500_000,
    new Date(now - 10 * 86400_000).toISOString(),
    new Date(now + 20 * 86400_000).toISOString(),
    nowIso(),
  );
  const insert = db.prepare(
    `INSERT INTO competition_entries (id, competition_id, user_id, display_name, account_size_cents, return_pct, joined_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?)`,
  );
  const players: [string, number, number][] = [
    ["Nathan Cole", 100_000, 31.4],
    ["Mira Voss", 200_000, 26.8],
    ["Theo Ashford", 50_000, 22.1],
    ["Lena Park", 100_000, 19.6],
    ["Idris Kane", 25_000, 17.9],
    ["Sofia Marin", 100_000, 15.3],
    ["Owen Brandt", 50_000, 12.6],
    ["Aria Novak", 25_000, 10.4],
    ["Kai Mercer", 10_000, 8.2],
  ];
  players.forEach(([name, size, ret], index) => {
    insert.run(
      randomUUID(),
      id,
      name,
      size * 100,
      ret,
      new Date(now - (9 - index) * 86400_000).toISOString(),
    );
  });
}

function createUser(
  db: DatabaseSync,
  input: {
    email: string;
    password: string;
    name: string;
    role: "user" | "admin";
    country?: string;
    kycStatus?: "unverified" | "pending" | "verified";
  },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, country, phone, role, kyc_status, kyc_submitted_at, kyc_data, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    input.email.toLowerCase(),
    hashSync(input.password, 10),
    input.name,
    input.country ?? null,
    input.role,
    input.kycStatus ?? (input.role === "admin" ? "verified" : "unverified"),
    input.kycStatus === "verified" ? new Date(Date.now() - 20 * 86400_000).toISOString() : null,
    nowIso(),
  );
  return id;
}

function resolveBroker(db: DatabaseSync, environment: "demo" | "live"): { id: string } | undefined {
  return db
    .prepare("SELECT id FROM broker_connections WHERE environment = ? AND status = 'connected' LIMIT 1")
    .get(environment) as { id: string } | undefined;
}

function createSeedAccount(
  db: DatabaseSync,
  userId: string,
  input: {
    type: AccountType;
    plan: ChallengePlanKey;
    phase: number;
    sizeCents: number;
    balanceCents: number;
    profitTargetPct: number | null;
    dailyLossPct: number;
    maxDrawdownPct: number;
    drawdownMode: DrawdownMode;
    minTradingDays: number;
    profitSplitPct: number;
    totalPayoutsCents?: number;
  },
): string {
  const id = randomUUID();
  let number = `AN-${String(100_000 + Math.floor(Math.random() * 899_999))}`;
  while (db.prepare("SELECT id FROM accounts WHERE number = ?").get(number)) {
    number = `AN-${String(100_000 + Math.floor(Math.random() * 899_999))}`;
  }
  const broker = resolveBroker(db, input.type === "funded" ? "live" : "demo");
  db.prepare(
    `INSERT INTO accounts (
      id, user_id, number, type, plan, phase, account_size_cents, balance_cents, leverage, status,
      profit_target_pct, daily_loss_pct, max_drawdown_pct, drawdown_mode, min_trading_days, profit_split_pct,
      start_balance_cents, high_water_mark_cents, day_start_equity_cents, day_start_balance_cents, day_start_date, total_payouts_cents,
      challenge_id, broker_connection_id, broker_login, created_at, ended_at, fail_reason
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      100, 'active',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL, ?, ?, ?, NULL, NULL
    )`,
  ).run(
    id,
    userId,
    number,
    input.type,
    input.plan,
    input.phase,
    input.sizeCents,
    input.balanceCents,
    input.profitTargetPct,
    input.dailyLossPct,
    input.maxDrawdownPct,
    input.drawdownMode,
    input.minTradingDays,
    input.profitSplitPct,
    input.sizeCents,
    Math.max(input.balanceCents, input.sizeCents),
    input.balanceCents,
    input.balanceCents,
    utcDate(),
    input.totalPayoutsCents ?? 0,
    broker?.id ?? null,
    nextBrokerLogin(),
    nowIso(),
  );
  return id;
}

function seedAdmin(db: DatabaseSync) {
  const email = (process.env.ADMIN_EMAIL ?? "admin@anerith.local").toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return;
  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
    console.warn(
      "[anerith] No admin seeded. Set ADMIN_EMAIL and ADMIN_PASSWORD before the first production boot.",
    );
    return;
  }
  const adminId = createUser(db, {
    email,
    password: process.env.ADMIN_PASSWORD ?? "Admin!2345",
    name: "Anerith Operations",
    role: "admin",
    country: "United Kingdom",
    kycStatus: "verified",
  });
  createSeedAccount(db, adminId, {
    type: "trial",
    plan: "trial",
    phase: 1,
    sizeCents: 1_000_000,
    balanceCents: 1_000_000,
    profitTargetPct: 6,
    dailyLossPct: 3,
    maxDrawdownPct: 6,
    drawdownMode: "static",
    minTradingDays: 3,
    profitSplitPct: 0,
  });
}

function seedDemoUser(db: DatabaseSync) {
  const email = "demo@anerith.local";
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return;
  const userId = createUser(db, {
    email,
    password: "Demo!2345",
    name: "Jordan Ellis",
    role: "user",
    country: "United Kingdom",
    kycStatus: "verified",
  });

  const now = Math.floor(Date.now() / 1000);
  const trialId = createSeedAccount(db, userId, {
    type: "trial",
    plan: "trial",
    phase: 1,
    sizeCents: 1_000_000,
    balanceCents: 1_000_000,
    profitTargetPct: 6,
    dailyLossPct: 3,
    maxDrawdownPct: 6,
    drawdownMode: "static",
    minTradingDays: 3,
    profitSplitPct: 0,
  });

  const evaluationId = createSeedAccount(db, userId, {
    type: "evaluation",
    plan: "two-step",
    phase: 1,
    sizeCents: 5_000_000,
    balanceCents: 5_245_000,
    profitTargetPct: 8,
    dailyLossPct: 5,
    maxDrawdownPct: 10,
    drawdownMode: "static",
    minTradingDays: 5,
    profitSplitPct: 90,
  });

  const fundedId = createSeedAccount(db, userId, {
    type: "funded",
    plan: "two-step",
    phase: 0,
    sizeCents: 10_000_000,
    balanceCents: 11_240_000,
    profitTargetPct: null,
    dailyLossPct: 5,
    maxDrawdownPct: 10,
    drawdownMode: "static",
    minTradingDays: 0,
    profitSplitPct: 90,
    totalPayoutsCents: 450_000,
  });

  const insertChallenge = db.prepare(
    `INSERT INTO challenges (id, user_id, plan, account_size_cents, price_cents, status, method, reference, account_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
  );
  insertChallenge.run(
    randomUUID(),
    userId,
    "two-step",
    5_000_000,
    21_900,
    "Card",
    "AN-CH-6F21C4",
    evaluationId,
    new Date((now - 21 * 86400) * 1000).toISOString(),
  );

  seedTrades(db, fundedId, now, 9);
  seedTrades(db, evaluationId, now, 5);

  const fundedOpenEntry = priceAt("EURUSD", now - 5400) * 0.9992;
  db.prepare(
    `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
      profit_cents, status, opened_at, closed_at, close_price, close_reason)
     VALUES (?, ?, 'EURUSD', 'buy', 0.8, ?, ?, ?, 0, 0, NULL, 'open', ?, NULL, NULL, NULL)`,
  ).run(
    randomUUID(),
    fundedId,
    fundedOpenEntry,
    Number((fundedOpenEntry - 0.012).toFixed(5)),
    Number((fundedOpenEntry + 0.025).toFixed(5)),
    new Date((now - 5400) * 1000).toISOString(),
  );

  const goldEntry = priceAt("XAUUSD", now - 2400) * 1.001;
  db.prepare(
    `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
      profit_cents, status, opened_at, closed_at, close_price, close_reason)
     VALUES (?, ?, 'XAUUSD', 'sell', 0.15, ?, ?, ?, 0, 0, NULL, 'open', ?, NULL, NULL, NULL)`,
  ).run(
    randomUUID(),
    fundedId,
    goldEntry,
    Number((goldEntry + 22).toFixed(2)),
    Number((goldEntry - 38).toFixed(2)),
    new Date((now - 2400) * 1000).toISOString(),
  );

  const pendingPrice = priceAt("US100", now) * 0.997;
  db.prepare(
    `INSERT INTO orders (id, account_id, symbol, side, type, lots, price, sl, tp, status, created_at, triggered_at)
     VALUES (?, ?, 'US100', 'buy', 'limit', 0.2, ?, ?, ?, 'pending', ?, NULL)`,
  ).run(
    randomUUID(),
    evaluationId,
    Number(pendingPrice.toFixed(1)),
    Number((pendingPrice - 120).toFixed(1)),
    Number((pendingPrice + 260).toFixed(1)),
    new Date((now - 1800) * 1000).toISOString(),
  );

  const payoutId = randomUUID();
  db.prepare(
    `INSERT INTO payouts (id, user_id, account_id, amount_cents, fee_cents, net_cents, status, method, destination, reference, requested_at, processed_at, note)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', 'crypto', ?, ?, ?, ?, ?)`,
  ).run(
    payoutId,
    userId,
    fundedId,
    500_000,
    50_000,
    450_000,
    "USDT (TRC20) ···9C2A",
    "AN-PO-7712A9",
    new Date((now - 12 * 86400) * 1000).toISOString(),
    new Date((now - 11 * 86400) * 1000).toISOString(),
    "First payout · 90% split",
  );
  db.prepare(
    `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
     VALUES (?, ?, ?, 'payout', ?, 'completed', 'crypto', ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    fundedId,
    -500_000,
    "AN-PO-7712A9",
    "Payout of $5,000.00 gross · $4,500.00 net",
    new Date((now - 12 * 86400) * 1000).toISOString(),
    new Date((now - 11 * 86400) * 1000).toISOString(),
  );

  db.prepare(
    `INSERT INTO transactions (id, user_id, account_id, type, amount_cents, status, method, reference, note, created_at, completed_at)
     VALUES (?, ?, ?, 'challenge_purchase', ?, 'completed', 'Card', ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    evaluationId,
    -21_900,
    "AN-CH-6F21C4",
    "Horizon · $50,000",
    new Date((now - 21 * 86400) * 1000).toISOString(),
    new Date((now - 21 * 86400) * 1000).toISOString(),
  );

  const competitionRow = db
    .prepare("SELECT id FROM competitions ORDER BY created_at DESC LIMIT 1")
    .get() as { id: string } | undefined;
  if (competitionRow) {
    db.prepare(
      `INSERT INTO competition_entries (id, competition_id, user_id, display_name, account_size_cents, return_pct, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      competitionRow.id,
      userId,
      "Jordan Ellis",
      10_000_000,
      14.2,
      new Date((now - 8 * 86400) * 1000).toISOString(),
    );
  }

  const notify = db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, kind, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  notify.run(
    randomUUID(),
    userId,
    "Welcome to Anerith",
    "Your free trial and evaluation accounts are ready. Open the terminal to begin trading.",
    "info",
    0,
    new Date((now - 21 * 86400) * 1000).toISOString(),
  );
  notify.run(
    randomUUID(),
    userId,
    "Funded account activated",
    "Congratulations — your $100,000 funded account is live. Your profit split is 90%.",
    "success",
    0,
    new Date((now - 13 * 86400) * 1000).toISOString(),
  );
  notify.run(
    randomUUID(),
    userId,
    "Payout processed",
    "Your $4,500.00 payout has been sent. Your certificate is available under Payouts.",
    "success",
    0,
    new Date((now - 11 * 86400) * 1000).toISOString(),
  );

  // Keep the trial account in the user's history without affecting headline stats.
  void trialId;
}

function seedTrades(db: DatabaseSync, accountId: string, now: number, count: number) {
  const presets: { symbol: string; side: Side; lots: number; drift: number; reason: string }[] = [
    { symbol: "EURUSD", side: "buy", lots: 0.8, drift: 0.0019, reason: "tp" },
    { symbol: "XAUUSD", side: "sell", lots: 0.2, drift: -8.4, reason: "tp" },
    { symbol: "US100", side: "buy", lots: 0.4, drift: 64, reason: "manual" },
    { symbol: "GBPUSD", side: "sell", lots: 0.3, drift: -0.0013, reason: "manual" },
    { symbol: "BTCUSD", side: "buy", lots: 0.05, drift: -540, reason: "sl" },
    { symbol: "USDJPY", side: "buy", lots: 0.3, drift: 0.38, reason: "tp" },
    { symbol: "US500", side: "sell", lots: 0.4, drift: -8.2, reason: "sl" },
    { symbol: "ETHUSD", side: "sell", lots: 0.15, drift: -36, reason: "tp" },
    { symbol: "XTIUSD", side: "sell", lots: 0.2, drift: -0.28, reason: "manual" },
    { symbol: "US30", side: "buy", lots: 0.15, drift: 118, reason: "tp" },
  ];
  const insert = db.prepare(
    `INSERT INTO positions (id, account_id, symbol, side, lots, entry_price, sl, tp, commission_cents, swap_cents,
      profit_cents, status, opened_at, closed_at, close_price, close_reason)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?, 'closed', ?, ?, ?, ?)`,
  );
  for (let i = 0; i < count; i++) {
    const preset = presets[i % presets.length];
    const daysAgo = 2 + i * 2;
    const closeUnix = now - daysAgo * 86400;
    const entry = priceAt(preset.symbol, closeUnix - 7200);
    const exit = entry + preset.drift;
    const profitCents = Math.round(calcProfitUsd(preset.symbol, preset.side, preset.lots, entry, exit) * 100);
    insert.run(
      randomUUID(),
      accountId,
      preset.symbol,
      preset.side,
      preset.lots,
      entry,
      profitCents,
      new Date((closeUnix - 7200) * 1000).toISOString(),
      new Date(closeUnix * 1000).toISOString(),
      exit,
      preset.reason,
    );
  }
}
