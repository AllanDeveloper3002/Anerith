"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Save, ServerCog, ShieldAlert, Zap } from "lucide-react";
import { clsx } from "clsx";
import { EmptyState, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, post } from "@/lib/client";
import type { Plan } from "@/lib/instruments";

interface EngineSettings {
  id: string;
  provider: string;
  market_data_provider: string;
  policy: "instant" | "reject_on_gap";
  slippage_pips: number;
  max_quote_age_ms: number;
  max_gap_pips: number;
  swap_enabled: number;
  updated_by: string | null;
  updated_at: string;
}

interface EngineInstrument {
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
  enabled: boolean;
  swapLong: number;
  swapShort: number;
  spreads: Record<Plan, number>;
  commissions: Record<Plan, number>;
}

interface EngineView {
  settings: EngineSettings;
  instruments: EngineInstrument[];
  executionProviders: { id: string; simulated: boolean }[];
  marketDataProviders: { id: string; simulated: boolean }[];
  marketDataStatus: { id: string; simulated: boolean; configured: boolean };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium tracking-wider text-fog uppercase">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[9.5px] leading-relaxed text-white/35">{hint}</p> : null}
    </label>
  );
}

function num(value: string): number {
  if (value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PLANS: Plan[] = ["standard", "raw", "zero"];

export function EngineAdminClient() {
  const toast = useToast();
  const [view, setView] = useState<EngineView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingInstrument, setSavingInstrument] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<EngineSettings | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<EngineView>("/api/admin/engine");
      setView(data);
      setSettings(data.settings);
      setSelected((current) => current ?? data.instruments[0]?.symbol ?? null);
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const instrument = useMemo(
    () => view?.instruments.find((item) => item.symbol === selected) ?? null,
    [view, selected],
  );
  const [draft, setDraft] = useState<EngineInstrument | null>(null);
  useEffect(() => {
    setDraft(instrument ? { ...instrument, spreads: { ...instrument.spreads }, commissions: { ...instrument.commissions } } : null);
  }, [instrument]);

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const data = await post<EngineView>("/api/admin/engine", {
        action: "settings.save",
        settings: {
          provider: settings.provider,
          marketDataProvider: settings.market_data_provider,
          policy: settings.policy,
          slippagePips: settings.slippage_pips,
          maxQuoteAgeMs: settings.max_quote_age_ms,
          maxGapPips: settings.max_gap_pips,
          swapEnabled: settings.swap_enabled === 1,
        },
      });
      setView(data);
      setSettings(data.settings);
      toast.push("Engine settings saved and audited.", "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveInstrument() {
    if (!draft) return;
    setSavingInstrument(true);
    try {
      const data = await post<EngineView>("/api/admin/engine", {
        action: "instrument.save",
        instrument: {
          symbol: draft.symbol,
          enabled: draft.enabled,
          tradingStatus: draft.tradingStatus,
          minLots: draft.minLots,
          maxLots: draft.maxLots,
          lotStep: draft.lotStep,
          contractSize: draft.contractSize,
          tickSize: draft.tickSize,
          pipSize: draft.pipSize,
          precision: draft.precision,
          maxLeverage: draft.maxLeverage,
          spreads: draft.spreads,
          commissions: draft.commissions,
          swapLong: draft.swapLong,
          swapShort: draft.swapShort,
          session: draft.session,
          baseCurrency: draft.baseCurrency,
          quoteCurrency: draft.quoteCurrency,
        },
      });
      setView(data);
      toast.push(`${draft.symbol} specification saved and audited.`, "success");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setSavingInstrument(false);
    }
  }

  if (loading && !view) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <RefreshCw className="size-3.5 animate-spin" /> Loading engine configuration
        </div>
      </div>
    );
  }

  if (!view || !settings) {
    return (
      <EmptyState
        icon={<ServerCog className="size-5" />}
        title="Engine configuration unavailable"
        body="Reload the page or check the server log for engine settings errors."
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <SectionHeader
          title="Execution & market data"
          hint="Server-side execution rules. Every save is written to the admin audit log."
          action={
            <button type="button" onClick={saveSettings} disabled={savingSettings} className="btn btn-primary btn-sm">
              {savingSettings ? <RefreshCw className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save
            </button>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Execution provider" hint="Only providers implemented on the server can be selected.">
            <select
              className="input"
              value={settings.provider}
              onChange={(event) => setSettings({ ...settings, provider: event.target.value })}
            >
              {view.executionProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id} {provider.simulated ? "(simulated)" : "(live)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price feed (admin only)" hint="Live quotes are fetched server-side; credentials never reach the browser.">
            <select
              className="input"
              value={settings.market_data_provider}
              onChange={(event) => setSettings({ ...settings, market_data_provider: event.target.value })}
            >
              {view.marketDataProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id} {provider.simulated ? "(simulated)" : "(live)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pending order gap policy">
            <select
              className="input"
              value={settings.policy}
              onChange={(event) =>
                setSettings({ ...settings, policy: event.target.value as EngineSettings["policy"] })
              }
            >
              <option value="instant">instant</option>
              <option value="reject_on_gap">reject_on_gap</option>
            </select>
          </Field>
          <Field label="Slippage (pips)">
            <input
              className="input"
              type="number"
              min={0}
              step="0.1"
              value={settings.slippage_pips}
              onChange={(event) => setSettings({ ...settings, slippage_pips: num(event.target.value) })}
            />
          </Field>
          <Field label="Max quote age (ms)">
            <input
              className="input"
              type="number"
              min={500}
              max={120000}
              step="100"
              value={settings.max_quote_age_ms}
              onChange={(event) => setSettings({ ...settings, max_quote_age_ms: num(event.target.value) })}
            />
          </Field>
          <Field label="Max stop gap (pips)" hint="Stops that gap beyond this are rejected when the gap policy is active.">
            <input
              className="input"
              type="number"
              min={0}
              step="1"
              value={settings.max_gap_pips}
              onChange={(event) => setSettings({ ...settings, max_gap_pips: num(event.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px]">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <input
              type="checkbox"
              checked={settings.swap_enabled === 1}
              onChange={(event) =>
                setSettings({ ...settings, swap_enabled: event.target.checked ? 1 : 0 })
              }
              className="size-3.5 accent-[var(--color-acid)]"
            />
            <span className="text-snow">Swap financing enabled</span>
          </label>
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-1",
              view.marketDataStatus.configured ? "badge-acid" : "badge-gold",
            )}
          >
            {view.marketDataStatus.simulated ? <Zap className="size-3" /> : <ShieldAlert className="size-3" />}
            {view.marketDataStatus.id}
            {view.marketDataStatus.configured ? " · configured" : " · missing server credentials"}
          </span>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <SectionHeader title="Instrument specifications" hint="Spreads, commissions, leverage and volume limits per instrument." />
          {draft ? (
            <button type="button" onClick={saveInstrument} disabled={savingInstrument} className="btn btn-primary btn-sm">
              {savingInstrument ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save {draft.symbol}
            </button>
          ) : null}
        </div>
        <div className="grid lg:grid-cols-[260px_1fr]">
          <div className="max-h-[560px] overflow-y-auto border-b border-white/[0.06] lg:border-r lg:border-b-0">
            {view.instruments.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSelected(item.symbol)}
                className={clsx(
                  "flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] transition",
                  item.symbol === selected ? "bg-acid/10 text-snow" : "text-white/55 hover:bg-white/[0.03]",
                )}
              >
                <span>
                  <span className="font-mono">{item.symbol}</span>
                  <span className="ml-2 text-[9.5px] text-white/35">{item.short}</span>
                </span>
                <span
                  className={clsx(
                    "size-1.5 rounded-full",
                    !item.enabled
                      ? "bg-white/20"
                      : item.tradingStatus === "open"
                        ? "bg-acid"
                        : item.tradingStatus === "halted"
                          ? "bg-rose-400"
                          : "bg-amber-400",
                  )}
                />
              </button>
            ))}
          </div>

          {draft ? (
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Trading status">
                  <select
                    className="input"
                    value={draft.tradingStatus}
                    onChange={(event) =>
                      setDraft({ ...draft, tradingStatus: event.target.value as EngineInstrument["tradingStatus"] })
                    }
                  >
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                    <option value="halted">halted</option>
                  </select>
                </Field>
                <Field label="Enabled">
                  <select
                    className="input"
                    value={draft.enabled ? "yes" : "no"}
                    onChange={(event) => setDraft({ ...draft, enabled: event.target.value === "yes" })}
                  >
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </Field>
                <Field label="Session">
                  <input
                    className="input"
                    value={draft.session}
                    onChange={(event) => setDraft({ ...draft, session: event.target.value })}
                  />
                </Field>
                <Field label="Min lots">
                  <input className="input" type="number" step="0.01" value={draft.minLots} onChange={(event) => setDraft({ ...draft, minLots: num(event.target.value) })} />
                </Field>
                <Field label="Max lots">
                  <input className="input" type="number" step="0.01" value={draft.maxLots} onChange={(event) => setDraft({ ...draft, maxLots: num(event.target.value) })} />
                </Field>
                <Field label="Lot step">
                  <input className="input" type="number" step="0.01" value={draft.lotStep} onChange={(event) => setDraft({ ...draft, lotStep: num(event.target.value) })} />
                </Field>
                <Field label="Max leverage">
                  <input className="input" type="number" step="1" value={draft.maxLeverage} onChange={(event) => setDraft({ ...draft, maxLeverage: num(event.target.value) })} />
                </Field>
                <Field label="Contract size">
                  <input className="input" type="number" step="1" value={draft.contractSize} onChange={(event) => setDraft({ ...draft, contractSize: num(event.target.value) })} />
                </Field>
                <Field label="Pip size">
                  <input className="input" type="number" step="0.00001" value={draft.pipSize} onChange={(event) => setDraft({ ...draft, pipSize: num(event.target.value) })} />
                </Field>
                <Field label="Tick size">
                  <input className="input" type="number" step="0.00001" value={draft.tickSize} onChange={(event) => setDraft({ ...draft, tickSize: num(event.target.value) })} />
                </Field>
                <Field label="Precision">
                  <input className="input" type="number" step="1" min={0} max={8} value={draft.precision} onChange={(event) => setDraft({ ...draft, precision: num(event.target.value) })} />
                </Field>
                <Field label="Quote currency">
                  <input className="input" maxLength={3} value={draft.quoteCurrency} onChange={(event) => setDraft({ ...draft, quoteCurrency: event.target.value.toUpperCase() })} />
                </Field>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-[9.5px] tracking-wider text-white/35 uppercase">
                    <tr>
                      <th className="py-2 pr-3">Plan</th>
                      <th className="py-2 pr-3">Spread (pips)</th>
                      <th className="py-2 pr-3">Commission (USD / lot)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLANS.map((plan) => (
                      <tr key={plan} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-3 text-white/60">{plan}</td>
                        <td className="py-2 pr-3">
                          <input
                            className="input"
                            type="number"
                            step="0.1"
                            value={draft.spreads[plan]}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                spreads: { ...draft.spreads, [plan]: num(event.target.value) },
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            value={draft.commissions[plan]}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                commissions: { ...draft.commissions, [plan]: num(event.target.value) },
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[9.5px] leading-relaxed text-white/35">
                Prices and fills come from the configured market data and execution providers. Internally simulated
                execution is always labelled as simulated in the terminal.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
