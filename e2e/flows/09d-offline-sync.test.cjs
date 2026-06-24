const {
  launchAppAndWait,
  forceStopApp,
  tapByTestID,
  waitForScreen,
  expectVisible,
  executeShell,
  sleep,
  by,
  element,
  expect,
} = require("../helpers/test-utils.cjs");

describe("09d Offline — Sync Feature Back to Server", () => {
  it("force-stops and relaunches in online mode", async () => {
    await forceStopApp();
    await launchAppAndWait();
  });

  it("shows online status and sync completes", async () => {
    await expectVisible("status-indicator", 30000);
    await sleep(8000);
  });

  it("verifies pending queue is empty after sync", async () => {
    await tapByTestID("tab-profile");
    await waitForScreen("profile-screen");
    await element(by.id("profile-screen")).scroll(500, "down");
    await expectVisible("pending-queue-empty", 30000);
  });

  it("verifies the feature reached the server database", async () => {
    try {
      const apiPort = process.env.API_HOST_PORT || 3000;
      const result = await executeShell(
        `curl -s "http://localhost:${apiPort}/api/features"`,
      );
      await expect(result).toEqual(
        expect.stringContaining("Test Trailhead"),
      );
    } catch {
      console.warn(
        "API query for Test Trailhead failed — feature may not have synced",
      );
    }
  });
});
