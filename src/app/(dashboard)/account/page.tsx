import { AccountSettings } from "@/components/account/account-settings";
import { SocialLinksSection } from "@/components/account/social-links-section";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AccountSettings>
      <SocialLinksSection linked={sp.linked} error={sp.error} />
    </AccountSettings>
  );
}
