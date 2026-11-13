"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#how", label: "How it works" },
  { href: "#plans", label: "Plans" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="Anerith home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-fog transition hover:bg-white/[0.04] hover:text-snow"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          {signedIn ? (
            <Link href="/app" className="btn btn-primary btn-sm gap-1.5">
              Open desk
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm gap-1.5">
                Start free trial
                <ArrowRight className="size-3.5" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn-ghost size-10 rounded-xl p-0 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-white/[0.06] bg-ink-950/95 px-5 pb-6 pt-3 md:hidden">
          <nav className="flex flex-col">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-fog hover:bg-white/[0.04] hover:text-snow"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            {signedIn ? (
              <Link href="/app" className="btn btn-primary">
                Open desk
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary">
                  Sign in
                </Link>
                <Link href="/register" className="btn btn-primary">
                  Start free trial
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
