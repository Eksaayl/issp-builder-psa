import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

const authMiddleware = auth.middleware({
  loginUrl: "/auth/sign-in",
});

const ALLOWED_EMAIL_DOMAIN = "@psa.gov.ph";

export default async function proxy(request: NextRequest) {
  if (request.headers.has("Next-Action")) {
    return;
  }

  const response = await authMiddleware(request);

  const cookie = request.headers.get("cookie") ?? "";
  const sessionRes = await fetch(new URL("/api/auth/get-session", request.url), {
    headers: { cookie },
  });
  const session = await sessionRes.json().catch(() => null);
  const email: string | undefined = session?.user?.email;

  if (email && !email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    await fetch(new URL("/api/auth/sign-out", request.url), {
      method: "POST",
      headers: { cookie },
    });
    const redirectUrl = new URL("/auth/sign-in", request.url);
    redirectUrl.searchParams.set("error", "domain_not_allowed");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

// Temporarily disabled — homepage is open without login for now.
// Restore matcher: ["/"] to re-enable the forced sign-in gate.
export const config = {
  matcher: [],
};
