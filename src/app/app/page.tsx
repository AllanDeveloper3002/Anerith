import Link from "next/link";
import { Target } from "lucide-react";
import { getActiveAccountOrNull } from "@/lib/accounts";
import { getSessionUser, toUserDTO } from "@/lib/auth";
import { getCompetitionView } from "@/lib/competitions";
import { getTradeState } from "@/lib/trading";
import { DashboardClient } from "@/components/dashboard-client";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const active = await getActiveAccountOrNull(user.id);
  if (!active) {
    return (
      <div className="card mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<Target className="size-5" />}
          title="No active account"
          body="Your previous evaluation or funded account is closed. Choose a challenge to get back on the desk."
          action={
            <Link href="/app/challenges" className="btn btn-primary">
              Browse challenges
            </Link>
          }
        />
      </div>
    );
  }

  const [initial, competition] = await Promise.all([
    getTradeState(user.id),
    Promise.resolve(getCompetitionView(user.id)),
  ]);

  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <DashboardClient
      user={toUserDTO(user)}
      initial={initial}
      competition={competition}
      greeting={greeting}
    />
  );
}
