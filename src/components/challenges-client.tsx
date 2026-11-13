"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bitcoin,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Landmark,
  LockKeyhole,
  Scale,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { api, post, errorMessage } from "@/lib/client";
import { PLANS, TRIAL_PLAN, type ChallengePlan } from "@/lib/challenges";
import { fmtDate, fmtDateTime, fmtUsd } from "@/lib/format";
import type { ChallengePurchaseDTO, PaymentGatewayInfo, PaymentIntentDTO } from "@/lib/types";

const ACCENTS: Record<
  ChallengePlan["accent"],
  { ring: string; badge: string; text: string; button: string; bar: string; icon: string }
> = {
  lime: {
    ring: "border-mint/25",
    badge: "badge-acid",
    text: "text-mint",
    button: "btn-primary",
    bar: "from-mint/60 via-acid/40 to-transparent",
    icon: "border-mint/20 bg-mint/[0.08] text-mint",
  },
  gold: {
    ring: "border-gold/25",
    badge: "badge-gold",
    text: "text-gold",
    button: "bg-gold text-ink-950 hover:brightness-110",
    bar: "from-gold/60 via-gold/30 to-transparent",
    icon: "border-gold/20 bg-gold/[0.08] text-gold",
  },
  blue: {
    ring: "border-sky/25",
    badge: "badge-sky",
    text: "text-sky",
    button: "bg-sky text-ink-950 hover:brightness-110",
    bar: "from-sky/60 via-violet/30 to-transparent",
    icon: "border-sky/20 bg-sky/[0.08] text-sky",
  },
};

type PaymentMethodKey = "pesapal" | "crypto" | "bank";

const METHODS: { key: PaymentMethodKey; label: string; icon: typeof CreditCard; note: string }[] = [
  { key: "pesapal", label: "PesaPal", icon: Smartphone, note: "Card · Mobile money" },
  { key: "crypto", label: "Crypto", icon: Bitcoin, note: "USDT / BTC" },
  { key: "bank", label: "Bank", icon: Landmark, note: "Local transfer" },
];

const INTENT_BADGES: Record<PaymentIntentDTO["status"], string> = {
  completed: "badge-acid",
  pending: "badge-gold",
  processing: "badge-sky",
  failed: "badge-rose",
  cancelled: "badge-muted",
};

