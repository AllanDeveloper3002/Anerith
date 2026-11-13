import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAccountSummaries } from "@/lib/accounts";
import { getSessionUser, toUserDTO } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · ANERITH" },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { accounts, activeId } = await getAccountSummaries(user.id);
  return (
    <AppShell user={toUserDTO(user)} accounts={accounts} activeId={activeId}>
      {children}
    </AppShell>
  );
}
