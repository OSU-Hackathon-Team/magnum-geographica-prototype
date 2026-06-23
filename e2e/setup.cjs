const { device } = require("detox");

// Detox behavior.init handles app install and launch (reinstallApp: true, launchApp: true).
// This file only handles teardown — no beforeAll needed.

afterAll(async () => {
  try {
    await device.terminateApp();
  } catch {
    // App may already be stopped.
  }
});
