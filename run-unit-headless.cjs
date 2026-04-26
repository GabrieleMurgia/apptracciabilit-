/**
 * Starts a local UI5 server when needed, runs the headless QUnit suite,
 * and always tears the server down before exiting.
 */
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.UI5_TEST_PORT || "8765", 10);
const HOST = process.env.UI5_TEST_HOST || "localhost";
const QUNIT_URL = process.env.QUNIT_URL || "http://" + HOST + ":" + PORT + "/test/unit/unitTests.qunit.html";
const UI5_HEALTH_URL = "http://" + HOST + ":" + PORT + "/test/unit/unitTests.qunit.html";
const UI5_CONFIG = process.env.UI5_TEST_CONFIG || "ui5-test.yaml";
const UI5_BIN = require.resolve("@ui5/cli/bin/ui5.cjs");
const RUNNER_PATH = path.join(__dirname, "run-qunit.cjs");
const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
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

(async () => {
  let ui5Process = null;
  let startedLocally = false;

  if (!(await probe(UI5_HEALTH_URL))) {
    startedLocally = true;
    ui5Process = spawnNode(UI5_BIN, ["serve", "--config", UI5_CONFIG, "--port", String(PORT)]);
    const ready = await waitForServer(UI5_HEALTH_URL, START_TIMEOUT_MS);
    if (!ready) {
      killChild(ui5Process);
      process.exit(2);
    }
  }

  const runner = spawnNode(RUNNER_PATH, [], { QUNIT_URL: QUNIT_URL });
  runner.on("exit", (code) => {
    if (startedLocally) killChild(ui5Process);
    process.exit(code == null ? 3 : code);
  });

  runner.on("error", () => {
    if (startedLocally) killChild(ui5Process);
    process.exit(3);
  });
})().catch(() => {
  process.exit(3);
});
