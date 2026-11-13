import type { Side } from "./instruments";
import type { AccountStatus, AccountType, ChallengePlanKey, DrawdownMode } from "./challenges";

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  country: string | null;
  phone: string | null;
  role: "user" | "admin";
  kycStatus: "unverified" | "pending" | "verified" | "rejected";
  kycSubmittedAt: string | null;
  createdAt: string;
}

export interface AccountObjectivesDTO {
  profitTargetPct: number | null;
  profitTargetUsd: number | null;
  profitCurrentUsd: number;
  profitProgressPct: number;
  tradingDays: number;
  minTradingDays: number;
  minDaysMet: boolean;
  maxTradingDays: number | null;
  dailyResetTimezone: string;
  dailyResetHour: number;
  dailyResetMinute: number;
  dailyLossPct: number;
  dailyLossLimitUsd: number;
  dailyLossUsedUsd: number;
  dailyLossProgressPct: number;
  maxDrawdownPct: number;
  maxDrawdownLimitUsd: number;
  drawdownUsedUsd: number;
  drawdownProgressPct: number;
  drawdownMode: DrawdownMode;
}

export interface AccountBrokerDTO {
  id: string;
  name: string;
  environment: "demo" | "live";
  login: string | null;
}

export interface AccountDTO {
  id: string;
  number: string;
  type: AccountType;
  plan: ChallengePlanKey;
  phase: number;
  status: AccountStatus;
  size: number;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number | null;
  floating: number;
  openPositions: number;
  startBalance: number;
  profitSplitPct: number;
  payoutAvailable: number;
  totalPayouts: number;
  objectives: AccountObjectivesDTO;
  broker: AccountBrokerDTO | null;
  createdAt: string;
  endedAt: string | null;
  failReason: string | null;
  breachedAt: string | null;
  breachRule: string | null;
  breachDetail: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  maxTradingDays: number | null;
  executionProvider: string;
  simulatedExecution: boolean;
}

export interface PositionDTO {
  id: string;
  accountId: string;
  symbol: string;
  side: Side;
  lots: number;
  entryPrice: number;
  currentPrice: number | null;
  sl: number | null;
  tp: number | null;
  floating: number;
  margin: number;
  commission: number;
  swap: number;
  openedAt: string;
  modifiedAt: string | null;
  clientOrderId: string | null;
  orderId: string | null;
  executionProvider: string;
  executionRef: string | null;
  simulatedExecution: boolean;
}

export interface OrderDTO {
  id: string;
  accountId: string;
  symbol: string;
  side: Side;
  type: "limit" | "stop";
  lots: number;
  price: number;
  sl: number | null;
  tp: number | null;
  status: "pending" | "filled" | "cancelled" | "rejected" | "expired";
  createdAt: string;
  triggeredAt: string | null;
  expiresAt: string | null;
  filledPrice: number | null;
  rejectionReason: string | null;
  modifiedAt: string | null;
  cancelledAt: string | null;
  clientOrderId: string | null;
  executionProvider: string;
  executionRef: string | null;
}

export interface ExecutionEventDTO {
  id: string;
  accountId: string;
  positionId: string | null;
  orderId: string | null;
  eventType: string;
  provider: string;
  executionRef: string | null;
  symbol: string | null;
  side: Side | null;
  lots: number | null;
  price: number | null;
  commission: number;
  reason: string | null;
  createdAt: string;
}

export interface ClosedTradeDTO {
  id: string;
  symbol: string;
  side: Side;
  lots: number;
  entryPrice: number;
  closePrice: number;
  profit: number;
  commission: number;
  swap: number;
  net: number;
  openedAt: string;
  closedAt: string;
  closeReason: string;
}

export interface TransactionDTO {
  id: string;
  type:
    | "challenge_purchase"
    | "payout"
    | "payout_reversal"
    | "competition_prize"
    | "commission"
    | "trade"
    | "adjustment";
  amount: number;
  status: "completed" | "processing" | "rejected";
  method: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  kind: "info" | "success" | "warning" | "danger";
  read: boolean;
  createdAt: string;
}

export interface PayoutDTO {
  id: string;
  accountId: string;
  accountNumber: string;
  accountSize: number;
  amount: number;
  fee: number;
  net: number;
  status: "processing" | "completed" | "rejected";
  method: string;
  destination: string;
  reference: string;
  requestedAt: string;
  processedAt: string | null;
}

