// Task 10 smoke: Consolidate UI — review screen, scalar-conflict resolution,
// stakeholders round-trip + idempotency, non-scoped rejection, masters-only gating.
//
// Authors scoped .issp fixtures directly (per the brief's suggestion — fiddlier
// to drive distribute→edit→re-import end-to-end in the browser).
//
// Prereq: dev server on :3000; NCWTR master demo at public/demo/.
//   node scripts/smoke-task10.mjs
import puppeteer from "puppeteer";
import fs from "node:fs";

const REAL_CHROME = "/root/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const DEMO = "/root/apps/issp/public/demo/ncwtr-issp-2026-2028.issp";

// ─── Fixture authoring ───────────────────────────────────────────────────────

const masterDoc = JSON.parse(fs.readFileSync(DEMO, "utf8"));

function authorScoped(path, officeId, officeName, editable, mutate) {
  // Start from a fresh master so non-owned data is the master's defaults (no
  // leakage of unrelated fields into the scoped file).
  const d = JSON.parse(JSON.stringify(masterDoc));
  d.editScope = {
    office: { id: officeId, name: officeName, displayLabel: officeName },
    editable,
    generatedAt: "2026-07-25T00:00:00.000Z",
  };
  mutate(d);
  fs.writeFileSync(path, JSON.stringify(d));
  console.log("  authored", path, "bytes=", fs.statSync(path).size);
}

// Office B owns part1/c.stakeholders and contributes 2 B-tagged rows.
authorScoped(
  "/tmp/task10-b-stakeholders.issp",
  "is-div",
  "Information Systems Division",
  ["part1/c.stakeholders"],
  (d) => {
    d.part1.stakeholders = [
      { id: "b1", rowId: "b1", officeId: "is-div", name: "ISD Stakeholder One", services: [] },
      { id: "b2", rowId: "b2", officeId: "is-div", name: "ISD Stakeholder Two", services: [] },
    ];
  }
);

// B v2: same office, same paths, different rows (idempotent replace).
authorScoped(
  "/tmp/task10-b-stakeholders-v2.issp",
  "is-div",
  "Information Systems Division",
  ["part1/c.stakeholders"],
  (d) => {
    d.part1.stakeholders = [
      { id: "b1f", rowId: "b1f", officeId: "is-div", name: "ISD Fixed One", services: [] },
      { id: "b2f", rowId: "b2f", officeId: "is-div", name: "ISD Fixed Two", services: [] },
    ];
  }
);

// Two offices both owning part1/b.cioName with different values (scalar conflict).
authorScoped(
  "/tmp/task10-a-conflict.issp",
  "off-a",
  "Office A",
  ["part1/b.cioName"],
  (d) => {
    d.part1.cioName = "Atty. Alvarez";
  }
);
authorScoped(
  "/tmp/task10-c-conflict.issp",
  "off-c",
  "Office C",
  ["part1/b.cioName"],
  (d) => {
    d.part1.cioName = "Atty. Cruz";
  }
);

