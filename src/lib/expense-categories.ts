/**
 * Expense categories — the 30 fixed categories from the DICT UACS classification
 * handout (pp. 39–47; see references/UACS_Classification_Handout.md), behind
 * every Part IV line-item category control, the Summary B.4 tables (editor +
 * PDF) and the A-table group headers in the PDF export.
 *
 * These ids are STORED in `.issp` files, not just shown: changing one is a
 * data change. Renames or removals must go through a schemaVersion bump plus a
 * legacy mapping in migrateLegacyDoc (the fund-sources.ts precedent).
 *
 * `name` is the exact handout row name (authoritative). The numeric UACS codes
 * from the old combobox era live only in LEGACY_UACS_TO_CATEGORY — the app no
 * longer stores or displays codes.
 */

export type ExpenseClass = "capitalOutlay" | "mooe";

export interface ExpenseCategory {
  /** Stable kebab-case id — persisted in .issp files. */
  id: string;
  /** Exact DICT handout category name. */
  name: string;
  expenseClass: ExpenseClass;
  /** Display sub-section (optgroup label / PDF grouping). */
  group: string;
  /** Position in the handout's order (1–30); B.4 rows follow it. */
  order: number;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  // — Capital Outlay (CO) —
  { id: "co-ict-machinery-equipment", name: "ICT Machinery and Equipment", expenseClass: "capitalOutlay", group: "Capital Outlay", order: 1 },
  { id: "co-communication-equipment", name: "Communication Equipment", expenseClass: "capitalOutlay", group: "Capital Outlay", order: 2 },
  { id: "co-printing-equipment", name: "Printing Equipment", expenseClass: "capitalOutlay", group: "Capital Outlay", order: 3 },
  { id: "co-ict-software", name: "ICT Software", expenseClass: "capitalOutlay", group: "Capital Outlay", order: 4 },
  { id: "co-infrastructure-communications-network", name: "Infrastructure Outlay - Communications Network", expenseClass: "capitalOutlay", group: "Capital Outlay", order: 5 },

  // — MOOE · Semi-Expendable Assets & Supplies —
  { id: "mooe-semi-expendable-ict-equipment", name: "Semi-Expendable - ICT Equipment", expenseClass: "mooe", group: "Semi-Expendable Assets & Supplies", order: 6 },
  { id: "mooe-semi-expendable-communication-equipment", name: "Semi-Expendable - Communication Equipment", expenseClass: "mooe", group: "Semi-Expendable Assets & Supplies", order: 7 },
  { id: "mooe-semi-expendable-printing-equipment", name: "Semi-Expendable - Printing Equipment", expenseClass: "mooe", group: "Semi-Expendable Assets & Supplies", order: 8 },
  { id: "mooe-ict-supplies", name: "ICT Supplies", expenseClass: "mooe", group: "Semi-Expendable Assets & Supplies", order: 9 },

  // — MOOE · Connectivity & Communications —
  { id: "mooe-mobile-expenses", name: "Mobile Expenses", expenseClass: "mooe", group: "Connectivity & Communications", order: 10 },
  { id: "mooe-landline-expenses", name: "Landline Expenses", expenseClass: "mooe", group: "Connectivity & Communications", order: 11 },
  { id: "mooe-internet-subscription", name: "Internet Subscription Expenses", expenseClass: "mooe", group: "Connectivity & Communications", order: 12 },
  { id: "mooe-cable-satellite-radio", name: "Cable, Satellite, Telegraph, and Radio Expenses", expenseClass: "mooe", group: "Connectivity & Communications", order: 13 },

  // — MOOE · Services & Subscriptions —
  { id: "mooe-ict-training", name: "ICT Training", expenseClass: "mooe", group: "Services & Subscriptions", order: 14 },
  { id: "mooe-professional-services", name: "Professional Services", expenseClass: "mooe", group: "Services & Subscriptions", order: 15 },
  { id: "mooe-ict-software-subscription", name: "ICT Software Subscription", expenseClass: "mooe", group: "Services & Subscriptions", order: 16 },
  { id: "mooe-data-center-services", name: "Data Center Services", expenseClass: "mooe", group: "Services & Subscriptions", order: 17 },
  { id: "mooe-cloud-computing", name: "Cloud Computing Services", expenseClass: "mooe", group: "Services & Subscriptions", order: 18 },
  { id: "mooe-web-hosting", name: "Web Hosting Services", expenseClass: "mooe", group: "Services & Subscriptions", order: 19 },
  { id: "mooe-ict-research", name: "ICT Research Exploration and Development Expenses", expenseClass: "mooe", group: "Services & Subscriptions", order: 20 },
  { id: "mooe-other-general-ict-services", name: "Other General ICT Services", expenseClass: "mooe", group: "Services & Subscriptions", order: 21 },

