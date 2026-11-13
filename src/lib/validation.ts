import { z } from "zod";
import { ACCOUNT_SIZES, PLANS } from "./challenges";
import { SYMBOLS } from "./instruments";

const symbol = z.string().refine((value) => SYMBOLS.includes(value), "Unknown trading instrument.");
const side = z.enum(["buy", "sell"]);
const lots = z
  .number()
  .min(0.01, "Minimum volume is 0.01 lots.")
  .max(1000, "Maximum volume is 1000 lots.")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "Volume supports two decimals.");
const optionalPrice = z.number().positive("Price must be positive.").nullable().optional();
const clientOrderId = z.string().trim().min(1).max(100).optional().nullable();
const expiresAt = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid expiry time.")
  .optional()
  .nullable();

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(160),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72)
    .regex(/[A-Za-z]/, "Password must include a letter.")
    .regex(/[0-9]/, "Password must include a number."),
  country: z.string().trim().min(2).max(60).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms." }) }),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72)
    .regex(/[A-Za-z]/, "Password must include a letter.")
    .regex(/[0-9]/, "Password must include a number."),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(80),
  country: z.string().trim().max(60).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const kycSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full legal name.").max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date."),
  country: z.string().trim().min(2, "Select your country.").max(60),
  documentType: z.enum(["passport", "national_id", "drivers_license"]),
  documentNumber: z.string().trim().min(4, "Enter your document number.").max(40),
});

export const activateAccountSchema = z.object({ accountId: z.string().min(1) });

export const purchaseChallengeSchema = z.object({
  plan: z.enum(["one-step", "two-step", "instant"]),
  size: z.number().int().refine((v) => ACCOUNT_SIZES.includes(v), "Unsupported account size."),
  method: z.enum(["card", "crypto", "bank"]),
});

export const paymentInitiateSchema = z.object({
  plan: z.enum(["one-step", "two-step", "instant"]),
  size: z.number().int().refine((v) => ACCOUNT_SIZES.includes(v), "Unsupported account size."),
  method: z.enum(["card", "mobile"]).optional(),
});

export const marketOrderSchema = z.object({
  symbol,
  side,
  lots,
  sl: optionalPrice,
  tp: optionalPrice,
  clientOrderId,
});

export const pendingOrderSchema = z.object({
  symbol,
  side,
  type: z.enum(["limit", "stop"]),
  lots,
  price: z.number().positive("Enter a valid trigger price."),
  sl: optionalPrice,
  tp: optionalPrice,
  expiresAt,
  clientOrderId,
});

export const modifyPendingSchema = z.object({
  price: z.number().positive("Enter a valid trigger price.").optional(),
  lots: lots.optional(),
  sl: optionalPrice,
  tp: optionalPrice,
  expiresAt,
});

export const closePositionSchema = z.object({
  lots: z.number().positive("Close volume must be positive.").max(1000).optional().nullable(),
  clientOrderId,
});

export const modifyPositionSchema = z.object({
  sl: optionalPrice,
  tp: optionalPrice,
});

export const payoutRequestSchema = z.object({
  accountId: z.string().min(1),
  amount: z
    .number()
    .min(100, "Minimum payout is $100.")
    .max(1_000_000, "Amount too large.")
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "Amount supports two decimals."),
  method: z.enum(["card", "bank", "crypto"]),
  destination: z.string().trim().min(4, "Enter a payout destination.").max(200),
});

export const adminPayoutSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(300).optional(),
});

export const adminKycSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(300).optional(),
});

export const brokerConnectionSchema = z.object({
  name: z.string().trim().min(2, "Name the bridge.").max(80),
  provider: z.enum(["mt5", "match-trader", "ctrader"]),
  environment: z.enum(["demo", "live"]),
  endpoint: z.string().trim().min(5, "Enter the bridge endpoint.").max(200),
  apiKey: z.string().trim().min(8, "Enter the API key.").max(300),
});

export const brokerStatusSchema = z.object({
  status: z.enum(["connected", "disconnected"]),
});

export const competitionCreateSchema = z.object({
  name: z.string().trim().min(3, "Name the competition.").max(80),
  description: z.string().trim().min(10, "Describe the competition.").max(400),
  prizePool: z.number().min(100, "Prize pool must be at least $100.").max(5_000_000, "Prize pool is too large."),
  durationDays: z.number().int().min(1).max(365),
  startAt: z.string().trim().optional().nullable(),
});

export const competitionSettleSchema = z.object({
  action: z.literal("settle"),
});

export const notificationsReadSchema = z.object({
  ids: z.array(z.string().min(1)).max(200).optional(),
  all: z.boolean().optional(),
});

