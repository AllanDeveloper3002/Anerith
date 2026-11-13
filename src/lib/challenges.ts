export type ChallengePlanKey = "trial" | "one-step" | "two-step" | "instant";
export type DrawdownMode = "static" | "trailing";
export type AccountStatus =
  | "active"
  | "passed"
  | "failed"
  | "breached"
  | "suspended"
  | "closed";
export type AccountType = "trial" | "evaluation" | "funded";

export interface ChallengeSize {
  size: number;
  price: number;
}

export interface PlanRule {
  title: string;
  body: string;
}

export interface ChallengePlan {
  key: ChallengePlanKey;
  name: string;
  eyebrow: string;
  tagline: string;
  description: string;
  phaseTargets: number[];
  dailyLossPct: number;
  maxDrawdownPct: number;
  drawdownMode: DrawdownMode;
  minTradingDays: number;
  profitSplitPct: number;
  payoutCycleDays: number;
  consistencyPct: number | null;
  sizes: ChallengeSize[];
  features: string[];
  rules: PlanRule[];
  accent: "lime" | "gold" | "blue";
  free?: boolean;
}

export const ACCOUNT_SIZES = [10_000, 25_000, 50_000, 100_000, 200_000];

export const PLANS: ChallengePlan[] = [
  {
    key: "one-step",
    name: "Momentum",
    eyebrow: "Most popular",
    tagline: "One target. One phase. Funded.",
    description:
      "A single disciplined evaluation with a 10% profit target, static drawdown and an 80% starting profit split.",
    phaseTargets: [10],
    dailyLossPct: 3,
    maxDrawdownPct: 6,
    drawdownMode: "static",
    minTradingDays: 5,
    profitSplitPct: 80,
    payoutCycleDays: 10,
    consistencyPct: 45,
    sizes: [
      { size: 10_000, price: 59 },
      { size: 25_000, price: 139 },
      { size: 50_000, price: 259 },
      { size: 100_000, price: 479 },
      { size: 200_000, price: 849 },
    ],
    features: [
      "10% profit target",
      "3% daily loss limit",
      "6% max drawdown (static)",
      "5 minimum trading days",
      "80% profit split",
    ],
    rules: [
      {
        title: "Profit objective",
        body: "Close trades for a net profit of 10% of your starting balance. Floating profit does not count toward the objective until it is realized.",
      },
      {
        title: "Daily loss limit",
        body: "Equity may not fall more than 3% below the day's starting equity. The risk engine closes open positions and pending orders when the limit is reached.",
      },
      {
        title: "Maximum drawdown",
        body: "A static 6% drawdown is measured from your initial balance and never trails your high-water mark. Breaching it ends the evaluation.",
      },
      {
        title: "Minimum trading days",
        body: "At least 5 distinct UTC trading days with a closed position are required before your result is reviewed.",
      },
      {
        title: "Payout cycle",
        body: "Funded desks are eligible for their first payout after 10 trading days, then every 10 trading days. Your split starts at 80%.",
      },
      {
        title: "Consistency rule",
        body: "No single trading day may account for more than 45% of total profit at the time of a payout request. This rewards repeatable process over one outsized session.",
      },
    ],
    accent: "lime",
  },
  {
    key: "two-step",
    name: "Horizon",
    eyebrow: "Best value",
    tagline: "Two phases engineered for consistency.",
    description:
      "Two disciplined phases with an 8% and 5% target, 10% max drawdown and a 90% profit split when funded.",
    phaseTargets: [8, 5],
    dailyLossPct: 5,
    maxDrawdownPct: 10,
    drawdownMode: "static",
    minTradingDays: 5,
    profitSplitPct: 90,
    payoutCycleDays: 14,
    consistencyPct: 40,
    sizes: [
      { size: 10_000, price: 49 },
      { size: 25_000, price: 119 },
      { size: 50_000, price: 219 },
      { size: 100_000, price: 399 },
      { size: 200_000, price: 699 },
    ],
    features: [
      "8% / 5% phase targets",
      "5% daily loss limit",
      "10% max drawdown (static)",
      "5 minimum trading days per phase",
      "90% profit split",
    ],
    rules: [
      {
        title: "Two-phase structure",
        body: "Phase 1 requires an 8% realized profit target. Passing opens Phase 2 with a 5% target, then the desk converts to a funded account at the same size.",
      },
      {
        title: "Daily loss limit",
        body: "A 5% daily loss limit is measured from the higher of your day-start equity or the start of the current phase. Breach closes the account.",
      },
      {
        title: "Maximum drawdown",
        body: "10% static drawdown from the initial phase balance. Your balance resets at the start of each new phase.",
      },
      {
        title: "Minimum trading days",
        body: "5 distinct UTC trading days with closed positions per phase. Days without a close do not count.",
      },
      {
        title: "Payout cycle",
        body: "Funded desks become payout-eligible after 14 trading days, then every 14 trading days. Profit split is 90%.",
      },
      {
        title: "Consistency rule",
        body: "Your best day must stay below 40% of total profit at payout review, encouraging steady risk-adjusted returns.",
      },
    ],
    accent: "gold",
  },
  {
    key: "instant",
    name: "Velocity",
    eyebrow: "Funded now",
    tagline: "Skip the evaluation.",
    description:
      "Start trading funded capital immediately with a trailing drawdown and an 80% profit split.",
    phaseTargets: [],
    dailyLossPct: 3,
    maxDrawdownPct: 6,
    drawdownMode: "trailing",
    minTradingDays: 0,
    profitSplitPct: 80,
    payoutCycleDays: 7,
    consistencyPct: null,
    sizes: [
      { size: 10_000, price: 89 },
      { size: 25_000, price: 199 },
      { size: 50_000, price: 369 },
      { size: 100_000, price: 649 },
      { size: 200_000, price: 1_099 },
    ],
    features: [
      "Funded from day one",
      "3% daily loss limit",
      "6% trailing drawdown",
      "No minimum trading days",
      "80% profit split",
    ],
    rules: [
      {
        title: "Immediate funding",
        body: "Your desk is funded as soon as checkout completes. There is no evaluation phase and no profit target to pass.",
      },
      {
        title: "Daily loss limit",
        body: "Equity may not fall more than 3% below the day's starting equity. The risk engine liquidates positions automatically if the limit is reached.",
      },
      {
        title: "Trailing drawdown",
        body: "A 6% drawdown trails your peak equity, including unrealized profit. It locks once your high-water mark reaches your initial balance plus 6%.",
      },
      {
        title: "No minimum days",
        body: "There is no minimum trading period. Payout eligibility is based on realized profit and the payout cycle only.",
      },
      {
        title: "Payout cycle",
        body: "Request your first payout after 7 trading days, then every 7 trading days. Your profit split is 80%.",
      },
      {
        title: "Risk controls",
        body: "1:100 leverage, 1s risk checks and swap-free standard spreads. All positions are marked against live bid/ask.",
      },
    ],
    accent: "blue",
  },
];

