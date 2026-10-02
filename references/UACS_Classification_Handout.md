# UACS Classification Reference — DICT Handout (pp. 39–47)

**Source:** Official DICT ISSP handout, pages 39–47 ("CLASSIFICATION FOR UACS" table).
Archived at `references/UACS Classification Handout (DICT, pp. 39-47).pdf`.
Companion transcript notes: `references/ISSP_Orientation_Notes_May25.md` §6 (same table, summarized with speaker timestamps).

> **Important — the handout contains NO numeric codes.** Its "UACS" column lists **category names only**.
> All numeric object codes below are **our mapping** onto the old UACS dataset (`public/uacs_active.min.json`,
> parked since schema v14), verified 2026-09-29. Do not attribute the codes to the handout itself.

**App status since schema v14 (2026-09-29):** these 30 categories are **the app's data model** —
`src/lib/expense-categories.ts` stores each as `{ id, name, expenseClass, group, order }`, and Part IV
line items persist `categoryId` (the ids below) in `.issp` files. The numeric codes below are now only
the legacy migration map (unknown codes are flagged for review, not guessed; generic Training Expenses
5020201002 maps to ICT Training by decision).

**Purpose for agents:** Use this doc to (a) classify ISSP Part IV line items correctly, and (b) know
which UACS code(s) each handout category maps to in the app's combobox dataset.

---

## Classification rules (from the handout)

1. **PHP 50,000.00 unit-cost threshold** splits tangible ICT hardware:
   - **≥ PHP 50,000** → Capital Outlay (CO)
   - **< PHP 50,000** → MOOE as **semi-expendable** (still inventory-tracked, but not capitalized)
2. **Software is split by acquisition model, not cost:**
   - Perpetual license / one-time purchase / capitalized custom development → **CO (ICT Software)**
   - Recurring subscription fees → **MOOE (ICT Software Subscription)**
3. **Repairs & Maintenance mirror the asset class** of the item being repaired (capitalizable,
   semi-expendable, infrastructure, or leased) — there are distinct UACS rows for each.
4. The handout covers **30 categories: 5 CO + 25 MOOE**.

---

## Capital Outlay (CO) — UACS prefix `506`

| Handout category | Description (condensed from handout) | Sample items (handout) | Mapped UACS code(s) | Label in dataset |
|---|---|---|---|---|
| ICT Machinery and Equipment | ICT equipment for government operations, unit cost ≥ ₱50,000. Includes hardware (computers, printers, scanners) and pre-loaded/bundled software whose cost is integrated into the hardware price. Covers central computing systems, user workstations, and core data-processing hardware. | Rack/blade servers & mainframes; NAS/SAN storage; high-performance desktops, laptops, engineering workstations (GIS, video editing, dev) ≥ ₱50k/unit; centralized UPS and Precision Air Conditioning Units (PACU) for data centers | **5060405003** | Information and Communication Technology Equipment |
| Communication Equipment | Communications equipment, unit cost ≥ ₱50,000 — devices that transmit voice, video, data, or signals across distances, linking individuals or offices. | Enterprise VoIP/PBX systems, IP gateways, executive IP phones; HF/VHF/UHF radio base stations, repeaters, military-grade handhelds; satellite phones & BGAN terminals; dedicated boardroom video-conferencing units | **5060405007** | Communications Equipment |
| Printing Equipment | Heavy-duty / large-scale printing equipment, unit value ≥ ₱50,000 — high-volume production machines for physical copies of documents, graphics, or credentials. | Centralized multi-function network printers/copiers (MFPs); wide-format plotters (blueprints, maps); production-grade ID card printers (licenses, passports, smart IDs) | **5060405012** | Printing Equipment |
| ICT Software | Acquiring or developing software for government operations. Covers (1) direct purchases of licensed software/enterprise systems, and (2) capitalized development costs — coding, testing, and producing product masters for custom software. | COTS perpetual licenses (Oracle, MS SQL, Windows Server, AutoCAD, Adobe CC perpetual); custom software development total cost (custom HRMS, procurement portal, citizen services app); ERP platform licenses | **5060405015** (primary) · 5060602000 (Intangible Assets variant) | ICT Software · Computer Software |
| Infrastructure Outlay – Communications Network | Building or acquiring extensive communication network infrastructure for public use or revenue generation. Acquisition methods: **purchase** (buying price), **construction** (total build cost), or **donation/transfer** (estimated fair value). Applies to the massive physical backbone connecting buildings, regions, or nationwide facilities — unlike individual equipment. | Underground/aerial fiber-optic backbones connecting multiple government buildings; cellular & radio towers, guyed masts, microwave relay stations; agency-wide structured cabling (drops, conduits, patch panels, vertical backbone) in multi-story buildings | **5060403006** (PPE Outlay) · 5060101007 (Investment Outlay variant) | Communications Networks |

