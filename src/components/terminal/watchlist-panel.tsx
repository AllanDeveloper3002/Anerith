"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Star, X } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, put } from "@/lib/client";
import { formatPrice, WATCH_GROUP_LABELS, watchGroupFor, type WatchGroup } from "@/lib/instruments";
import type { Quote } from "@/lib/market";
import type { InstrumentMeta } from "@/components/terminal/order-ticket";

const GROUP_ORDER: WatchGroup[] = [
  "forex-majors",
  "forex-minors",
  "forex-exotics",
  "metals",
  "indices",
  "crypto",
  "energy",
];

interface WatchlistResponse {
  symbols: string[];
  favourites: string[];
  updatedAt: string | null;
}

export function WatchlistPanel({
  instruments,
  quotes,
  symbol,
  onSelect,
  className,
}: {
  instruments: InstrumentMeta[];
  quotes: Quote[];
  symbol: string;
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<WatchGroup | "all" | "favourites">("all");
  const [symbols, setSymbols] = useState<string[]>(instruments.map((item) => item.symbol));
  const [favourites, setFavourites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<WatchlistResponse>("/api/watchlist")
      .then((data) => {
        if (cancelled) return;
        setSymbols(data.symbols);
        setFavourites(data.favourites);
      })
      .catch(() => {
        /* fall back to the full instrument list */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(nextSymbols: string[], nextFavourites: string[]) {
    setSymbols(nextSymbols);
    setFavourites(nextFavourites);
    try {
      await put("/api/watchlist", { symbols: nextSymbols, favourites: nextFavourites });
    } catch (error) {
      toast.push(errorMessage(error), "error");
    }
  }

  function toggleFavourite(target: string) {
    const next = favourites.includes(target)
      ? favourites.filter((item) => item !== target)
      : [...favourites, target];
    void persist(symbols, next);
  }

  function removeSymbol(target: string) {
    void persist(
      symbols.filter((item) => item !== target),
      favourites.filter((item) => item !== target),
    );
  }

  function move(target: string, direction: -1 | 1) {
    const index = symbols.indexOf(target);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= symbols.length) return;
    const next = [...symbols];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    void persist(next, favourites);
  }

  function addSymbol(target: string) {
    if (!symbols.includes(target)) void persist([...symbols, target], favourites);
    setAddOpen(false);
    setAddSearch("");
    onSelect(target);
  }

  const instrumentBySymbol = useMemo(
    () => new Map(instruments.map((item) => [item.symbol, item])),
    [instruments],
  );
  const quoteBySymbol = useMemo(() => new Map(quotes.map((item) => [item.symbol, item])), [quotes]);

  const favouritesSet = new Set(favourites);
  const searchText = search.trim().toLowerCase();
  const rows = symbols
    .map((item) => instrumentBySymbol.get(item))
    .filter((item): item is InstrumentMeta => Boolean(item))
    .filter((item) => (group === "all" ? true : group === "favourites" ? favouritesSet.has(item.symbol) : watchGroupFor(item.symbol) === group))
    .filter(
      (item) =>
        !searchText ||
        item.symbol.toLowerCase().includes(searchText) ||
        item.name.toLowerCase().includes(searchText),
    );

  const addCandidates = instruments
    .filter((item) => !symbols.includes(item.symbol))
    .filter(
      (item) =>
        !addSearch.trim() ||
        item.symbol.toLowerCase().includes(addSearch.trim().toLowerCase()) ||
        item.name.toLowerCase().includes(addSearch.trim().toLowerCase()),
    )
    .slice(0, 8);

  const selectedMeta = instrumentBySymbol.get(symbol);
  const selectedQuote = quoteBySymbol.get(symbol);

  const groupsWithItems = GROUP_ORDER.filter((item) =>
    symbols.some((entry) => watchGroupFor(entry) === item),
  );

  return (
    <aside className={clsx("card flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="border-b border-white/[0.06] p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fog" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search markets"
              className="input h-8 py-0 pl-8 text-[12px]"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddOpen((value) => !value)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-fog transition hover:text-snow"
            title="Add instrument to watchlist"
            aria-label="Add instrument to watchlist"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {addOpen ? (
          <div className="mt-2 rounded-lg border border-white/[0.08] bg-black/25 p-2">
            <input
              value={addSearch}
              onChange={(event) => setAddSearch(event.target.value)}
              placeholder="Find an instrument to add"
              className="input h-7 py-0 text-[11px]"
              autoFocus
            />
            <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
              {addCandidates.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => addSymbol(item.symbol)}
                  className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[10.5px] text-fog hover:bg-white/[0.06] hover:text-snow"
                >
                  <span className="font-mono">{item.symbol}</span>
                  <span className="truncate pl-2 text-[9.5px] text-white/35">{item.name}</span>
                </button>
              ))}
              {addCandidates.length === 0 ? <p className="px-1.5 py-1 text-[10px] text-white/30">Nothing to add.</p> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setGroup("all")}
            className={clsx(
              "rounded-md px-2 py-1 text-[10px] font-medium transition",
              group === "all" ? "bg-acid/15 text-acid" : "text-fog hover:bg-white/[0.05] hover:text-snow",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setGroup("favourites")}
            className={clsx(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition",
              group === "favourites" ? "bg-gold/15 text-gold" : "text-fog hover:bg-white/[0.05] hover:text-snow",
            )}
          >
            <Star className="size-2.5" /> Favourites
          </button>
          {groupsWithItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setGroup(item)}
              className={clsx(
                "rounded-md px-2 py-1 text-[10px] font-medium transition",
                group === item ? "bg-white/10 text-snow" : "text-fog hover:bg-white/[0.05] hover:text-snow",
              )}
            >
              {WATCH_GROUP_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-8 text-center text-[10.5px] text-fog">Loading watchlist…</p>
        ) : null}
        {!loading && rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[10.5px] text-fog">
            No instruments in this group. Use + to add one.
          </p>
        ) : null}
        {rows.map((item) => {
          const itemQuote = quoteBySymbol.get(item.symbol);
          const active = item.symbol === symbol;
          const favourite = favouritesSet.has(item.symbol);
          return (
            <div
              key={item.symbol}
              className={clsx(
                "group flex items-center gap-1 border-b border-white/[0.04] py-2 pr-1.5 pl-2.5 transition last:border-0",
                active ? "bg-acid/[0.06]" : "hover:bg-white/[0.03]",
              )}
            >
              <button
                type="button"
                onClick={() => toggleFavourite(item.symbol)}
                className={clsx(
                  "shrink-0 rounded p-0.5 transition",
                  favourite ? "text-gold" : "text-white/15 hover:text-gold/70",
                )}
                aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
              >
                <Star className={clsx("size-3", favourite && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={() => onSelect(item.symbol)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className={clsx("font-mono text-[11.5px]", active ? "text-acid" : "text-snow")}>{item.symbol}</p>
                  <p className="truncate text-[9.5px] text-fog">
                    {item.tradingStatus === "open" ? item.name : `${item.name} · ${item.tradingStatus}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[10.5px] text-snow">
                    {itemQuote ? formatPrice(item.symbol, itemQuote.bid) : "—"}
                  </p>
                  <p className="font-mono text-[9px] text-fog">
                    {itemQuote ? `${(itemQuote.spread / (item.pipSize || 0.0001)).toFixed(1)}p` : "—"}
                  </p>
                </div>
                <p
                  className={clsx(
                    "w-12 shrink-0 text-right font-mono text-[9.5px]",
                    (itemQuote?.changePct ?? 0) >= 0 ? "text-acid" : "text-rose",
                  )}
                >
                  {itemQuote ? `${itemQuote.changePct >= 0 ? "+" : ""}${itemQuote.changePct.toFixed(2)}%` : "—"}
                </p>
              </button>
              <span className="flex shrink-0 flex-col opacity-0 transition group-hover:opacity-100">
                <button type="button" onClick={() => move(item.symbol, -1)} className="rounded p-0.5 text-white/30 hover:text-snow" aria-label="Move up">
                  <ArrowUp className="size-2.5" />
                </button>
                <button type="button" onClick={() => move(item.symbol, 1)} className="rounded p-0.5 text-white/30 hover:text-snow" aria-label="Move down">
                  <ArrowDown className="size-2.5" />
                </button>
              </span>
              <button
                type="button"
                onClick={() => removeSymbol(item.symbol)}
                className="shrink-0 rounded p-0.5 text-white/15 opacity-0 transition group-hover:opacity-100 hover:text-rose"
                aria-label="Remove from watchlist"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      {selectedMeta ? (
        <div className="border-t border-white/[0.06] p-2.5">
          <button
            type="button"
            onClick={() => setSpecsOpen((value) => !value)}
            className="flex w-full items-center justify-between text-[10px] font-medium text-fog hover:text-snow"
          >
            <span>
              {selectedMeta.symbol} specs · {selectedMeta.session} · {selectedMeta.tradingStatus}
            </span>
            <span className="font-mono text-[9px] text-white/35">
              {selectedQuote ? `${selectedQuote.bid.toFixed(selectedMeta.precision)} / ${selectedQuote.ask.toFixed(selectedMeta.precision)}` : "—"}
            </span>
          </button>
          {specsOpen ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9.5px]">
              <div className="flex justify-between text-fog">
                <dt>Lots</dt>
                <dd className="font-mono text-snow">{selectedMeta.minLots}–{selectedMeta.maxLots}</dd>
              </div>
              <div className="flex justify-between text-fog">
                <dt>Step</dt>
                <dd className="font-mono text-snow">{selectedMeta.lotStep}</dd>
              </div>
              <div className="flex justify-between text-fog">
                <dt>Contract</dt>
                <dd className="font-mono text-snow">{selectedMeta.contractSize.toLocaleString("en-US")}</dd>
              </div>
              <div className="flex justify-between text-fog">
                <dt>Max leverage</dt>
                <dd className="font-mono text-snow">1:{selectedMeta.maxLeverage}</dd>
              </div>
              <div className="flex justify-between text-fog">
                <dt>Spread</dt>
                <dd className="font-mono text-snow">{selectedMeta.spreads.standard}p</dd>
              </div>
              <div className="flex justify-between text-fog">
                <dt>Commission</dt>
                <dd className="font-mono text-snow">${selectedMeta.commissions.standard}/lot</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
