// End-to-end per-project distribution smoke (current UI):
//   master fixture → Distribute (kebab) with a project filter → assert the
//   downloaded JSON → open the scoped file in the editor → assert visibility
//   + Add-project availability → edit the scoped JSON on disk → Consolidate
//   back into the master → assert the merged IDB doc.
//
// Drives the REAL dialogs (no fixture authoring beyond the master). Carlos
// reaches dev over HTTP at the public IP = a NON-SECURE browsing context,
// where crypto.randomUUID is undefined. We reproduce that condition
// faithfully on localhost (reliable; the server's headless Chrome hitting its
// own public IP instead fails the dev HMR websocket via hairpin-NAT, a
// harness artifact unrelated to the code) by neutralizing crypto.randomUUID
// before each load. Any unguarded direct call would crash; the uuid()
// fallback must carry it.
//
// Helpers copied verbatim from scripts/smoke-roundtrip.mjs (encodes the
// randomUUID neutralization, trusted-click download rule, networkidle2, and
// fresh-page-per-phase gotchas).
//
// Prereq: fixture built (`npx tsx scripts/make-project-filter-fixture.ts`);
// dev server on :3000.
//   node scripts/smoke-project-filter.mjs
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const MASTER = "/tmp/smoke-project-filter/master.issp";
const DOWNLOAD_DIR = "/tmp/smoke-project-filter-downloads";

const browser = await puppeteer.launch({
  executablePath: "/root/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const fails = [];
const fail = (m) => { console.error("  ASSERT FAIL:", m); fails.push(m); };
const ok = (m) => console.log("  ok:", m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// ── helpers (verbatim from smoke-roundtrip.mjs) ─────────────────────────────

// A fresh page per phase. Repeated page.goto on one tab accumulates dev HMR
// websockets past networkidle's threshold and eventually hangs; a fresh page
// each phase keeps every navigation a reliable "first". Pages share the
// browser's default context (same IDB origin), and each phase loads its own
// file first, so IDB state is always re-established.
async function freshPage({ downloads = false } = {}) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  // Simulate Carlos's non-secure access: randomUUID is undefined there.
  await p.evaluateOnNewDocument(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  });
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  if (downloads) {
    const client = await p.target().createCDPSession();
    await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  }
  return p;
}

// The visible kebab trigger (desktop OR mobile render — pick the one with size).
async function visibleKebab(page) {
  return page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button[aria-label="More file actions"]')];
    const vis = btns.find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return vis || btns[0];
  });
}

// Open the kebab and click the menu item whose text matches `re`.
async function kebabClick(page, re) {
  const trig = await visibleKebab(page);
  if (!(await trig.asElement())) throw new Error("kebab trigger not found");
  await trig.asElement().click();
  await sleep(250);
  const clicked = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc);
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const t = items.find((el) => re.test(el.textContent || ""));
    if (!t) return false;
    t.click();
    return true;
  }, re.source);
  if (!clicked) throw new Error(`kebab item ${re} not found`);
  await sleep(150);
}

// Wait for any .issp to appear in DOWNLOAD_DIR (cleared before each capture),
// returning the newest by mtime. Race-free: no before-snapshot to miss a fast
// download on.
async function captureDownload(label) {
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith(".issp"));
    if (files.length > 0) {
      let newest = files[0];
      for (const f of files) {
        if (fs.statSync(path.join(DOWNLOAD_DIR, f)).mtimeMs >
            fs.statSync(path.join(DOWNLOAD_DIR, newest)).mtimeMs) newest = f;
      }
      ok(`${label}: downloaded ${newest}`);
      return path.join(DOWNLOAD_DIR, newest);
    }
  }
  fail(`${label}: no .issp downloaded`);
  return null;
}

// Read the current doc straight from IDB.
async function readDoc(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("issp-builder");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("documents", "readonly");
      const getReq = tx.objectStore("documents").get("current");
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
    };
    req.onerror = () => reject(req.error);
  }));
}

async function loadFile(page, filePath) {
  // networkidle2 (not 0): dev's persistent HMR websocket is a lingering
  // connection, so networkidle0 hangs; networkidle2 tolerates it while still
  // waiting long enough for React hydration so the upload's change event lands.
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("no file input on home page");
  await input.uploadFile(filePath);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 20000 });
  await page.waitForSelector("aside nav", { timeout: 15000 });
  await sleep(600);
}

