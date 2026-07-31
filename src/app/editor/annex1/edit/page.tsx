import { Suspense } from "react";
import { EditorAnnex1EditContent } from "./content";

export default function EditorAnnex1EditPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
      <EditorAnnex1EditContent />
    </Suspense>
  );
}
