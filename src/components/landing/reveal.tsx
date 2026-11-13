"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { clsx } from "clsx";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  scale?: boolean;
  style?: CSSProperties;
}

export function Reveal({ children, className, delay = 0, scale = false, style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.visible = "true";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={clsx(scale ? "reveal-scale" : "reveal", className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}
