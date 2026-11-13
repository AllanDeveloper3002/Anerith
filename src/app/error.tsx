"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-5">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/20 bg-rose/[0.08] text-rose">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-snow">Something interrupted the desk</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fog">
          The page could not finish loading. Your accounts, positions and payout records are safe.
          Please try again.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn btn-primary gap-2">
            <RotateCcw className="size-4" />
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
