# Annex 1 reconciliation: Direction C (bridge), not migration

**Status:** accepted

Annex 1 has two coexisting models: the legacy `annexedOffices` whole-office buckets (attached `.issp` files, keyed by office label) and the new scoped "shared table" model (office-tagged rows merged by `consolidate()`).

Rather than migrate or delete either, we keep both: new scoped files use the row-merge path, and legacy attached files still load and render unchanged. We picked the bridge because migrating existing files is risky and the old path costs little to carry — the legacy model ages out as offices move to scoped files. The cost is two code paths and a conceptual seam between them, which is documented in `docs/scoped-issp-distribution-design-2026-07-21.md`.
