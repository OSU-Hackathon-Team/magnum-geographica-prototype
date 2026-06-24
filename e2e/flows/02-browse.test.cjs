const { expectVisible, expectExists, scrollToTestID, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Browse Systems and Trails", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show system list", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await expectVisible("systems-list");
  });

  it("should navigate to system detail", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");
    await expect(element(by.id("system-name"))).toHaveText("Hocking Hills State Park");
  });

  it("should show trails within a system", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");
    await scrollToTestID("system-trails", "system-detail-screen");
    await expectVisible("system-trails");
  });

  it("should be able to go back from system detail", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen", 15000);
    await device.pressBack();
    // expo-router nested tabs may pop back to either the systems list or
    // to the initial explore tab depending on the navigation stack.
    await expectVisible("explore-screen", 15000);
  });
});

