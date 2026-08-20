import { AccountSettingsView } from "@/components/account/account-settings-view";

export const dynamicParams = false;

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return (
    <main className="container mx-auto flex grow flex-col items-center p-4">
      <AccountSettingsView path={path} />
    </main>
  );
}