## Maintenance and Other Operating Expenses (MOOE) — UACS prefix `502`

### Semi-expendable assets & supplies (< ₱50,000)

| Handout category | Description (condensed) | Sample items (handout) | Mapped UACS code(s) | Label in dataset |
|---|---|---|---|---|
| Semi-Expendable – ICT Equipment | Purchase price / fair value of ICT equipment with unit cost **< ₱50,000**. Below the capitalization threshold, so classified semi-expendable rather than permanent capital outlay, but still tracked for inventory and accountability. | Laptop, desktop, access point, NAS, camera, drone, switch, smart TV, monitor, router, projector, speaker | **5020321003** | Information and Communications Technology Equipment |
| Semi-Expendable – Communication Equipment | Communications equipment with unit cost **< ₱50,000**, same semi-expendable treatment. | Digital mobile radio, low-cost handheld radio, intercom system, mobile phone, mobile radio, paging system, satellite phones, VoIP telephone | **5020321007** | Communications Equipment |
| Semi-Expendable – Printing Equipment | Printing equipment with unit cost **< ₱50,000**, same semi-expendable treatment. | Desktop inkjet/laser/tank printers; label & barcode printers; basic 3-in-1 desktop scanners/copiers | **5020321011** | Printing Equipment |
| ICT Supplies | Expendable items and accessories consumed within a year or of low individual value (lifespan < 1 year or small parts). | Peripherals & accessories (monitors, webcams, headsets, keyboards, mice, speakers); storage & media (flash drives, external drives, memory cards, blank CDs/DVDs); consumables (ink, toner, ribbons). **Handout note: these may be merged into ONE (1) lot as "ICT Office Supplies."** | **5020301001** | ICT Office Supplies Expenses |

### Connectivity & communications services

| Handout category | Description (condensed) | Sample items (handout) | Mapped UACS code(s) | Label in dataset |
|---|---|---|---|---|
| Mobile Expenses | Cost of transmitting messages and cellular communications via mobile phone lines — both prepaid (load/cards) and postpaid (monthly billing). | Mobile postpaid plan, prepaid load/cell cards, SMS/text blast | **5020502001** (· generic parent 5020502000 Telephone Expenses) | Mobile |
| Landline Expenses | Cost of transmitting voice and data messages through traditional landline telephone services. | Direct line subscription, SIP trunks | **5020502002** | Landline |
| Internet Subscription Expenses | Costs of acquiring and using internet services for day-to-day government operations. | Internet service, broadband service | **5020503000** | Internet Subscription Expenses |
| Cable, Satellite, Telegraph, and Radio Expenses | Costs of specialized communication services — cable, satellite, telegram, and radio frequencies. | TV spectrum, radio spectrum, satellite internet service (Starlink) | **5020504000** | Cable, Satellite, Telegraph and Radio Expenses |

### Training, professional & technical services

