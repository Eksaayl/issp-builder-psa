# CSC Enterprise Architecture — Reference SVG (Design)

- **Date:** 2026-07-25
- **Status:** Approved → implementing
- **Owner:** Carlos Antonio Albornoz
- **Related:** ISSP Builder · Part III-B (Enterprise Architecture)

## Goal

Produce a clean, standalone **reference SVG** of a sample agency Enterprise
Architecture (EA), using the **Civil Service Commission (CSC)** as the example
agency. The artifact illustrates what a good Part III-B "Enterprise
Architecture" diagram looks like and is grounded in CSC's real ISSP data.

## Context

- In the ISSP Builder, **Part III-B "Enterprise Architecture"** is a single
  image field (`enterpriseArchDataUrl`) embedded into the exported PDF
  (max-height 145mm, `object-fit: contain`). The section guidance lists four
  layers — **Business, Application, Technology, Data** — and references the
  Philippine EA framework (PeGov / iGov).
- CSC's reference `.issp` (`references/csc-issp/CSC_ISSP_2028-2030.issp`)
  provides authentic content: mandate (HR & organizational development for the
  whole government), vision, and eight proposed systems (EMMS, AJSS, PSEO,
  Integrated Eligibility & Examination, QMS, HRPMIS, IAS, HRIGA).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Purpose | **Standalone reference SVG** | One-off clean diagram; no app changes; fastest |
| EA model | **App's 4-layer model** (Business → Application → Data → Technology) | Matches Part III-B guidance exactly; consistent with the tool |
| Layout | **Stacked horizontal bands** (one row per layer, items across) | Most legible for a PDF-embedded doc; matches PH-gov EA convention |
| Palette | **App's warm-neutral set** | Reads as part of the same family; print-safe; honors the restrained-neutral preference |
| Location | `references/csc-issp/csc-enterprise-architecture.svg` | Sits with the CSC reference material |

## Structure (top → bottom)

1. **Title block** — "Civil Service Commission (CSC) — Enterprise Architecture";
   subtitle "ISSP FY 2028–2030 · Part III-B"; small CSC mark.
2. **Strategic Outcomes band** (green accent header) — Vision 2030 + mission
   line ("Gawing Lingkod-Bayani ang Bawat Kawani") + outcome chips
   (Professionalized HR · Citizen Trust · Organizational Development · Digital
   Public Service).
3. **Business Architecture** — HR Management & Development; Recruitment &
   Eligibility Examination; Administrative Justice & Discipline; Policy,
   Standards & Compliance; Organization Development; Quality Management &
   Internal Audit.
4. **Application Architecture** — the eight proposed systems as two-line chips
   (bold acronym + full name), plus a Citizen/Employee Service Portal:
   EMMS, AJSS, PSEO, Integrated Eligibility & Examination, QMS, HRPMIS, IAS,
   HRIGA.
5. **Data Architecture** — master-data domains (Employee & Plantilla;
   Eligibility & Exam Results; Administrative Cases; Payroll; Organization /
   Position Registry); National HR Data Registry (MDM); PeGIF interoperability
   ↔ DBM, GSIS, SSS, PhilHealth, COA, iGovPH.
6. **Technology Architecture** — GovCloud / Data Center; LAN/WAN (IPv6);
   Cybersecurity (NGFW, WAF, Endpoint, SOC/SIEM, IAM/SSO); Integration / API
   Gateway; Backup & Disaster Recovery.
7. **Cross-cutting rails** spanning the four layers:
   - **Left rail — Security & Privacy:** DICT cybersecurity controls (Part
     II.B / III.A); Data Privacy / PIA (NPC); Identity & Access Management.
   - **Right rail — Governance & Interoperability:** EGEA / iGovPH framework;
     PeGIF interoperability; ICT governance & standards.

## Visual style

- Palette: `#FAFAF7` background, `#18181B` ink, `#52525B` muted labels,
  `#E5E3DC` rules, `#F2F1EC` / `#EAE8E1` muted bands, `#15803D` green reserved
  for the Strategic Outcomes header and the Security rail only.
- Per-layer differentiation via tonal band background + a numbered badge (no
  hue) — keeps the palette fully neutral.
- Landscape ~3:2, pure vector SVG; flat (no gradients/shadows), hairline
  borders; small legend/footer. Scales cleanly into the PDF's 145mm slot.

## Deliverable

- One file: `references/csc-issp/csc-enterprise-architecture.svg`
- Self-contained (inline styles), viewable in any browser, exportable to
  PNG/PDF. No code changes.

## Out of scope (YAGNI)

- An in-app EA diagram builder / UI feature.
- Wiring the SVG into the app's EA upload field or the CSC `.issp`.
- Redrawing CSC's existing embedded PNG.

## Acceptance criteria

1. Valid, well-formed SVG that renders in a browser.
2. Shows the four layers + Strategic Outcomes + Security/Governance rails.
3. Content is grounded in CSC's real ISSP (mandate, vision, 8 systems).
4. Uses the app's warm-neutral palette; prints legibly at the PDF embed size.
5. Saved to `references/csc-issp/csc-enterprise-architecture.svg`.
