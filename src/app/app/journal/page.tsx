import { getSessionUser } from "@/lib/auth";
import { getJournal } from "@/lib/journal";
import { JournalClient } from "@/components/journal/journal-client";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const initial = getJournal(user.id);
  return <JournalClient initial={initial} />;
}
