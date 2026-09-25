// Builds the master fixture used by scripts/smoke-project-filter.mjs.
// Run: npx tsx scripts/make-project-filter-fixture.ts
import fs from "node:fs";
import assert from "node:assert/strict";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IctProject, KpiRow, LineItem, ProposedSystem } from "../src/lib/store/types";

const OUT_DIR = "/tmp/smoke-project-filter";
const OUT = `${OUT_DIR}/master.issp`;

function sys(id: string, name: string): ProposedSystem {
  return { id, name, classification: "", frontline: false, frontlineAccessType: "",
    url: "", description: "", status: "", enhancementDetails: "", developmentStrategy: "",
    developmentPlatform: "", databaseName: "", dataStorage: "", internalUsers: "",
    externalUsers: "", owner: "",
    interoperability: { integrated: false, internalSystems: "", externalSystems: "",
      generatesData: false, processesExternalData: false, sharedPlatform: false },
    pia: { processesPersonalInfo: "", piaRequired: false } };
}
function proj(id: string, title: string, linked: string[]): IctProject {
  return { id, title, description: "smoke", objectives: "", projectType: "IS_DRIVEN",
    linkedSystemIds: linked, strategicAlignment: [], harmonizationFramework: [],
    implementingUnit: "IMD", fundingSource: "General Appropriations Act (GAA)",
    year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "2028" };
}
function kpiRow(id: string): KpiRow {
  return { id, hierarchy: "Output", targetedResult: "", indicator: `ind-${id}`, baseline: "",
    year1Target: "", year2Target: "", year3Target: "", dataCollectionMethod: "", responsibleUnit: "IMD" };
}
function line(id: string, item: string): LineItem {
  return { id, item, office: "IMD", uacsCode: "", uacsLabel: "",
    fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1000 };
}

const doc = createEmptyDocument({
  title: "Smoke Master ISSP", startYear: 2028, endYear: 2030, amendmentNumber: 0,
  scope: "AGENCY_WIDE", agencyHeadName: "Dir. Smoke",
  agency: { name: "Smoke Agency", acronym: "SMK", type: "NGA", websiteUrl: "", logoBase64: null },
});

doc.part3.proposedSystems = [sys("sys-hris", "HRIS"), sys("sys-fin", "Finance")];
doc.part3.internalProjects = [
  proj("proj-sikap", "SIKAP", ["sys-hris"]),
  proj("proj-records", "Records Digitization", ["sys-fin"]),
];
doc.part3.crossAgencyProjects = [proj("proj-portal", "Bayanihan Portal", [])];
doc.part3.performanceFramework = {
  "proj-sikap": { projectTitle: "SIKAP", projectCategory: "internal", rows: [kpiRow("k-sikap")] },
  "proj-records": { projectTitle: "Records Digitization", projectCategory: "internal", rows: [kpiRow("k-rec")] },
  "proj-portal": { projectTitle: "Bayanihan Portal", projectCategory: "crossAgency", rows: [kpiRow("k-por")] },
};
doc.part4.year1 = {
  officeProductivity: { capitalOutlay: [], mooe: [line("op-1", "Office connectivity")] },
  internalProjects: {
    "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [line("co-1", "Servers")], mooe: [] },
    "proj-records": { projectTitle: "Records Digitization", capitalOutlay: [], mooe: [line("m-1", "Scanning")] },
  },
  crossAgencyProjects: {
    "proj-portal": { projectTitle: "Bayanihan Portal", capitalOutlay: [], mooe: [line("m-2", "Hosting")] },
  },
  continuingCosts: { mooe: [line("cc-1", "Licenses")] },
};
doc.part4.year2.internalProjects = {
  "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [], mooe: [line("y2-1", "Maintenance")] },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));

// self-check
const back = JSON.parse(fs.readFileSync(OUT, "utf8"));
assert.equal(back.fileType, "issp-main");
assert.equal(back.part3.internalProjects.length, 2);
assert.equal(back.part4.year1.officeProductivity.mooe.length, 1);
console.log(`✓ fixture written: ${OUT}`);
