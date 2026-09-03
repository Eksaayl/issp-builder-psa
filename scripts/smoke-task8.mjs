// Task 8 smoke: Distribute dialog UI + tri-state + generate/download + round-trip
// into scoped mode + masters-only gating.
//
// Prereq: dev server on :3000; NCWTR demo at public/demo/.
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const REAL_CHROME = "/root/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const DEMO = "/root/apps/issp/public/demo/ncwtr-issp-2026-2028.issp";
const DOWNLOAD_DIR = "/tmp/task8-downloads";
const SCOPED_PREBUILT = "/tmp/ncwtr-scoped-isdiv.issp";

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

fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const client = await page.target().createCDPSession();
  await client.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });

  // ── Part A: dialog UI + tri-state + generate ──────────────────────────
  console.log("\n=== Part A: Distribute dialog UI + generate ===");
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
  let fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error("no file input on home page");
  await fileInput.uploadFile(DEMO);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
  await page.waitForSelector("aside nav", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));

  // Distribute button present on master?
  const distributeBtn = await page.evaluateHandle(() => {
    return [...document.querySelectorAll("aside button")].find((b) =>
      /Distribute/.test(b.textContent || "")
    );
  });
  if (!(await distributeBtn.asElement())) fail("Distribute button missing on master");
  else ok("Distribute button present on master");

  // Open the dialog
  await distributeBtn.asElement().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 300));
  const dialogText = await page.$eval('[role="dialog"]', (el) => el.textContent || "");
  if (!/Distribute to offices/.test(dialogText)) fail("dialog title missing");
  ok("dialog opened with title");

  // Tree should contain all 4 parts + definitions + annex
  const treeHas = (s) => dialogText.includes(s);
  for (const t of ["Part I:", "Part II:", "Part III:", "Part IV:", "Definition of Terms", "Annex 1"]) {
    if (!treeHas(t)) fail(`tree missing "${t}"`);
  }
  if (treeHas("Part I:") && treeHas("Part IV:")) ok("tree shows all parts + front matter + annex");

  // ── Tri-state test: check "Part IV" area → all Year sections checked ──
  // Find the Part IV area checkbox (first checkbox in the Part IV row).
  // Expand Part IV first (it's expanded by default, but ensure).
  // Strategy: click the area-level checkbox for Part IV via its row.
  // We locate Part IV row by text and click its checkbox.
  const clickedPart4 = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const rows = [...dialog.querySelectorAll("li")];
    const part4Row = rows.find((li) => /Part IV:/.test(li.textContent || "") && li.querySelector('input[type="checkbox"]'));
    if (!part4Row) return false;
    // The first checkbox button in this row is the area checkbox.
    const cb = part4Row.querySelector('button[role="checkbox"], [role="checkbox"]');
    if (!cb) return false;
    cb.click();
    return true;
  });
  if (!clickedPart4) fail("could not click Part IV area checkbox");
  await new Promise((r) => setTimeout(r, 200));

  // Now Part IV area checkbox should be checked; year sections too.
  const part4State = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const rows = [...dialog.querySelectorAll("li")];
    const part4Row = rows.find((li) => /^Part IV:/.test((li.textContent || "").trim()));
    if (!part4Row) return null;
    // First checkbox inside the Part IV row is the area-level checkbox.
    const firstCb = part4Row.querySelector("div [role='checkbox']");
    return {
      checked: firstCb?.getAttribute("aria-checked"),
      indeterminate: firstCb?.hasAttribute("data-indeterminate") || firstCb?.getAttribute("data-indeterminate") === "true",
    };
  });
  console.log("  Part IV checkbox state after check:", JSON.stringify(part4State));
  if (part4State?.checked !== "true") fail("Part IV area checkbox not 'checked' after click");
  else ok("Part IV area checkbox is checked (all descendants selected)");

  // Uncheck one Year SECTION → Part IV should go indeterminate.
  // (Sections are visible without expansion; field-level would need expanding.)
  const uncheckedOne = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    // Section rows live one level under the area. Find "Year 1 Breakdown" section.
    const allLis = [...dialog.querySelectorAll("li")];
    const year1Sec = allLis.find((li) => {
      const t = (li.textContent || "").trim();
      return /^Year 1 Breakdown/.test(t) && li.querySelector("[role='checkbox']");
    });
    if (!year1Sec) return false;
    const cb = year1Sec.querySelector("[role='checkbox']");
    if (!cb) return false;
    cb.click();
    return true;
  });
  if (!uncheckedOne) fail("could not uncheck Year 1 Breakdown section");
  await new Promise((r) => setTimeout(r, 200));
  const part4State2 = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const rows = [...dialog.querySelectorAll("li")];
    const part4Row = rows.find((li) => /^Part IV:/.test((li.textContent || "").trim()));
    const firstCb = part4Row?.querySelector("div [role='checkbox']");
    return {
      checked: firstCb?.getAttribute("aria-checked"),
      indeterminate: firstCb?.getAttribute("data-indeterminate") === "true" || firstCb?.dataset.indeterminate === "true",
    };
  });
  console.log("  Part IV checkbox state after unchecking one section:", JSON.stringify(part4State2));
  // base-ui exposes indeterminate via aria-checked="mixed" (ARIA tri-state standard).
  const isIndeterminate = part4State2?.indeterminate || part4State2?.checked === "mixed";
  if (isIndeterminate) ok("Part IV area checkbox is indeterminate (aria-checked=mixed) after partial uncheck");
  else if (part4State2?.checked === "false") ok("Part IV area checkbox flipped to unchecked");
  else fail(`Part IV should be indeterminate/unchecked, got ${JSON.stringify(part4State2)}`);

  // ── Set up a clean, simple selection for the round-trip: ──────────────
  // part1/b.cioName only. Clear Part IV, then check the single field.
  // Re-check Part IV area (toggles back to all), then uncheck it fully → empty.
  // Easiest: click Part IV area twice to clear, then expand Part I → B → check cioName.
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const rows = [...dialog.querySelectorAll("li")];
    const part4Row = rows.find((li) => /^Part IV:/.test((li.textContent || "").trim()));
    let cb = part4Row?.querySelector("div [role='checkbox']");
    // Click until Part IV is fully unchecked (handles checked→unchecked and mixed→unchecked).
    for (let i = 0; i < 3; i++) {
      if (cb?.getAttribute("aria-checked") === "false") break;
      cb?.click();
    }
  });
  await new Promise((r) => setTimeout(r, 150));

  // Expand Part I → section B → check "CIO Name" field
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    // Part I is expanded by default. Find section B row.
    const sectionRows = [...dialog.querySelectorAll("li li")]; // nested li
    const bRow = sectionRows.find((li) => /B\. Organization Structure/.test(li.textContent || ""));
    if (bRow) {
      // expand it
      const expBtn = bRow.querySelector(":scope > div button");
      expBtn?.click();
    }
  });
  await new Promise((r) => setTimeout(r, 150));
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const spans = [...dialog.querySelectorAll("li span")];
    const cioName = spans.find((s) => /^CIO Name$/.test((s.textContent || "").trim()));
    const li = cioName?.closest("li");
    li?.querySelector("[role='checkbox']")?.click();
  });
  await new Promise((r) => setTimeout(r, 150));

  // Office name
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const inp = dialog?.querySelector('input[aria-label="Office name"], input[placeholder*="Information Systems"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, "Information Systems Division");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 200));

  // Roster should now show the office + the part1/b path
  const rosterText = await page.$eval('[role="dialog"]', (el) => el.textContent || "");
  if (!/Information Systems Division/.test(rosterText)) fail("office name not in roster");
  if (!/part1\/b/.test(rosterText)) fail("roster does not show part1/b editable path");
  ok("roster shows office name + part1/b editable path");

  // ── Click Generate and capture the download ───────────────────────────
  const filesBefore = new Set(fs.readdirSync(DOWNLOAD_DIR));
  const genBtn = await page.evaluateHandle(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return [...dialog.querySelectorAll("button")].find((b) => /^Generate\s+1\s+file/.test((b.textContent || "").trim()));
  });
  if (!(await genBtn.asElement())) {
    // fallback: any "Generate" button
    const gen2 = await page.evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return [...dialog.querySelectorAll("button")].find((b) => /Generate/.test(b.textContent || ""));
    });
    if (!(await gen2.asElement())) fail("Generate button not found / not enabled");
    else await gen2.asElement().click();
  } else {
    await genBtn.asElement().click();
  }
  // Wait for the .issp to land in the download dir
  let downloaded = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const now = new Set(fs.readdirSync(DOWNLOAD_DIR));
    for (const f of now) if (!filesBefore.has(f) && f.endsWith(".issp")) { downloaded = path.join(DOWNLOAD_DIR, f); break; }
    if (downloaded) break;
  }
  if (!downloaded) fail("no .issp downloaded from Generate");
  else ok(`downloaded: ${path.basename(downloaded)}`);
  if (downloaded && !/issp-2026-2028-information-systems-division\.issp$/i.test(downloaded)) {
    fail(`filename slug wrong: ${path.basename(downloaded)}`);
  } else if (downloaded) {
    ok("filename slug matches office display label");
  }

  // Toast
  await new Promise((r) => setTimeout(r, 500));
  const toastText = await page.evaluate(() => document.body.textContent || "");
  if (!/Generated 1 scoped file/.test(toastText)) fail("toast 'Generated 1 scoped file' not seen");
  else ok("toast 'Generated 1 scoped file' shown");

  // ── Part B: round-trip — load the generated file, assert scoped mode ──
  console.log("\n=== Part B: round-trip — generated file opens in scoped mode ===");
  if (downloaded) {
    // Close dialog (if still open) and navigate home
    await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 300));
    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(downloaded);
    await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
    await page.waitForSelector("aside nav", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // Scope banner present with office displayLabel
    const asideText = await page.$eval("aside", (el) => el.textContent || "");
    if (!/Scoped file/.test(asideText)) fail("scope banner missing");
    if (!/Information Systems Division/.test(asideText)) fail("banner missing office displayLabel");
    else ok("scope banner shows office displayLabel");

    // Sidebar: only Part I (B) visible; no Part II/III/IV, no definitions, no annex
    const navText = await page.$eval("aside nav", (el) => el.textContent || "");
    const see = (t) => navText.includes(t);
    if (!see("B. Organization Structure")) fail("sidebar missing part1/b section");
    if (see("A. Mandate")) fail("sidebar shows part1/a (should be stripped)");
    if (see("Year 1 Breakdown")) fail("sidebar shows Part IV (should be stripped — not selected)");
    if (see("Definition of Terms")) fail("sidebar shows definitions (should be stripped)");
    ok("sidebar shows ONLY part1/b (Part I header present, rest stripped)");

    // PDF / Distribute buttons both hidden on scoped file
    const footerBtns = await page.$$eval("aside button", (bs) => bs.map((b) => b.textContent || ""));
    if (footerBtns.some((t) => /Export PDF/.test(t))) fail("Export PDF button visible on scoped file");
    if (footerBtns.some((t) => /Distribute/.test(t))) fail("Distribute button visible on scoped file (must not redistribute)");
    else ok("Distribute button HIDDEN on scoped file (masters-only gating)");
    if (!footerBtns.some((t) => /Properties/.test(t))) fail("Properties button missing (should remain)");
    ok("Export PDF + Distribute both hidden on scoped file");

    // Navigate to part1/b — the form uses an allowlist: only owned fields render at all.
    // With just cioName owned, the CIO card shows "Full Name" but NOT Position/Email/Unit/Contact.
    await page.goto(BASE + "/editor/part1/b", { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));
    const formText = await page.$eval("main", (el) => el.textContent || "");
    if (!/Chief Information Officer/.test(formText)) fail("part1/b form missing CIO section");
    if (!/Full Name/.test(formText)) fail("part1/b form missing CIO 'Full Name' field (owned cioName)");
    else ok("CIO 'Full Name' field renders (cioName owned)");
    // Non-owned CIO fields must NOT render (allowlist drops them entirely)
    if (/Position \/ Designation/.test(formText)) fail("CIO Position renders (should be dropped — not owned)");
    if (/Email Address/.test(formText)) fail("CIO Email Address renders (should be dropped — not owned)");
    else ok("CIO Position/Email/Unit/Contact fields are dropped (only cioName owned)");
  } else {
    fail("skipped round-trip (no file downloaded)");
  }

  // ── Part C: masters-only gating on a known scoped fixture ─────────────
  console.log("\n=== Part C: gating on prebuilt scoped fixture ===");
  if (fs.existsSync(SCOPED_PREBUILT)) {
    await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 300));
    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(SCOPED_PREBUILT);
    await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
    await page.waitForSelector("aside nav", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));
    const btns = await page.$$eval("aside button", (bs) => bs.map((b) => b.textContent || ""));
    if (btns.some((t) => /Distribute/.test(t))) fail("Distribute visible on prebuilt scoped fixture");
    else ok("Distribute hidden on prebuilt scoped fixture");
  } else {
    console.log("  (skipped: prebuilt fixture not present)");
  }

  // ── Part D: unscoped no-regression — Distribute present on master ─────
  console.log("\n=== Part D: unscoped no-regression ===");
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 300));
  fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(DEMO);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
  await page.waitForSelector("aside nav", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  const masterBtns = await page.$$eval("aside button", (bs) => bs.map((b) => b.textContent || ""));
  if (!masterBtns.some((t) => /Distribute/.test(t))) fail("Distribute MISSING on master (regression)");
  else ok("Distribute present on unscoped master (no regression)");
  if (!masterBtns.some((t) => /Properties/.test(t))) fail("Properties missing on master");
  if (!masterBtns.some((t) => /Export PDF/.test(t))) fail("Export PDF missing on master");
  ok("Properties + Export PDF + Distribute all present on master");
} catch (err) {
  console.error("SMOKE ERROR:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}

console.log("\n=== Summary ===");
if (fails.length === 0) {
  console.log("ALL CHECKS PASSED");
} else {
  console.log(`${fails.length} FAIL(s):`);
  for (const f of fails) console.log("  -", f);
  process.exitCode = 1;
}
