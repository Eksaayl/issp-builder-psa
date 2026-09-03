// Task 6 smoke: assert provenance stamps land on the persisted doc in scoped mode,
// and are ABSENT in unscoped mode (no-regression). Reads the doc out of IDB after
// each add — avoids save-to-file download plumbing.
//
// Each scenario uses a fresh page so the first `goto` per page is a clean load
// (Puppeteer's lifecycle watcher hangs on subsequent navigations under the dev
// server's HMR websocket once a doc is loaded).
//
// Stakeholders: add a row in scoped mode → row has rowId + officeId.
// Annex 1: add an office in scoped mode → payload has officeId.
// Unscoped demo: add stakeholder → no officeId/rowId keys. Add annex office → no officeId.
import puppeteer from "puppeteer";

const CHROME = "/root/.cache/puppeteer/chrome/linux-148.0.7778.167/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const SCOPED = "/tmp/ncwtr-scoped-task6.issp";
const DEMO = "/root/apps/issp/public/demo/ncwtr-issp-2026-2028.issp";
const EXPECTED_OFFICE_ID = "task6-rosario";
const SAVE_DEBOUNCE_MS = 1500;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

let fails = 0;
function fail(msg) {
  console.error("ASSERT FAIL:", msg);
  fails++;
}

async function readDoc(page) {
  return await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open("issp-builder", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents");
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("documents", "readonly");
        const getReq = tx.objectStore("documents").get("current");
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function loadFixtureAndGoto(page, fixturePath, targetPath, readyText) {
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("no file input on home page");
  await input.uploadFile(fixturePath);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
  await page.waitForSelector("aside nav", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.goto(BASE + targetPath, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (readyText) await page.waitForSelector(`text/${readyText}`, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 600));
}

async function clickByText(page, selector, text) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = (await page.evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim(), h));
    if (t === text) { await h.click(); return true; }
  }
  return false;
}

async function pickCentralAndContinue(page) {
  // Click "Add office" on /editor/annex1 → /editor/annex1/new (OfficeSelector)
  let clicked = await clickByText(page, "button", "Add office");
  if (!clicked) throw new Error("could not click first 'Add office'");
  await page.waitForSelector("text/Who is filling out this form?", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 300));
  const handles = await page.$$("button");
  let found = false;
  for (const h of handles) {
    const t = (await page.evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim(), h));
    if (t.startsWith("Central Office")) { await h.click(); found = true; break; }
  }
  if (!found) throw new Error("could not pick Central Office type");
  await new Promise((r) => setTimeout(r, 300));
  const cont = await clickByText(page, "button", "Continue →");
  if (!cont) throw new Error("could not click Continue →");
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === "Add office"),
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 400));
}

async function newScenario() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  return page;
}

async function addStakeholderViaTableMode(page, label) {
  const edit = await clickByText(page, "button", "Edit table");
  if (!edit) fail(`${label}: could not click 'Edit table'`);
  await new Promise((r) => setTimeout(r, 300));
  const added = await clickByText(page, "button", "Add Stakeholder");
  if (!added) fail(`${label}: could not click 'Add Stakeholder'`);
  await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 900));
}

// ── Scenario 1: SCOPED stakeholders ──
try {
  const page = await newScenario();
  await loadFixtureAndGoto(page, SCOPED, "/editor/part1/c", "Stakeholder Analysis");
  await addStakeholderViaTableMode(page, "scoped-stakeholders");
  const doc = await readDoc(page);
  const rows = doc?.part1?.stakeholders ?? [];
  const last = rows[rows.length - 1];
  console.log("[1 SCOPED stakeholders] keys:", JSON.stringify(Object.keys(last ?? {}).sort()));
  console.log("[1 SCOPED stakeholders] officeId:", last?.officeId, "rowId:", last?.rowId);
  if (!last) fail("scoped: no stakeholder row");
  else {
    if (last.officeId !== EXPECTED_OFFICE_ID) fail(`scoped stakeholder officeId wrong (want ${EXPECTED_OFFICE_ID}, got ${last.officeId})`);
    if (!last.rowId) fail("scoped stakeholder rowId absent");
  }
  await page.close();
} catch (e) { console.error("S1 ERROR:", e.message); fails++; }

// ── Scenario 2: SCOPED Annex 1 ──
try {
  const page = await newScenario();
  await loadFixtureAndGoto(page, SCOPED, "/editor/annex1", "Annex 1 — ICT Asset Inventory");
  await pickCentralAndContinue(page);
  const save = await clickByText(page, "button", "Add office");
  if (!save) fail("scoped annex1: could not click save 'Add office'");
  await page.waitForFunction(() => location.pathname === "/editor/annex1", { timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 900));
  const doc = await readDoc(page);
  const arr = doc?.annexedOffices ?? [];
  const last = arr[arr.length - 1];
  console.log("[2 SCOPED annex1] payload keys:", JSON.stringify(Object.keys(last ?? {}).sort()));
  console.log("[2 SCOPED annex1] officeId:", last?.officeId, "displayLabel:", last?.office?.displayLabel);
  if (!last) fail("scoped annex1: no payload");
  else if (last.officeId !== EXPECTED_OFFICE_ID) fail(`scoped annex1 officeId wrong (want ${EXPECTED_OFFICE_ID}, got ${last.officeId})`);
  await page.close();
} catch (e) { console.error("S2 ERROR:", e.message); fails++; }

// ── Scenario 3: UNSCOPED demo stakeholders ──
try {
  const page = await newScenario();
  await loadFixtureAndGoto(page, DEMO, "/editor/part1/c", "Stakeholder Analysis");
  await addStakeholderViaTableMode(page, "unscoped-stakeholders");
  const doc = await readDoc(page);
  const rows = doc?.part1?.stakeholders ?? [];
  const last = rows[rows.length - 1];
  console.log("[3 UNSCOPED stakeholders] keys:", JSON.stringify(Object.keys(last ?? {}).sort()));
  if (!last) fail("unscoped: no stakeholder row");
  else {
    if ("officeId" in last) fail(`unscoped stakeholder has officeId (regression): ${last.officeId}`);
    if ("rowId" in last) fail(`unscoped stakeholder has rowId (regression): ${last.rowId}`);
  }
  await page.close();
} catch (e) { console.error("S3 ERROR:", e.message); fails++; }

// ── Scenario 4: UNSCOPED demo Annex 1 ──
try {
  const page = await newScenario();
  await loadFixtureAndGoto(page, DEMO, "/editor/annex1", "Annex 1 — ICT Asset Inventory");
  await pickCentralAndContinue(page);
  const save = await clickByText(page, "button", "Add office");
  if (!save) fail("unscoped annex1: could not click save 'Add office'");
  await page.waitForFunction(() => location.pathname === "/editor/annex1", { timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 900));
  const doc = await readDoc(page);
  const arr = doc?.annexedOffices ?? [];
  const last = arr[arr.length - 1];
  console.log("[4 UNSCOPED annex1] payload keys:", JSON.stringify(Object.keys(last ?? {}).sort()));
  if (!last) fail("unscoped annex1: no payload");
  else if ("officeId" in last) fail(`unscoped annex1 payload has officeId (regression): ${last.officeId}`);
  await page.close();
} catch (e) { console.error("S4 ERROR:", e.message); fails++; }

console.log("\nRESULT:", fails === 0 ? "PASS" : `FAIL (${fails} assertion${fails > 1 ? "s" : ""})`);
await browser.close();
process.exitCode = fails === 0 ? 0 : 1;