export const TRIAL_PLAN: ChallengePlan = {
  key: "trial",
  name: "Discovery",
  eyebrow: "No cost",
  tagline: "Test the desk and the rules.",
  description:
    "A free $10,000 practice evaluation. Complete the objectives to see how the Anerith desk works — trials do not convert to a funded account.",
  phaseTargets: [6],
  dailyLossPct: 3,
  maxDrawdownPct: 6,
  drawdownMode: "static",
  minTradingDays: 3,
  profitSplitPct: 0,
  payoutCycleDays: 0,
  consistencyPct: null,
  sizes: [{ size: 10_000, price: 0 }],
  features: [
    "6% profit target",
    "3% daily loss limit",
    "6% max drawdown",
    "3 minimum trading days",
    "No payout eligibility",
  ],
  rules: [
    {
      title: "Practice objectives",
      body: "Reach a 6% realized profit target on a $10,000 practice desk with no cost and no card required.",
    },
    {
      title: "Risk limits",
      body: "A 3% daily loss limit and 6% static drawdown apply. Breaking either closes the trial desk.",
    },
    {
      title: "Trading days",
      body: "At least 3 distinct UTC trading days with a closed position are required to complete the objectives.",
    },
    {
      title: "No funding conversion",
      body: "Discovery is a practice environment. Completing it does not create a funded account; choose Momentum, Horizon or Velocity when you are ready.",
    },
  ],
  accent: "lime",
  free: true,
};

export const ALL_PLANS = [...PLANS, TRIAL_PLAN];

export const PLAN_MAP: Record<ChallengePlanKey, ChallengePlan> = Object.fromEntries(
  ALL_PLANS.map((p) => [p.key, p]),
) as Record<ChallengePlanKey, ChallengePlan>;

export function getPlan(key: string): ChallengePlan {
  const plan = PLAN_MAP[key as ChallengePlanKey];
  if (!plan) throw new Error(`Unknown challenge plan: ${key}`);
  return plan;
}

export function getSizeOption(key: ChallengePlanKey, size: number): ChallengeSize | undefined {
  return getPlan(key).sizes.find((s) => s.size === size);
}

export function phaseTarget(planKey: ChallengePlanKey, phase: number): number | null {
  const plan = getPlan(planKey);
  return plan.phaseTargets[phase - 1] ?? null;
}

export function maxPhases(planKey: ChallengePlanKey): number {
  return getPlan(planKey).phaseTargets.length;
}

export function accountTypeForPlan(planKey: ChallengePlanKey): AccountType {
  if (planKey === "trial") return "trial";
  if (planKey === "instant") return "funded";
  return "evaluation";
}

export function phaseLabel(account: {
  type: AccountType;
  plan: ChallengePlanKey;
  phase: number;
  status: AccountStatus;
}): string {
  if (account.status === "breached") return "Breached";
  if (account.status === "suspended") return "Suspended";
  if (account.status === "closed") return "Closed";
  if (account.type === "funded") return "Funded";
  if (account.type === "trial") return "Trial";
  if (account.status === "passed") return account.phase === 1 && maxPhases(account.plan) === 2 ? "Phase 1 passed" : "Evaluation passed";
  if (account.status === "failed") return "Failed";
  return `Phase ${account.phase}`;
}

export function planName(key: ChallengePlanKey): string {
  return PLAN_MAP[key]?.name ?? key;
}

export const PAYOUT_MIN_USD = 100;
