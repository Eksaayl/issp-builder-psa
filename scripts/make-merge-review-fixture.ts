// Fixtures for scripts/smoke-merge-review.mjs: a master (the demo ISSP) and
// two returned scoped files that between them produce every headline change
// kind — rich-text overwrite, clear, object cells, replaced / removed /
// appended rows, a Part IV line item, a field conflict, and a provenance
// warning.
// Run: npx tsx scripts/make-merge-review-fixture.ts <out-dir>
import { readFileSync, writeFileSync } from "node:fs";
import { sliceScopedDoc } from "../src/lib/scope/slice";
import { migrateLegacyDoc } from "../src/lib/store/index";
import type { IsspDocument } from "../src/lib/store/types";

const out = process.argv[2];
if (!out) throw new Error("usage: npx tsx scripts/make-merge-review-fixture.ts <out-dir>");

const master = migrateLegacyDoc(JSON.parse(readFileSync("public/demo/ncwtr-issp-2026-2028.issp", "utf8")) as IsspDocument);
delete master.migrationReview;
writeFileSync(`${out}/review-master.issp`, JSON.stringify(master));

const cut = (id: string, name: string, editable: string[]) =>
  JSON.parse(JSON.stringify(sliceScopedDoc(master, { office: { id, name, displayLabel: name }, editable }))) as IsspDocument;

// ICT Division: rich-text vision, CIO name + e-mail, Human Capital, IS Inventory, Year 1 budget.
const a = cut("office-a", "ICT Division", [
  "part1/a.visionStatement", "part1/b.cioName", "part1/b.cioEmail", "part1/b.humanCapital",
  "part2/c.informationSystems", "part4/year1.year1",
]);
a.part1.visionStatement = master.part1.visionStatement.replace(/\w+(?=[^\w]*$)/, "nation");
a.part1.cioName = "Engr. Maria Santos";
a.part1.cioEmail = "";
a.part1.humanCapital.plantilla.it.male += 2;
const is = a.part2.informationSystems;
is[0] = { ...is[0], name: `${is[0].name} v2`, url: "https://example.gov.ph" };
is.splice(1, 1); // removes the master's second system
is.push({ ...is[0], id: "sys-new-helpdesk", name: "Helpdesk Ticketing" });
const co = a.part4.year1.officeProductivity.capitalOutlay;
co[0] = { ...co[0], qty: co[0].qty + 5 };
writeFileSync(`${out}/review-office-a.issp`, JSON.stringify(a));

// Planning Office: a different CIO name (conflict), a new system (appended), another ISSP's title (provenance).
const b = cut("office-b", "Planning Office", ["part1/b.cioName", "part2/c.informationSystems"]);
b.part1.cioName = "Dr. Jose Reyes";
b.part2.informationSystems.push({ ...b.part2.informationSystems[0], id: "sys-new-dms", name: "Document Management" });
b.title = "NCWTR ISSP 2025-2027";
writeFileSync(`${out}/review-office-b.issp`, JSON.stringify(b));

console.log(`merge-review fixtures written to ${out}`);
