import Link from "next/link";
import { ArrowLeft, BadgeCheck, ChartCandlestick, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Logo } from "@/components/logo";
import { BRAND } from "@/lib/brand";
import { TRIAL_PLAN } from "@/lib/challenges";

export function AuthShell({
  mode,
  children,
}: {
  mode: "login" | "register";
  children: React.ReactNode;
}) {
  const copy =
    mode === "login"
      ? {
          eyebrow: "Welcome back",
          title: "Your desk is waiting.",
          subtitle: "Sign in to manage accounts, trade the terminal and track your evaluations.",
        }
      : {
          eyebrow: "Create workspace",
          title: "Your edge. Funded.",
          subtitle: `${TRIAL_PLAN.eyebrow} — every new workspace opens with a free $10,000 Discovery desk.`,
        };

  return (
    <div className="relative z-10 grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-ink-900/40 px-10 py-9 lg:flex xl:px-14">
        <div className="pointer-events-none absolute -left-24 top-24 size-96 rounded-full bg-acid/[0.08] blur-[100px]" />
        <Link href="/" className="relative inline-flex w-fit items-center gap-2">
          <Logo size={32} />
        </Link>

        <div className="relative max-w-md">
          <span className="badge badge-acid">
            <Sparkles className="size-3" />
            Proprietary trading, reimagined
          </span>
          <h1 className="mt-5 text-[42px] leading-[1.03] font-semibold tracking-[-0.04em] xl:text-[52px]">
            {copy.title}
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-fog">{copy.subtitle}</p>

          <div className="mt-8 space-y-3.5">
            {[
              { icon: ChartCandlestick, text: "Multi-asset terminal with streaming charts and bracketed orders", tone: "text-mint" },
              { icon: BadgeCheck, text: "Evaluations and funded desks from $10K to $200K", tone: "text-gold" },
              { icon: Trophy, text: "Competitions, analytics and payout certificates in one workspace", tone: "text-sky" },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-3 text-[12.5px] text-fog">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03]">
                  <item.icon className={`size-4 ${item.tone}`} />
                </span>
                <span className="pt-1.5">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="card bg-ink-950/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium tracking-[0.12em] text-fog uppercase">
                Evaluation snapshot
              </span>
              <span className="badge badge-acid">
                <span className="live-dot" />
                On track
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="font-mono text-2xl font-medium tabular-nums text-snow">$56,240.00</p>
                <p className="mt-0.5 text-[10.5px] text-fog">Momentum desk · $50,000</p>
              </div>
              <span className="font-mono text-[12px] text-mint">+12.48%</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-fog">Target</p>
                <p className="mt-0.5 font-mono text-snow">64%</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-fog">Drawdown</p>
                <p className="mt-0.5 font-mono text-snow">18%</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-fog">Days</p>
                <p className="mt-0.5 font-mono text-snow">3 / 5</p>
              </div>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[10.5px] text-fog/70">
            <ShieldCheck className="size-3.5 text-acid" />
            {BRAND.riskDisclosure}
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-8 lg:px-10 xl:px-16">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:hidden">
            <Logo size={28} />
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fog transition hover:text-snow"
          >
            <ArrowLeft className="size-3.5" />
            Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-snow">
              {mode === "login" ? "Sign in to Anerith" : "Create your account"}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fog">
              {mode === "login"
                ? "Use your workspace credentials to continue to the desk."
                : "One account unlocks the terminal, evaluations and every funded desk you pass."}
            </p>

            <div className="mt-7">{children}</div>
          </div>
        </div>

        <p className="text-center text-[10.5px] text-fog/70 lg:text-left">
          © {new Date().getFullYear()} {BRAND.fullName} · All rights reserved.
        </p>
      </main>
    </div>
  );
}