| Handout category | Description (condensed) | Sample items (handout) | Mapped UACS code(s) | Label in dataset |
|---|---|---|---|---|
| ICT Training | Costs of sending personnel to educational events AND of organizing/conducting them. Covers trainings, conventions, seminars, and workshops. | Web design & development training, graphic design training, database backup & recovery training, ISO 27001:2022 ISMS certification | **5020201001** | ICT Training Expenses |
| Professional Services | Hiring external consultants to deliver specific outputs/services — primarily advisory work requiring highly specialized or technical expertise the agency's regular staff cannot provide. | Certified IT security consultant, enterprise architecture consultants, information security & cybersecurity experts, data privacy consultants/auditors, QA & software testing consultants | **5021103001** (· fallback 5021199000 Other Professional Services) | ICT Consultancy Services |
| ICT Software Subscription | Costs of recurring software subscriptions used by the agency. | Online office productivity tools, antivirus, CAD software, graphic design software, software development tools, IDE *(sic "Integraged" in handout)*, endpoint security, firewall, database management systems (DMS) | **5029907001** | ICT Software Subscription |
| Data Center Services | Recurring costs of subscribing to external data center services. | Colocation, data storage & backup, disaster recovery | **5029907002** | Data Center Service |
| Cloud Computing Services | Recurring operational costs of subscribing to cloud computing services. | IaaS, PaaS, SaaS | **5029907003** | Cloud Computing Service |
| Web Hosting Services | Costs of related web hosting services. | SSL, domain name | ⚠️ **no dedicated code in our dataset** — nearest: 5029907099 Other Subscription Expenses · 5029999001 Website Maintenance · 5021200001 General ICT Services | — |
| ICT Research Exploration and Development Expenses | Costs of research, studies, and investigations for scientific/technical knowledge for future projects, including creating/refining/evaluating official policies. Preliminary, exploratory phase of future ICT projects — before actual system deployment. | Feasibility studies for nationwide systems; **ISSP formulation** (agency-wide assessments and studies for the official 3-year ISSP); PoC/prototyping studies (blockchain, AI); ICT policy development studies | **5020702001** | ICT Research, Exploration and Development Expenses |
| Other General ICT Services | Outsourced/contracted general ICT services that do not fit any of the specific predefined general ICT service accounts — routine IT services and labor contracts, not highly specialized consultancy, software subscriptions, or standard utilities. | Outsourced IT helpdesk/technical support; data entry & digitization services; auxiliary data center facility support (PACU maintenance, fire suppression servicing); website & content moderation services | **5021200001** | General ICT Services |

### Repairs & maintenance

