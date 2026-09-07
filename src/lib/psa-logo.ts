/**
 * The PSA mark, used as every document's agency logo.
 *
 * It is not uploaded -- the dialogs seed it into the form so that it is stored
 * on the document exactly as a user-uploaded logo used to be. Everything
 * downstream (the `.issp` file, the PDF cover, the running page header) then
 * works unchanged, because it is a real `data:image/png;base64,...` value in
 * `agency.logoBase64` rather than a special case.
 *
 * Two forms, because display and storage need different things:
 *
 * - `PSA_LOGO_PATH` renders instantly in an `<img>`. Callers prepend
 *   `NEXT_PUBLIC_BASE_PATH` themselves -- Next rewrites `next/link` and router
 *   URLs for the basePath, but not a raw `src`.
 * - `loadPsaLogoDataUrl()` is what gets stored. The PDF renderer accepts
 *   nothing else: the cover and header both test for a `data:image/` prefix and
 *   fall back to plain text otherwise, and Puppeteer's request interceptor
 *   blocks every other scheme.
 *
 * Deliberately NOT marked `"use client"`. The auth page is a server component,
 * and the directive would hand it a client reference instead of the string --
 * the `<img src>` then renders as a "cannot call a client function from the
 * server" stub and the logo silently breaks. `loadPsaLogoDataUrl` is
 * browser-only at call time, which is enough; its callers are client
 * components already.
 */
export const PSA_LOGO_PATH = "/PSA/PSA.png";

export function psaLogoUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${PSA_LOGO_PATH}`;
}

// One fetch per page load, shared by both dialogs. Kept as the promise rather
// than the resolved string so concurrent callers await the same request.
let pending: Promise<string> | null = null;

export function loadPsaLogoDataUrl(): Promise<string> {
  pending ??= fetch(psaLogoUrl())
    .then((res) => {
      if (!res.ok) throw new Error(`PSA logo ${res.status}`);
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    )
    .catch((err) => {
      // Let the next caller retry rather than caching a failure for the life
      // of the page. The document keeps a null logo and the PDF falls back to
      // the agency name, which is the pre-existing no-logo behaviour.
      pending = null;
      throw err;
    });
  return pending;
}