// ─── Puppeteer ────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  executablePath: REAL_CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const fails = [];
function fail(msg) {
  console.error("ASSERT FAIL:", msg);
  fails.push(msg);
}
function ok(msg) {
  console.log("  ok:", msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read the master doc straight from IDB so we can assert exact field state
// without depending on DOM rendering of the merged values.
async function readDoc(page) {
  return page.evaluate(() => {
    return new Promise((resolve, reject) => {
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
    });
  });
}

// The scheduleSave debounce is 1500ms; wait long enough that the IDB write has
// landed before reading the doc back.
async function waitForSave() {
  await sleep(2200);
}

// Find the Consolidate button in the desktop sidebar (masters only).
async function findConsolidateBtn(page) {
  return page.evaluateHandle(() => {
    return [...document.querySelectorAll("aside button")].find((b) =>
      /Consolidate/.test(b.textContent || "")
    );
  });
}

// Find a file input by selector inside the dialog.
async function setDialogFiles(page, filePaths) {
  // The dialog's hidden multiple file input.
  const input = await page.$('[role="dialog"] input[type="file"][multiple]');
  if (!input) throw new Error("dialog file input not found");
  await input.uploadFile(...filePaths);
}

async function clickApply(page) {
  const btn = await page.evaluateHandle(() => {
    return [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
      /Apply merge/.test(b.textContent || "")
    );
  });
  if (!(await btn.asElement())) throw new Error("Apply button not found");
  await btn.asElement().click();
}

async function dialogText(page) {
  return page.$eval('[role="dialog"]', (el) => el.textContent || "");
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ── Load the master ───────────────────────────────────────────────────
  console.log("\n=== Setup: load master demo ===");
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
  let homeInput = await page.$('input[type="file"]');
  if (!homeInput) throw new Error("no file input on home page");
  await homeInput.uploadFile(DEMO);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
  await page.waitForSelector("aside nav", { timeout: 10000 });
  await sleep(500);
  // The demo's existing stakeholders — count them so we can assert "legacy +
  // B's rows" after the round-trip.
  const beforeDoc = await readDoc(page);
  const beforeStakeholders = beforeDoc.part1.stakeholders.length;
  const beforeCioName = beforeDoc.part1.cioName;
  console.log("  master before: stakeholders =", beforeStakeholders, ", cioName =", JSON.stringify(beforeCioName));
  ok("master demo loaded");

  // ── Masters-only: Consolidate button present on master ────────────────
  console.log("\n=== Test 4 (run early): masters-only gating ===");
  {
    const btn = await findConsolidateBtn(page);
    if (!(await btn.asElement())) fail("Consolidate button missing on master");
    else ok("Consolidate button present on master (next to Distribute)");
  }

  // ── 1. Stakeholders round-trip: open dialog, select B file ────────────
  console.log("\n=== Test 1: stakeholders round-trip ===");
  {
    const btn = await findConsolidateBtn(page);
    await btn.asElement().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await sleep(300);
    if (!/Consolidate returned files/.test(await dialogText(page)))
      fail("dialog title missing");
    else ok("dialog opened with title");

    await setDialogFiles(page, ["/tmp/task10-b-stakeholders.issp"]);
    await sleep(800); // parse + preview

    const text = await dialogText(page);
    if (!/Information Systems Division/.test(text)) fail("preview missing office label");
    if (!/Replace 2 stakeholder rows/.test(text))
      fail(`preview missing 'Replace 2 stakeholder rows' (got: ${text.slice(0, 400)})`);
    else ok("preview shows 'Replace 2 stakeholder rows for this office'");
    if (/conflict/i.test(text) && /Atty\. /.test(text))
      fail("unexpected conflict surfaced for clean stakeholders file");

    await clickApply(page);
    await sleep(800);
    if (await page.$('[role="dialog"]')) {
      // Dialog still open — likely an error toast. Capture for debug.
      const t = await dialogText(page);
      fail(`dialog did not close after Apply (text: ${t.slice(0, 300)})`);
    } else ok("dialog closed after Apply");

    await waitForSave();
    const after = await readDoc(page);
    const isdRows = after.part1.stakeholders.filter((s) => s.officeId === "is-div");
    if (isdRows.length !== 2) fail(`expected 2 is-div rows, got ${isdRows.length}`);
    else ok(`master has 2 is-div-tagged stakeholder rows after consolidate`);
    const isdNames = isdRows.map((r) => r.name).sort().join("|");
    if (isdNames !== "ISD Stakeholder One|ISD Stakeholder Two")
      fail(`unexpected is-div row names: ${isdNames}`);
    else ok("B v1 rows are 'One' and 'Two'");

    const totalCount = after.part1.stakeholders.length;
    console.log("    master after v1: stakeholders =", totalCount, "(is-div:", isdRows.length, ")");
  }

  // ── 2. Idempotent re-import: B v2 replaces v1 ────────────────────────
  console.log("\n=== Test 2: idempotent re-import (B v2) ===");
  {
    const btn = await findConsolidateBtn(page);
    await btn.asElement().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await sleep(300);
    await setDialogFiles(page, ["/tmp/task10-b-stakeholders-v2.issp"]);
    await sleep(800);
    const text = await dialogText(page);
    if (!/Replace 2 stakeholder rows/.test(text))
      fail(`v2 preview missing 'Replace 2 stakeholder rows' (got: ${text.slice(0, 300)})`);
    else ok("v2 preview shows 'Replace 2 stakeholder rows' (replace, not add)");
    if (/conflict/i.test(text) && /Atty\./.test(text))
      fail("unexpected conflict for v2 stakeholders");

    await clickApply(page);
    await sleep(800);
    if (await page.$('[role="dialog"]')) fail("v2 dialog did not close after Apply");
    else ok("v2 dialog closed after Apply");

    await waitForSave();
    const after = await readDoc(page);
    const isdRows = after.part1.stakeholders.filter((s) => s.officeId === "is-div");
    if (isdRows.length !== 2) fail(`idempotency: expected 2 is-div rows, got ${isdRows.length}`);
    else ok("idempotency: still 2 is-div rows (no duplicates)");
    const isdNames = isdRows.map((r) => r.name).sort().join("|");
    if (isdNames !== "ISD Fixed One|ISD Fixed Two")
      fail(`idempotency: v2 names not written (got ${isdNames})`);
    else ok("idempotency: B's rows are the v2 versions ('Fixed One', 'Fixed Two')");
    console.log("    master after v2: stakeholders =", after.part1.stakeholders.length);
  }

  // ── 3. Scalar conflict resolution ────────────────────────────────────
  console.log("\n=== Test 3: scalar conflict resolution ===");
  {
    const btn = await findConsolidateBtn(page);
    await btn.asElement().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await sleep(300);
    await setDialogFiles(page, ["/tmp/task10-a-conflict.issp", "/tmp/task10-c-conflict.issp"]);
    await sleep(900);
    const text = await dialogText(page);
    if (!/Resolve 1 conflict/.test(text))
      fail(`conflict header missing (got: ${text.slice(0, 400)})`);
    else ok("conflict section header present");
    if (!/Atty\. Alvarez/.test(text)) fail("conflict missing Office A value");
    if (!/Atty\. Cruz/.test(text)) fail("conflict missing Office C value");
    else ok("both office values surfaced in conflict UI");

    // Pick Office C's value (Atty. Cruz) — find the radio whose associated
    // value label includes "Atty. Cruz" and click it.
    const picked = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const labels = [...dialog.querySelectorAll("label")];
      const target = labels.find((l) => /Atty\. Cruz/.test(l.textContent || ""));
      if (!target) return false;
      const input = document.getElementById(target.getAttribute("for") || "");
      if (!input) {
        // Fallback: click the label itself (browser toggles associated control).
        target.click();
        return true;
      }
      input.click();
      return true;
    });
    if (!picked) fail("could not click Office C radio");
    else ok("picked Office C value 'Atty. Cruz'");

    await sleep(200);
    await clickApply(page);
    await sleep(900);
    if (await page.$('[role="dialog"]')) fail("conflict dialog did not close after Apply");
    else ok("conflict dialog closed after Apply");

    await waitForSave();
    const after = await readDoc(page);
    if (after.part1.cioName !== "Atty. Cruz")
      fail(`cioName after conflict pick: expected "Atty. Cruz", got ${JSON.stringify(after.part1.cioName)}`);
    else ok("master cioName = 'Atty. Cruz' (the picked value)");
    // Per merge contract: the section is flagged for review (consolidationFlags).
    if (!Array.isArray(after.consolidationFlags) || !after.consolidationFlags.includes("part1/b"))
      fail(`part1/b not in consolidationFlags (got ${JSON.stringify(after.consolidationFlags)})`);
    else ok("part1/b flagged for review (consolidationFlags)");
  }

  // ── 4. Rejection: non-scoped file ────────────────────────────────────
  console.log("\n=== Test 5: non-scoped file rejected ===");
  {
    const btn = await findConsolidateBtn(page);
    await btn.asElement().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await sleep(300);
    await setDialogFiles(page, [DEMO]);
    await sleep(800);
    const text = await dialogText(page);
    if (!/rejected/i.test(text)) fail("rejection callout missing");
    else ok("rejection callout shown");
    // The master demo's filename should be named in the rejection reason.
    if (!/ncwtr-issp-2026-2028/i.test(text))
      fail(`rejection does not name the file (got: ${text.slice(0, 300)})`);
    else ok("rejection names the offending file");
    // Apply must be disabled while there are rejections.
    const applyDisabled = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const btn = [...dialog.querySelectorAll("button")].find((b) => /Apply merge/.test(b.textContent || ""));
      return btn ? btn.disabled : null;
    });
    if (applyDisabled !== true) fail(`Apply not disabled with rejected file (got ${applyDisabled})`);
    else ok("Apply disabled with rejected file present");

    // Cancel/close.
    const cancel = await page.evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      return [...dialog.querySelectorAll("button")].find((b) => /Cancel/.test(b.textContent || ""));
    });
    if (await cancel.asElement()) await cancel.asElement().click();
    await sleep(300);

    // Master should be unchanged by the rejected attempt.
    await waitForSave();
    const after = await readDoc(page);
    if (after.part1.cioName !== "Atty. Cruz")
      fail(`master cioName changed by rejected attempt: ${JSON.stringify(after.part1.cioName)}`);
    else ok("master unchanged by rejected non-scoped file");
  }

  // ── 5. Masters-only: scoped file has no Consolidate button ───────────
  console.log("\n=== Test 6: scoped file has no Consolidate button ===");
  {
    // Load a scoped file via the home page input (fresh load → editor). Use a
    // fresh tab so the previous session's IDB write doesn't race the navigation.
    const fresh = await browser.newPage();
    await fresh.setViewport({ width: 1280, height: 900 });
    await fresh.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(800); // let React mount the home page file input
    const homeInput2 = await fresh.$('input[type="file"]');
    if (!homeInput2) throw new Error("no file input on home page (test 6)");
    await homeInput2.uploadFile("/tmp/task10-b-stakeholders.issp");
    await fresh.waitForFunction(() => location.pathname === "/editor", { timeout: 20000 });
    await fresh.waitForSelector("aside nav", { timeout: 10000 });
    await sleep(500);
    const btn = await findConsolidateBtn(fresh);
    if (await btn.asElement())
      fail("Consolidate button visible on a scoped file (should be masters-only)");
    else ok("Consolidate button hidden on scoped file (masters-only)");
    // Distribute button should also be hidden — sanity-check the symmetry.
    const distribute = await fresh.evaluateHandle(() =>
      [...document.querySelectorAll("aside button")].find((b) => /Distribute/.test(b.textContent || ""))
    );
    if (await distribute.asElement()) fail("Distribute button visible on scoped file");
    else ok("Distribute button also hidden on scoped file");
    await fresh.close();
  }
} catch (err) {
  console.error("FATAL:", err);
  fails.push(`FATAL: ${err.message}`);
} finally {
  await browser.close();
}

console.log("\n=== Summary ===");
if (fails.length === 0) {
  console.log("PASS — all Task 10 consolidate-UI checks passed");
  process.exit(0);
} else {
  console.log(`FAIL — ${fails.length} assertion(s) failed:`);
  for (const f of fails) console.log("  -", f);
  process.exit(1);
}