| Handout category | Description (condensed) | Sample items (handout) | Mapped UACS code(s) | Label in dataset |
|---|---|---|---|---|
| Repairs & Maintenance – Infra Assets – Communications Network | Repairs and maintenance on communications **networks** (infrastructure). | Fiber-optic network inspections; tower & mast maintenance (structural checks, rustproofing, guy wires); antenna alignment; backup power system servicing (UPS/generators serving comms nodes) | **5021303006** | Communications Networks |
| Repairs & Maintenance – ICT Equipment | Repairs and maintenance on ICT equipment. Applies **only to capitalizable ICT hardware** (units originally purchased for ≥ ₱50,000). | Enterprise servers & mainframes (motherboard/PSU/CPU-fan replacement, SAN drive replacement); high-performance workstations (GPU/cooling repair); core network & security hardware (enterprise routers/switches, hardware firewalls); data-center UPS battery banks | **5021305003** | ICT Equipment |
| Repairs & Maintenance – Communication Equipment | Repairs and maintenance on communications equipment — **only capitalizable comms hardware** (originally ≥ ₱50,000). | Two-way radio base stations/repeaters; satellite phone antenna/screen replacement; enterprise boardroom video-conferencing systems | **5021305007** | Communications Equipment |
| Repairs & Maintenance – Printing Equipment | Repairs and maintenance on printing equipment — **only capitalizable printing hardware** (originally ≥ ₱50,000). | Heavy-duty copier/plotter drum units, fuser assemblies, gears; industrial ID card printer thermal heads | **5021305012** | Printing Equipment |
| Repairs and Maintenance – Semi-Expendable – ICT Equipment | Repairs of semi-expendable ICT equipment — hardware that **originally cost < ₱50,000**. | Desktop/laptop drive replacement, RAM upgrades, keyboard replacement; consumer scanners, basic switches, Wi-Fi routers | **5021321003** | Information and Communications Technology Equipment |
| Repairs and Maintenance – Semi-Expendable – Communication Equipment | Repairs of semi-expendable communications equipment — comms hardware that originally cost < ₱50,000. | Walkie-talkie clips/knobs/wiring; office desk phones (IP or analog on PBX); basic mobile phone screen/battery | **5021321007** | Communications Equipment |
| Repairs and Maintenance – Semi-Expendable – Printing Equipment | Repairs of semi-expendable printing equipment — printing hardware that originally cost < ₱50,000. | Desktop printer feed rollers, paper jams, printheads; small barcode label printers | **5021321011** | Printing Equipment |
| Repairs and Maintenance – Leased Assets – ICT Equipment | Repairs and maintenance of ICT machinery/equipment acquired by a **lessee under a finance lease contract** where the contract stipulates the agency covers certain maintenance costs. | Leased enterprise servers (contract-assigned minor maintenance); Managed Print Services out-of-warranty repairs caused by user error | **5021308004** | ICT Machinery and Equipment (under R&M – Leased Assets) |
| Rents – ICT Machineries and Equipment | Renting/leasing physical ICT hardware (computers, servers, network equipment, MFPs) from external vendors instead of purchasing outright. | Managed Print Services fleets; temporary event hardware (laptops, desktops, routers, LED screens for summits/conventions); on-premise server/NAS rental for temporary capacity | **5029905008** (· related 5029905009 Rents – Communication Networks) | Rents - ICT Machinery and Equipment |

---

## App category ids (stored in `.issp` files since schema v14)

| # | App id (`categoryId`) | Handout name | Class | Legacy code(s) |
|---|---|---|---|---|
| 1 | `co-ict-machinery-equipment` | ICT Machinery and Equipment | CO | 5060405003 |
| 2 | `co-communication-equipment` | Communication Equipment | CO | 5060405007 |
| 3 | `co-printing-equipment` | Printing Equipment | CO | 5060405012 |
| 4 | `co-ict-software` | ICT Software | CO | 5060405015, 5060602000 |
| 5 | `co-infrastructure-communications-network` | Infrastructure Outlay - Communications Network | CO | 5060403006, 5060101007 |
| 6 | `mooe-semi-expendable-ict-equipment` | Semi-Expendable - ICT Equipment | MOOE | 5020321003 |
| 7 | `mooe-semi-expendable-communication-equipment` | Semi-Expendable - Communication Equipment | MOOE | 5020321007 |
| 8 | `mooe-semi-expendable-printing-equipment` | Semi-Expendable - Printing Equipment | MOOE | 5020321011 |
| 9 | `mooe-ict-supplies` | ICT Supplies | MOOE | 5020301001 |
| 10 | `mooe-mobile-expenses` | Mobile Expenses | MOOE | 5020502001 |
| 11 | `mooe-landline-expenses` | Landline Expenses | MOOE | 5020502002 |
| 12 | `mooe-internet-subscription` | Internet Subscription Expenses | MOOE | 5020503000 |
| 13 | `mooe-cable-satellite-radio` | Cable, Satellite, Telegraph, and Radio Expenses | MOOE | 5020504000 |
| 14 | `mooe-ict-training` | ICT Training | MOOE | 5020201001, 5020201002* |
| 15 | `mooe-professional-services` | Professional Services | MOOE | 5021103001 |
| 16 | `mooe-ict-software-subscription` | ICT Software Subscription | MOOE | 5029907001 |
| 17 | `mooe-data-center-services` | Data Center Services | MOOE | 5029907002 |
| 18 | `mooe-cloud-computing` | Cloud Computing Services | MOOE | 5029907003 |
| 19 | `mooe-web-hosting` | Web Hosting Services | MOOE | — |
| 20 | `mooe-ict-research` | ICT Research Exploration and Development Expenses | MOOE | 5020702001 |
| 21 | `mooe-other-general-ict-services` | Other General ICT Services | MOOE | 5021200001 |
| 22 | `mooe-rm-infra-communications-network` | Repairs & Maintenance - Infra Assets - Communications Network | MOOE | 5021303006 |
| 23 | `mooe-rm-ict-equipment` | Repairs & Maintenance - ICT Equipment | MOOE | 5021305003 |
| 24 | `mooe-rm-communication-equipment` | Repairs & Maintenance - Communication Equipment | MOOE | 5021305007 |
| 25 | `mooe-rm-printing-equipment` | Repairs & Maintenance - Printing Equipment | MOOE | 5021305012 |
| 26 | `mooe-rm-semi-ict` | Repairs and Maintenance - Semi-Expendable - ICT Equipment | MOOE | 5021321003 |
| 27 | `mooe-rm-semi-communication` | Repairs and Maintenance - Semi-Expendable - Communication Equipment | MOOE | 5021321007 |
| 28 | `mooe-rm-semi-printing` | Repairs and Maintenance - Semi-Expendable - Printing Equipment | MOOE | 5021321011 |
| 29 | `mooe-rm-leased-ict` | Repairs and Maintenance - Leased Assets - ICT Equipment | MOOE | 5021308004 |
| 30 | `mooe-rents-ict` | Rents-ICT Machineries and Equipment | MOOE | 5029905008 |

