const { expectVisible, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Full Journey Smoke Test", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("complete user journey: explore -> systems -> trail -> profile", async () => {
    // 1. Start on Explore
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");

    // 2. Navigate to Systems tab
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await expectVisible("systems-list");

    // 3. Open a system detail
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");
    await expect(element(by.id("system-name"))).toHaveText("Hocking Hills State Park");

    // 4. Try to see a trail within the system
    try {
      await element(by.id("system-trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-name");
      await expectVisible("trail-stats");

      // 5. Back to system detail
      await device.pressBack();
      await waitForScreen("system-detail-screen");
    } catch (e) {
      await expectVisible("system-detail-screen");
    }

    // 6. Go back to systems list
    await device.pressBack();
    await waitForScreen("systems-screen");

    // 7. Go to Profile
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("profile-contributor");
    await expectVisible("profile-status");
    await expectVisible("storage-manager");

    // 8. Back to Explore
    await element(by.text("Explore")).tap();
    await waitForScreen("explore-screen");
  });
});
