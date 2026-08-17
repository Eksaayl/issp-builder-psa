import { AuthView } from "@neondatabase/auth-ui";

export const dynamicParams = false;

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { path } = await params;
  const { error } = await searchParams;
  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 p-4">
      {error === "domain_not_allowed" && (
        <div className="w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Sign-in is restricted to @psa.gov.ph Google accounts.
        </div>
      )}
      <AuthView path={path} />
    </main>
  );
}
