const { device } = require("detox");
const http = require("http");
const { execSync } = require("child_process");

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
  const required = [8081, 3000, 3001];
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
      `[setup] Fix with: adb reverse tcp:3000 tcp:3000 && adb reverse tcp:3001 tcp:3001 && adb reverse tcp:8081 tcp:8081`,
    );
  }

  const checks = await Promise.all([
    waitForService("http://localhost:8081/status", "Metro", 25000),
    waitForService("http://localhost:3000/api/health", "API", 25000),
    waitForService("http://localhost:3001/catalog", "Martin", 25000),
  ]);

  const labels = ["Metro (8081)", "API (3000)", "Martin (3001)"];
  const failures = labels.filter((_, i) => !checks[i]);

  if (failures.length > 0) {
    throw new Error(
      `\n\nFATAL — Required services not reachable: ${failures.join(", ")}.\n` +
        `Run:  docker compose -f docker/docker-compose.yml up -d\n` +
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
