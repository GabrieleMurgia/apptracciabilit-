/**
 * Starts a local UI5 server when needed, runs the headless QUnit suite,
 * and always tears the server down before exiting.
 */
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.UI5_TEST_PORT || "8765", 10);
const HOST = process.env.UI5_TEST_HOST || "localhost";
const DEFAULT_QUNIT_PATH = "/test/unit/unitTests.qunit.html";
const EXPLICIT_QUNIT_URL = process.env.QUNIT_URL || "";
const UI5_CONFIG = process.env.UI5_TEST_CONFIG || "ui5-test.yaml";
const UI5_BIN = require.resolve("@ui5/cli/bin/ui5.cjs");
const RUNNER_PATH = path.join(__dirname, "run-qunit.cjs");
const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;
const STOP_TIMEOUT_MS = 5000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatHost(host) {
  if (!host) return "localhost";
  return host.indexOf(":") >= 0 && host.charAt(0) !== "[" ? "[" + host + "]" : host;
}

function buildUrl(host, pathname) {
  return "http://" + formatHost(host) + ":" + PORT + pathname;
}

function unique(list) {
  return list.filter(function (item, index) {
    return item && list.indexOf(item) === index;
  });
}

function buildCandidateUrls(pathname) {
  if (EXPLICIT_QUNIT_URL) return [EXPLICIT_QUNIT_URL];
  var hosts = unique([HOST, "::1", "localhost", "127.0.0.1"]);
  return hosts.map(function (host) { return buildUrl(host, pathname); });
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function findReachableUrl(urls) {
  for (const url of urls) {
    if (await probe(url)) return url;
  }
  return null;
}

async function waitForServer(urls, timeoutMs) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const url = await findReachableUrl(urls);
    if (url) return url;
    await wait(POLL_INTERVAL_MS);
  }
  return null;
}

async function waitForServerToStop(urls, timeoutMs) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (!(await findReachableUrl(urls))) return true;
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

(async () => {
  let ui5Process = null;
  let startedLocally = false;
  const candidateUrls = buildCandidateUrls(DEFAULT_QUNIT_PATH);
  let resolvedQunitUrl = await findReachableUrl(candidateUrls);

  if (!resolvedQunitUrl) {
    startedLocally = true;
    ui5Process = spawnNode(UI5_BIN, ["serve", "--config", UI5_CONFIG, "--port", String(PORT)]);
    resolvedQunitUrl = await waitForServer(candidateUrls, START_TIMEOUT_MS);
    if (!resolvedQunitUrl) {
      killChild(ui5Process);
      process.exit(2);
    }
  }

  const runner = spawnNode(RUNNER_PATH, [], { QUNIT_URL: resolvedQunitUrl });
  runner.on("exit", async (code) => {
    if (startedLocally) {
      killChild(ui5Process);
      await waitForServerToStop(candidateUrls, STOP_TIMEOUT_MS);
    }
    process.exit(code == null ? 3 : code);
  });

  runner.on("error", async () => {
    if (startedLocally) {
      killChild(ui5Process);
      await waitForServerToStop(candidateUrls, STOP_TIMEOUT_MS);
    }
    process.exit(3);
  });
})().catch(() => {
  process.exit(3);
});
