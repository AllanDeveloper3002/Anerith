"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Moon,
  ShieldCheck,
  ShieldQuestion,
  Sun,
  UserRound,
} from "lucide-react";
import { clsx } from "clsx";
import { useTheme, type ThemeMode } from "@/components/theme-provider";
import { useToast } from "@/components/toast-provider";
import { SectionHeader } from "@/components/ui";
import { api, errorMessage, patch, post } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { UserDTO } from "@/lib/types";

const KYC_BADGES = {
  unverified: { label: "Not verified", className: "badge-muted", icon: ShieldQuestion },
  pending: { label: "Under review", className: "badge-gold", icon: Clock3 },
  verified: { label: "Verified", className: "badge-acid", icon: BadgeCheck },
  rejected: { label: "Needs attention", className: "badge-rose", icon: ShieldQuestion },
} as const;

export function SettingsClient({ initialUser }: { initialUser: UserDTO }) {
  const router = useRouter();
  const toast = useToast();
  const { mode, setMode } = useTheme();
  const [user, setUser] = useState(initialUser);

  const [fullName, setFullName] = useState(initialUser.fullName);
  const [country, setCountry] = useState(initialUser.country ?? "");
  const [phone, setPhone] = useState(initialUser.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [kycFullName, setKycFullName] = useState(initialUser.fullName);
  const [dob, setDob] = useState("");
  const [kycCountry, setKycCountry] = useState(initialUser.country ?? "");
  const [documentType, setDocumentType] = useState("passport");
  const [documentNumber, setDocumentNumber] = useState("");
  const [savingKyc, setSavingKyc] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const kyc = KYC_BADGES[user.kycStatus];
  const KycIcon = kyc.icon;

  const pollUser = useCallback(async () => {
    try {
      const data = await api<{ user: UserDTO }>("/api/auth/me");
      setUser(data.user);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    if (user.kycStatus !== "pending") return;
    const timer = window.setInterval(pollUser, 4000);
    return () => window.clearInterval(timer);
  }, [user.kycStatus, pollUser]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const data = await patch<{ user: UserDTO; message: string }>("/api/profile", {
        fullName,
        country: country || null,
        phone: phone || null,
      });
      setUser(data.user);
      toast.push(data.message, "success");
      router.refresh();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitKyc() {
    setSavingKyc(true);
    try {
      const data = await post<{ message: string }>("/api/kyc", {
        fullName: kycFullName,
        dateOfBirth: dob,
        country: kycCountry,
        documentType,
        documentNumber,
      });
      toast.push(data.message, "success");
      await pollUser();
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setSavingKyc(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast.push("New passwords do not match.", "error");
      return;
    }
    setSavingPassword(true);
    try {
      const data = await post<{ message: string }>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      toast.push(data.message, "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    try {
      await post("/api/auth/logout");
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Account control</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Settings & verification</h1>
        <p className="mt-1 text-[12.5px] text-fog">
          Keep your profile current. Identity verification is required before your first payout.
        </p>
      </div>

      <section className="card p-5">
        <SectionHeader title="Appearance" hint="Choose how Anerith looks on this device. Your preference is saved." />
        <div className="grid gap-2.5 sm:grid-cols-3">
          {(
            [
              { key: "dark", label: "Dark", hint: "Low-light terminal", icon: Moon },
              { key: "light", label: "Light", hint: "Bright workspace", icon: Sun },
              { key: "system", label: "System", hint: "Match this device", icon: Monitor },
            ] as { key: ThemeMode; label: string; hint: string; icon: typeof Moon }[]
          ).map((option) => {
            const Icon = option.icon;
            const active = mode === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key)}
                className={clsx(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-acid/40 bg-acid/[0.07]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={clsx(
                    "grid size-9 shrink-0 place-items-center rounded-lg border",
                    active
                      ? "border-acid/25 bg-acid/10 text-acid"
                      : "border-white/[0.08] bg-white/[0.03] text-fog",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-snow">{option.label}</span>
                  <span className="block text-[10.5px] text-fog">{option.hint}</span>
                </span>
                <span
                  className={clsx(
                    "ml-auto size-2 rounded-full transition",
                    active ? "bg-acid" : "bg-white/15",
                  )}
                />
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Profile */}
        <section className="card p-5">
          <SectionHeader title="Profile" hint="Displayed on your desk and payout records." />
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="profile-name">
                Full name
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fog" />
                <input
                  id="profile-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="input pl-9"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="profile-email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fog" />
                <input id="profile-email" value={user.email} readOnly className="input pl-9 text-fog" />
              </div>
              <p className="mt-1 text-[9.5px] text-white/30">Email changes require support review.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="profile-country">
                  Country
                </label>
                <input
                  id="profile-country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="United Arab Emirates"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="profile-phone">
                  Phone
                </label>
                <input
                  id="profile-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+971 50 000 0000"
                  className="input"
                />
              </div>
            </div>
            <button type="button" onClick={saveProfile} disabled={savingProfile} className="btn btn-primary">
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
            <p className="text-[9.5px] text-white/30">Member since {fmtDate(user.createdAt)}</p>
          </div>
        </section>

        {/* KYC */}
        <section className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Identity verification</h2>
              <p className="mt-0.5 text-[11.5px] text-fog">Unlocks profit payouts on funded accounts.</p>
            </div>
            <span className={clsx("badge", kyc.className)}>
              <KycIcon className="size-3" /> {kyc.label}
            </span>
          </div>

          {user.kycStatus === "verified" ? (
            <div className="rounded-xl border border-acid/20 bg-acid/[0.05] p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-acid">
                <ShieldCheck className="size-4" /> Your identity is verified
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-fog">
                Payouts are enabled on all active funded accounts. Verification was completed
                {user.kycSubmittedAt ? ` after submission on ${fmtDate(user.kycSubmittedAt)}` : ""}.
              </p>
            </div>
          ) : user.kycStatus === "pending" ? (
            <div className="rounded-xl border border-gold/20 bg-gold/[0.05] p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-gold">
                <Clock3 className="size-4" /> Documents under review
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-fog">
                The compliance desk is reviewing your submission. Verification usually completes within a few
                minutes, and you will be notified as soon as it is approved.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {user.kycStatus === "rejected" ? (
                <p className="rounded-lg border border-rose/20 bg-rose/[0.05] p-3 text-[11px] text-rose">
                  Your previous submission was declined. Please check your details and resubmit.
                </p>
              ) : null}
              <div>
                <label className="label" htmlFor="kyc-name">
                  Legal full name
                </label>
                <input
                  id="kyc-name"
                  value={kycFullName}
                  onChange={(event) => setKycFullName(event.target.value)}
                  className="input"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="kyc-dob">
                    Date of birth
                  </label>
                  <input
                    id="kyc-dob"
                    type="date"
                    value={dob}
                    onChange={(event) => setDob(event.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="kyc-country">
                    Country
                  </label>
                  <input
                    id="kyc-country"
                    value={kycCountry}
                    onChange={(event) => setKycCountry(event.target.value)}
                    placeholder="United Arab Emirates"
                    className="input"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="kyc-doc-type">
                    Document type
                  </label>
                  <select
                    id="kyc-doc-type"
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    className="select"
                  >
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID</option>
                    <option value="drivers_license">Driver&apos;s license</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="kyc-doc-number">
                    Document number
                  </label>
                  <input
                    id="kyc-doc-number"
                    value={documentNumber}
                    onChange={(event) => setDocumentNumber(event.target.value)}
                    placeholder="A12345678"
                    className="input font-mono"
                  />
                </div>
              </div>
              <button type="button" onClick={submitKyc} disabled={savingKyc} className="btn btn-primary">
                {savingKyc ? "Submitting…" : "Submit for verification"}
              </button>
              <p className="text-[9.5px] leading-relaxed text-white/30">
                Documents are encrypted at rest and used only to verify your identity. Anerith never shares
                verification data with third parties.
              </p>
            </div>
          )}
        </section>

        {/* Password */}
        <section className="card p-5">
          <SectionHeader title="Security" hint="Rotate your password regularly." />
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="current-password">
                Current password
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fog" />
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="input pl-9"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="input"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="input"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
              className="btn btn-secondary"
            >
              {savingPassword ? "Updating…" : "Update password"}
            </button>
          </div>
        </section>

        {/* Session */}
        <section className="card p-5">
          <SectionHeader title="Session" hint="You are signed in on this device." />
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full border border-acid/20 bg-acid/10 font-mono text-[11px] font-semibold text-acid">
                {user.fullName
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <p className="text-[12.5px] font-medium">{user.fullName}</p>
                <p className="text-[10.5px] text-fog">
                  {user.email} · {user.role === "admin" ? "Administrator" : "Trader"}
                </p>
              </div>
            </div>
            <button type="button" onClick={signOut} className="btn btn-danger mt-4 w-full">
              <LogOut className="size-4" /> Sign out of Anerith
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-sky/20 bg-sky/[0.05] p-3 text-[10.5px] leading-relaxed text-sky">
            Security notice — Anerith support will never ask for your password, one-time codes, or broker
            credentials. Sessions are signed and expire automatically.
          </div>
        </section>
      </div>
    </div>
  );
}
