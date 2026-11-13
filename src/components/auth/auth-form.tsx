"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/toast-provider";
import { errorMessage, post } from "@/lib/client";

const COUNTRIES = [
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "New Zealand",
  "Ireland",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Portugal",
  "Poland",
  "Czechia",
  "United Arab Emirates",
  "Saudi Arabia",
  "South Africa",
  "Nigeria",
  "Kenya",
  "India",
  "Pakistan",
  "Bangladesh",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Turkey",
  "Egypt",
];

const DEMO = { email: "demo@anerith.local", password: "Demo!2345" };

function passwordScore(value: string): number {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return score;
}

const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["bg-rose", "bg-rose", "bg-gold", "bg-sky", "bg-acid"];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { push } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => passwordScore(password), [password]);
  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isRegister) {
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      if (!acceptTerms) {
        setError("Please accept the terms to continue.");
        return;
      }
    }

    setPending(true);
    try {
      const data = await post<{ redirect?: string }>(
        isRegister ? "/api/auth/register" : "/api/auth/login",
        isRegister
          ? {
              fullName: fullName.trim(),
              email: email.trim(),
              password,
              country: country || undefined,
              acceptTerms: true,
            }
          : { email: email.trim(), password },
      );
      push(isRegister ? "Workspace created. Opening your trial desk…" : "Signed in. Loading your desk…", "success");
      window.location.assign(data.redirect ?? "/app");
    } catch (submitError) {
      setError(errorMessage(submitError));
      setPending(false);
    }
  }

  function fillDemo() {
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose/25 bg-rose/[0.08] px-3.5 py-3 text-[12.5px] leading-relaxed text-rose"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isRegister ? (
        <div>
          <label htmlFor="fullName" className="label">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            autoComplete="name"
            className="input"
            placeholder="Jordan Ellis"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="input"
          placeholder="you@desk.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      {isRegister ? (
        <div>
          <label htmlFor="country" className="label">
            Country <span className="normal-case tracking-normal text-fog/60">(optional)</span>
          </label>
          <select
            id="country"
            name="country"
            autoComplete="country-name"
            className="select"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="">Select your country</option>
            {COUNTRIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="label">
            Password
          </label>
          {isRegister ? (
            <span className="mb-1.5 text-[10.5px] text-fog">8+ characters, letter and number</span>
          ) : null}
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="input pr-11"
            placeholder={isRegister ? "Create a strong password" : "Your password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={isRegister ? 8 : 1}
            maxLength={72}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-fog transition hover:text-snow"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {isRegister && password.length > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={clsx(
                    "h-1 flex-1 rounded-full transition-colors",
                    index < score ? STRENGTH_COLOR[score] : "bg-white/10",
                  )}
                />
              ))}
            </div>
            <span className="w-16 text-right text-[10px] text-fog">{STRENGTH[score]}</span>
          </div>
        ) : null}
      </div>

      {isRegister ? (
        <>
          <div>
            <label htmlFor="confirmPassword" className="label">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="input"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={8}
              maxLength={72}
              required
            />
            {confirm.length > 0 && confirm !== password ? (
              <p className="mt-1.5 text-[11px] text-rose">Passwords do not match.</p>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-acid"
              required
            />
            <span className="text-[11.5px] leading-relaxed text-fog">
              I agree to the Anerith Terms of Service and confirm that I have read the risk
              disclosure. Trading leveraged products involves substantial risk.
            </span>
          </label>
        </>
      ) : null}

      <button type="submit" className="btn btn-primary w-full gap-2 py-3" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {isRegister ? "Creating workspace…" : "Signing in…"}
          </>
        ) : (
          <>
            {isRegister ? "Create workspace" : "Sign in"}
            <ArrowRight className="size-4" />
          </>
        )}
      </button>

      {!isRegister ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-snow">Example workspace</p>
            <p className="truncate font-mono text-[10.5px] text-fog">
              {DEMO.email} · {DEMO.password}
            </p>
          </div>
          <button
            type="button"
            onClick={fillDemo}
            className="shrink-0 text-[11px] font-medium text-sky transition hover:text-snow"
          >
            Use example
          </button>
        </div>
      ) : null}

      <p className="pt-1 text-center text-[12px] text-fog">
        {isRegister ? (
          <>
            Already have a workspace?{" "}
            <Link href="/login" className="font-medium text-acid hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Anerith?{" "}
            <Link href="/register" className="font-medium text-acid hover:underline">
              Create a free workspace
            </Link>
          </>
        )}
      </p>

      {isRegister ? (
        <p className="flex items-center justify-center gap-1.5 pt-1 text-[10.5px] text-fog/70">
          <Check className="size-3 text-acid" />
          Free $10,000 trial desk included · no card required
        </p>
      ) : null}
    </form>
  );
}
