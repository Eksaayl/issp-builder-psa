// Task 1 repro: editing/adding an office in /editor/annex1 must surface in the
// sidebar's "Unsaved changes" expanded list. The boolean `unsavedToFile` already
// works (Save button turns amber); only the per-section breakdown was missing
// Annex 1 because (a) getChangedFields had no "annexes/annex1" branch and
// (b) the sidebar `groups` array never iterated ANNEX_SECTIONS.
//
// Boilerplate (Chrome path, IDB-load-via-home-file-input, pickCentralAndContinue)
// is copied verbatim from scripts/smoke-task6.mjs. Only the assertion body is new.
import puppeteer from "puppeteer";

const CHROME = "/root/.cache/puppeteer/chrome/linux-148.0.7778.167/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const DEMO = "/root/apps/issp/public/demo/ncwtr-issp-2026-2028.issp";
const SAVE_DEBOUNCE_MS = 1500;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

async function clickByText(page, selector, text) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = await page.evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim(), h);
    if (t === text) { await h.click(); return true; }
  }
  return false;
}

async function loadFixtureAndGoto(page, fixturePath, targetPath, readyText) {
  // Upload via the home page file input → loadFromFile sets savedSnapshot (a
  // deep clone of the migrated doc). We MUST NOT do a full page.goto after
  // this: a reload re-initialises the store from IDB and leaves savedSnapshot
  // null, which sends the sidebar down the fresh-load fallback path (based on
  // lastEditedAt) instead of the snapshot path that calls getChangedFields.
  // So we navigate client-side by clicking the sidebar link.
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("no file input on home page");
  await input.uploadFile(fixturePath);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 });
  await page.waitForSelector("aside nav", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  // Client-side navigation preserves the in-memory savedSnapshot. Use a native
  // .click() via evaluate (not Puppeteer's ElementHandle.click) — the annex
  // link sits below the sidebar's scroll fold and Puppeteer's viewport-click
  // misses it.
  const clicked = await page.evaluate((href) => {
    const link = document.querySelector(`aside nav a[href="${href}"]`);
    if (!link) return false;
    link.click();
    return true;
  }, targetPath);
  if (!clicked) throw new Error(`sidebar link to ${targetPath} not found`);
  await page.waitForFunction((p) => location.pathname === p, { timeout: 15000 }, targetPath);
  await page.waitForFunction((p) => location.pathname === p, { timeout: 15000 }, targetPath);
  if (readyText) await page.waitForSelector(`text/${readyText}`, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 600));
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
    const t = await page.evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim(), h);
    if (t.startsWith("Central Office")) { await h.click(); found = true; break; }
  }
  if (!found) throw new Error("could not pick Central Office type");
  await new Promise((r) => setTimeout(r, 300));
  const cont = await clickByText(page, "button", "Continue →");
  if (!cont) throw new Error("could not click Continue →");
  // Lands on /editor/annex1/edit?type=central — wait for the edit form's save
  // button (also labeled "Add office") to appear.
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === "Add office"),
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 400));
}

let exitCode = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Load the demo doc into IDB (sets savedSnapshot) and go to Annex 1.
  await loadFixtureAndGoto(page, DEMO, "/editor/annex1", "Annex 1 — ICT Asset Inventory");

  // 2. Pick Central Office → land on the edit form.
  await pickCentralAndContinue(page);

  // 3. Type a count so the saved payload is a real change (not all zeros).
  //    The inventory table renders number inputs with placeholder="0".
  await page.waitForSelector('input[placeholder="0"]', { timeout: 8000 });
  const firstCount = await page.$('input[placeholder="0"]');
  if (firstCount) {
    await firstCount.click({ clickCount: 3 });
    await firstCount.type("5");
  }
  await new Promise((r) => setTimeout(r, 300));

  // 4. Save — the edit form's save button is labeled "Add office". It persists
  //    the office into doc.annexedOffices (in-memory + IDB) and routes back to
  //    /editor/annex1. savedSnapshot is NOT touched → unsavedToFile flips true.
  const saved = await clickByText(page, "button", "Add office");
  if (!saved) throw new Error("could not click save 'Add office' on edit form");
  await page.waitForFunction(() => location.pathname === "/editor/annex1", { timeout: 15000 });
  // Let the IDB save debounce flush + React re-render the sidebar.
  await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 900));

  // 5. Open the sidebar "Unsaved changes" expander and read ONLY its panel.
  //    Scoping to the toggle's parent container is essential: the bare body
  //    text always contains "Annex 1" (nav link) and "Central Office" (main
  //    content list), which would mask the bug. The tracker panel is the only
  //    place that should list them together as a *changed section*.
  //    Desktop sidebar (1280px viewport) renders the toggle when unsavedToFile;
  //    the mobile footer uses a <span>, not a button, so it won't match.
  await new Promise((r) => setTimeout(r, 400));
  const panelText = await page.evaluate(() => {
    const toggle = [...document.querySelectorAll("button")].find((b) => /Unsaved changes/i.test(b.textContent || ""));
    if (!toggle) return { text: "", clicked: false };
    toggle.click();
    // The toggle + expanded panel share a wrapper <div>; read only that.
    const wrapper = toggle.parentElement;
    return { text: wrapper ? wrapper.innerText : "", clicked: true };
  });
  if (!panelText.clicked) {
    console.error("FAIL: could not find 'Unsaved changes' toggle (unsavedToFile never became true?)");
    exitCode = 3;
  } else {
    // Give the expanded panel a tick to render after the click, then re-read.
    await new Promise((r) => setTimeout(r, 300));
    const panelText2 = await page.evaluate(() => {
      const toggle = [...document.querySelectorAll("button")].find((b) => /Unsaved changes/i.test(b.textContent || ""));
      const wrapper = toggle ? toggle.parentElement : null;
      return wrapper ? wrapper.innerText : "";
    });

    const hasAnnex1 = /Annex 1/i.test(panelText2);
    const hasCentral = /Central Office/i.test(panelText2);
    const ok = hasAnnex1 && hasCentral;

    console.log("---- tracker panel text ----");
    console.log(panelText2.trim());
    console.log("----------------------------");
    console.log("hasAnnex1:", hasAnnex1, "hasCentralOffice:", hasCentral);
    console.log(ok ? "PASS: tracker lists Annex 1 / Central Office" : "FAIL: tracker missing Annex 1");
    exitCode = ok ? 0 : 1;
  }
  await page.close();
} catch (e) {
  console.error("ERROR:", e.message);
  exitCode = 2;
}

await browser.close();
process.exit(exitCode);