const INTENT_LABELS: Record<PaymentIntentDTO["status"], string> = {
  completed: "Paid",
  pending: "Awaiting payment",
  processing: "Confirming",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TRUST = [
  { icon: ShieldCheck, tone: "text-mint", label: "Rules enforced every second" },
  { icon: Banknote, tone: "text-gold", label: "Profit splits up to 90%" },
  { icon: Clock3, tone: "text-sky", label: "Payout cycles from 7 days" },
  { icon: Sparkles, tone: "text-violet", label: "Free $10,000 Discovery desk" },
];

const STEPS = [
  {
    icon: Target,
    tone: "text-gold",
    title: "Choose your program",
    body: "Pick Momentum, Horizon or Velocity and the account size that matches how you trade.",
  },
  {
    icon: CreditCard,
    tone: "text-sky",
    title: "Complete checkout",
    body: "Your desk is provisioned the moment payment is confirmed — credentials, broker route and rules included.",
  },
  {
    icon: TrendingUp,
    tone: "text-mint",
    title: "Trade the objectives",
    body: "Hit the profit target while staying inside daily loss, drawdown and trading-day rules.",
  },
  {
    icon: Banknote,
    tone: "text-coral",
    title: "Get funded & paid",
    body: "Pass and your desk converts to funded capital. Request payouts on your program's cycle at 80–90%.",
  },
];

export function ChallengesClient({
  initialPurchases,
  initialIntents,
  gateway,
}: {
  initialPurchases: ChallengePurchaseDTO[];
  initialIntents: PaymentIntentDTO[];
  gateway: PaymentGatewayInfo;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sizes, setSizes] = useState<Record<string, number>>(() =>
    Object.fromEntries(PLANS.map((plan) => [plan.key, plan.sizes[1]?.size ?? plan.sizes[0].size])),
  );
  const [checkout, setCheckout] = useState<{ plan: ChallengePlan; size: number } | null>(null);
  const [rulesPlan, setRulesPlan] = useState<ChallengePlan | null>(null);
  const [method, setMethod] = useState<PaymentMethodKey>(gateway.enabled ? "pesapal" : "bank");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activated, setActivated] = useState<{ accountId: string; planName: string; size: number } | null>(null);
  const [purchases, setPurchases] = useState(initialPurchases);
  const [intents, setIntents] = useState(initialIntents);
  const [filter, setFilter] = useState<"all" | "one-step" | "two-step" | "instant">("all");

  useEffect(() => {
    setPurchases(initialPurchases);
  }, [initialPurchases]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planKey = params.get("plan");
    const plan = PLANS.find((item) => item.key === planKey);
    if (!plan) return;
    const requested = Number(params.get("size"));
    const size = plan.sizes.find((option) => option.size === requested)?.size ?? plan.sizes[1]?.size ?? plan.sizes[0].size;
    setSizes((current) => ({ ...current, [plan.key]: size }));
    if (params.get("buy") === "1") setCheckout({ plan, size });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("ref");
    const payment = params.get("payment");
    if (!reference && !payment) return;
    window.history.replaceState({}, "", window.location.pathname);

    if (!reference) {
      if (payment === "unknown") {
        toast.push("We could not match that payment. Check your payment history below.", "error");
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ intent: PaymentIntentDTO }>(
          `/api/payments/pesapal/status?intentId=${encodeURIComponent(reference)}`,
        );
        if (cancelled) return;
        setIntents((current) => [data.intent, ...current.filter((item) => item.id !== data.intent.id)]);
        if (data.intent.status === "completed" && data.intent.accountId) {
          toast.push("Payment confirmed — your desk is live.", "success");
          setActivated({
            accountId: data.intent.accountId,
            planName: PLANS.find((item) => item.key === data.intent.plan)?.name ?? "Your account",
            size: data.intent.accountSize,
          });
          router.refresh();
          window.setTimeout(() => window.location.assign("/app/terminal"), 1600);
        } else if (data.intent.status === "pending" || data.intent.status === "processing") {
          toast.push("Payment received — confirmation is still processing.", "info");
        } else {
          toast.push(data.intent.failureReason ?? "Payment was not completed.", "error");
        }
      } catch (error) {
        if (!cancelled) toast.push(errorMessage(error), "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () =>
      PLANS.filter((plan) => filter === "all" || plan.key === filter).map((plan) => {
        const size = sizes[plan.key] ?? plan.sizes[0].size;
        const option = plan.sizes.find((item) => item.size === size) ?? plan.sizes[0];
        return { plan, size, price: option.price };
      }),
    [sizes, filter],
  );

  const selected = checkout
    ? (() => {
        const option = checkout.plan.sizes.find((item) => item.size === checkout.size);
        return option ? { ...checkout, price: option.price } : null;
      })()
    : null;

  async function buy() {
    if (!checkout || !agreed) return;
    setBusy(true);
    try {
      if (method === "pesapal") {
        if (!gateway.enabled) {
          throw new Error("PesaPal is not configured on this server.");
        }
        const data = await post<{ intent: PaymentIntentDTO; redirectUrl: string }>(
          "/api/payments/pesapal/initiate",
          { plan: checkout.plan.key, size: checkout.size },
        );
        setIntents((current) => [data.intent, ...current.filter((item) => item.id !== data.intent.id)]);
        toast.push("Opening PesaPal secure checkout…", "info");
        window.location.assign(data.redirectUrl);
        return;
      }

      const data = await post<{ purchase: ChallengePurchaseDTO; accountId: string }>("/api/challenges/purchase", {
        plan: checkout.plan.key,
        size: checkout.size,
        method,
      });
      setPurchases((current) => [data.purchase, ...current]);
      setCheckout(null);
      setActivated({
        accountId: data.accountId,
        planName: checkout.plan.name,
        size: checkout.size,
      });
      router.refresh();
      window.setTimeout(() => window.location.assign("/app/terminal"), 1400);
    } catch (error) {
      toast.push(errorMessage(error), "error");
      setBusy(false);
    }
  }

  function openCheckout(plan: ChallengePlan, size: number) {
    setAgreed(false);
    setMethod(gateway.enabled ? "pesapal" : "bank");
    setCheckout({ plan, size });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My challenges</p>
          <h1 className="mt-1 max-w-xl text-[27px] leading-tight font-semibold tracking-tight lg:text-[32px]">
            Choose the account that funds your edge.
          </h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-fog">
            Transparent rules, instant provisioning and profit splits up to 90%. Every program includes
            the full Trade workspace, performance analytics and risk engine — scale from $10,000 to $200,000.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-mint/20 bg-mint/[0.05] px-3 py-2 text-[11px] text-mint">
          <Sparkles className="size-3.5" /> Free {fmtUsd(TRIAL_PLAN.sizes[0].size)} Discovery desk included
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {TRUST.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card flex items-center gap-2.5 px-3.5 py-3">
              <Icon className={`size-4 shrink-0 ${item.tone}`} />
              <span className="text-[11px] font-medium text-snow">{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: "all", label: "All programs" },
            { key: "one-step", label: "Momentum" },
            { key: "two-step", label: "Horizon" },
            { key: "instant", label: "Velocity" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition",
              filter === item.key
                ? "bg-white/[0.08] text-snow"
                : "text-fog hover:bg-white/[0.04] hover:text-snow",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[10.5px] text-fog">
          <LockKeyhole className="size-3" /> Secure checkout
        </span>
      </div>

      <div className={clsx("grid gap-4", options.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2 xl:grid-cols-3")}>
        {options.map(({ plan, size, price }) => {
          const accent = ACCENTS[plan.accent];
          return (
            <article
              key={plan.key}
              className={clsx(
                "card relative flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-2xl",
                accent.ring,
              )}
            >
              <div className={clsx("h-1 w-full bg-gradient-to-r", accent.bar)} />
              <div className="border-b border-white/[0.06] p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className={clsx("badge", accent.badge)}>{plan.eyebrow}</span>
                  {plan.key === "one-step" ? (
                    <span className="text-[10px] font-medium tracking-wider text-fog uppercase">Most chosen</span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[21px] font-semibold tracking-tight">{plan.name}</h2>
                    <p className="mt-1 text-[12px] text-fog">{plan.tagline}</p>
                  </div>
                  <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl border", accent.icon)}>
                    {plan.key === "one-step" ? (
                      <Target className="size-5" />
                    ) : plan.key === "two-step" ? (
                      <Scale className="size-5" />
                    ) : (
                      <Zap className="size-5" />
                    )}
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono text-[34px] leading-none font-medium tracking-tight">
                    {fmtUsd(price, 0)}
                  </span>
                  <span className="text-[11px] text-fog">one-time</span>
                </div>
                <p className="mt-1 text-[11px] text-fog">
                  for a ${size.toLocaleString("en-US")} account
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {plan.sizes.map((option) => (
                    <button
                      key={option.size}
                      type="button"
                      onClick={() => setSizes((current) => ({ ...current, [plan.key]: option.size }))}
                      className={clsx(
                        "rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] transition",
                        size === option.size
                          ? clsx("bg-white/[0.08] text-snow", accent.ring)
                          : "border-white/[0.07] text-fog hover:border-white/20 hover:text-snow",
                      )}
                    >
                      ${(option.size / 1000).toFixed(0)}k
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-white/[0.06] px-5 py-4 text-[11px]">
                <div>
                  <p className="text-[9.5px] tracking-wider text-fog uppercase">Profit target</p>
                  <p className="mt-0.5 font-mono text-[13px]">
                    {plan.phaseTargets.length === 0
                      ? "Funded"
                      : plan.phaseTargets.map((target) => `${target}%`).join(" / ")}
                  </p>
                </div>
                <div>
                  <p className="text-[9.5px] tracking-wider text-fog uppercase">Profit split</p>
                  <p className={clsx("mt-0.5 font-mono text-[13px]", accent.text)}>{plan.profitSplitPct}%</p>
                </div>
                <div>
                  <p className="text-[9.5px] tracking-wider text-fog uppercase">Daily loss</p>
                  <p className="mt-0.5 font-mono text-[13px]">{plan.dailyLossPct}%</p>
                </div>
                <div>
                  <p className="text-[9.5px] tracking-wider text-fog uppercase">
                    {plan.drawdownMode === "trailing" ? "Trailing DD" : "Max drawdown"}
                  </p>
                  <p className="mt-0.5 font-mono text-[13px]">{plan.maxDrawdownPct}%</p>
                </div>
              </div>

              <ul className="flex-1 space-y-2 px-5 py-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[11.5px] text-fog">
                    <Check className={clsx("mt-0.5 size-3.5 shrink-0", accent.text)} />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="px-5 pb-5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openCheckout(plan, size)}
                    className={clsx("btn flex-1 py-3 font-semibold", accent.button)}
                  >
                    Buy {plan.name} <ArrowRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRulesPlan(plan)}
                    className="btn btn-secondary px-3"
                    title={`${plan.name} rules`}
                    aria-label={`View ${plan.name} rules`}
                  >
                    <ScrollText className="size-4" />
                  </button>
                </div>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[9.5px] text-white/30">
                  <ShieldCheck className="size-3" /> Rules shown before purchase · instant activation
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold">Compare every program</h2>
            <p className="mt-0.5 text-[11px] text-fog">
              One table, every objective. Switch sizes above to preview pricing.
            </p>
          </div>
          <span className="badge badge-muted">
            <Scale className="size-3" /> Same terminal, different risk envelope
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Program</th>
                <th>Entry price</th>
                <th>Profit target</th>
                <th>Daily loss</th>
                <th>Max drawdown</th>
                <th>Min. days</th>
                <th>Payout cycle</th>
                <th className="text-right">Split</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => {
                const chosen = sizes[plan.key] ?? plan.sizes[0].size;
                const price = plan.sizes.find((s) => s.size === chosen)?.price ?? plan.sizes[0].price;
                return (
                  <tr key={plan.key}>
                    <td>
                      <p className="text-[12px] font-medium text-snow">{plan.name}</p>
                      <p className="text-[9.5px] text-fog">${(chosen / 1000).toFixed(0)}K account</p>
                    </td>
                    <td className="font-mono text-[11px]">{fmtUsd(price, 0)}</td>
                    <td className="font-mono text-[11px]">
                      {plan.phaseTargets.length ? plan.phaseTargets.map((t) => `${t}%`).join(" / ") : "None"}
                    </td>
                    <td className="font-mono text-[11px]">{plan.dailyLossPct}%</td>
                    <td className="font-mono text-[11px]">
                      {plan.maxDrawdownPct}% {plan.drawdownMode}
                    </td>
                    <td className="font-mono text-[11px]">{plan.minTradingDays || "—"}</td>
                    <td className="font-mono text-[11px]">{plan.payoutCycleDays} days</td>
                    <td className="text-right font-mono text-[11px] text-mint">{plan.profitSplitPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-mint" />
          <h2 className="text-[14px] font-semibold">How funding works</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03]">
                    <Icon className={`size-4 ${step.tone}`} />
                  </span>
                  <span className="font-mono text-[11px] text-white/30">0{index + 1}</span>
                </div>
                <p className="mt-3 text-[12px] font-medium text-snow">{step.title}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fog">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            tone: "text-mint",
            title: "Rules you can verify",
            body: "Every objective, drawdown mode and payout calculation is shown in your dashboard in real time.",
          },
          {
            icon: Banknote,
            tone: "text-gold",
            title: "Profit split up to 90%",
            body: "Funded accounts earn a share of every profit payout, with a $100 minimum withdrawal.",
          },
          {
            icon: Timer,
            tone: "text-sky",
            title: "Activation in seconds",
            body: "Your account, broker route and terminal access are provisioned immediately after checkout.",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="card flex gap-3 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03]">
                <Icon className={`size-4 ${item.tone}`} />
              </div>
              <div>
                <p className="text-[12.5px] font-medium text-snow">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-fog">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold">Your orders</h2>
            <p className="mt-0.5 text-[11px] text-fog">Every program you have activated on Anerith.</p>
          </div>
          <Target className="size-4 text-gold" />
        </div>
        {purchases.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-fog">
            No orders yet — your free Discovery desk is already active.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Program</th>
                  <th>Account size</th>
                  <th>Paid</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="text-[11px] text-fog">{fmtDate(purchase.createdAt)}</td>
                    <td className="text-[12px]">
                      {PLANS.find((plan) => plan.key === purchase.plan)?.name ?? purchase.plan}
                    </td>
                    <td className="font-mono text-[11.5px]">${purchase.accountSize.toLocaleString("en-US")}</td>
                    <td className="font-mono text-[11.5px]">{fmtUsd(purchase.price, 0)}</td>
                    <td className="text-[11px] capitalize text-fog">{purchase.method}</td>
                    <td className="font-mono text-[10.5px] text-fog">{purchase.reference}</td>
                    <td className="text-right">
                      <span className="badge badge-acid">Activated</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {intents.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold">Payment history</h2>
              <p className="mt-0.5 text-[11px] text-fog">
                Gateway checkouts and their settlement status.
              </p>
            </div>
            <span className="badge badge-sky">
              <CreditCard className="size-3" /> PesaPal
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Program</th>
                  <th>Amount</th>
                  <th>Channel</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {intents.map((intent) => (
                  <tr key={intent.id}>
                    <td className="text-[11px] text-fog">{fmtDateTime(intent.createdAt)}</td>
                    <td className="text-[12px]">
                      {PLANS.find((plan) => plan.key === intent.plan)?.name ?? intent.plan}
                      <span className="block text-[9.5px] text-fog">
                        ${intent.accountSize.toLocaleString("en-US")} account
                      </span>
                    </td>
                    <td className="font-mono text-[11.5px]">
                      {fmtUsd(intent.amount, 0)}
                      <span className="ml-1 text-[9px] text-fog">{intent.currency}</span>
                    </td>
                    <td className="text-[11px] capitalize text-fog">PesaPal · {intent.method}</td>
                    <td className="font-mono text-[10.5px] text-fog">{intent.reference}</td>
                    <td>
                      <span className={clsx("badge", INTENT_BADGES[intent.status])}>
                        {INTENT_LABELS[intent.status]}
                      </span>
                      {intent.failureReason ? (
                        <p className="mt-1 max-w-[220px] text-[9.5px] leading-snug text-rose">
                          {intent.failureReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {intent.status === "pending" &&
                      intent.redirectUrl &&
                      /^https?:\/\//i.test(intent.redirectUrl) ? (
                        <a
                          href={intent.redirectUrl}
                          className="text-[11px] font-medium text-acid hover:underline"
                        >
                          Resume
                        </a>
                      ) : intent.status === "completed" && intent.accountId ? (
                        <Link
                          href="/app/terminal"
                          className="text-[11px] font-medium text-mint hover:underline"
                        >
                          Open desk
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const plan = PLANS.find((item) => item.key === intent.plan);
                            if (plan) openCheckout(plan, intent.accountSize);
                          }}
                          className="text-[11px] font-medium text-fog transition hover:text-snow"
                        >
                          Try again
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rulesPlan ? (
        <RulesModal plan={rulesPlan} onClose={() => setRulesPlan(null)} onBuy={() => {
          const size = sizes[rulesPlan.key] ?? rulesPlan.sizes[0].size;
          setRulesPlan(null);
          openCheckout(rulesPlan, size);
        }} />
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.07] p-5">
              <div>
                <p className="eyebrow">Secure checkout</p>
                <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{selected.plan.name}</h3>
                <p className="mt-0.5 text-[11.5px] text-fog">
                  ${selected.size.toLocaleString("en-US")} account · {selected.plan.profitSplitPct}% split
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckout(null)}
                className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow"
                aria-label="Close checkout"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-fog">Account size</span>
                  <span className="font-mono">${selected.size.toLocaleString("en-US")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Profit target</span>
                  <span className="font-mono">
                    {selected.plan.phaseTargets.length === 0
                      ? "Funded"
                      : selected.plan.phaseTargets.map((t) => `${t}%`).join(" / ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Drawdown</span>
                  <span className="font-mono">
                    {selected.plan.maxDrawdownPct}% {selected.plan.drawdownMode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Payout cycle</span>
                  <span className="font-mono">Every {selected.plan.payoutCycleDays} days</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-white/[0.06] pt-2 text-[13px]">
                  <span className="text-snow">Total due</span>
                  <span className="font-mono font-medium text-mint">{fmtUsd(selected.price, 0)}</span>
                </div>
              </div>

              <div>
                <p className="label">Payment method</p>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((item) => {
                    const Icon = item.icon;
                    const unavailable = item.key === "pesapal" && !gateway.enabled;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setMethod(item.key)}
                        disabled={unavailable}
                        title={
                          unavailable
                            ? "Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET to enable PesaPal."
                            : undefined
                        }
                        className={clsx(
                          "rounded-xl border p-2.5 text-center transition",
                          unavailable
                            ? "cursor-not-allowed border-white/[0.05] text-white/25"
                            : method === item.key
                              ? "border-mint/40 bg-mint/[0.07] text-mint"
                              : "border-white/[0.08] text-fog hover:border-white/20 hover:text-snow",
                        )}
                      >
                        <Icon className="mx-auto size-4" />
                        <span className="mt-1 block text-[10.5px] font-medium">{item.label}</span>
                        <span className="block text-[8.5px] text-current opacity-60">{item.note}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-fog">
                  {method === "pesapal"
                    ? gateway.enabled
                      ? `You will be redirected to PesaPal to pay in ${gateway.currency} by card or mobile money. Your desk activates automatically once the payment is confirmed.`
                      : "PesaPal is not configured on this server. Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET to enable card and mobile money."
                    : "Alternative settlement channel — your account is provisioned at checkout and the payment is reconciled by our operations desk."}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-acid"
                />
                <span className="text-[10.5px] leading-relaxed text-fog">
                  I have read the {selected.plan.name} objectives and understand that breaching daily
                  loss or maximum drawdown closes the account.
                </span>
              </label>

              <button
                type="button"
                onClick={buy}
                disabled={busy || !agreed || (method === "pesapal" && !gateway.enabled)}
                className="btn btn-primary w-full py-3"
              >
                {busy
                  ? method === "pesapal"
                    ? "Opening PesaPal…"
                    : "Activating your desk…"
                  : method === "pesapal"
                    ? `Pay ${fmtUsd(selected.price, 0)} with PesaPal`
                    : `Pay ${fmtUsd(selected.price, 0)} & activate`}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[9.5px] text-white/30">
                <LockKeyhole className="size-3" />
                {method === "pesapal"
                  ? `PesaPal ${gateway.environment === "production" ? "live" : "sandbox"} checkout · account activates on confirmation`
                  : "Encrypted checkout · instant account provisioning"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activated ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-mint/25 bg-ink-850 p-8 text-center shadow-2xl">
            <span className="mx-auto grid size-14 place-items-center rounded-full border border-mint/30 bg-mint/10 text-mint">
              <Check className="size-7" />
            </span>
            <h3 className="mt-4 text-[19px] font-semibold">{activated.planName} is live</h3>
            <p className="mt-1 text-[12px] text-fog">
              Your ${activated.size.toLocaleString("en-US")} desk is provisioned. Opening the terminal…
            </p>
            <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full origin-left animate-[shimmer_1.2s_linear_infinite] bg-gradient-to-r from-mint via-acid to-mint" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RulesModal({
  plan,
  onClose,
  onBuy,
}: {
  plan: ChallengePlan;
  onClose: () => void;
  onBuy: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.09] bg-ink-850 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/[0.07] p-5">
          <div>
            <p className="eyebrow">Full rulebook</p>
            <h3 className="mt-1 text-[19px] font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-0.5 text-[11.5px] text-fog">{plan.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow"
            aria-label="Close rules"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="scroll-area max-h-[55vh] space-y-3 p-5">
          {plan.rules.map((rule, index) => (
            <div key={rule.title} className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <p className="flex items-center gap-2 text-[12px] font-medium text-snow">
                <span className="grid size-5 place-items-center rounded-md bg-white/[0.06] font-mono text-[9px] text-fog">
                  {index + 1}
                </span>
                {rule.title}
              </p>
              <p className="mt-1.5 pl-7 text-[11px] leading-relaxed text-fog">{rule.body}</p>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-white/[0.06] p-2.5 text-center">
              <p className="text-[9px] tracking-wider text-fog uppercase">Split</p>
              <p className="mt-0.5 font-mono text-[13px] text-mint">{plan.profitSplitPct}%</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] p-2.5 text-center">
              <p className="text-[9px] tracking-wider text-fog uppercase">Payout</p>
              <p className="mt-0.5 font-mono text-[13px] text-snow">{plan.payoutCycleDays}d</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] p-2.5 text-center">
              <p className="text-[9px] tracking-wider text-fog uppercase">Consistency</p>
              <p className="mt-0.5 font-mono text-[13px] text-snow">
                {plan.consistencyPct ? `${plan.consistencyPct}%` : "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/[0.07] p-4">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Close
          </button>
          <button type="button" onClick={onBuy} className="btn btn-primary flex-1 gap-1.5">
            Buy {plan.name} <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
