import { all, nowIso, run, type UserRow } from "./db";
import { notify } from "./notifications";

export interface KycSubmission {
  fullName: string;
  dateOfBirth: string;
  country: string;
  documentType: string;
  documentNumber: string;
}

export function submitKyc(user: UserRow, input: KycSubmission): void {
  run(
    "UPDATE users SET kyc_status = 'pending', kyc_submitted_at = ?, kyc_data = ? WHERE id = ?",
    [nowIso(), JSON.stringify(input), user.id],
  );
  notify(
    user.id,
    "Verification submitted",
    "Your identity documents are under review. Verification decisions are issued by the compliance desk.",
    "info",
  );
}

export function approveKyc(userId: string): boolean {
  const updated = run(
    "UPDATE users SET kyc_status = 'verified' WHERE id = ? AND kyc_status IN ('pending','rejected','unverified')",
    [userId],
  );
  if (updated > 0) {
    notify(userId, "Identity verified", "Your identity has been verified. Payouts are now available on funded accounts.", "success");
  }
  return updated > 0;
}

export function rejectKyc(userId: string, reason: string): boolean {
  const updated = run("UPDATE users SET kyc_status = 'rejected' WHERE id = ? AND kyc_status = 'pending'", [
    userId,
  ]);
  if (updated > 0) {
    notify(userId, "Verification needs attention", `Your identity verification was declined: ${reason}. Please resubmit in Settings.`, "danger");
  }
  return updated > 0;
}

export function autoVerifyKyc(olderThanMs = 15_000): void {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const pending = all<UserRow>(
    "SELECT * FROM users WHERE kyc_status = 'pending' AND kyc_submitted_at IS NOT NULL AND kyc_submitted_at <= ?",
    [cutoff],
  );
  for (const user of pending) {
    approveKyc(user.id);
  }
}
