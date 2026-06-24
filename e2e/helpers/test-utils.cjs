const { by, element, expect, waitFor, device } = require("detox");
const { execSync } = require("child_process");

async function waitForScreen(testID, timeout = 30000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

async function tapByTestID(testID) {
  await element(by.id(testID)).tap();
}

async function typeByTestID(testID, text) {
  await element(by.id(testID)).typeText(text);
}

async function scrollToTestID(testID, parentID = null) {
  if (parentID) {
    await waitFor(element(by.id(testID)))
      .toBeVisible()
      .whileElement(by.id(parentID))
      .scroll(500, "down");
  } else {
    await element(by.id(testID)).scrollTo("bottom");
  }
}

async function scrollDown(screenID, pixels = 500) {
  await element(by.id(screenID)).scroll(pixels, "down");
}

async function expectVisible(testID, timeout = 30000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

async function expectExists(testID, timeout = 15000) {
  await waitFor(element(by.id(testID)))
    .toExist()
    .withTimeout(timeout);
}

async function expectText(testID, text) {
  await expect(element(by.id(testID))).toHaveText(text);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeShell(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 15000 }).trim();
  } catch (e) {
    throw new Error(`Shell command failed: ${cmd}\n${e.message}`);
  }
}

/**
 * Toggle network off/on.
 *
 * Disabling WiFi kills the adb reverse bridge, which prevents the app from
 * loading its JS bundle from Metro.  Instead of disabling the radio we
 * launch the app with `url: "magnum://offline"` — the OfflineProvider
 * detects this URL and sets `isOnline = false`, so the app reads from the
 * local SQLite store while still being able to load the JS bundle.
 *
 * This function now only serves as a cleanup helper.
 */
async function setAirplaneMode(enabled) {
  if (enabled) {
    // No-op: see comment above.
    return;
  }
  // Re-enable WiFi in case a previous test disabled it.
  executeShell("adb shell svc wifi enable");
  await sleep(3000);
}

async function forceStopApp() {
  executeShell("adb shell am force-stop org.magnum.app");
  await sleep(2000);
}

/**
 * Detect the Expo / React Native red error screen.
 * If the app hits an uncaught exception (e.g. "Could not connect to
 * development server") we fail immediately instead of waiting minutes
 * for `explore-screen` to appear.
 */
async function assertNoExpoError() {
  // Expo red screen has a dismiss button and error text.
  // We check a few known patterns — any match means we should abort.
  const errorIndicators = [
    by.text(/development server/),
    by.text(/Cannot connect/),
    by.text(/Can't connect/),
    by.text(/packager/),
    by.text(/Metro/),
  ];

  for (const matcher of errorIndicators) {
    try {
      await waitFor(element(matcher))
        .toExist()
        .withTimeout(1500);
      throw new Error(
        "Expo error screen detected — the JS bundle hit an exception. " +
          "Check Metro logs and fix the bundle error before re-running Detox.",
      );
    } catch (err) {
      if (err.message.includes("Expo error screen detected")) throw err;
    }
  }
}

/**
 * Launch the app and wait for the Explore tab to render. Fail fast
 * (within ~75 s) if the app is stuck on the Expo error screen.
 */
async function launchAppAndWait(launchArgs = {}) {
  await device.launchApp({
    newInstance: true,
    ...launchArgs,
  });

  await sleep(15000);

  const exploreReady = waitFor(element(by.id("explore-screen")))
    .toBeVisible()
    .withTimeout(60000)
    .then(() => true, () => false);

  let errorFound = false;
  const errorCheck = (async () => {
    try {
      await assertNoExpoError();
    } catch (e) {
      if (e.message.includes("Expo error screen detected")) {
        errorFound = true;
        throw e;
      }
    }
  })();

  try {
    await Promise.race([exploreReady, errorCheck]);
  } catch (e) {
    if (errorFound) throw e;
  }

  const ready = await exploreReady;
  if (!ready && !errorFound) {
    throw new Error(
      "App did not reach explore-screen within 75 s. " +
        "Possible cause: bundle error, network issue, or API unreachable.",
    );
  }

  if (!ready) {
    throw new Error(
      "App did not reach explore-screen — check the error screen above.",
    );
  }
}

async function waitForText(text, timeout = 30000) {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Launch the app in offline mode.  The offline flag is smuggled inside the
 * Metro URL (not a top-level Expo query param, which the dev client strips).
 * The full URL returned by Linking.getInitialURL() is then:
 *   org.magnum.app://expo-development-client/?url=http://10.0.2.2:8081?offlineMode=true
 * and the OfflineProvider's url.includes("offline") matches "offlineMode".
 */
async function launchAppOffline(launchArgs = {}) {
  // Metro ignores query params on the bundle URL, so ?offlineMode=true
  // is harmless for JS loading but visible to getInitialURL().
  const expoUrl =
    "org.magnum.app://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%3FofflineMode%3Dtrue";
  return launchAppAndWait({
    ...launchArgs,
    url: expoUrl,
  });
}

/**
 * Restore the adb reverse forwards for API and Martin after an offline test
 * that disabled them.
 */
async function restoreReversePorts() {
  execSync("adb reverse tcp:3000 tcp:3000 2>/dev/null || true", {
    encoding: "utf8",
  });
  execSync("adb reverse tcp:3001 tcp:3001 2>/dev/null || true", {
    encoding: "utf8",
  });
  await sleep(1000);
}

module.exports = {
  waitForScreen,
  tapByTestID,
  typeByTestID,
  scrollToTestID,
  scrollDown,
  expectVisible,
  expectExists,
  expectText,
  sleep,
  executeShell,
  setAirplaneMode,
  forceStopApp,
  launchAppAndWait,
  launchAppOffline,
  restoreReversePorts,
  waitForText,
  by,
  element,
  expect,
};

