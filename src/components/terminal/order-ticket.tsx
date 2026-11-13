"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { errorMessage, post } from "@/lib/client";
import { fmtUsd } from "@/lib/format";
import { formatPrice, requiredMarginCents } from "@/lib/instruments";
import type { Plan } from "@/lib/instruments";
import type { Quote } from "@/lib/market";
import type { TradeStateDTO } from "@/lib/types";

export interface InstrumentMeta {
  symbol: string;
  name: string;
  short: string;
  category: string;
  precision: number;
  pipSize: number;
  contractSize: number;
  session: string;
  maxLeverage: number;
  minLots: number;
  maxLots: number;
  lotStep: number;
  tickSize: number;
  tradingStatus: "open" | "closed" | "halted";
  baseCurrency: string;
  quoteCurrency: string;
  spreads: Record<Plan, number>;
  commissions: Record<Plan, number>;
}

export function newClientOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function roundToStep(value: number, step: number): number {
  const safeStep = step > 0 ? step : 0.01;
  return Number((Math.round(value / safeStep) * safeStep).toFixed(8));
}

export function OrderTicket({
  account,
  symbol,
  quote,
  meta,
  hasPosition,
  onPlaced,
}: {
  account: TradeStateDTO["account"];
  symbol: string;
  quote: Quote | undefined;
  meta: InstrumentMeta | undefined;
  hasPosition: boolean;
  onPlaced: () => Promise<void>;
}) {
  const toast = useToast();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [lots, setLots] = useState("0.10");
  const [trigger, setTrigger] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<{ fingerprint: string; clientOrderId: string } | null>(null);

  const minLots = meta?.minLots ?? 0.01;
  const maxLots = meta?.maxLots ?? 50;
  const lotStep = meta?.lotStep ?? 0.01;

  useEffect(() => {
    setTrigger("");
    setSl("");
    setTp("");
    setExpiry("");
    requestRef.current = null;
    setLots((current) => {
      const parsed = Number(current);
      return parsed >= minLots && parsed <= maxLots
        ? roundToStep(parsed, lotStep).toFixed(2)
        : roundToStep(minLots, lotStep).toFixed(2);
    });
  }, [symbol, lotStep, maxLots, minLots]);

  const lotsNumber = Number(lots);
  const validLots =
    Number.isFinite(lotsNumber) &&
    lotsNumber >= minLots &&
    lotsNumber <= maxLots &&
    Math.abs(lotsNumber / lotStep - Math.round(lotsNumber / lotStep)) < 1e-6;
  const referencePrice =
    orderType === "market"
      ? side === "buy"
        ? quote?.ask
        : quote?.bid
      : trigger
        ? Number(trigger)
        : side === "buy"
          ? quote?.ask
          : quote?.bid;
  const marginUsd =
    validLots && referencePrice && referencePrice > 0
      ? requiredMarginCents(account.leverage, symbol, lotsNumber, referencePrice) / 100
      : 0;
  const commissionUsd = validLots ? (meta?.commissions.standard ?? 0) * lotsNumber : 0;
  const riskReward =
    sl.trim() && tp.trim() && referencePrice
      ? (() => {
          const slNumber = Number(sl);
          const tpNumber = Number(tp);
          const risk = Math.abs(referencePrice - slNumber);
          const reward = Math.abs(tpNumber - referencePrice);
          if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0) return null;
          return Number((reward / risk).toFixed(2));
        })()
      : null;

  function bumpLots(delta: number) {
    const next = Math.max(minLots, Math.min(maxLots, roundToStep(lotsNumber + delta, lotStep)));
    setLots(next.toFixed(2));
  }

  async function submit() {
    if (!quote || !meta) {
      toast.push("Waiting for a market quote.", "warning");
      return;
    }
    if (!validLots) {
      toast.push(`Enter a volume between ${minLots} and ${maxLots} lots in ${lotStep} steps.`, "error");
      return;
    }
    const slNumber = sl.trim() ? Number(sl) : null;
    const tpNumber = tp.trim() ? Number(tp) : null;
    if (slNumber !== null && (!Number.isFinite(slNumber) || slNumber <= 0)) {
      toast.push("Stop loss must be a positive price.", "error");
      return;
    }
    if (tpNumber !== null && (!Number.isFinite(tpNumber) || tpNumber <= 0)) {
      toast.push("Take profit must be a positive price.", "error");
      return;
    }
    if (slNumber != null) {
      if (side === "buy" && slNumber >= (referencePrice ?? 0)) {
        toast.push("For a buy, the stop loss must be below the entry price.", "error");
        return;
      }
      if (side === "sell" && slNumber <= (referencePrice ?? 0)) {
        toast.push("For a sell, the stop loss must be above the entry price.", "error");
        return;
      }
    }
    if (tpNumber != null) {
      if (side === "buy" && tpNumber <= (referencePrice ?? 0)) {
        toast.push("For a buy, the take profit must be above the entry price.", "error");
        return;
      }
      if (side === "sell" && tpNumber >= (referencePrice ?? 0)) {
        toast.push("For a sell, the take profit must be below the entry price.", "error");
        return;
      }
    }

    const price =
      orderType === "market"
        ? null
        : trigger.trim() !== ""
          ? Number(trigger)
          : side === "buy"
            ? quote.ask
            : quote.bid;
    if (orderType !== "market" && price != null) {
      if (!Number.isFinite(price) || price <= 0) {
        toast.push("Enter a valid trigger price.", "error");
        return;
      }
      if (orderType === "limit" && side === "buy" && price >= quote.ask) {
        toast.push("A buy limit must be below the current ask.", "error");
        return;
      }
      if (orderType === "limit" && side === "sell" && price <= quote.bid) {
        toast.push("A sell limit must be above the current bid.", "error");
        return;
      }
      if (orderType === "stop" && side === "buy" && price <= quote.ask) {
        toast.push("A buy stop must be above the current ask.", "error");
        return;
      }
      if (orderType === "stop" && side === "sell" && price >= quote.bid) {
        toast.push("A sell stop must be below the current bid.", "error");
        return;
      }
    }

    const fingerprint = JSON.stringify({ symbol, side, orderType, lotsNumber, slNumber, tpNumber, price, expiry });
    const clientOrderId =
      requestRef.current?.fingerprint === fingerprint ? requestRef.current.clientOrderId : newClientOrderId();
    requestRef.current = { fingerprint, clientOrderId };

    const base = { symbol, side, lots: lotsNumber, sl: slNumber, tp: tpNumber, clientOrderId };
    setBusy(true);
    try {
      let result: { message: string };
      if (orderType === "market") {
        result = await post<{ message: string }>("/api/trade/market", base);
      } else {
        result = await post<{ message: string }>("/api/trade/pending", {
          ...base,
          type: orderType,
          price,
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
        });
      }
      requestRef.current = null;
      toast.push(result.message, "success");
      setTrigger("");
      setSl("");
      setTp("");
      setExpiry("");
      await onPlaced();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  const disabled = account.status !== "active" || busy || meta?.tradingStatus !== "open";
  const quickSizes = Array.from(new Set([minLots, 0.1, 0.25, 0.5, 1]))
    .filter((value) => value >= minLots && value <= maxLots)
    .sort((a, b) => a - b);

  return (
    <aside className="card flex flex-col overflow-hidden">
      <div className="grid grid-cols-2 gap-1 border-b border-white/[0.06] p-1.5">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={clsx(
            "rounded-lg py-2.5 text-[12px] font-semibold transition",
            side === "buy" ? "bg-acid text-ink-950" : "text-fog hover:bg-white/[0.04] hover:text-snow",
          )}
        >
          Buy {quote ? formatPrice(symbol, quote.ask) : ""}
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={clsx(
            "rounded-lg py-2.5 text-[12px] font-semibold transition",
            side === "sell" ? "bg-rose text-ink-950" : "text-fog hover:bg-white/[0.04] hover:text-snow",
          )}
        >
          Sell {quote ? formatPrice(symbol, quote.bid) : ""}
        </button>
      </div>

      <div className="space-y-3.5 p-3.5">
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
          {(["market", "limit", "stop"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              className={clsx(
                "rounded-md py-1.5 text-[10.5px] font-medium capitalize transition",
                orderType === type ? "bg-white/[0.08] text-snow" : "text-fog hover:text-snow",
              )}
            >
              {type === "stop" ? "Stop" : type}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="volume">
              Volume (lots)
            </label>
            <span className="font-mono text-[10px] text-fog">
              {meta ? `${minLots}–${maxLots}` : "—"} · 1 lot = {meta?.contractSize.toLocaleString("en-US") ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => bumpLots(-lotStep)}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-fog hover:text-snow"
              aria-label="Decrease volume"
            >
              <Minus className="size-3.5" />
            </button>
            <input
              id="volume"
              type="number"
              min={minLots}
              max={maxLots}
              step={lotStep}
              value={lots}
              onChange={(event) => setLots(event.target.value)}
              className="input h-9 text-center font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => bumpLots(lotStep)}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-fog hover:text-snow"
              aria-label="Increase volume"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex gap-1">
            {quickSizes.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLots(value.toFixed(2))}
                className={clsx(
                  "flex-1 rounded-md border py-1 font-mono text-[9.5px] transition",
                  lotsNumber === value
                    ? "border-acid/30 bg-acid/10 text-acid"
                    : "border-white/[0.07] text-fog hover:border-white/20 hover:text-snow",
                )}
              >
                {value.toFixed(2)}
              </button>
            ))}
          </div>
        </div>

        {orderType !== "market" ? (
          <div>
            <label className="label" htmlFor="trigger">
              Trigger price
            </label>
            <input
              id="trigger"
              type="number"
              step="any"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
              placeholder={quote ? (side === "buy" ? formatPrice(symbol, quote.ask) : formatPrice(symbol, quote.bid)) : ""}
              className="input h-9 font-mono text-[12px]"
            />
            <p className="mt-1 text-[9.5px] leading-relaxed text-white/35">
              {orderType === "limit"
                ? side === "buy"
                  ? "Buy limit fills below the current ask."
                  : "Sell limit fills above the current bid."
                : side === "buy"
                  ? "Buy stop fills above the current ask."
                  : "Sell stop fills below the current bid."}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="sl">
              Stop loss
            </label>
            <input
              id="sl"
              type="number"
              step="any"
              value={sl}
              onChange={(event) => setSl(event.target.value)}
              placeholder="Optional"
              className="input h-9 font-mono text-[11.5px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="tp">
              Take profit
            </label>
            <input
              id="tp"
              type="number"
              step="any"
              value={tp}
              onChange={(event) => setTp(event.target.value)}
              placeholder="Optional"
              className="input h-9 font-mono text-[11.5px]"
            />
          </div>
        </div>

        {orderType !== "market" ? (
          <div>
            <label className="label" htmlFor="expiry">
              Expiry
            </label>
            <input
              id="expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className="input h-9 font-mono text-[11px]"
            />
            <p className="mt-1 text-[9.5px] text-white/35">Leave blank for good-till-cancelled.</p>
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-black/20 p-2.5 text-[10.5px]">
          <div className="flex justify-between text-fog">
            <span>Estimated margin</span>
            <span className="font-mono text-snow">{fmtUsd(marginUsd)}</span>
          </div>
          <div className="flex justify-between text-fog">
            <span>Estimated commission</span>
            <span className="font-mono text-snow">{fmtUsd(commissionUsd)}</span>
          </div>
          <div className="flex justify-between text-fog">
            <span>Risk : reward</span>
            <span className="font-mono text-snow">{riskReward != null ? `1 : ${riskReward}` : "—"}</span>
          </div>
          <div className="flex justify-between text-fog">
            <span>Available margin</span>
            <span className="font-mono text-snow">{fmtUsd(account.freeMargin)}</span>
          </div>
          <div className="flex justify-between text-fog">
            <span>Stop out level</span>
            <span className="font-mono text-snow">50%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className={clsx(
            "btn w-full py-3 text-[13px] font-semibold",
            side === "buy" ? "btn-primary" : "bg-rose text-ink-950 hover:bg-[#ff8f8f]",
          )}
        >
          {busy
            ? "Submitting…"
            : `${side === "buy" ? "Buy" : "Sell"} ${validLots ? lotsNumber.toFixed(2) : "—"} ${symbol}${orderType !== "market" ? ` · ${orderType}` : ""}`}
        </button>

        {hasPosition ? (
          <p className="flex items-center justify-center gap-1.5 text-[10px] text-acid">
            <Check className="size-3" /> You hold an open {symbol} position
          </p>
        ) : null}
        <p className="flex items-start gap-1.5 text-[9.5px] leading-relaxed text-white/35">
          <ShieldCheck className="mt-0.5 size-3 shrink-0 text-gold" />
          Simulated execution on the Anerith internal engine. No real capital or live broker order is involved.
        </p>
      </div>
    </aside>
  );
}
