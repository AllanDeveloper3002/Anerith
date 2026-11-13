import { getBrokerConnections, getBrokerEvents } from "./broker";
import { getCompetitionView } from "./competitions";
import { all, one } from "./db";
import { centsToUsd } from "./format";
import { planName } from "./challenges";
import type { BrokerConnectionDTO, BrokerEventDTO, CompetitionDTO } from "./types";

interface AdminPayoutRow {
  id: string;
  user_id: string;
  account_id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  method: string;
  destination: string;
  reference: string;
  requested_at: string;
  processed_at: string | null;
  full_name: string;
  email: string;
  account_number: string | null;
}

interface AdminUserRow {
  id: string;
  email: string;
  full_name: string;
  country: string | null;
  role: string;
  kyc_status: string;
  created_at: string;
  account_count: number;
  active_count: number;
}

interface AdminAccountRow {
  id: string;
  number: string;
  user_id: string;
  full_name: string;
  email: string;
  type: string;
  plan: string;
  phase: number;
  status: string;
  account_size_cents: number;
  balance_cents: number;
  start_balance_cents: number;
  broker_login: string | null;
  created_at: string;
}

export interface AdminSummary {
  metrics: {
    users: number;
    accounts: number;
    activeAccounts: number;
    fundedAccounts: number;
    passedAccounts: number;
    failedAccounts: number;
    breachedAccounts: number;
    suspendedAccounts: number;
    openBreaches: number;
    riskConfigs: number;
    pendingKyc: number;
    processingPayouts: number;
    completedPayouts: number;
    payoutVolume: number;
    challengeRevenue: number;
    fundedCapital: number;
  };
  payouts: {
    id: string;
    userId: string;
    user: string;
    email: string;
    accountNumber: string;
    amount: number;
    fee: number;
    net: number;
    status: string;
    method: string;
    destination: string;
    reference: string;
    requestedAt: string;
    processedAt: string | null;
  }[];
  kycQueue: {
    id: string;
    full_name: string;
    email: string;
    country: string | null;
    kyc_status: string;
    kyc_submitted_at: string | null;
  }[];
  users: AdminUserRow[];
  accounts: {
    id: string;
    number: string;
    owner: string;
    email: string;
    type: string;
    plan: string;
    planKey: string;
    phase: number;
    status: string;
    size: number;
    balance: number;
    profit: number;
    brokerLogin: string | null;
    createdAt: string;
  }[];
  brokers: BrokerConnectionDTO[];
  brokerEvents: BrokerEventDTO[];
  competition: CompetitionDTO | null;
}

function count(sql: string): number {
  return one<{ c: number }>(sql)?.c ?? 0;
}

export function getAdminSummary(adminId: string): AdminSummary {
  const payoutVolumeCents =
    one<{ v: number }>("SELECT COALESCE(SUM(net_cents), 0) as v FROM payouts WHERE status = 'completed'")?.v ?? 0;
  const challengeRevenueCents =
    one<{ v: number }>("SELECT COALESCE(SUM(price_cents), 0) as v FROM challenges WHERE status = 'completed'")?.v ??
    0;
  const fundedCapitalCents =
    one<{ v: number }>(
      "SELECT COALESCE(SUM(account_size_cents), 0) as v FROM accounts WHERE type = 'funded' AND status = 'active'",
    )?.v ?? 0;

  const metrics = {
    users: count("SELECT COUNT(*) as c FROM users"),
    accounts: count("SELECT COUNT(*) as c FROM accounts"),
    activeAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE status = 'active'"),
    fundedAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE type = 'funded' AND status = 'active'"),
    passedAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE status = 'passed'"),
    failedAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE status = 'failed'"),
    breachedAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE status = 'breached'"),
    suspendedAccounts: count("SELECT COUNT(*) as c FROM accounts WHERE status = 'suspended'"),
    openBreaches: count("SELECT COUNT(*) as c FROM breaches WHERE status = 'open'"),
    riskConfigs: count("SELECT COUNT(*) as c FROM risk_configs WHERE enabled = 1"),
    pendingKyc: count("SELECT COUNT(*) as c FROM users WHERE kyc_status = 'pending'"),
    processingPayouts: count("SELECT COUNT(*) as c FROM payouts WHERE status = 'processing'"),
    completedPayouts: count("SELECT COUNT(*) as c FROM payouts WHERE status = 'completed'"),
    payoutVolume: centsToUsd(payoutVolumeCents),
    challengeRevenue: centsToUsd(challengeRevenueCents),
    fundedCapital: centsToUsd(fundedCapitalCents),
  };

  const payoutRows = all<AdminPayoutRow>(
    `SELECT p.*, u.full_name, u.email, a.number as account_number
     FROM payouts p JOIN users u ON u.id = p.user_id LEFT JOIN accounts a ON a.id = p.account_id
     ORDER BY p.requested_at DESC LIMIT 60`,
  );

  const kycQueue = all<AdminSummary["kycQueue"][number]>(
    `SELECT id, full_name, email, country, kyc_status, kyc_submitted_at FROM users
     WHERE kyc_status IN ('pending','unverified') ORDER BY kyc_submitted_at IS NULL, kyc_submitted_at ASC LIMIT 40`,
  ).map((row) => ({ ...row }));

  const users = all<AdminUserRow>(
    `SELECT u.id, u.email, u.full_name, u.country, u.role, u.kyc_status, u.created_at,
      (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) as account_count,
      (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id AND a.status = 'active') as active_count
     FROM users u ORDER BY u.created_at DESC LIMIT 80`,
  ).map((row) => ({ ...row }));

  const accounts = all<AdminAccountRow>(
    `SELECT a.id, a.number, a.user_id, u.full_name, u.email, a.type, a.plan, a.phase, a.status,
      a.account_size_cents, a.balance_cents, a.start_balance_cents, a.broker_login, a.created_at
     FROM accounts a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 80`,
  );

  return {
    metrics,
    payouts: payoutRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      user: row.full_name,
      email: row.email,
      accountNumber: row.account_number ?? "—",
      amount: centsToUsd(row.amount_cents),
      fee: centsToUsd(row.fee_cents),
      net: centsToUsd(row.net_cents),
      status: row.status,
      method: row.method,
      destination: row.destination,
      reference: row.reference,
      requestedAt: row.requested_at,
      processedAt: row.processed_at,
    })),
    kycQueue,
    users,
    accounts: accounts.map((row) => ({
      id: row.id,
      number: row.number,
      owner: row.full_name,
      email: row.email,
      type: row.type,
      plan: planName(row.plan as never),
      planKey: row.plan,
      phase: row.phase,
      status: row.status,
      size: centsToUsd(row.account_size_cents),
      balance: centsToUsd(row.balance_cents),
      profit: centsToUsd(row.balance_cents - row.start_balance_cents),
      brokerLogin: row.broker_login,
      createdAt: row.created_at,
    })),
    brokers: getBrokerConnections(),
    brokerEvents: getBrokerEvents(),
    competition: getCompetitionView(adminId),
  };
}
