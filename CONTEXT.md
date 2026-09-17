# ISSP Builder

A local-first web tool that lets Philippine government agencies fill, validate, and export their three-year Information Systems Strategic Plan (ISSP) as a PDF, per the DICT 2026 template. There are no accounts and no server-side storage; each user's data lives in their browser and is shared as a `.issp` file.

## Language

### The document

**ISSP**:
A Philippine government agency's three-year Information Systems Strategic Plan, mandated by and submitted to DICT.
_Avoid_: "the plan", "the form"

**DICT**:
The Department of Information and Communications Technology — the body that mandates the ISSP and receives the submission.
_Avoid_: "the regulator"

**MITHI**:
The Medium-Term ICT Harmonization Initiative — the inter-agency framework that the ISSP's strategic-alignment and harmonization fields map onto.

**Part I / II / III / IV**:
The four mandatory sections of the ISSP. Part I = mandate & organization; Part II = current ICT state & concerns; Part III = proposed systems & projects; Part IV = three-year budget.

**Annex 1**:
The Existing ICT Asset Inventory — equipment and software counts per office. Two surfaces: the standalone `/annex1` form (an office fills and returns a `.issp` file) and inline management at `/editor/annex1` (secretariat adds/edits offices directly or attaches returned files).
_Avoid_: "the inventory", "asset table"

**Annex 2**:
The Disaster Recovery & Business Continuity Plan for ICT resources. Referenced in the guidelines; not yet implemented.

### Actors

**CIO**:
The agency's Chief Information Officer — accountable for the ISSP.

**Focal Person**:
The ISSP contact point. May be the same person as the CIO.

**Secretariat**:
The CIO's office — assembles the agency-wide master ISSP from office contributions.

**Office** (Central / Regional / Field):
An org unit described in, or contributing to, the ISSP. Central = head office; Regional = a regional office (selects a Philippine region); Field = a satellite office under a regional office.

### Sharing model

**`.issp` file**:
The JSON transport format for one ISSP artefact. A kind marker distinguishes a full document (`issp-main`) from a single office's inventory (`annex1`).
_Avoid_: "the JSON", "the export"

**Master document**:
The complete, consolidated ISSP held by the secretariat — the only file that produces the official PDF.

**Scoped file**:
A `.issp` sliced from the master, limited to one office's owned fields, sections, or areas. The office edits offline and returns it for consolidation.
_Avoid_: "slice", "partial file"

**Distribute**:
The master-side action that generates scoped files — one per office, granularity from a whole Part down to a single field. Lives in the editor's file-actions (⋯) menu; masters only.

**Consolidation**:
Merging one or more returned scoped files back into the master, with overlap review.

**`officeId`**:
The merge key stamped on shared-table rows and Annex 1 payloads. Consolidation replaces rows by `officeId` (not display label), which makes re-importing an office's file idempotent. Absent ⇒ legacy/secretariat-owned row.

Per-project distribution: `editScope.projectIds` (absent = all projects)
filters the project-bearing fields at slice time — `part3/e1/e2` project
lists, `part3/f.performanceFramework`, `part3/d.proposedSystems`, and the
`part4/yearN` project budget records (registry `PROJECT_BEARING_FIELDS`, 7
members). Consolidate merges these by id (replace / union-new /
keep-on-delete) whenever any file in the batch declares the filter; Part IV
year fields decompose so `officeProductivity`/`continuingCosts` keep scalar
conflict semantics under the nested fieldKey `yearN.officeProductivity` —
but only between offices holding unfiltered files: a project-filtered file
carries neither category (the office sees only its projects' budget lines)
and contributes nothing to them on merge (no overlay, sub-conflict, or
flag). Its Proposed IS list likewise holds only the carried projects'
linked systems; systems merge by their own id — replace / union-new + flag,
absence kept unflagged (a project filter selects projects, not systems).
