"use client";

import { Moon, Sun } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setMode } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className={clsx(
        "rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-fog transition hover:border-white/20 hover:text-snow",
        className,
      )}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
