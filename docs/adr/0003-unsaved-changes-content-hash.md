# Unsaved changes tracked by content hash, not edit timestamp

**Status:** accepted

The "unsaved to file" flag is true when the current document's content hash differs from the saved snapshot's hash. The hash deliberately strips volatile timestamps (`updatedAt`, `exportedAt`, `sectionMeta.lastEditedAt`) and keeps only affirmative user state (`userMarkedDone`), so reopening or re-saving a file does not register as "unsaved."

We chose a content hash over a "last edit time > save time" flag because timestamp checks produce false positives whenever any timestamp advances for non-content reasons — migration, normalization, or a no-op save. The cost is that the hash must be kept in sync with what counts as "content" whenever a new volatile field is added.
