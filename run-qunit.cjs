/**
 * Headless QUnit runner for the SAPUI5 unit tests.
 * Spawns Puppeteer, opens the QUnit page served by `ui5 serve`,
 * collects results, prints a summary and exits non-zero on failure.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer");

const URL = process.env.QUNIT_URL || "http://localhost:8765/test/unit/unitTests.qunit.html";
const TIMEOUT_MS = parseInt(process.env.QUNIT_TIMEOUT_MS || "90000", 10);
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || resolveExecutablePath();

function walkExecutables(rootDir, fileName, bucket) {
  if (!fs.existsSync(rootDir)) return;
  fs.readdirSync(rootDir, { withFileTypes: true }).forEach((entry) => {
    var fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkExecutables(fullPath, fileName, bucket);
      return;
    }
    if (entry.isFile() && entry.name === fileName) bucket.push(fullPath);
  });
}

function newestExecutable(rootDir, fileName) {
  var matches = [];
  walkExecutables(rootDir, fileName, matches);
  if (!matches.length) return null;
  matches.sort(function (a, b) {
    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  });
  return matches[0];
}

function resolveExecutablePath() {
  var cacheRoot = path.join(os.homedir(), ".cache", "puppeteer");
  return newestExecutable(path.join(cacheRoot, "chrome-headless-shell"), "chrome-headless-shell") ||
    newestExecutable(path.join(cacheRoot, "chrome"), "Google Chrome for Testing") ||
    null;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  const consoleLines = [];
  page.on("console", (msg) => {
    consoleLines.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleLines.push(`[pageerror] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    consoleLines.push(`[requestfailed] ${req.url()} :: ${req.failure() && req.failure().errorText}`);
  });

  // Hook QUnit BEFORE any module loads.
  await page.evaluateOnNewDocument(() => {
    window.__qunitTests = [];
    window.__qunitResult = null;
    function hookQUnit(QUnit) {
      QUnit.testDone((details) => {
        window.__qunitTests.push({
          module: details.module,
          name: details.name,
          failed: details.failed,
          passed: details.passed,
          total: details.total,
          assertions: (details.assertions || []).map((a) => ({
            result: a.result,
            message: a.message,
            source: a.source
          }))
        });
      });
      QUnit.done((details) => {
        window.__qunitResult = {
          failed: details.failed,
          passed: details.passed,
          total: details.total,
          runtime: details.runtime
        };
      });
    }
    // QUnit is loaded via script tag synchronously in the HTML head, but we
    // can't rely on it existing yet at this exact moment. Defer until present.
    Object.defineProperty(window, "QUnit", {
      configurable: true,
      set(v) {
        Object.defineProperty(window, "QUnit", { value: v, writable: true, configurable: true });
        try { hookQUnit(v); } catch (e) {}
      },
      get() { return undefined; }
    });
  });

  if (PUPPETEER_EXECUTABLE_PATH) {
    console.log("→ browser", PUPPETEER_EXECUTABLE_PATH);
  }
  console.log(`→ opening ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

  try {
    await page.waitForFunction("window.__qunitResult !== null", { timeout: TIMEOUT_MS, polling: 200 });
  } catch (e) {
    console.error("\n‼  Timeout waiting for QUnit.done()");
    console.error("--- Browser console (tail) ---");
    consoleLines.slice(-40).forEach((l) => console.error(l));
    await browser.close();
    process.exit(2);
  }

  const result = await page.evaluate(() => window.__qunitResult);
  const tests = await page.evaluate(() => window.__qunitTests);

  console.log("\n=== QUnit results ===");
  for (const t of tests) {
    const tag = t.failed ? "FAIL" : "ok  ";
    console.log(`  [${tag}] ${t.module} :: ${t.name}  (${t.passed}/${t.total})`);
    if (t.failed) {
      for (const a of t.assertions) {
        if (!a.result) {
          console.log(`         × ${a.message}`);
          if (a.source) {
            const firstLine = String(a.source).split("\n")[0];
            console.log(`           at ${firstLine}`);
          }
        }
      }
    }
  }
  console.log(`\n  total: ${result.passed}/${result.total}  failed: ${result.failed}  runtime: ${result.runtime}ms`);

  await browser.close();
  process.exit(result.failed === 0 ? 0 : 1);
})().catch((err) => {
  if (!PUPPETEER_EXECUTABLE_PATH) {
    console.error("Runner note: no cached browser executable was found. Set PUPPETEER_EXECUTABLE_PATH if needed.");
  }
  console.error("Runner error:", err);
  process.exit(3);
});
