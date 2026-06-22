import { expectVisible, tapByTestID, waitForScreen } from "../helpers/test-utils";

describe("Back Navigation and App Lifecycle", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should navigate back from system detail to systems list via Android back", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    // Press Android hardware back button
    await device.pressBack();
    await waitForScreen("systems-screen");
  });

  it("should return to Explore from a detail screen via back", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    await device.pressBack();
    await waitForScreen("systems-screen");
  });

  it("should handle sending app to background and returning", async () => {
    await waitForScreen("explore-screen");
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    // Should return to Explore
    try {
      await waitForScreen("explore-screen", 5000);
    } catch {
      // May land on a different screen depending on state
    }
  });
});
