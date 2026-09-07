import { NextRequest, NextResponse } from "next/server";
import { handleAuthProxyRequest } from "@neondatabase/auth/server";

const ALLOWED_EMAIL_DOMAIN = "@psa.gov.ph";

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL!;
const AUTH_COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET!;

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
  "/robots.txt",
]);

function internalUrl(path: string, request: NextRequest) {
  return new URL(`${BASE_PATH}${path}`, request.url);
}

/**
 * Talk to the Neon Auth API the way the app's own `/api/auth/[...path]` route
 * does, but in-process.
 *
 * This deliberately does NOT go through that route over HTTP. Doing so meant
 * the container issuing a request to its own public hostname on every gated
 * navigation, which only works if the box can reach itself back through the
 * reverse proxy. In the container the app actually ships in that round trip
 * has to leave the Docker network, resolve the public host and come back in
 * through nginx; when any of that fails the `catch` below fails closed and
 * every route -- including the OAuth landing -- bounces to sign-in. This
 * helper reaches `NEON_AUTH_BASE_URL` directly instead, so the gate no longer
 * depends on the deployment's ability to call itself.
 *
 * `url` is passed through because the helper forwards its query string
 * upstream, and on the OAuth landing that query string carries the
 * `neon_auth_session_verifier` that gets exchanged for the session cookies.
 */
function callAuthApi(path: string, url: URL | string, cookie: string, body?: string) {
  return handleAuthProxyRequest({
    request: new Request(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined
        ? { cookie }
        : { cookie, "Content-Type": "application/json" },
      body,
    }),
    path,
    baseUrl: AUTH_BASE_URL,
    cookieSecret: AUTH_COOKIE_SECRET,
  });
}

/**
 * Refuse the request. API callers get a 401 they can branch on; anything a
 * browser navigated to gets bounced to sign-in. The attempted path is
 * deliberately not carried along: sign-in always finishes on the home page
 * (see the `redirectTo` pinned in the auth page), so a stashed destination
 * would only be dead weight in the URL.
 */
function deny(request: NextRequest, error?: string) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // A redirect here would be followed by `fetch` and answered with sign-in
    // HTML under a 200, which callers read as success and then hang on.
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const signInUrl = internalUrl("/auth/sign-in", request);
  if (error) {
    signInUrl.searchParams.set("error", error);
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
  // for it. `request.url` still carries it here, and `callAuthApi` forwards
  // the query string upstream, so the session resolves on this very request;
  // without it the landing looks signed-out and would be bounced back to
  // sign-in, breaking the flow before it can finish.
  const verifier = request.nextUrl.searchParams.get("neon_auth_session_verifier");

  let sessionRes: Response;
  try {
    sessionRes = await callAuthApi("get-session", request.url, cookie);
  } catch {
    // Reaching Neon Auth can still fail on its own (DNS, TLS, upstream down).
    // Letting that throw would turn every matched route into a 500, so fail
    // closed instead.
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
      const signOutRes = await callAuthApi(
        "sign-out",
        internalUrl("/api/auth/sign-out", request),
        cookie,
        "{}",
      );
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

  // The verifier is single-use: exchanging it above both minted the session
  // cookies and consumed the challenge. Letting it stay in the address bar
  // leaves the client adapter permanently broken on this page -- it skips its
  // session cache for as long as the param is present and keeps replaying the
  // spent verifier, so every client-side session read comes back signed-out
  // even though the cookies are good. Bounce once to the clean URL, carrying
  // the cookies, which is what the library's own middleware does.
  if (verifier) {
    // Built through `internalUrl` rather than from `request.url` so the
    // basePath is re-applied the same way every other absolute URL here is,
    // instead of depending on whether the runtime left it on `request.url`.
    const cleanUrl = internalUrl(pathname, request);
    for (const [key, value] of request.nextUrl.searchParams) {
      if (key !== "neon_auth_session_verifier") {
        cleanUrl.searchParams.append(key, value);
      }
    }
    const redirect = NextResponse.redirect(cleanUrl);
    for (const setCookie of sessionCookies) {
      redirect.headers.append("Set-Cookie", setCookie);
    }
    return redirect;
  }

  const response = NextResponse.next();
  for (const setCookie of sessionCookies) {
    response.headers.append("Set-Cookie", setCookie);
  }
  return response;
}

export const config = {
  matcher: [
    // The pattern below compiles to a path-to-regexp group that will not match
    // an empty segment, so the landing path has to be listed on its own or it
    // slips past the gate entirely.
    "/",
    // Anything with a static-asset extension is served as-is: gating `.json`
    // in particular broke client fetches that parse the response as JSON and
    // memoize the result, poisoning the cache for the whole page session.
    "/((?!_next/|api/auth/|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|webmanifest|txt|xml|json|html|pdf|csv|map|woff|woff2|ttf|otf)$).*)",
  ],
};
