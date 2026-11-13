"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Bell,
  ChartCandlestick,
  ChartNoAxesCombined,
  ChevronDown,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Maximize2,
  Menu,
  NotebookPen,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast-provider";
import type { AccountDTO, NotificationDTO, UserDTO } from "@/lib/types";
import { fmtUsd, timeAgo } from "@/lib/format";
import { phaseLabel } from "@/lib/challenges";
import { api, errorMessage, post } from "@/lib/client";

const NAV = [
  {
    label: "Trading",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard, tone: "text-sky" },
      { href: "/app/challenges", label: "My challenges", icon: Target, tone: "text-gold" },
      { href: "/app/terminal", label: "Trade", icon: ChartCandlestick, tone: "text-mint" },
      { href: "/app/chart", label: "Chart workspace", icon: Maximize2, tone: "text-sky" },
      { href: "/app/journal", label: "Trading journal", icon: NotebookPen, tone: "text-violet" },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/app/analytics", label: "Performance", icon: ChartNoAxesCombined, tone: "text-sky" },
      { href: "/app/payouts", label: "Rewards & payouts", icon: Banknote, tone: "text-coral" },
      { href: "/app/accounts", label: "Account", icon: WalletCards, tone: "text-violet" },
      { href: "/app/support", label: "Help & support", icon: LifeBuoy, tone: "text-mint" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/app/history", label: "Trade history", icon: History, tone: "text-fog" },
      { href: "/app/competitions", label: "Competitions", icon: Trophy, tone: "text-gold" },
      { href: "/app/risk", label: "Rule violations", icon: ShieldAlert, tone: "text-rose" },
      { href: "/app/settings", label: "Settings", icon: Settings, tone: "text-fog" },
      { href: "/app/admin", label: "Admin console", icon: ShieldCheck, adminOnly: true, tone: "text-rose" },
    ],
  },
];

const TITLES: { match: (path: string) => boolean; title: string; sub: string }[] = [
  { match: (p) => p === "/app", title: "Overview", sub: "Your desk at a glance" },
  { match: (p) => p.startsWith("/app/terminal"), title: "Trade", sub: "Chart, execute and manage positions" },
  { match: (p) => p === "/app/chart" || p.startsWith("/app/chart/"), title: "Chart workspace", sub: "Full-screen charting and drawings" },
  { match: (p) => p.startsWith("/app/journal"), title: "Trading journal", sub: "Review trades, notes and patterns" },
  { match: (p) => p.startsWith("/app/challenges"), title: "My challenges", sub: "Programs, rules & funding" },
  { match: (p) => p.startsWith("/app/accounts"), title: "Account", sub: "Every desk you operate" },
  { match: (p) => p.startsWith("/app/risk"), title: "Rule violations", sub: "Limits, breaches & enforcement" },
  { match: (p) => p.startsWith("/app/payouts"), title: "Rewards & payouts", sub: "Profit withdrawals & certificates" },
  { match: (p) => p.startsWith("/app/analytics"), title: "Performance", sub: "Execution quality, edge & equity" },
  { match: (p) => p.startsWith("/app/history"), title: "Trade history", sub: "Closed trades & ledger" },
  { match: (p) => p.startsWith("/app/competitions"), title: "Competitions", sub: "Leaderboard & prize pool" },
  { match: (p) => p.startsWith("/app/settings"), title: "Settings", sub: "Profile, verification & security" },
  { match: (p) => p.startsWith("/app/support"), title: "Help & support", sub: "Answers, tickets & platform guidance" },
  { match: (p) => p.startsWith("/app/admin"), title: "Admin console", sub: "Operations & broker routing" },
];

const BOTTOM_NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, tone: "text-sky" },
  { href: "/app/terminal", label: "Trade", icon: ChartCandlestick, tone: "text-mint" },
  { href: "/app/journal", label: "Journal", icon: NotebookPen, tone: "text-violet" },
  { href: "/app/payouts", label: "Payouts", icon: Banknote, tone: "text-coral" },
];

function isActive(path: string, href: string): boolean {
  if (href === "/app") return path === "/app";
  return path === href || path.startsWith(`${href}/`);
}

function accountLabel(account: AccountDTO): string {
  return `${account.number} · ${phaseLabel(account)} · $${account.size.toLocaleString("en-US")}`;
}

