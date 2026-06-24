const {
  launchAppOffline,
  tapByTestID,
  typeByTestID,
  waitForScreen,
  expectVisible,
  sleep,
  by,
  element,
  expect,
} = require("../helpers/test-utils.cjs");

describe("09c Offline — Create Feature While Offline", () => {
  it("launches in offline mode and taps add feature", async () => {
    await launchAppOffline();
    await expectVisible("explore-add-feature");
    await tapByTestID("explore-add-feature");
    await expectVisible("explore-placing-banner");
  });

  it("taps on the map to place a feature", async () => {
    await element(by.id("explore-map")).tapAtPoint({ x: 540, y: 700 });

    await Promise.race([
      waitFor(element(by.id("create-feature-offline-banner")))
        .toBeVisible()
        .withTimeout(30000),
      waitFor(element(by.id("create-feature-form")))
        .toBeVisible()
        .withTimeout(30000),
    ]);
  });

  it("fills and saves the feature form", async () => {
    await tapByTestID("feature-type-trailhead");
    await typeByTestID("feature-form-name", "Test Trailhead");
    await tapByTestID("feature-system-hocking-hills-state-park");
    await tapByTestID("feature-form-save");
    await waitForScreen("explore-screen");
  });

  it("verifies pending contribution appears in profile", async () => {
    await tapByTestID("tab-profile");
    await waitForScreen("profile-screen");
    await element(by.id("profile-screen")).scroll(500, "down");
    await expectVisible("pending-queue");
    await expect(element(by.id("pending-queue-empty"))).not.toExist();
  });
});
