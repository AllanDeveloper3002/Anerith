import { getSessionUser } from "@/lib/auth";
import { getCompetitionView } from "@/lib/competitions";
import { CompetitionClient } from "@/components/competition-client";

export const dynamic = "force-dynamic";

export default async function CompetitionsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return <CompetitionClient initial={getCompetitionView(user.id)} />;
}
