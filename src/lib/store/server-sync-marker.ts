/**
 * What this browser knows about the shared server copy, across reloads.
 *
 * The automatic restore has to answer one question: is the document in this
 * browser still exactly what the server last handed it? In memory that is a
 * string comparison, but a reload loses it -- and a returning user is precisely
 * who the automatic restore is for, so the answer has to survive the reload.
 *
 * Storing the document to compare against would mean a second copy of up to
 * tens of megabytes, so a SHA-256 digest is stored instead. A digest match means
 * the local document is byte-identical to what the server gave, and adopting a
 * newer version can lose nothing.
 *
 * localStorage rather than IndexedDB: this is a small per-browser marker, it is
 * written on the same paths that already touch localStorage for preferences,
 * and losing it is harmless -- the app falls back to leaving the local document
 * alone, which is the safe direction.
 */

const SERVER_SYNC_KEY = "issp-server-sync";

export interface ServerSyncMarker {
  /** Row timestamp of the version this browser took. */
  updatedAt: string;
  /** SHA-256 of the adopted document's content hash. */
  digest: string;
}

export function readServerSyncMarker(): ServerSyncMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SERVER_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerSyncMarker>;
    if (typeof parsed.updatedAt !== "string" || typeof parsed.digest !== "string") return null;
    return { updatedAt: parsed.updatedAt, digest: parsed.digest };
  } catch {
    return null;
  }
}

export function writeServerSyncMarker(marker: ServerSyncMarker): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVER_SYNC_KEY, JSON.stringify(marker));
  } catch {
    // A full or blocked localStorage costs the automatic restore, not the app.
  }
}

export function clearServerSyncMarker(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SERVER_SYNC_KEY);
  } catch {
    // Nothing to do; a stale marker only ever makes the app more cautious.
  }
}

/**
 * SHA-256 of a string, hex encoded, or null where WebCrypto is unavailable
 * (an insecure origin, for instance). Null makes the caller treat the document
 * as locally modified, which is the safe answer.
 */
export async function digestContent(content: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const bytes = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
