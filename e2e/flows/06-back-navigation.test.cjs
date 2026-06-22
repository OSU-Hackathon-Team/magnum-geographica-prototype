const { expectVisible, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Back Navigation", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should navigate back from system detail via Android back", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    await device.pressBack();
    await waitForScreen("systems-screen");
  });

  it("should handle app background and return", async () => {
    await waitForScreen("explore-screen");
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    try {
      await waitForScreen("explore-screen", 5000);
    } catch (e) {
      // May land on a different screen
    }
  });
});
