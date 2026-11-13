"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  LifeBuoy,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { api, errorMessage, post } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, SectionHeader } from "@/components/ui";
import type { SupportTicketDTO } from "@/lib/support";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & challenges" },
  { value: "payout", label: "Payouts" },
  { value: "technical", label: "Technical / charting" },
  { value: "verification", label: "Identity verification" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const FAQ = [
  {
    q: "How does execution work on ANERITH?",
    a: "Orders are filled by our proprietary internal simulation engine using the current quotes from our market data feed. Every fill is stored as an execution record with the price, size and timestamp used. ANERITH does not route orders to an exchange or interbank venue, and execution results are not presented as external exchange fills.",
  },
  {
    q: "What happens if the price feed is unavailable?",
    a: "Trading fails closed. If the feed is stale or unavailable, new orders are rejected with a clear message instead of being filled at an invented price. Open positions, chart history and execution records are never filled in with synthetic prices.",
  },
  {
    q: "Where do charts and drawings come from?",
    a: "Candles and quotes come from ANERITH's market data feed. Chart history is internally simulated where labeled, and the terminal always shows which feed is active. Drawings, layouts and indicator templates are saved to your account and private to you.",
  },
  {
    q: "Why can't I edit my trade details in the journal?",
    a: "The journal links automatically to your closed positions. Entry, exit, size, stop, target and realised P&L are read-only execution facts so the record stays trustworthy. You can add notes, reasons, emotions, lessons, strategies, tags and screenshots alongside those facts.",
  },
  {
    q: "When can I request a payout?",
    a: "Payouts are available on funded accounts once profit meets the minimum threshold shown on the Rewards & payouts page. Evaluation accounts must first meet the profit target and minimum trading days. Payout review times depend on the verification status of your account.",
  },
  {
    q: "Why was a trade rejected or an account breached?",
    a: "The risk engine checks every order against the limits of your challenge, including daily loss, maximum or trailing drawdown, position sizing and trading hours. Rejections include the specific rule that triggered them, and enforcement actions are recorded under Rule violations.",
  },
];

const STATUS_TONE: Record<string, string> = {
  open: "badge-gold",
  pending: "badge-sky",
  answered: "badge-sky",
  resolved: "badge-acid",
  closed: "badge-muted",
};

function FaqItem({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <CircleHelp className="size-4 shrink-0 text-fog" />
        <span className="flex-1 text-[12.5px] font-medium text-snow">{item.q}</span>
        <ChevronDown
          className={clsx("size-4 shrink-0 text-fog transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <p className="px-4 pb-4 pl-11 text-[12px] leading-relaxed text-fog">{item.a}</p>
      ) : null}
    </div>
  );
}

export function SupportClient({
  initialTickets,
  email,
}: {
  initialTickets: SupportTicketDTO[];
  email: string;
}) {
  const toast = useToast();
  const [tickets, setTickets] = useState(initialTickets);
  const [category, setCategory] = useState<Category>("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await post<{ ticket: SupportTicketDTO }>("/api/support", {
        category,
        subject,
        body,
      });
      setTickets((current) => [data.ticket, ...current]);
      setSubject("");
      setBody("");
      setCategory("general");
      toast.push("Ticket sent. Our team will review it in the order received.");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  const openCount = tickets.filter((ticket) => ticket.status === "open").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Help & support</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-snow lg:text-[30px]">
            Answers first, humans when you need one.
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fog">
            Check the common questions below. If your issue needs review, open a ticket and keep the
            reference number for follow-up.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
          <LifeBuoy className="size-4 text-acid" />
          <span className="text-[11.5px] text-fog">
            {openCount} open ticket{openCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <BookOpen className="size-4 text-sky" />
              <p className="text-[12px] font-medium text-snow">Common questions</p>
            </div>
            {FAQ.map((item) => (
              <FaqItem key={item.q} item={item} />
            ))}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <ShieldCheck className="size-4 text-acid" />
              <p className="mt-2 text-[12.5px] font-medium text-snow">Execution & data are labeled</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fog">
                Internal simulated fills and the active price feed are always identified. We never
                present simulated results as exchange executions.
              </p>
            </div>
            <div className="card p-4">
              <CheckCircle2 className="size-4 text-gold" />
              <p className="mt-2 text-[12.5px] font-medium text-snow">What to include in a ticket</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fog">
                Account number, instrument, timeframe, the exact time (UTC) and any rule message.
                For chart issues, mention the layout and drawing tool you were using.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <MessageSquare className="size-4 text-acid" />
              <p className="text-[12px] font-medium text-snow">Open a support ticket</p>
            </div>
            <form onSubmit={submit} className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-fog">Category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Category)}
                  className="field w-full"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-fog">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={140}
                  minLength={4}
                  required
                  placeholder="Short summary of the issue"
                  className="field w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-fog">Details</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4000}
                  minLength={10}
                  required
                  rows={6}
                  placeholder="What happened, what you expected, and any reference number or time."
                  className="field w-full resize-y"
                />
                <span className="mt-1 block text-right text-[10px] text-white/30">{body.length}/4000</span>
              </label>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10.5px] text-fog">
                  Replies go to <span className="text-snow">{email}</span>
                </p>
                <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
                  <Send className="size-3.5" /> {busy ? "Sending…" : "Send ticket"}
                </button>
              </div>
            </form>
          </section>

          <section className="card overflow-hidden">
            <div className="px-4 pt-4">
              <SectionHeader
                title="Your tickets"
                hint="Reference numbers and current status."
                className="mb-2"
              />
            </div>
            {tickets.length === 0 ? (
              <EmptyState
                icon={<LifeBuoy className="size-5" />}
                title="No tickets yet"
                body="When you contact support, your tickets and their status appear here."
              />
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={clsx("badge", STATUS_TONE[ticket.status] ?? "badge-muted")}>
                        {ticket.status.replace(/-/g, " ")}
                      </span>
                      <span className="font-mono text-[10px] text-white/35">
                        {ticket.id.slice(0, 8)}
                      </span>
                      <span className="ml-auto text-[10px] text-fog">
                        {fmtDateTime(ticket.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] font-medium text-snow">{ticket.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-fog">
                      {ticket.body}
                    </p>
                    <p className="mt-1 text-[10px] text-white/30">
                      {CATEGORIES.find((item) => item.value === ticket.category)?.label ??
                        ticket.category}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="px-1 text-[10.5px] leading-relaxed text-white/30">
            ANERITH support handles platform, account and payout questions. We do not provide
            investment advice or manage positions on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