  // — MOOE · Repairs, Maintenance & Rents —
  { id: "mooe-rm-infra-communications-network", name: "Repairs & Maintenance - Infra Assets - Communications Network", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 22 },
  { id: "mooe-rm-ict-equipment", name: "Repairs & Maintenance - ICT Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 23 },
  { id: "mooe-rm-communication-equipment", name: "Repairs & Maintenance - Communication Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 24 },
  { id: "mooe-rm-printing-equipment", name: "Repairs & Maintenance - Printing Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 25 },
  { id: "mooe-rm-semi-ict", name: "Repairs and Maintenance - Semi-Expendable - ICT Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 26 },
  { id: "mooe-rm-semi-communication", name: "Repairs and Maintenance - Semi-Expendable - Communication Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 27 },
  { id: "mooe-rm-semi-printing", name: "Repairs and Maintenance - Semi-Expendable - Printing Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 28 },
  { id: "mooe-rm-leased-ict", name: "Repairs and Maintenance - Leased Assets - ICT Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 29 },
  { id: "mooe-rents-ict", name: "Rents-ICT Machineries and Equipment", expenseClass: "mooe", group: "Repairs, Maintenance & Rents", order: 30 },
];

const BY_ID: Record<string, ExpenseCategory> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.id, c])
);

/** The category for a stored id, or undefined for "" / unknown ids. */
export function categoryById(id: string): ExpenseCategory | undefined {
  return BY_ID[id];
}

/** Categories selectable for a given expense class, in handout order. */
export function categoriesForClass(expenseClass: ExpenseClass): ExpenseCategory[] {
  return EXPENSE_CATEGORIES.filter((c) => c.expenseClass === expenseClass);
}

/** Handout position (1–30) of a category id; unknown ids sort last. */
export function categoryOrder(id: string): number {
  return BY_ID[id]?.order ?? Number.MAX_SAFE_INTEGER;
}

/** Display name for a stored id; "" when unset, the raw id when unknown. */
export function categoryName(id: string): string {
  if (!id) return "";
  return BY_ID[id]?.name ?? id;
}

/**
 * Legacy UACS object code → category id, for migrating pre-v14 .issp files.
 *
 * Exact matches for the handout's categories plus two official-code variants
 * that mean the same category (5060602000 Computer Software → ICT Software;
 * 5060101007 Investment Outlay → Communications Network infrastructure).
 * Per the 2026-09-29 migration decision, generic Training Expenses
 * (5020201002) also maps to ICT Training. Everything else returns undefined —
 * those line items are left uncategorized and flagged for review rather than
 * guessed.
 */
const LEGACY_UACS_TO_CATEGORY: Record<string, string> = {
  // Capital Outlay
  "5060405003": "co-ict-machinery-equipment",
  "5060405007": "co-communication-equipment",
  "5060405012": "co-printing-equipment",
  "5060405015": "co-ict-software",
  "5060602000": "co-ict-software",
  "5060403006": "co-infrastructure-communications-network",
  "5060101007": "co-infrastructure-communications-network",
  // MOOE — semi-expendable & supplies
  "5020321003": "mooe-semi-expendable-ict-equipment",
  "5020321007": "mooe-semi-expendable-communication-equipment",
  "5020321011": "mooe-semi-expendable-printing-equipment",
  "5020301001": "mooe-ict-supplies",
  // MOOE — connectivity
  "5020502001": "mooe-mobile-expenses",
  "5020502002": "mooe-landline-expenses",
  "5020503000": "mooe-internet-subscription",
  "5020504000": "mooe-cable-satellite-radio",
  // MOOE — services & subscriptions
  "5020201001": "mooe-ict-training",
  "5020201002": "mooe-ict-training", // generic Training Expenses (migration decision)
  "5021103001": "mooe-professional-services",
  "5029907001": "mooe-ict-software-subscription",
  "5029907002": "mooe-data-center-services",
  "5029907003": "mooe-cloud-computing",
  "5020702001": "mooe-ict-research",
  "5021200001": "mooe-other-general-ict-services",
  // MOOE — repairs, maintenance & rents
  "5021303006": "mooe-rm-infra-communications-network",
  "5021305003": "mooe-rm-ict-equipment",
  "5021305007": "mooe-rm-communication-equipment",
  "5021305012": "mooe-rm-printing-equipment",
  "5021321003": "mooe-rm-semi-ict",
  "5021321007": "mooe-rm-semi-communication",
  "5021321011": "mooe-rm-semi-printing",
  "5021308004": "mooe-rm-leased-ict",
  "5029905008": "mooe-rents-ict",
};

/** The category a legacy UACS code means, or undefined — never guess. */
export function categoryForLegacyUacs(code: string): string | undefined {
  return LEGACY_UACS_TO_CATEGORY[code];
}
