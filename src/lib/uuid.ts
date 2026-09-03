/**
 * RFC 4122 v4 UUID, safe in non-secure browsing contexts.
 *
 * `crypto.randomUUID()` is only available in **secure** contexts (HTTPS, or
 * `localhost`/`127.0.0.1`). On a plain-HTTP host reached via a public IP or
 * hostname (e.g. a dev server opened at `http://192.0.2.1:3000`), it is
 * `undefined` and calling it throws — which crashes any feature that generates
 * an id on load or interaction.
 *
 * `crypto.getRandomValues()` is available in *all* contexts (it is not gated
 * behind secure-context), so we fall back to it, then to `Math.random`.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set the v4 (version) and variant bits per RFC 4122 §4.4 / §4.2.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
