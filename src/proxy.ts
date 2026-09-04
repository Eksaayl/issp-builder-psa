import { NextRequest, NextResponse } from "next/server";

const ALLOWED_EMAIL_DOMAIN = "@psa.gov.ph";

// Production serves the app under a sub-path (see NEXT_PUBLIC_BASE_PATH in the
// Dockerfile). Middleware sees `nextUrl.pathname` with that prefix already
// stripped, but neither self-`fetch` nor `NextResponse.redirect` adds it back,
// so every absolute URL built here has to prepend it manually.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Metadata routes Next generates without a file extension. They have to stay
// reachable while signed out or link unfurlers get the sign-in page instead.
const PUBLIC_ROUTES = new Set([
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/sitemap.xml",
  "/robots.txt",
]);

function internalUrl(path: string, request: NextRequest) {
  return new URL(`${BASE_PATH}${path}`, request.url);
}

/**
 * Refuse the request. API callers get a 401 they can branch on; anything a
 * browser navigated to gets bounced to sign-in with the original destination
 * preserved, which is what the replaced `auth.middleware` used to do.
 */
function deny(request: NextRequest, error?: string) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // A redirect here would be followed by `fetch` and answered with sign-in
    // HTML under a 200, which callers read as success and then hang on.
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const signInUrl = internalUrl("/auth/sign-in", request);
  if (error) {
    signInUrl.searchParams.set("error", error);
  }
  if (pathname !== "/") {
    signInUrl.searchParams.set("redirect", `${pathname}${search}`);
  }
  return NextResponse.redirect(signInUrl);
}

export default async function proxy(request: NextRequest) {
  if (request.headers.has("Next-Action")) {
    return;
  }

  const { pathname } = request.nextUrl;

  // The auth screens must stay reachable while signed out, or the redirect
  // below would bounce them back to themselves forever.
  if (pathname.startsWith("/auth/") || PUBLIC_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie") ?? "";

  // On the OAuth landing the session cookie does not exist yet — the
  // `neon_auth_session_verifier` query param is the token that gets exchanged
  // for it. Forward that param so the session resolves on this very request;
  // without it the landing looks signed-out and would be bounced back to
  // sign-in, breaking the flow before it can finish.
  const sessionUrl = internalUrl("/api/auth/get-session", request);
  const verifier = request.nextUrl.searchParams.get("neon_auth_session_verifier");
  if (verifier) {
    sessionUrl.searchParams.set("neon_auth_session_verifier", verifier);
  }

  let sessionRes: Response;
  try {
    sessionRes = await fetch(sessionUrl, { headers: { cookie } });
  } catch {
    // The loopback request can fail on its own (DNS, TLS, proxy). Letting that
    // throw would turn every matched route into a 500, so fail closed instead.
    return deny(request);
  }

  const session = await sessionRes.json().catch(() => null);
  const email: string | undefined = session?.user?.email;
  // Exchanging the verifier mints the session cookies; they must be passed on
  // to the browser or the sign-in silently loses its session.
  const sessionCookies = sessionRes.headers.getSetCookie?.() ?? [];

  // Signed in, but with an address outside the allowed domain: revoke the
  // session server-side and send them back to sign-in with an explanation.
  if (email && !email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    const response = deny(request, "domain_not_allowed");
    try {
      const signOutRes = await fetch(internalUrl("/api/auth/sign-out", request), {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: "{}",
      });
      // Forward the cleared session cookies so the browser drops them
      // immediately instead of relying on a second round trip.
      for (const setCookie of signOutRes.headers.getSetCookie?.() ?? []) {
        response.headers.append("Set-Cookie", setCookie);
      }
    } catch {
      // Best effort: the sign-out is a cleanup, not the gate. The user is
      // still turned away below whether or not it succeeded.
    }
    return response;
  }

  if (!email) {
    // Carry any cookies the verifier exchange minted, so a half-finished
    // sign-in is not silently thrown away on the way back to the form.
    const response = deny(request);
    for (const setCookie of sessionCookies) {
      response.headers.append("Set-Cookie", setCookie);
    }
    return response;
  }

  const response = NextResponse.next();
  for (const setCookie of sessionCookies) {
    response.headers.append("Set-Cookie", setCookie);
  }
  return response;
}

export const config = {
  matcher: [
    // Anything with a static-asset extension is served as-is: gating `.json`
    // in particular broke client fetches that parse the response as JSON and
    // memoize the result, poisoning the cache for the whole page session.
    "/((?!_next/|api/auth/|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|webmanifest|txt|xml|json|html|pdf|csv|map|woff|woff2|ttf|otf)$).*)",
  ],
};