let page;
try {
  // ═══ Phase A: generate a project-filtered scoped file ═════════════════════
  console.log("\n=== A: Distribute with project filter (via kebab) ===");
  page = await freshPage({ downloads: true });
  await loadFile(page, MASTER);
  await kebabClick(page, /Distribute to offices/);
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await sleep(300);

  // Tick Part III E1 + F (expand the Part III area, check both rows) and the
  // whole Part IV area checkbox. Selector notes (vs the brief):
  //  - the real section label is "E.1 Internal Projects" (src/lib/sections.ts),
  //    so the pattern is /E\.1/, not the brief's /E1\./ which matches nothing;
  //  - the brief's `li.querySelector("div span")` grabs the FIRST span in the
  //    row — the Radix checkbox's empty indicator <span>, not the label — so
  //    it never matches "Part IV". The area checkboxes carry aria-labels
  //    ("Part IV: Resource Requirements"), so select on those instead.
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const rows = [...dlg.querySelectorAll("li li")];
    for (const re of [/E\.1/, /F\./]) {
      const row = rows.find((li) => re.test(li.textContent || ""));
      row?.querySelector("[role='checkbox']")?.click();
    }
    const p4 = [...dlg.querySelectorAll("[role='checkbox']")].find((c) =>
      (c.getAttribute("aria-label") || "").startsWith("Part IV:"));
    p4?.click();
  });
  await sleep(250);

  // Projects panel must now exist; switch to Selected and check SIKAP only.
  const panelText = await page.$eval('[role="dialog"]', (e) => e.textContent || "");
  if (!/Projects/.test(panelText)) fail("Projects panel did not appear");
  else ok("Projects panel appeared after ticking project-bearing fields");

  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const label = [...dlg.querySelectorAll("label")].find((l) =>
      /Selected projects only/.test(l.textContent || ""));
    label?.click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const cb = dlg?.querySelector("[role='checkbox'][aria-label='SIKAP']");
    cb?.click();
  });
  await sleep(200);

  // Office name, then Generate (trusted click) and capture the download.
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const inp = dlg?.querySelector('input[aria-label="Office name"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "Maria Santos");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await sleep(250);
  const gen = await page.evaluateHandle(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return [...dlg.querySelectorAll("button")].find((x) => /Generate/.test(x.textContent || ""));
  });
  await gen.asElement()?.click();
  const scopedPath = await captureDownload("A");
  if (scopedPath && !/sikap\.issp$/i.test(scopedPath))
    fail(`expected project-slug filename, got: ${path.basename(scopedPath)}`);
  else ok("single-project filename uses project slug");

  // Node-side JSON asserts on the generated file.
  const scopedJson = JSON.parse(fs.readFileSync(scopedPath, "utf8"));
  const assertE = (cond, msg) => { if (!cond) fail(msg); else ok(msg); };
  assertE(JSON.stringify(scopedJson.editScope.projectIds) === '["proj-sikap"]',
    "editScope.projectIds = [proj-sikap]");
  assertE(scopedJson.part3.internalProjects.length === 1
    && scopedJson.part3.internalProjects[0].id === "proj-sikap", "E1 carries only SIKAP");
  assertE(scopedJson.part3.crossAgencyProjects.length === 0,
    "cross-agency projects stripped (unselected)");
  assertE(Object.keys(scopedJson.part3.performanceFramework).length === 1, "PF carries only SIKAP");
  assertE(Object.keys(scopedJson.part4.year1.internalProjects).length === 1, "year1 budget only SIKAP");
  assertE(scopedJson.part4.year1.officeProductivity.mooe.length === 0
    && scopedJson.part4.year1.officeProductivity.capitalOutlay.length === 0,
    "officeProductivity stripped from project file (CO + MOOE empty)");
  assertE(scopedJson.part4.year1.continuingCosts.mooe.length === 0,
    "continuingCosts stripped from project file");
  assertE(scopedJson.part3.proposedSystems.length === 1
    && scopedJson.part3.proposedSystems[0].id === "sys-hris", "linked-system context = HRIS only");

  // ═══ Phase B: open the scoped file in the editor ══════════════════════════
  console.log("\n=== B: scoped file visibility in the editor ===");
  await page.close();
  page = await freshPage();
  await loadFile(page, scopedPath);
  // Selector note: sidebar labels use the real "E.1" spelling (sections.ts),
  // so /E\.1/ replaces the brief's /E1/.
  const navText = await page.$eval("aside nav", (e) => e.textContent || "");
  if (!/E\.1/.test(navText)) fail("sidebar missing III-E1");
  if (/A\. Mandate/.test(navText)) fail("sidebar shows Part I (should be stripped)");
  if (!/Year 1/.test(navText)) fail("sidebar missing Part IV Year 1");
  else ok("sidebar shows only project-bearing sections");
  await page.evaluate(() => {
    const link = [...document.querySelectorAll("aside nav a")].find((a) => /E\.1/.test(a.textContent || ""));
    link?.click();
  });
  await sleep(600);
  const e1Text = await page.evaluate(() => document.body.textContent || "");
  if (!/SIKAP/.test(e1Text)) fail("E1 page missing SIKAP");
  if (/Records Digitization/.test(e1Text)) fail("E1 page shows unselected project");
  // Selector note: the E1 form's trigger button reads "Add Project"
  // (part3-e1-form.tsx); "Add project" (lowercase) is only the create-dialog
  // submit label, hidden until opened — so match both spellings.
  if (!/Add [Pp]roject/.test(e1Text)) fail("Add project button missing");
  else ok("E1 shows only SIKAP + Add project available");

  // Part IV Year 1: the two agency-wide budget categories are hidden in a
  // project-filtered scoped file; the selected project's budget is not.
  await page.evaluate(() => {
    const link = [...document.querySelectorAll("aside nav a")].find((a) =>
      /Year 1/.test(a.textContent || ""));
    link?.click();
  });
  await sleep(600);
  const y1Text = await page.evaluate(() => document.body.textContent || "");
  if (/Office Productivity/.test(y1Text)) fail("Year 1 page shows Office Productivity (should be hidden)");
  if (/Continuing Costs/.test(y1Text)) fail("Year 1 page shows Continuing Costs (should be hidden)");
  if (!/SIKAP/.test(y1Text)) fail("Year 1 page missing SIKAP budget section");
  else ok("Year 1 hides both agency-wide categories, shows SIKAP budget");

  // ═══ Phase C: edit the scoped JSON on disk, consolidate back ══════════════
  console.log("\n=== C: consolidate edited return into master (via kebab) ===");
  const edited = "/tmp/smoke-project-filter/edited.issp";
  scopedJson.part3.internalProjects[0].title = "SIKAP (revised)";
  scopedJson.part3.internalProjects.push(
    { id: "proj-new", title: "Training Program", description: "", objectives: "",
      projectType: "STANDALONE", linkedSystemIds: [], strategicAlignment: [],
      harmonizationFramework: [], implementingUnit: "HR", fundingSource: "",
      year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "2028" });
  scopedJson.part4.year1.internalProjects["proj-sikap"].mooe.push(
    { id: "li-new", item: "Connectivity", office: "IMD", uacsCode: "", uacsLabel: "",
      fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 12000 });
  fs.writeFileSync(edited, JSON.stringify(scopedJson, null, 2));

  await page.close();
  page = await freshPage();
  await loadFile(page, MASTER);
  await kebabClick(page, /Consolidate returned files/);
  await page.waitForSelector('[role="dialog"] input[type="file"]', { timeout: 5000 });
  const fileInput = await page.$('[role="dialog"] input[type="file"]');
  await fileInput.uploadFile(edited);
  await sleep(800);
  const applyBtn = await page.evaluateHandle(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return [...dlg.querySelectorAll("button")].find((x) => /Apply merge/.test(x.textContent || ""));
  });
  await applyBtn.asElement()?.click();
  await sleep(1000);

  const merged = await readDoc(page);
  const titles = merged.part3.internalProjects.map((p) => p.title);
  if (!titles.includes("SIKAP (revised)")) fail("merged master missing revised title");
  if (!titles.includes("Records Digitization")) fail("merged master lost untouched project");
  if (!titles.includes("Training Program")) fail("new project not unioned in");
  if (!merged.part4.year1.internalProjects["proj-sikap"].mooe.some((l) => l.id === "li-new"))
    fail("new budget line not merged");
  assertE(merged.part4.year1.internalProjects["proj-sikap"].capitalOutlay.some((l) => l.id === "co-1"),
    "existing capital line survived the merge");
  if (merged.part4.year1.officeProductivity.mooe.length !== 1)
    fail("officeProductivity corrupted");
  if (!(merged.consolidationFlags ?? []).includes("part3/e1"))
    fail("new-project review flag missing");
  else ok("consolidate: replace-by-id + union + flags all correct");
} catch (err) {
  console.error("FATAL:", err);
  fails.push(`FATAL: ${err.message}`);
} finally {
  await browser.close();
}

console.log("\n=== Summary ===");
if (fails.length === 0) {
  console.log("PASS — project-filter distribute → scoped editor → consolidate round-trip green");
  process.exit(0);
} else {
  console.log(`FAIL — ${fails.length} assertion(s):`);
  for (const f of fails) console.log("  -", f);
  process.exit(1);
}
