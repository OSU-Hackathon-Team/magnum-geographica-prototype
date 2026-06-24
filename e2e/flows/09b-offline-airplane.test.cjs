const {
  launchAppAndWait,
  launchAppOffline,
  forceStopApp,
  setAirplaneMode,
  sleep,
  waitForScreen,
  expectVisible,
  tapByTestID,
  expectExists,
  by,
  element,
  expect,
} = require("../helpers/test-utils.cjs");

describe("09b Offline — Airplane Mode Survives Force-Stop", () => {
  it("sets up offline mode and force-stops the app", async () => {
    await setAirplaneMode(true);
    await forceStopApp();
    await sleep(2000);
  });

  it("launches in offline mode and shows offline indicator", async () => {
    await launchAppOffline();
    await expectVisible("status-indicator", 30000);
    await expect(element(by.id("status-label"))).toHaveText("Offline");
  });

  it("shows downloaded systems while offline", async () => {
    await tapByTestID("tab-systems");
    await waitForScreen("systems-screen");
    await expectVisible("systems-list");
    await expect(element(by.id("systems-empty"))).not.toExist();
  });

  it("opens a system detail while offline", async () => {
    await tapByTestID("system-card-hocking-hills-state-park");
    await waitForScreen("system-detail-screen", 15000);
    await expectVisible("system-name", 15000);
    await expectVisible("system-offline-ready", 10000);
    await device.pressBack();
  });

  it("shows stored regions in profile while offline", async () => {
    await tapByTestID("tab-profile");
    await waitForScreen("profile-screen");
    await element(by.id("profile-screen")).scroll(500, "down");
    await expectVisible("storage-manager", 15000);
    await expect(element(by.id("storage-empty"))).not.toExist();
  });
});
