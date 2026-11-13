import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <Link href="/" className="w-fit">
        <Logo />
      </Link>
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] tracking-[0.24em] text-acid uppercase">Error 404</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            This desk does not exist
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-fog">
            The page you were looking for has moved, closed, or never opened. Head back to the
            terminal or return to the homepage.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/app" className="btn btn-primary gap-2">
              <Compass className="size-4" />
              Open the desk
            </Link>
            <Link href="/" className="btn btn-secondary gap-2">
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
