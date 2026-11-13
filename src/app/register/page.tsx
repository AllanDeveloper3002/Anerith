import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create workspace",
  description:
    "Create a free Anerith workspace and open a $10,000 Discovery desk with a full trading terminal.",
};

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");
  return (
    <AuthShell mode="register">
      <AuthForm mode="register" />
    </AuthShell>
  );
}
