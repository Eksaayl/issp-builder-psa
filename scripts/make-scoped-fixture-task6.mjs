// Task 6 fixture: an office that owns BOTH shared tables (stakeholders + Annex 1).
// Used by smoke-task6.mjs to assert rowId/officeId stamps land on the persisted doc.
import fs from "node:fs";

const SRC = "public/demo/ncwtr-issp-2026-2028.issp";
const OUT = "/tmp/ncwtr-scoped-task6.issp";

const doc = JSON.parse(fs.readFileSync(SRC, "utf8"));
doc.editScope = {
  office: {
    id: "task6-rosario",
    name: "Task6 Office",
    displayLabel: "Task 6 Field Office — Rosario",
  },
  editable: ["part1/c.stakeholders", "annexes/annex1"],
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(OUT, JSON.stringify(doc));
console.log("wrote", OUT, "bytes=", fs.statSync(OUT).size);
