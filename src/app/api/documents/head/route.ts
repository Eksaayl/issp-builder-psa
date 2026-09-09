import { auth } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db";
import { SHARED_DOCUMENT_ID } from "@/lib/server-document";

/**
 * Just the version of the shared document, never the document itself.
 *
 * Every open tab polls this on a timer, so the response has to stay a few dozen
 * bytes -- shipping a multi-megabyte document every 30 seconds would cost far
 * more than the feature is worth. Clients fetch /api/documents only once this
 * timestamp actually moves.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user?.id) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const row = await getPrisma().isspDocument.findUnique({
      where: { id: SHARED_DOCUMENT_ID },
      select: { updatedAt: true, ownerId: true },
    });
    if (!row) return Response.json({ error: "No ISSP has been uploaded yet." }, { status: 404 });

    return Response.json({
      updatedAt: row.updatedAt.toISOString(),
      lastEditedBy: row.ownerId,
    });
  } catch (error) {
    console.error("[api/documents/head] read failed:", error);
    return Response.json({ error: "Could not reach the database." }, { status: 503 });
  }
}
