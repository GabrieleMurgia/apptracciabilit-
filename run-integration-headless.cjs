/**
 * Starts a local UI5 server when needed, runs the headless OPA suite,
 * reads the final QUnit DOM report, and always tears the server down.
 */
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const PORT = parseInt(process.env.UI5_IT_PORT || "8766", 10);
const HOST = process.env.UI5_TEST_HOST || "localhost";
const QUNIT_URL = process.env.QUNIT_URL || "http://" + HOST + ":" + PORT + "/test/integration/opaTests.qunit.html";
const UI5_HEALTH_URL = "http://" + HOST + ":" + PORT + "/test/integration/opaTests.qunit.html";
const UI5_CONFIG = process.env.UI5_TEST_CONFIG || "ui5-test.yaml";
const UI5_BIN = require.resolve("@ui5/cli/bin/ui5.cjs");
const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;
const QUNIT_TIMEOUT_MS = parseInt(process.env.QUNIT_TIMEOUT_MS || "180000", 10);
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || resolveExecutablePath();

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function walkExecutables(rootDir, fileName, bucket) {
  if (!fs.existsSync(rootDir)) return;
  fs.readdirSync(rootDir, { withFileTypes: true }).forEach(function (entry) {
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

function probe(url) {
  return new Promise(function (resolve) {
    var req = http.get(url, function (res) {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", function () { resolve(false); });
    req.setTimeout(3000, function () {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  var startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (await probe(url)) return true;
    await wait(POLL_INTERVAL_MS);
  }
  return false;
}

function spawnNode(scriptPath, args, extraEnv) {
  return spawn(process.execPath, [scriptPath].concat(args || []), {
    cwd: __dirname,
    stdio: "inherit",
    env: Object.assign({}, process.env, extraEnv || {})
  });
}

function killChild(child) {
  if (!child || child.killed) return;
  try { child.kill("SIGTERM"); } catch (e) {}
}

function summarizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

async function runOpaSuite() {
  var browser = await puppeteer.launch({
    headless: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  var page = await browser.newPage();
  var consoleLines = [];

  page.on("console", function (msg) {
    consoleLines.push("[console." + msg.type() + "] " + msg.text());
  });
  page.on("pageerror", function (err) {
    consoleLines.push("[pageerror] " + err.message);
  });
  page.on("requestfailed", function (req) {
    consoleLines.push("[requestfailed] " + req.url() + " :: " + (req.failure() && req.failure().errorText));
  });

  if (PUPPETEER_EXECUTABLE_PATH) {
    console.log("→ browser", PUPPETEER_EXECUTABLE_PATH);
  }
  console.log("→ opening " + QUNIT_URL);
  await page.goto(QUNIT_URL, { waitUntil: "domcontentloaded", timeout: QUNIT_TIMEOUT_MS });

  try {
    await page.waitForFunction(function () {
      var resultNode = document.querySelector("#qunit-testresult");
      var testNodes = document.querySelectorAll("#qunit-tests > li");
      var text = resultNode ? String(resultNode.textContent || "").replace(/\s+/g, " ").trim() : "";
      return /tests completed/i.test(text) && testNodes.length > 0;
    }, { timeout: QUNIT_TIMEOUT_MS, polling: 250 });
  } catch (e) {
    console.error("\n‼  Timeout waiting for the OPA QUnit DOM report");
    console.error("--- Browser console (tail) ---");
    consoleLines.slice(-80).forEach(function (line) { console.error(line); });
    await browser.close();
    process.exit(2);
  }

  var report = await page.evaluate(function () {
    function normalize(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    var resultNode = document.querySelector("#qunit-testresult");
    var tests = Array.prototype.slice.call(document.querySelectorAll("#qunit-tests > li")).map(function (li) {
      var nameNode = li.querySelector(".test-name") || li.querySelector("strong");
      var moduleNode = li.querySelector(".module-name");
      var failItems = Array.prototype.slice.call(li.querySelectorAll("li.fail")).map(function (failLi) {
        return normalize(failLi.textContent);
      });
      return {
        name: normalize(nameNode ? nameNode.textContent : li.textContent),
        module: normalize(moduleNode ? moduleNode.textContent : ""),
        failed: li.classList.contains("fail"),
        details: failItems
      };
    });

    return {
      summary: normalize(resultNode ? resultNode.textContent : ""),
      tests: tests
    };
  });

  console.log("\n=== OPA results ===");
  report.tests.forEach(function (test) {
    var tag = test.failed ? "FAIL" : "ok  ";
    var label = test.module ? test.module + " :: " + test.name : test.name;
    console.log("  [" + tag + "] " + label);
    if (test.failed) {
      test.details.forEach(function (detail) {
        console.log("         × " + detail);
      });
    }
  });
  console.log("\n  " + report.summary);

  if (report.tests.some(function (test) { return test.failed; })) {
    console.log("\n--- Browser console (tail) ---");
    consoleLines.slice(-60).forEach(function (line) { console.log(line); });
  }

  await browser.close();
  process.exit(report.tests.some(function (test) { return test.failed; }) ? 1 : 0);
}

(async function () {
  var ui5Process = null;
  var startedLocally = false;

  if (!(await probe(UI5_HEALTH_URL))) {
    startedLocally = true;
    ui5Process = spawnNode(UI5_BIN, ["serve", "--config", UI5_CONFIG, "--port", String(PORT)]);
    var ready = await waitForServer(UI5_HEALTH_URL, START_TIMEOUT_MS);
    if (!ready) {
      killChild(ui5Process);
      process.exit(2);
    }
  }

  try {
    await runOpaSuite();
  } finally {
    if (startedLocally) killChild(ui5Process);
  }
})().catch(function (err) {
  if (!PUPPETEER_EXECUTABLE_PATH) {
    console.error("Runner note: no cached browser executable was found. Set PUPPETEER_EXECUTABLE_PATH if needed.");
  }
  console.error("Runner error:", err);
  process.exit(3);
});
