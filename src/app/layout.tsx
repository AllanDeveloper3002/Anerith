import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { BRAND } from "@/lib/brand";

const themeBoot = `(function(){try{var m=localStorage.getItem('anerith-theme')||'system';var t=m==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):m;if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Anerith is a proprietary trading firm for disciplined traders: evaluations, funded accounts up to $200,000, 80–90% profit splits, fast payouts and a professional multi-asset terminal.",
  applicationName: BRAND.fullName,
  keywords: ["proprietary trading", "prop firm", "funded account", "trading challenge", "Anerith"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060809" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7f1" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
