# Local-first, no-backend architecture

**Status:** accepted

The ISSP Builder stores every document in the user's browser (IndexedDB) and shares work as `.issp` files. There is no database, no user accounts, and no server-side document storage; the only server endpoint is a stateless PDF generator.

We chose this over a conventional backend + auth app because agency data is sensitive, the single secretariat already consolidates manually, and a file-based round-trip keeps the tool usable by offices that have no account. The cost is no real-time multi-user collaboration — accepted because consolidation is already a file exchange, not a live editing session.