\* 5020201002 is the generic "Training Expenses" code — mapped to ICT Training by the 2026-09-29
migration decision; every other unmapped legacy code is left uncategorized and flagged for review.

## Coverage vs. our implementation (`uacs_active.min.json`, 2026-09-29)

- **29 of 30** handout categories have an exact/near-exact object code in the dataset. Only
  **Web Hosting Services** is unmapped (see table above for nearest codes).
- **ICT chip coverage** (the `tags: ["ict"]` shortcut chips in `UacsCombobox`): 23 of 30 handout
  categories are surfaced as chips. **All six semi-expendable purchase/R&M codes exist in the
  dataset but carry no `ict` tag**, so they are reachable only via search.
- Chips present in our data but **not** handout categories: 5020502000 Telephone Expenses (generic
  parent), 5020901001 ICT Generation/Transmission/Distribution Expenses, 5021308005 R&M – Leased
  Assets – Communication Networks, 5029905009 Rents – Communication Networks, 5029999001 Website
  Maintenance.
- Combobox context filters (`uacs-combobox.tsx`): CO context = codes starting `506`; MOOE context =
  codes starting `502` — both align with the handout's CO/MOOE split.

## Naming crosswalk — orientation notes vs. handout (authoritative)

The transcript-based rows in `ISSP_Orientation_Notes_May25.md` §6 use two labels differently from
the handout. The **handout row names are authoritative**:

| Orientation notes label | Actual handout row |
|---|---|
| "Professional Services" (helpdesk/data-entry samples, "non-consultancy") | **Other General ICT Services** (5021200001) |
| "ICT Consultancy" (advisory experts) | **Professional Services** (5021103001 ICT Consultancy Services) |

## Notes & errata in the source

- The handout's Semi-Expendable ICT Equipment sample list is numbered "1–8, 09–12" in the original
  (item 9 "Monitor" printed as "09").
- "Integraged Development Environment (IDE)" and "agency hadles minor maintenance" are typos in the
  original handout, reproduced here only where marked *(sic)*.
- **ISSP formulation costs** explicitly belong under ICT Research, Exploration and Development
  Expenses (5020702001) — relevant when agencies budget the studies that produce this very plan.
