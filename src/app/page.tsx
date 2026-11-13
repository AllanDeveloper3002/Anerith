import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  ChartCandlestick,
  Check,
  ChevronRight,
  Gauge,
  Globe2,
  Layers,
  LockKeyhole,
  Medal,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LiveTicker } from "@/components/landing/live-ticker";
import { Reveal } from "@/components/landing/reveal";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_PLAN } from "@/lib/challenges";
import { getCompetitionView } from "@/lib/competitions";
import { INSTRUMENTS } from "@/lib/instruments";
import { getAllQuotes } from "@/lib/market";
import { fmtDate, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${BRAND.name} — Your edge. Funded.`,
  description:
    "Anerith is a proprietary trading firm platform: structured evaluations, funded accounts up to $200,000, 80–90% profit splits, fast payouts, competitions and a professional multi-asset terminal.",
};

const equityPoints = Array.from({ length: 64 }, (_, i) => {
  const x = (i / 63) * 520;
  const drift = i * 1.85;
  const wobble = Math.sin(i * 0.52) * 6.5 + Math.sin(i * 0.17) * 11;
  return { x, y: 152 - drift - wobble };
});

const equityLine = `M${equityPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}`;
const equityArea = `${equityLine} L520,160 L0,160 Z`;

const FEATURE_TONES = [
  { icon: "text-mint", border: "border-mint/20", bg: "bg-mint/10" },
  { icon: "text-sky", border: "border-sky/20", bg: "bg-sky/10" },
  { icon: "text-gold", border: "border-gold/20", bg: "bg-gold/10" },
  { icon: "text-violet", border: "border-violet/20", bg: "bg-violet/10" },
  { icon: "text-coral", border: "border-coral/20", bg: "bg-coral/10" },
  { icon: "text-acid", border: "border-acid/20", bg: "bg-acid/10" },
] as const;

const FEATURES = [
  {
    icon: ChartCandlestick,
    title: "Institutional terminal",
    body: "Candlesticks across seven timeframes, market, limit and stop orders, SL/TP management and one-second execution — all in the browser.",
  },
  {
    icon: ShieldCheck,
    title: "Rules enforced in real time",
    body: "Daily loss, static or trailing drawdown, profit targets and minimum trading days are checked every second against live equity.",
  },
  {
    icon: Banknote,
    title: "Transparent payout ledger",
    body: "Request profits from funded desks, track approval status and generate a printable certificate for every settled withdrawal.",
  },
  {
    icon: Gauge,
    title: "Deep analytics",
    body: "Equity curves, win rate, profit factor, long/short balance and symbol performance built from every closed trade.",
  },
  {
    icon: Trophy,
    title: "Live competitions",
    body: "Enter time-boxed tournaments, climb a real-time leaderboard and compete for a shared prize pool against other operators.",
  },
  {
    icon: Globe2,
    title: "Execution bridge",
    body: "MT5, Match-Trader and cTrader routing with heartbeats, environment controls and a full bridge event log.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Create your workspace",
    body: "Register in under a minute. Every new account starts with a free $10,000 trial desk and full terminal access.",
    tone: "text-mint",
  },
  {
    number: "02",
    title: "Choose an evaluation",
    body: "Pick the Momentum, Horizon or Velocity program from $10,000 to $200,000. Trade the targets while staying inside the risk limits.",
    tone: "text-sky",
  },
  {
    number: "03",
    title: "Operate firm capital",
    body: "Pass your objectives and your desk converts to funded status. Scale your edge, request payouts and enter competitions.",
    tone: "text-gold",
  },
];

const FAQ = [
  {
    q: "What is Anerith?",
    a: "Anerith is a proprietary trading firm platform. Traders prove their process in a structured evaluation, then operate firm capital and keep 80–90% of the profits they generate.",
  },
  {
    q: "How do the evaluations work?",
    a: "Each program sets profit targets, a daily loss limit, a maximum drawdown and a minimum number of trading days. Hit the target without breaching a rule and your account advances a phase or converts to funded status.",
  },
  {
    q: "What profit split can I reach?",
    a: "Funded desks start at an 80% profit split, with the Horizon program offering 90%. Splits are applied to eligible profit when each payout cycle settles.",
  },
  {
    q: "How do payouts run?",
    a: "A payout request reserves the amount from your funded desk and records it in the ledger. The risk desk reviews it, settles to your chosen destination and issues a printable payout certificate.",
  },
  {
    q: "Which markets and timeframes are available?",
    a: `Forex, metals, indices, crypto and energy — ${INSTRUMENTS.length} instruments in total — with 1m to 1d candlesticks, leverage up to 1:100 and standard spreads.`,
  },
  {
    q: "Do I need third-party broker credentials?",
    a: "No. Your Anerith login is all you need. Execution routing is handled by our bridge, so there are no external platform credentials to manage or share.",
  },
];

const accent = {
  lime: { badge: "badge-acid", check: "text-mint", ring: "hover:border-mint/30" },
  gold: { badge: "badge-gold", check: "text-gold", ring: "hover:border-gold/30" },
  blue: { badge: "badge-sky", check: "text-sky", ring: "hover:border-sky/30" },
} as const;

export default async function LandingPage() {
  const [quotes, user] = await Promise.all([getAllQuotes("standard"), getSessionUser()]);
  const competition = getCompetitionView(user?.id ?? "");
  const storeLink = (planKey: string, size: number) =>
    user
      ? `/app/challenges?plan=${planKey}&size=${size}&buy=1`
      : "/register";

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <div className="relative overflow-hidden border-b border-gold/20 bg-gradient-to-r from-gold/[0.1] via-gold/[0.05] to-violet/[0.08] px-5 py-2.5 text-center text-[11.5px]">
        <span className="inline-flex flex-wrap items-center justify-center gap-2 text-gold">
          <Zap className="size-3.5" />
          <span className="font-medium">Black November</span>
          <span className="text-snow/80">30% off every evaluation with code</span>
          <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wider">
            EDGE30
          </span>
          <Link href="#plans" className="inline-flex items-center gap-1 font-medium text-snow hover:text-gold">
            Claim <ArrowRight className="size-3" />
          </Link>
        </span>
      </div>

      <LandingNav signedIn={Boolean(user)} />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-mint/[0.07] blur-[120px]" />
          <div className="pointer-events-none absolute -right-40 top-24 size-[420px] rounded-full bg-violet/[0.07] blur-[110px]" />
          <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
            <div className="animate-rise lg:col-span-6">
              <span className="badge badge-mint">
                <Sparkles className="size-3" />
                The prop firm for serious operators
              </span>
              <h1 className="mt-6 text-[44px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-6xl lg:text-[68px]">
                Your edge.
                <br />
                <span className="bg-gradient-to-r from-snow via-mint to-acid bg-clip-text text-transparent">
                  Funded.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-fog">
                A professional prop-firm platform with structured evaluations, funded desks up to{" "}
                <span className="text-snow">$200,000</span>, 80–90% profit splits and a full
                multi-asset terminal. Prove your process, then operate firm capital with
                institutional-grade tooling.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/register" className="btn btn-primary btn-lg gap-2">
                  Start free trial
                  <ArrowRight className="size-4" />
                </Link>
                <a href="#plans" className="btn btn-secondary btn-lg gap-2">
                  Explore programs
                  <ChevronRight className="size-4" />
                </a>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-fog">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-mint" /> No card required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-sky" /> Instant $10,000 trial desk
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-gold" /> Payouts from day one
                </span>
              </div>
            </div>

            <div className="animate-rise lg:col-span-6" style={{ animationDelay: "90ms" }}>
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]">
                <Image
                  src="/images/hero-market.png"
                  alt="Market data visualisation"
                  fill
                  priority
                  sizes="(min-width: 1024px) 620px, 100vw"
                  className="animate-aurora-slow object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-ink-950 via-ink-950/70 to-transparent" />

                <div className="relative m-4 rounded-2xl border border-white/10 bg-ink-950/80 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="live-dot" />
                      <span className="text-[12px] font-medium text-snow">Momentum</span>
                      <span className="badge badge-muted">$100,000</span>
                    </div>
                    <span className="hidden text-[10.5px] tracking-[0.12em] text-fog uppercase sm:block">
                      Funded desk
                    </span>
                  </div>

                  <div className="px-5 pt-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-medium tracking-[0.12em] text-fog uppercase">
                          Account equity
                        </p>
                        <p className="mt-1 font-mono text-3xl font-medium tracking-tight tabular-nums">
                          $106,482.50
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="badge badge-acid">+6.48%</span>
                        <p className="mt-1.5 font-mono text-[11px] text-mint">+$6,482.50</p>
                      </div>
                    </div>

                    <svg viewBox="0 0 520 160" className="mt-5 h-36 w-full" role="img" aria-label="Equity curve">
                      <defs>
                        <linearGradient id="hero-equity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#c9f75c" stopOpacity="0.28" />
                          <stop offset="1" stopColor="#c9f75c" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0" stopColor="#7ee8c0" />
                          <stop offset="1" stopColor="#c9f75c" />
                        </linearGradient>
                      </defs>
                      {[40, 80, 120].map((y) => (
                        <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />
                      ))}
                      <path d={equityArea} fill="url(#hero-equity)" />
                      <path d={equityLine} fill="none" stroke="url(#hero-line)" strokeWidth="2.2" strokeLinecap="round" />
                      <circle cx="520" cy={equityPoints[equityPoints.length - 1].y} r="3.5" fill="#c9f75c" />
                    </svg>
                  </div>

                  <div className="grid grid-cols-3 gap-px border-t border-white/[0.06] bg-white/[0.04]">
                    {[
                      { label: "Profit target", value: "65%", hint: "of 10%", tone: "text-mint" },
                      { label: "Drawdown used", value: "24%", hint: "of 6%", tone: "text-gold" },
                      { label: "Min. days", value: "3 / 5", hint: "trading days", tone: "text-sky" },
                    ].map((item) => (
                      <div key={item.label} className="bg-ink-900/90 px-4 py-3.5">
                        <p className="text-[9.5px] font-medium tracking-[0.1em] text-fog uppercase">{item.label}</p>
                        <p className={`mt-1 font-mono text-[15px] tabular-nums ${item.tone}`}>{item.value}</p>
                        <p className="text-[10px] text-fog">{item.hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 px-3 pb-3 pt-2">
                    {[
                      { symbol: "EUR/USD", side: "Buy", lots: "1.50", pnl: "+$1,284.00" },
                      { symbol: "XAU/USD", side: "Sell", lots: "0.80", pnl: "+$842.50" },
                      { symbol: "US30", side: "Buy", lots: "2.00", pnl: "−$118.00" },
                    ].map((row) => (
                      <div key={row.symbol} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[11.5px] hover:bg-white/[0.03]">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-snow">{row.symbol}</span>
                          <span className={row.side === "Buy" ? "text-mint" : "text-rose"}>{row.side}</span>
                        </span>
                        <span className="font-mono text-fog">{row.lots} lots</span>
                        <span className={row.pnl.startsWith("+") ? "font-mono text-mint" : "font-mono text-rose"}>{row.pnl}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="absolute -right-3 -top-4 hidden rotate-1 items-center gap-2.5 rounded-xl border border-sky/30 bg-ink-950/95 px-3.5 py-2.5 shadow-xl backdrop-blur lg:flex">
                  <BadgeCheck className="size-4 text-sky" />
                  <div>
                    <p className="text-[11px] font-medium text-snow">Evaluation passed</p>
                    <p className="text-[10px] text-fog">Desk converted to funded</p>
                  </div>
                </div>
                <div className="absolute -bottom-5 -left-3 hidden -rotate-1 items-center gap-2.5 rounded-xl border border-gold/30 bg-ink-950/95 px-3.5 py-2.5 shadow-xl backdrop-blur lg:flex">
                  <Banknote className="size-4 text-gold" />
                  <div>
                    <p className="text-[11px] font-medium text-snow">90% profit split</p>
                    <p className="text-[10px] text-fog">Paid on your cycle</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <LiveTicker initial={quotes} />

        <section className="border-b border-white/[0.06]">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-5 py-9 sm:px-8 lg:grid-cols-4">
            {[
              { value: "$200K", label: "Maximum funded capital", icon: Layers, tone: "text-mint" },
              { value: "90%", label: "Top profit split", icon: Scale, tone: "text-gold" },
              { value: `${INSTRUMENTS.length}`, label: "Markets, five asset classes", icon: Globe2, tone: "text-sky" },
              { value: "1s", label: "Risk engine tick rate", icon: Timer, tone: "text-violet" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3.5">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] ${stat.tone}`}>
                  <stat.icon className="size-4.5" />
                </span>
                <div>
                  <p className="font-mono text-xl font-medium tracking-tight text-snow">{stat.value}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-fog">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="platform" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">The platform</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Everything a professional desk needs
              </h2>
              <p className="mt-4 text-[14.5px] leading-relaxed text-fog">
                Evaluations are only the entry point. Anerith ships the terminal, risk engine,
                payout operations and analytics that make a prop firm feel like a real desk.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => {
                const tone = FEATURE_TONES[index % FEATURE_TONES.length];
                return (
                  <Reveal key={feature.title} delay={index * 70}>
                    <div className="card card-hover group h-full p-6">
                      <span className={`grid size-10 place-items-center rounded-xl border ${tone.border} ${tone.bg} ${tone.icon} transition group-hover:scale-105`}>
                        <feature.icon className="size-[18px]" />
                      </span>
                      <h3 className="mt-4 text-[15px] font-semibold text-snow">{feature.title}</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-fog">{feature.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-y border-white/[0.06] bg-ink-900/30 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow">How it works</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                  From sign-up to funded desk
                </h2>
              </div>
              <p className="max-w-md text-[13.5px] leading-relaxed text-fog lg:text-right">
                A clear three-step path. No hidden phases, no surprise objectives — every rule is
                visible before you take a single trade.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal key={step.number} delay={index * 90} className="relative">
                  {index < STEPS.length - 1 ? (
                    <div className="absolute left-full top-9 hidden h-px w-4 bg-gradient-to-r from-mint/40 to-transparent md:block" />
                  ) : null}
                  <div className="card h-full p-6">
                    <div className="flex items-center justify-between">
                      <span className={`font-mono text-[28px] font-medium tracking-tight opacity-60 ${step.tone}`}>
                        {step.number}
                      </span>
                      {index === 2 ? (
                        <Trophy className="size-4 text-gold" />
                      ) : index === 1 ? (
                        <Target className="size-4 text-sky" />
                      ) : (
                        <Zap className="size-4 text-mint" />
                      )}
                    </div>
                    <h3 className="mt-4 text-[16px] font-semibold text-snow">{step.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-fog">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Evaluations & funded programs</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Choose the path to funded capital
              </h2>
              <p className="mt-4 text-[14.5px] leading-relaxed text-fog">
                All programs include the full terminal, analytics and account dashboard. Every rule
                is published up front — pick the structure that matches how you trade.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {PLANS.map((plan, index) => {
                const tone = accent[plan.accent];
                const from = Math.min(...plan.sizes.map((s) => s.price));
                const spotlight = plan.sizes[Math.min(1, plan.sizes.length - 1)];
                return (
                  <Reveal key={plan.key} delay={index * 90}>
                    <div
                      className={`card relative flex h-full flex-col p-6 ${tone.ring} ${
                        plan.key === "one-step" ? "border-mint/25 bg-gradient-to-b from-mint/[0.06] to-transparent" : ""
                      }`}
                    >
                      {plan.eyebrow ? (
                        <span className={`badge ${tone.badge} absolute right-5 top-5`}>{plan.eyebrow}</span>
                      ) : null}
                      <h3 className="pr-24 text-[18px] font-semibold text-snow">{plan.name}</h3>
                      <p className="mt-1 min-h-[38px] text-[12.5px] leading-relaxed text-fog">{plan.tagline}</p>

                      <div className="mt-5 flex items-end gap-2">
                        <span className="font-mono text-4xl font-medium tracking-tight text-snow">{fmtUsd(from, 0)}</span>
                        <span className="pb-1 text-[11.5px] text-fog">one-time</span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {plan.sizes.map((s) => (
                          <span key={s.size} className="badge badge-muted font-mono">
                            ${s.size / 1000}K
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                        <div>
                          <p className="text-[9.5px] tracking-[0.1em] text-fog uppercase">Profit split</p>
                          <p className="mt-0.5 font-mono text-[14px] text-mint">{plan.profitSplitPct}%</p>
                        </div>
                        <div>
                          <p className="text-[9.5px] tracking-[0.1em] text-fog uppercase">Max drawdown</p>
                          <p className="mt-0.5 font-mono text-[14px] text-snow">{plan.maxDrawdownPct}%</p>
                        </div>
                        <div>
                          <p className="text-[9.5px] tracking-[0.1em] text-fog uppercase">Target</p>
                          <p className="mt-0.5 font-mono text-[14px] text-snow">
                            {plan.phaseTargets.length ? plan.phaseTargets.map((t) => `${t}%`).join(" / ") : "Instant"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9.5px] tracking-[0.1em] text-fog uppercase">Daily loss</p>
                          <p className="mt-0.5 font-mono text-[14px] text-gold">{plan.dailyLossPct}%</p>
                        </div>
                      </div>

                      <ul className="mt-5 flex-1 space-y-2">
                        {plan.features.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-[12.5px] text-fog">
                            <Check className={`mt-0.5 size-3.5 shrink-0 ${tone.check}`} />
                            {item}
                          </li>
                        ))}
                      </ul>

                      <Link
                        href={storeLink(plan.key, spotlight.size)}
                        className={`btn mt-6 w-full gap-2 ${plan.key === "one-step" ? "btn-primary" : "btn-secondary"}`}
                      >
                        {user ? `Buy ${plan.name}` : `Choose ${plan.name}`}
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={120}>
              <div className="card mt-4 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
                    <Sparkles className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-snow">Not ready to commit? Start with the free trial.</p>
                    <p className="mt-0.5 text-[12px] text-fog">{TRIAL_PLAN.description}</p>
                  </div>
                </div>
                <Link href="/register" className="btn btn-secondary btn-sm shrink-0 gap-1.5">
                  Open a free trial
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-white/[0.06] bg-ink-900/30 px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <p className="eyebrow">The terminal</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Execute like it is a real desk
              </h2>
              <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-fog">
                A low-latency terminal with a watchlist, streaming quotes, candlestick charts and an
                order ticket that handles market, limit and stop entries with bracketed risk.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  { icon: ChartCandlestick, text: "Streaming one-second ticks and coherent candles across every timeframe", tone: "text-mint" },
                  { icon: Target, text: "Bracketed orders with stop-loss and take-profit modification", tone: "text-sky" },
                  { icon: LockKeyhole, text: "Server-side risk checks on margin, lot size and rule compliance", tone: "text-gold" },
                  { icon: Wallet, text: "Per-desk equity, free margin and floating P&L, always visible", tone: "text-violet" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3 text-[13.5px] text-fog">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] ${item.tone}`}>
                      <item.icon className="size-4" />
                    </span>
                    <span className="pt-1.5">{item.text}</span>
                  </li>
                ))}
              </ul>
              <Link href={user ? "/app/terminal" : "/register"} className="btn btn-primary mt-8 gap-2">
                Open the terminal
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>

            <Reveal delay={120} scale>
              <div className="relative overflow-hidden rounded-3xl border border-white/10">
                <Image
                  src="/images/trading-desk.png"
                  alt="A professional multi-monitor trading desk"
                  width={1536}
                  height={1024}
                  sizes="(min-width: 1024px) 620px, 100vw"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "Execution", value: "One-second", tone: "text-mint" },
                    { label: "Risk engine", value: "Real-time", tone: "text-gold" },
                    { label: "Markets", value: `${INSTRUMENTS.length} live`, tone: "text-sky" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-ink-950/80 px-3 py-2.5 backdrop-blur">
                      <p className="text-[9px] tracking-[0.1em] text-fog uppercase">{item.label}</p>
                      <p className={`mt-0.5 font-mono text-[12px] ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/[0.08] via-ink-900 to-ink-900 p-7 sm:p-10 lg:p-12">
                <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-gold/[0.12] blur-[90px]" />
                <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
                  <div>
                    <span className="badge badge-gold">
                      <Trophy className="size-3" />
                      Competitions
                    </span>
                    <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                      Test your edge against the field
                    </h2>
                    <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-fog">
                      Monthly tournaments with a shared prize pool, a live leaderboard and scoring
                      measured directly from verified account equity. Enter with your active desk and
                      climb as you trade.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <Link href={user ? "/app/competitions" : "/register"} className="btn btn-primary gap-2">
                        Join the next event
                        <ArrowRight className="size-4" />
                      </Link>
                      <span className="text-[11.5px] text-fog">
                        {competition ? `${fmtUsd(competition.prizePool)} prize pool · closes ${fmtDate(competition.endAt)}` : "New rounds announced monthly"}
                      </span>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-white/10">
                    <Image
                      src="/images/competition.png"
                      alt="Championship trophy"
                      width={1536}
                      height={1024}
                      sizes="(min-width: 1024px) 560px, 100vw"
                      className="h-52 w-full object-cover sm:h-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
                    <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/10 bg-ink-950/85 p-3 backdrop-blur">
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="flex items-center gap-2 text-[11px] font-medium text-snow">
                          <span className="live-dot" /> Live leaderboard
                        </span>
                        <span className="badge badge-gold">{competition?.entries.length ?? 0} traders</span>
                      </div>
                      <div className="space-y-0.5">
                        {(competition?.entries.slice(0, 3) ?? []).map((entry) => (
                          <div key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[11px]">
                            <span className={`w-5 font-mono ${entry.rank === 1 ? "text-gold" : entry.rank === 2 ? "text-sky" : "text-coral"}`}>
                              {String(entry.rank).padStart(2, "0")}
                            </span>
                            <span className="flex-1 truncate font-mono text-snow">{entry.displayName}</span>
                            <span className={entry.returnPct >= 0 ? "font-mono text-mint" : "font-mono text-rose"}>
                              {entry.returnPct >= 0 ? "+" : ""}
                              {entry.returnPct.toFixed(2)}%
                            </span>
                          </div>
                        ))}
                        {!competition || competition.entries.length === 0 ? (
                          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[11px]">
                            <Medal className="size-3.5 text-gold" />
                            <span className="text-fog">Leaderboard opens when the round starts.</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-t border-white/[0.06] px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <p className="eyebrow">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Clear answers, no fine print
              </h2>
              <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-fog">
                Everything you need to understand the programs, the rules and how payouts work.
                Still deciding? Create a free trial and explore the full flow yourself.
              </p>
              <Link href="/register" className="btn btn-secondary mt-6 gap-2">
                Try it free
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>

            <Reveal delay={120} className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-snow [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronRight className="size-4 shrink-0 text-fog transition group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 pr-8 text-[13px] leading-relaxed text-fog">{item.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-14 text-center sm:px-12">
                <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-2/3 rounded-full bg-mint/[0.1] blur-[80px]" />
                <div className="relative">
                  <span className="badge badge-muted">
                    <Zap className="size-3 text-mint" />
                    Free $10,000 trial desk
                  </span>
                  <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
                    Prove the process. Operate the capital.
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-fog">
                    Create your Anerith workspace and open the terminal in minutes. Trade the free
                    trial, choose your evaluation and start building a verified track record.
                  </p>
                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/register" className="btn btn-primary btn-lg gap-2">
                      Start free trial
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link href="/login" className="btn btn-secondary btn-lg">
                      Sign in
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] bg-ink-950/60 px-5 py-12 sm:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-fog">{BRAND.description}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-mint/20 bg-mint/[0.05] px-3 py-2 text-[11px] text-mint">
                <ShieldCheck className="size-3.5" />
                Risk-managed capital · real payouts
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-snow uppercase">Platform</p>
              <ul className="mt-3 space-y-2 text-[12.5px] text-fog">
                <li><a className="hover:text-snow" href="#platform">Features</a></li>
                <li><a className="hover:text-snow" href="#plans">Evaluations</a></li>
                <li><Link className="hover:text-snow" href="/register">Free trial</Link></li>
                <li><Link className="hover:text-snow" href="/login">Trading terminal</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-snow uppercase">Resources</p>
              <ul className="mt-3 space-y-2 text-[12.5px] text-fog">
                <li><a className="hover:text-snow" href="#how">How it works</a></li>
                <li><a className="hover:text-snow" href="#faq">FAQ</a></li>
                <li><span className="text-fog/70">Risk disclosure</span></li>
                <li><span className="text-fog/70">Terms of service</span></li>
              </ul>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-snow uppercase">Contact</p>
              <ul className="mt-3 space-y-2 text-[12.5px] text-fog">
                <li>{BRAND.supportEmail}</li>
                <li>Mon–Fri · 09:00–18:00 UTC</li>
                <li className="pt-1 text-[11px] leading-relaxed text-fog/70">
                  Desk support responds within one business day.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-white/[0.06] pt-6 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-2xl text-[10.5px] leading-relaxed text-fog/70">
              {BRAND.riskDisclosure} Anerith does not provide investment advice. Only trade with capital
              you can afford to lose.
            </p>
            <p className="shrink-0 text-[10.5px] text-fog/70">
              © {new Date().getFullYear()} {BRAND.fullName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