export interface ChallengePurchaseDTO {
  id: string;
  plan: ChallengePlanKey;
  accountSize: number;
  price: number;
  method: string;
  reference: string;
  status: "completed" | "processing" | "rejected";
  accountId: string;
  createdAt: string;
}

export type PaymentIntentStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface PaymentIntentDTO {
  id: string;
  plan: ChallengePlanKey;
  accountSize: number;
  amount: number;
  currency: string;
  provider: "pesapal";
  method: string;
  status: PaymentIntentStatus;
  reference: string;
  redirectUrl: string | null;
  accountId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PaymentGatewayInfo {
  provider: "pesapal";
  name: string;
  enabled: boolean;
  environment: "sandbox" | "production";
  currency: string;
  methods: { key: "card" | "mobile"; label: string }[];
}

export interface CompetitionEntryDTO {
  id: string;
  displayName: string;
  accountSize: number;
  returnPct: number;
  peakReturnPct: number;
  prize: number;
  isYou: boolean;
  rank: number;
}

export interface CompetitionPrizeDTO {
  place: number;
  label: string;
  sharePct: number;
  amount: number;
}

export interface CompetitionDTO {
  id: string;
  name: string;
  description: string;
  prizePool: number;
  startAt: string;
  endAt: string;
  status: "upcoming" | "active" | "ended";
  settledAt: string | null;
  joined: boolean;
  canJoin: boolean;
  prizeSplit: CompetitionPrizeDTO[];
  entries: CompetitionEntryDTO[];
}

export interface BrokerConnectionDTO {
  id: string;
  name: string;
  provider: string;
  environment: "demo" | "live";
  endpoint: string;
  apiKeyPreview: string;
  status: "connected" | "disconnected" | "error";
  lastSyncAt: string | null;
  accountCount: number;
  createdAt: string;
}

export interface BrokerEventDTO {
  id: string;
  connectionName: string;
  kind: string;
  message: string;
  createdAt: string;
}

export interface AnalyticsDTO {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgTrade: number;
  avgHoldHours: number;
  bestTrade: number;
  worstTrade: number;
  longTrades: number;
  shortTrades: number;
  equityCurve: { time: number; value: number }[];
  bySymbol: { symbol: string; trades: number; pnl: number }[];
}

export interface TradeStateDTO {
  account: AccountDTO;
  positions: PositionDTO[];
  orders: OrderDTO[];
  recentClosed: ClosedTradeDTO[];
  recentEvents: ExecutionEventDTO[];
}

export type RiskCompliance = "safe" | "warning" | "breached";
export type RiskScope = "default" | "plan" | "account";

export interface RiskConfigDTO {
  id: string;
  name: string;
  scope: RiskScope;
  planKey: string | null;
  accountId: string | null;
  enabled: boolean;
  profitTargetPct: number | null;
  phase2TargetPct: number | null;
  dailyLossPct: number;
  dailyLossBasis: "equity" | "balance";
  dailyLimitBasis: "starting_balance" | "day_start_equity";
  drawdownPct: number;
  drawdownMode: DrawdownMode;
  drawdownBasis: "equity" | "balance";
  trailingLockPct: number | null;
  minTradingDays: number;
  maxTradingDays: number | null;
  maxRiskPerTradePct: number;
  requireStopLoss: boolean;
  maxOpenPositions: number;
  maxTotalExposurePct: number;
  maxInstrumentExposurePct: number;
  maxPositionLots: number;
  maxLeverage: number;
  restrictedSymbols: string[];
  weekendHolding: boolean;
  weekendCloseHourUtc: number;
  newsTradingAllowed: boolean;
  newsBlackoutMinutes: number;
  closeOnBreach: boolean;
  resetTimezone: string;
  resetHour: number;
  resetMinute: number;
  updatedAt: string;
}

export interface RiskMetricsDTO {
  accountId: string;
  status: AccountStatus;
  dayKey: string;
  timezone: string;
  resetHour: number;
  resetMinute: number;
  nextResetAt: string;
  balance: number;
  equity: number;
  floating: number;
  margin: number;
  freeMargin: number;
  marginLevelPct: number | null;
  startBalance: number;
  highWaterMark: number;
  realizedPnl: number;
  profitTarget: number | null;
  profitProgressPct: number;
  dailyLossUsed: number;
  dailyLossLimit: number;
  dailyLossRemaining: number;
  dailyLossProgressPct: number;
  dailyLossBasis: "equity" | "balance";
  dailyLimitBasis: "starting_balance" | "day_start_equity";
  drawdownUsed: number;
  drawdownLimit: number;
  drawdownRemaining: number;
  drawdownProgressPct: number;
  drawdownFloor: number;
  drawdownBaseline: number;
  drawdownMode: DrawdownMode;
  drawdownBasis: "equity" | "balance";
  tradingDays: number;
  minTradingDays: number;
  maxTradingDays: number | null;
  tradingDaysRemaining: number | null;
  openPositions: number;
  pendingOrders: number;
  exposure: number;
  exposurePct: number;
  exposureBySymbol: { symbol: string; notional: number; pct: number }[];
  riskPerTradeLimit: number;
  maxOpenPositions: number;
  maxTotalExposurePct: number;
  maxInstrumentExposurePct: number;
  maxPositionLots: number;
  maxLeverage: number;
  restrictedSymbols: string[];
  weekendHolding: boolean;
  newsTradingAllowed: boolean;
  weekendWindow: boolean;
  newsBlackout: boolean;
  compliance: RiskCompliance;
  violations: string[];
  dailyCommission: number;
  dailySwap: number;
}

export interface RiskEventDTO {
  id: string;
  accountId: string | null;
  accountNumber?: string | null;
  type: string;
  severity: string;
  rule: string;
  message: string;
  actorRole: string | null;
  createdAt: string;
}

export interface BreachDTO {
  id: string;
  accountId: string;
  accountNumber: string;
  owner: string;
  email: string;
  rule: string;
  detail: string;
  actionTaken: string;
  status: "open" | "resolved";
  occurredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface DailySnapshotDTO {
  dayKey: string;
  timezone: string;
  startBalance: number;
  startEquity: number;
  endBalance: number;
  endEquity: number;
  peakEquity: number;
  troughEquity: number;
  realizedPnl: number;
  commission: number;
  swap: number;
  openPositions: number;
  traded: boolean;
  finalizedAt: string | null;
}

export interface EquityPointDTO {
  time: string;
  balance: number;
  equity: number;
  drawdown: number;
  dailyLoss: number;
}

export interface StatusHistoryDTO {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  actorRole: string | null;
  createdAt: string;
  accountNumber?: string | null;
  accountOwner?: string | null;
}

export interface RiskDashboardDTO {
  account: {
    id: string;
    number: string;
    type: AccountType;
    plan: ChallengePlanKey;
    phase: number;
    status: AccountStatus;
    size: number;
    leverage: number;
    profitSplitPct: number;
    breachedAt: string | null;
    breachRule: string | null;
    breachDetail: string | null;
    suspendedAt: string | null;
    suspensionReason: string | null;
  };
  config: RiskConfigDTO;
  metrics: RiskMetricsDTO;
  events: RiskEventDTO[];
  breaches: BreachDTO[];
  dailySnapshots: DailySnapshotDTO[];
  equityCurve: EquityPointDTO[];
  statusHistory: StatusHistoryDTO[];
  generatedAt: string;
}

export interface AdminRiskAccountDTO {
  id: string;
  number: string;
  owner: string;
  email: string;
  status: AccountStatus;
  type: AccountType;
  plan: string;
  phase: number;
  riskConfigId: string | null;
  size: number;
  balance: number;
  equity: number;
  dailyLossUsed: number;
  dailyLossLimit: number;
  dailyLossProgressPct: number;
  drawdownUsed: number;
  drawdownLimit: number;
  drawdownProgressPct: number;
  tradingDays: number;
  minTradingDays: number;
  maxTradingDays: number | null;
  openPositions: number;
  exposure: number;
  compliance: RiskCompliance;
  breachedAt: string | null;
  breachRule: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
}

export interface AdminAuditDTO {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  note: string | null;
  createdAt: string;
}

export interface NewsEventDTO {
  id: string;
  title: string;
  symbol: string | null;
  impact: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelledAt: string | null;
}

export interface ConfigHistoryDTO {
  id: string;
  configId: string;
  adminEmail: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  createdAt: string;
}

export interface AdminRiskViewDTO {
  configs: RiskConfigDTO[];
  accounts: AdminRiskAccountDTO[];
  breaches: BreachDTO[];
  events: RiskEventDTO[];
  audit: AdminAuditDTO[];
  news: NewsEventDTO[];
  statusHistory: StatusHistoryDTO[];
  configHistory: ConfigHistoryDTO[];
  generatedAt: string;
}
