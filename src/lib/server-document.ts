import type { IsspDocument } from "@/lib/store/types";

/**
 * The shared PSA ISSP on the server.
 *
 * One row, one document, shared by every signed-in user -- the agency files a
 * single ISSP, so the server copy is a singleton rather than one row per
 * person. The id is a constant instead of a generated cuid so the row can be
 * addressed without first looking it up, and so a second concurrent create
 * collides on the primary key rather than quietly producing a second document.
 */
export const SHARED_DOCUMENT_ID = "psa-shared-issp";

/** Server response for a document read. */
export interface ServerDocumentPayload {
  content: IsspDocument;
  /** ISO timestamp of the row. Send it back on the next write as the precondition. */
  updatedAt: string;
  /** User id of whoever wrote it last. */
  lastEditedBy: string;
}

export type UploadResult =
  | { status: "ok"; updatedAt: string }
  /** Someone else wrote since `baseUpdatedAt`; the caller must reload before retrying. */
  | { status: "conflict"; serverUpdatedAt: string }
  | { status: "error"; error: string };

export type DownloadResult =
  | { status: "ok"; payload: ServerDocumentPayload }
  | { status: "empty" }
  | { status: "error"; error: string };

/**
 * Next rewrites `next/link` and router URLs for the basePath but not a bare
 * `fetch`, and production serves the app under /issp -- so the prefix has to be
 * added by hand, the same way `recordIsspUsage` does it.
 */
function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

export type HeadResult =
  | { status: "ok"; updatedAt: string; lastEditedBy: string }
  | { status: "empty" }
  | { status: "error" };

/**
 * The server copy's version, without the copy itself.
 *
 * Failures collapse to one case with no message. This runs on a timer, so a
 * transient blip -- an expired session, a suspended database, a dropped
 * connection -- must not surface as a toast or a visible error. The caller just
 * tries again on the next tick.
 */
export async function fetchServerDocumentHead(): Promise<HeadResult> {
  try {
    const res = await fetch(apiUrl("/api/documents/head"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 404) return { status: "empty" };
    if (!res.ok) return { status: "error" };
    const body = (await res.json()) as { updatedAt: string; lastEditedBy: string };
    return { status: "ok", updatedAt: body.updatedAt, lastEditedBy: body.lastEditedBy };
  } catch {
    return { status: "error" };
  }
}

export async function fetchServerDocument(): Promise<DownloadResult> {
  try {
    const res = await fetch(apiUrl("/api/documents"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 404) return { status: "empty" };
    if (!res.ok) return { status: "error", error: await readError(res) };
    return { status: "ok", payload: (await res.json()) as ServerDocumentPayload };
  } catch {
    return { status: "error", error: "Could not reach the server. Check your connection and try again." };
  }
}

/**
 * Write the document to the server.
 *
 * `baseUpdatedAt` is the row timestamp this copy was built from, or null when
 * the caller believes there is no server copy yet. The server refuses the write
 * if the row has moved on, so a stale tab cannot overwrite a colleague's work.
 */
export async function uploadServerDocument(
  doc: IsspDocument,
  baseUpdatedAt: string | null
): Promise<UploadResult> {
  try {
    const res = await fetch(apiUrl("/api/documents"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ doc, baseUpdatedAt }),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { serverUpdatedAt: string };
      return { status: "conflict", serverUpdatedAt: body.serverUpdatedAt };
    }
    if (!res.ok) return { status: "error", error: await readError(res) };
    const body = (await res.json()) as { updatedAt: string };
    return { status: "ok", updatedAt: body.updatedAt };
  } catch {
    return { status: "error", error: "Could not reach the server. Check your connection and try again." };
  }
}

async function readError(res: Response): Promise<string> {
  if (res.status === 401) return "Your session has expired. Sign in again, then retry.";
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the status-based message below.
  }
  return `The server rejected the request (${res.status}).`;
}
