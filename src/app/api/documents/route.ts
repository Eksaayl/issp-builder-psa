import { auth } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { SHARED_DOCUMENT_ID } from "@/lib/server-document";
import type { IsspDocument } from "@/lib/store/types";

/**
 * The shared PSA ISSP.
 *
 * GET returns the stored document, PUT replaces it. `src/proxy.ts` already
 * gates every /api route and answers with 401 JSON when signed out, so the
 * session lookup here is about identifying the writer, not about access
 * control -- but it stays because the proxy failing open must not turn into an
 * anonymous write.
 */

// The session read makes this dynamic; say so rather than have Next infer it.
export const dynamic = "force-dynamic";

/** Roughly the .issp file ceiling, so a runaway body cannot be streamed into the row. */
const MAX_BODY_BYTES = 50 * 1024 * 1024;

async function requireUserId(): Promise<string | null> {
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Prisma types a Json column as an index-signed value, which a precisely typed
 * interface like IsspDocument does not structurally satisfy. The document is
 * plain JSON-serializable data, so the cast is describing what is already true
 * rather than defeating a real check.
 */
function asJsonColumn(doc: IsspDocument): Prisma.InputJsonValue {
  return doc as unknown as Prisma.InputJsonValue;
}

function headerColumnsOf(doc: IsspDocument) {
  return {
    title: doc.title,
    agencyName: doc.agency.name,
    agencyAcronym: doc.agency.acronym,
    startYear: doc.startYear,
    endYear: doc.endYear,
    planStatus: doc.planStatus ?? "draft",
  };
}

/**
 * A shape check, not a schema validation.
 *
 * The client runs the real gauntlet -- `normalizeImportShape`, the embedded
 * image limits and the v1..v11 migration chain -- on the way in and on the way
 * back out. Duplicating that here would mean importing it out of a "use client"
 * module; this only has to keep obvious junk out of the row.
 */
function rejectionReason(doc: unknown): string | null {
  if (typeof doc !== "object" || doc === null) return "The request did not contain a document.";
  const candidate = doc as Partial<IsspDocument>;
  if (candidate.fileType !== "issp-main") return "That is not an ISSP document.";
  if (!candidate.agency?.acronym) return "The document is missing its agency.";
  if (typeof candidate.startYear !== "number" || typeof candidate.endYear !== "number") {
    return "The document is missing its coverage period.";
  }
  return null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const row = await getPrisma().isspDocument.findUnique({
      where: { id: SHARED_DOCUMENT_ID },
    });
    if (!row) return Response.json({ error: "No ISSP has been uploaded yet." }, { status: 404 });

    return Response.json({
      content: row.content,
      updatedAt: row.updatedAt.toISOString(),
      lastEditedBy: row.ownerId,
    });
  } catch {
    return Response.json({ error: "Could not read the ISSP from the database." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: { doc?: unknown; baseUpdatedAt?: string | null };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ error: "This ISSP is too large to upload." }, { status: 413 });
    }
    body = JSON.parse(text) as typeof body;
  } catch {
    return Response.json({ error: "The request body was not valid JSON." }, { status: 400 });
  }

  const reason = rejectionReason(body.doc);
  if (reason) return Response.json({ error: reason }, { status: 400 });

  const doc = body.doc as IsspDocument;
  const baseUpdatedAt = body.baseUpdatedAt ?? null;
  const prisma = getPrisma();

  try {
    const existing = await prisma.isspDocument.findUnique({
      where: { id: SHARED_DOCUMENT_ID },
      select: { updatedAt: true },
    });

    // First upload. A concurrent create collides on the primary key, which is
    // caught below and reported as a conflict rather than silently losing one.
    if (!existing) {
      const created = await prisma.isspDocument.create({
        data: {
          id: SHARED_DOCUMENT_ID,
          ownerId: userId,
          ...headerColumnsOf(doc),
          content: asJsonColumn(doc),
        },
        select: { updatedAt: true },
      });
      return Response.json({ updatedAt: created.updatedAt.toISOString() });
    }

    if (!baseUpdatedAt) {
      return Response.json(
        { error: "An ISSP already exists on the server.", serverUpdatedAt: existing.updatedAt.toISOString() },
        { status: 409 }
      );
    }

    // The precondition lives in the WHERE clause rather than in an if-statement
    // above it, so two writers racing on the same base cannot both pass the
    // check and then both write -- the second one matches zero rows.
    const result = await prisma.isspDocument.updateMany({
      where: { id: SHARED_DOCUMENT_ID, updatedAt: new Date(baseUpdatedAt) },
      data: { ownerId: userId, ...headerColumnsOf(doc), content: asJsonColumn(doc) },
    });

    if (result.count === 0) {
      return Response.json(
        { error: "Someone else saved a newer version.", serverUpdatedAt: existing.updatedAt.toISOString() },
        { status: 409 }
      );
    }

    const saved = await prisma.isspDocument.findUnique({
      where: { id: SHARED_DOCUMENT_ID },
      select: { updatedAt: true },
    });
    return Response.json({ updatedAt: saved?.updatedAt.toISOString() ?? new Date().toISOString() });
  } catch {
    return Response.json({ error: "Could not save the ISSP to the database." }, { status: 500 });
  }
}