const planKeySchema = z.enum(["trial", "one-step", "two-step", "instant"]);

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const riskConfigInputSchema = z
  .object({
    id: z.string().min(1).optional().nullable(),
    name: z.string().trim().min(3, "Name the risk profile.").max(80),
    scope: z.enum(["default", "plan", "account"]),
    planKey: planKeySchema.optional().nullable(),
    accountId: z.string().min(1).optional().nullable(),
    enabled: z.boolean(),
    profitTargetPct: z.number().min(0).max(100).nullable(),
    phase2TargetPct: z.number().min(0).max(100).nullable(),
    dailyLossPct: z.number().min(0, "Daily loss cannot be negative.").max(100),
    dailyLossBasis: z.enum(["equity", "balance"]),
    dailyLimitBasis: z.enum(["starting_balance", "day_start_equity"]),
    drawdownPct: z.number().gt(0, "Drawdown must be greater than zero.").max(100),
    drawdownMode: z.enum(["static", "trailing"]),
    drawdownBasis: z.enum(["equity", "balance"]),
    trailingLockPct: z.number().min(0).max(100).nullable(),
    minTradingDays: z.number().int().min(0).max(365),
    maxTradingDays: z.number().int().min(1).max(3650).nullable(),
    maxRiskPerTradePct: z.number().min(0, "Risk per trade cannot be negative.").max(50),
    requireStopLoss: z.boolean(),
    maxOpenPositions: z.number().int().min(1).max(500),
    maxTotalExposurePct: z.number().min(0).max(10_000),
    maxInstrumentExposurePct: z.number().min(0).max(10_000),
    maxPositionLots: z.number().min(0.01, "Maximum position size must be positive.").max(1000),
    maxLeverage: z.number().int().min(1).max(5000),
    restrictedSymbols: z.array(symbol).max(100),
    weekendHolding: z.boolean(),
    weekendCloseHourUtc: z.number().int().min(0).max(23),
    newsTradingAllowed: z.boolean(),
    newsBlackoutMinutes: z.number().int().min(0).max(1440),
    closeOnBreach: z.boolean(),
    resetTimezone: z
      .string()
      .trim()
      .min(1)
      .refine(validTimezone, "Enter a valid IANA timezone, for example UTC or Africa/Nairobi."),
    resetHour: z.number().int().min(0).max(23),
    resetMinute: z.number().int().min(0).max(59),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "plan" && !value.planKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["planKey"], message: "Choose a plan." });
    }
    if (value.scope === "account" && !value.accountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountId"], message: "Choose an account." });
    }
    if (value.trailingLockPct != null && value.trailingLockPct >= value.drawdownPct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trailingLockPct"],
        message: "The trailing lock must be smaller than the drawdown limit.",
      });
    }
    if (value.maxTradingDays != null && value.maxTradingDays < value.minTradingDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxTradingDays"],
        message: "Maximum trading days cannot be below the minimum.",
      });
    }
  });

export const adminRiskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config.save"), config: riskConfigInputSchema }),
  z.object({
    action: z.literal("config.assign"),
    accountId: z.string().min(1),
    configId: z.string().min(1).nullable(),
    note: z.string().trim().max(400).optional(),
  }),
  z.object({
    action: z.literal("breach.resolve"),
    breachId: z.string().min(1),
    note: z.string().trim().min(5, "Document the resolution.").max(500),
  }),
  z.object({
    action: z.literal("account.suspend"),
    accountId: z.string().min(1),
    reason: z.string().trim().min(5, "Document the suspension.").max(500),
  }),
  z.object({
    action: z.literal("account.reactivate"),
    accountId: z.string().min(1),
    note: z.string().trim().min(5, "Document the authorization.").max(500),
  }),
  z.object({
    action: z.literal("account.close"),
    accountId: z.string().min(1),
    reason: z.string().trim().min(5, "Document the closure.").max(500),
  }),
  z.object({
    action: z.literal("news.create"),
    title: z.string().trim().min(3).max(160),
    symbol: z.string().min(1).nullable().optional(),
    impact: z.enum(["high", "medium", "low"]),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  }),
  z.object({ action: z.literal("news.cancel"), id: z.string().min(1) }),
]);

export const executionSettingsSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  marketDataProvider: z.string().trim().min(1).max(80),
  policy: z.enum(["instant", "reject_on_gap"]),
  slippagePips: z.number().min(0).max(100),
  maxQuoteAgeMs: z.number().int().min(500).max(120_000),
  maxGapPips: z.number().min(0).max(10_000),
  swapEnabled: z.boolean(),
});

const planNumbers = z.object({
  standard: z.number().min(0).max(100_000),
  raw: z.number().min(0).max(100_000),
  zero: z.number().min(0).max(100_000),
});

export const instrumentSpecSchema = z
  .object({
    symbol,
    enabled: z.boolean(),
    tradingStatus: z.enum(["open", "closed", "halted"]),
    minLots: z.number().positive().max(1000),
    maxLots: z.number().positive().max(10_000),
    lotStep: z.number().positive().max(100),
    contractSize: z.number().positive().max(1_000_000_000),
    tickSize: z.number().positive(),
    pipSize: z.number().positive(),
    precision: z.number().int().min(0).max(8),
    maxLeverage: z.number().int().min(1).max(5000),
    spreads: planNumbers,
    commissions: planNumbers,
    swapLong: z.number().min(-1000).max(1000),
    swapShort: z.number().min(-1000).max(1000),
    session: z.string().trim().min(1).max(20),
    baseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
    quoteCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
  })
  .superRefine((value, ctx) => {
    if (value.maxLots < value.minLots) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxLots"], message: "Maximum lots cannot be below minimum lots." });
    }
  });

