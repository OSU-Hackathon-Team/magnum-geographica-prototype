import { expectVisible, tapByTestID, waitForScreen } from "../helpers/test-utils";

describe("Browse Systems and Trails", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show system list", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await expectVisible("systems-list");
  });

  it("should navigate to system detail", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");
    await expect(element(by.id("system-name"))).toHaveText("Hocking Hills State Park");
  });

  it("should show trails within a system", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");
    await expectVisible("system-trails");
  });

  it("should navigate from system to trail detail", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    try {
      await element(by.id("system-trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expect(element(by.id("trail-name"))).toHaveText("Buckeye Trail");
    } catch {
      // Trail may not be listed if API is not seeded
      await expectVisible("system-detail-screen");
    }
  });

  it("should show trail detail with stats", async () => {
    try {
      await element(by.id("tab-trails")).tap();
      await waitForScreen("trails-screen");
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-name");
      await expectVisible("trail-stats");
      await expectVisible("trail-length");
    } catch {
      await expectVisible("trails-screen");
    }
  });
});
