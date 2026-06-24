const { device } = require("detox");
const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Load .env (managed by scripts/ports.sh) so test infra follows shifted
// ports. Falls back to .env.example if .env is missing.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.example"));

const API_PORT = Number(process.env.API_HOST_PORT || 3000);
const MARTIN_PORT = Number(process.env.MARTIN_HOST_PORT || 3001);
const METRO_PORT = Number(process.env.METRO_HOST_PORT || 8081);

/**
 * Check whether a local service is reachable by hitting a URL.
 * Returns true if the endpoint responds within `timeoutMs`, false otherwise.
 */
function checkEndpoint(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Poll a service until it responds, or the deadline passes.
 * Returns true once the service is reachable, false on timeout.
 */
async function waitForService(url, label, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await checkEndpoint(url, 3000);
    if (ok) {
      console.log(`[setup] ${label} is ready at ${url}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`[setup] ${label} NOT reachable at ${url} after ${timeoutMs}ms`);
  return false;
}

/**
 * Verify adb reverse is forwarding the required ports.
 * Without these the emulator cannot reach Metro/API/Martin on localhost.
 */
function checkAdbReverse() {
  const required = [METRO_PORT, API_PORT, MARTIN_PORT];
  try {
    const out = execSync("adb reverse --list", { encoding: "utf8" }).trim();
    const missing = required.filter(
      (port) => !out.includes(`tcp:${port} tcp:${port}`),
    );
    if (missing.length > 0) {
      console.error(
        `[setup] WARNING — adb reverse missing for ports: ${missing.join(", ")}.\n` +
          `Emulator may not reach backend services on localhost.`,
      );
    }
    return missing;
  } catch (e) {
    console.error("[setup] adb reverse --list failed:", e.message);
    return required;
  }
}

/**
 * Fail-fast health gate: Metro (8081), API (3000) and Martin (3001) must all
 * be reachable before any test begins. If any is missing after its deadline
 * the entire suite is aborted — no point in wasting minutes timing out.
 *
 * Also verifies adb reverse forwards are in place so the emulator can reach
 * the host's services.
 */
beforeAll(async () => {
  const adbMissing = checkAdbReverse();
  if (adbMissing.length > 0) {
    console.error(
      `[setup] Fix with: adb reverse tcp:${METRO_PORT} tcp:${METRO_PORT} && adb reverse tcp:${API_PORT} tcp:${API_PORT} && adb reverse tcp:${MARTIN_PORT} tcp:${MARTIN_PORT}`,
    );
  }

  const checks = await Promise.all([
    waitForService(`http://localhost:${METRO_PORT}/status`, "Metro", 25000),
    waitForService(`http://localhost:${API_PORT}/api/health`, "API", 25000),
    waitForService(`http://localhost:${MARTIN_PORT}/catalog`, "Martin", 25000),
  ]);

  const labels = [
    `Metro (${METRO_PORT})`,
    `API (${API_PORT})`,
    `Martin (${MARTIN_PORT})`,
  ];
  const failures = labels.filter((_, i) => !checks[i]);

  if (failures.length > 0) {
    throw new Error(
      `\n\nFATAL — Required services not reachable: ${failures.join(", ")}.\n` +
        `Run:  ./scripts/dc.sh up -d\n` +
        `Then:  cd packages/app && npx expo start --dev-client --no-dev\n` +
        `Aborting Detox suite.\n`,
    );
  }

  console.log("[setup] All backend services are ready. Starting tests…");
});

afterAll(async () => {
  try {
    await device.terminateApp();
  } catch {
    // App may already be stopped.
  }
});
