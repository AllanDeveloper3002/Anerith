import { clsx } from "clsx";

export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={clsx("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="anerith-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d7ff71" />
          <stop offset="1" stopColor="#8fd341" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0a0d0e" />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#c9f75c" strokeOpacity=".28" />
      <path
        d="M17 46 L32 16 L47 46"
        fill="none"
        stroke="url(#anerith-mark)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 36 H40" stroke="url(#anerith-mark)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({
  className,
  size = 30,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[0.18em] text-snow">ANERITH</span>
          <span className="mt-1 text-[8px] font-medium tracking-[0.26em] text-fog uppercase">
            Capital
          </span>
        </span>
      ) : null}
    </span>
  );
}
