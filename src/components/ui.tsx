import { clsx } from "clsx";

export function Progress({
  value,
  tone = "acid",
  className,
}: {
  value: number;
  tone?: "acid" | "gold" | "rose" | "sky";
  className?: string;
}) {
  const toneClass =
    tone === "rose" ? "bg-rose" : tone === "gold" ? "bg-gold" : tone === "sky" ? "bg-sky" : "bg-acid";
  return (
    <div className={clsx("meter", className)}>
      <div className={clsx("h-full rounded-full transition-[width] duration-500", toneClass)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-4 flex items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-snow">{title}</h2>
        {hint ? <p className="mt-0.5 text-[11.5px] text-fog">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 grid size-11 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-fog">{icon}</div> : null}
      <p className="text-sm font-medium text-snow">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-fog">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} />;
}

export function StatBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "acid" | "rose" | "gold" | "sky" | "muted";
}) {
  const toneClass =
    tone === "acid"
      ? "text-acid"
      : tone === "rose"
        ? "text-rose"
        : tone === "gold"
          ? "text-gold"
          : tone === "sky"
            ? "text-sky"
            : tone === "muted"
              ? "text-fog"
              : "text-snow";
  return (
    <div>
      <p className="text-[10px] font-medium tracking-[0.1em] text-fog uppercase">{label}</p>
      <p className={clsx("mt-1 font-mono text-[19px] font-medium tracking-tight tabular-nums", toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10.5px] text-fog">{hint}</p> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "acid" | "gold" | "sky" | "rose" | "muted";
  className?: string;
}) {
  return <span className={clsx("badge", `badge-${tone}`, className)}>{children}</span>;
}
