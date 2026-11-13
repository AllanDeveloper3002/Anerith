import { getSessionUser, toUserDTO } from "@/lib/auth";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return <SettingsClient initialUser={toUserDTO(user)} />;
}