export const adminEngineActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings.save"), settings: executionSettingsSchema }),
  z.object({ action: z.literal("instrument.save"), instrument: instrumentSpecSchema }),
]);

const timeframe = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Use a valid colour.");
const indicatorParam = z.number().finite().min(0).max(1000).optional();

export const indicatorSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kind: z.enum(["sma", "ema", "bollinger", "rsi", "macd", "atr"]),
  visible: z.boolean(),
  color: hexColor,
  params: z
    .object({
      period: indicatorParam,
      multiplier: indicatorParam,
      fast: indicatorParam,
      slow: indicatorParam,
      signal: indicatorParam,
      overbought: indicatorParam,
      oversold: indicatorParam,
    })
    .default({}),
});

export const chartSettingsSchema = z.object({
  showVolume: z.boolean(),
  showGrid: z.boolean(),
  upColor: hexColor.nullable(),
  downColor: hexColor.nullable(),
});

export const chartPointSchema = z.object({
  time: z.number().int().finite(),
  price: z.number().finite(),
});

export const chartDrawingSchema = z.object({
  id: z.string().trim().min(1).max(80),
  tool: z.enum([
    "trendline",
    "horizontal",
    "vertical",
    "ray",
    "extended",
    "channel",
    "rectangle",
    "fib",
    "fibextension",
    "text",
    "brush",
    "measure",
    "timemeasure",
  ]),
  points: z.array(chartPointSchema).min(1).max(500),
  style: z.object({
    color: hexColor,
    lineWidth: z.number().min(1).max(6),
    lineStyle: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    fillOpacity: z.number().min(0).max(0.5),
    text: z.string().max(240).optional(),
    levels: z.record(z.string(), z.boolean()).optional(),
    showLabels: z.boolean().optional(),
  }),
  visible: z.boolean().default(true),
});

export const chartActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    layoutId: z.string().min(1),
    symbol,
    timeframe,
    indicators: z.array(indicatorSchema).max(20),
    chartSettings: chartSettingsSchema,
    drawings: z.array(chartDrawingSchema).max(500),
  }),
  z.object({
    action: z.literal("layout.create"),
    name: z.string().trim().min(2).max(60),
    symbol: symbol.nullable().optional(),
    timeframe,
    indicators: z.array(indicatorSchema).max(20),
    chartSettings: chartSettingsSchema,
    drawings: z.array(chartDrawingSchema).max(500),
  }),
  z.object({ action: z.literal("layout.delete"), layoutId: z.string().min(1) }),
  z.object({
    action: z.literal("template.save"),
    name: z.string().trim().min(2).max(60),
    indicators: z.array(indicatorSchema).min(1).max(20),
  }),
  z.object({ action: z.literal("template.delete"), templateId: z.string().min(1) }),
]);

export const watchlistSchema = z.object({
  symbols: z.array(symbol).max(100),
  favourites: z.array(symbol).max(100),
});

export const journalUpdateSchema = z.object({
  entryId: z.string().min(1),
  strategyId: z.string().min(1).nullable().optional(),
  entryReason: z.string().max(4000).optional().nullable(),
  exitReason: z.string().max(4000).optional().nullable(),
  marketConditions: z.string().max(4000).optional().nullable(),
  emotions: z.string().max(4000).optional().nullable(),
  mistakes: z.string().max(4000).optional().nullable(),
  lessons: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  tagIds: z.array(z.string().min(1)).max(20).optional(),
});

export const journalStrategySchema = z.object({
  name: z.string().trim().min(2, "Name your strategy.").max(60),
  description: z.string().trim().max(1000).optional().nullable(),
  rules: z.string().trim().max(4000).optional().nullable(),
});

export const journalTagSchema = z.object({
  name: z.string().trim().min(1, "Name the tag.").max(30),
  color: hexColor.optional(),
});

export const journalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("entry.update") }).merge(journalUpdateSchema),
  z.object({ action: z.literal("strategy.save"), id: z.string().min(1).optional() }).merge(journalStrategySchema),
  z.object({ action: z.literal("strategy.delete"), strategyId: z.string().min(1) }),
  z.object({ action: z.literal("tag.save"), id: z.string().min(1).optional() }).merge(journalTagSchema),
  z.object({ action: z.literal("tag.delete"), tagId: z.string().min(1) }),
]);

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(4, "Add a short subject.").max(140),
  body: z.string().trim().min(10, "Describe your issue.").max(4000),
  category: z.enum(["general", "account", "payout", "technical", "verification"]),
});

export const planMeta = PLANS;
