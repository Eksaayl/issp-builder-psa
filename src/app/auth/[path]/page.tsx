import Image from "next/image";
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

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const showDomainNote = path === "sign-in" || path === "sign-up";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary/40 px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src={`${basePath}/PSA/PSA.webp`}
            alt="Philippine Statistics Authority logo"
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            priority
            unoptimized
          />
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">ISSP Builder</h1>
            <p className="text-sm text-muted-foreground">Philippine Statistics Authority</p>
          </div>
        </div>

        {error === "domain_not_allowed" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Sign-in is restricted to @psa.gov.ph Google accounts.
          </div>
        )}

        <div key={path} className="animate-auth-view-switch flex w-full flex-col items-center">
          <AuthView path={path} />
        </div>

        {showDomainNote && (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Only official PSA email accounts{" "}
            <span className="font-semibold text-foreground">(@psa.gov.ph)</span> are allowed.
          </p>
        )}
      </div>
    </main>
  );
}
