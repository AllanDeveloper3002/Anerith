"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/market";
import { getInstrument } from "@/lib/instruments";
import { api } from "@/lib/client";
import { clsx } from "clsx";

export function LiveTicker({ initial }: { initial: Quote[] }) {
  const [quotes, setQuotes] = useState(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api<{ quotes: Quote[] }>("/api/market/quotes");
        if (alive) setQuotes(data.quotes);
      } catch {
        // keep the last good snapshot
      }
    };
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const row = [...quotes, ...quotes];

  return (
    <div className="marquee relative overflow-hidden border-y border-white/[0.06] bg-ink-900/50 py-3">
      <div className="marquee-track gap-8">
        {row.map((quote, index) => {
          const inst = getInstrument(quote.symbol);
          const up = quote.changePct >= 0;
          return (
            <div
              key={`${quote.symbol}-${index}`}
              className="flex shrink-0 items-center gap-2.5 text-[12px]"
              aria-hidden={index >= quotes.length}
            >
              <span className="font-mono font-medium tracking-wide text-snow">{inst.short}</span>
              <span className="font-mono text-fog tabular-nums">{quote.mid.toFixed(inst.precision)}</span>
              <span className={clsx("font-mono tabular-nums", up ? "text-mint" : "text-rose")}>
                {up ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </span>
              <span className="ml-4 size-1 rounded-full bg-white/15" />
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  );
}