export function AppShell({
  user,
  accounts,
  activeId,
  children,
}: {
  user: UserDTO;
  accounts: AccountDTO[];
  activeId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [switching, setSwitching] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;
  const meta = TITLES.find((t) => t.match(pathname)) ?? TITLES[0];
  const initials = user.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationDTO[]; unread: number }>("/api/notifications");
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      /* shell badge is non-critical */
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const nav = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => !("adminOnly" in item && item.adminOnly) || user.role === "admin"),
      })),
    [user.role],
  );

  async function switchAccount(id: string) {
    if (id === activeId) return;
    setSwitching(true);
    try {
      await post("/api/accounts/activate", { accountId: id });
      router.refresh();
      window.location.reload();
    } catch (error) {
      toast.push(errorMessage(error), "error");
      setSwitching(false);
    }
  }

  async function markAllRead() {
    try {
      await post("/api/notifications");
      setNotifications((current) => current.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  async function signOut() {
    try {
      await post("/api/auth/logout");
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <div className="relative z-10 min-h-dvh">
      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-white/[0.07] bg-ink-950/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/app" aria-label="Anerith dashboard">
            <Logo size={30} />
          </Link>
          <button
            type="button"
            className="rounded-lg p-1.5 text-fog hover:bg-white/5 hover:text-snow lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {active ? (
          <Link
            href="/app/accounts"
            className="mx-3 mb-3 block rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition hover:border-white/[0.14] hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="badge badge-acid">{phaseLabel(active)}</span>
              <span className="text-[10px] font-medium tracking-wider text-fog uppercase">
                {active.leverage}x
              </span>
            </div>
            <p className="mt-2.5 font-mono text-lg font-medium tracking-tight">
              {fmtUsd(active.equity)}
            </p>
            <div className="mt-0.5 flex items-center justify-between text-[11px] text-fog">
              <span className="font-mono">{active.number}</span>
              <span>${active.size.toLocaleString("en-US")}</span>
            </div>
          </Link>
        ) : (
          <Link
            href="/app/challenges"
            className="mx-3 mb-3 rounded-xl border border-acid/25 bg-acid/[0.07] p-3 text-center text-xs text-acid"
          >
            Start your first challenge →
          </Link>
        )}

        <nav className="scroll-area flex-1 px-3 pb-4">
          {nav.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const activeItem = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx("nav-item", activeItem && "nav-item-active")}
                    >
                      <Icon className={clsx("size-[18px]", item.tone)} strokeWidth={1.9} />
                      <span className="flex-1">{item.label}</span>
                      {activeItem ? <span className="size-1.5 rounded-full bg-acid" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[10px] font-medium text-fog">
            <span className="live-dot" /> Risk engine online
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/30">
            Every rule is checked in real time against live equity. Feed status is shown in Trade.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-3.5">
          <div className="grid size-9 place-items-center rounded-full border border-acid/20 bg-acid/10 font-mono text-[11px] font-semibold text-acid">
            {initials || "AN"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-snow">{user.fullName}</p>
            <p className="truncate text-[10.5px] text-fog">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg p-1.5 text-fog transition hover:bg-white/5 hover:text-rose"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
        />
      ) : null}

      {/* Main column */}
      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-7">
            <button
              type="button"
              className="rounded-lg p-2 text-fog hover:bg-white/5 hover:text-snow lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-snow">{meta.title}</p>
              <p className="hidden truncate text-[11px] text-fog sm:block">{meta.sub}</p>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-medium text-fog md:flex">
                <span className="live-dot" /> Markets live
              </div>

              {accounts.length > 0 ? (
                <label className="relative hidden sm:block">
                  <span className="sr-only">Active trading account</span>
                  <select
                    value={activeId}
                    onChange={(event) => switchAccount(event.target.value)}
                    disabled={switching}
                    className="h-9 max-w-[230px] cursor-pointer appearance-none truncate rounded-lg border border-white/[0.09] bg-ink-850 pr-8 pl-3 font-mono text-[11.5px] text-snow transition hover:border-white/20 focus:border-acid/60 focus:outline-none"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={account.status !== "active"}>
                        {accountLabel(account)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fog" />
                </label>
              ) : null}

              <ThemeToggle />

              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((open) => !open);
                    if (!notifOpen) loadNotifications();
                  }}
                  className="relative rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-fog transition hover:border-white/20 hover:text-snow"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" />
                  {unread > 0 ? (
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-acid font-mono text-[9px] font-bold text-ink-950">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </button>

                {notifOpen ? (
                  <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/[0.09] bg-ink-850/98 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                      <p className="text-xs font-semibold tracking-wider text-fog uppercase">Notifications</p>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-[11px] text-acid hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="scroll-area max-h-[380px]">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-xs text-fog">Nothing yet.</p>
                      ) : (
                        notifications.map((item) => (
                          <div
                            key={item.id}
                            className={clsx(
                              "border-b border-white/[0.05] px-4 py-3 last:border-0",
                              !item.read && "bg-acid/[0.03]",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {!item.read ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-acid" /> : null}
                              <div className="min-w-0">
                                <p className="text-[12.5px] font-medium text-snow">{item.title}</p>
                                <p className="mt-0.5 text-[11.5px] leading-relaxed text-fog">{item.body}</p>
                                <p className="mt-1 text-[10px] text-white/30">{timeAgo(item.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <Link href="/app/challenges" className="btn btn-primary btn-sm hidden md:inline-flex">
                New challenge
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-4 pt-5 pb-24 lg:px-7 lg:pt-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-950/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const activeItem = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition",
                  activeItem ? "text-acid" : "text-fog",
                )}
              >
                <Icon className={clsx("size-[19px]", !activeItem && item.tone)} strokeWidth={1.9} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-fog"
          >
            <Menu className="size-[19px]" strokeWidth={1.9} />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
