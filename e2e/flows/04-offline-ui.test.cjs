const { expectVisible, expectExists, scrollToTestID, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Offline UI", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show download button on system detail", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    await scrollToTestID("system-meta", "system-detail-screen");
    await expectVisible("system-meta");
    await expect(element(by.text("Download for Offline"))).toExist();
  });

  it("should show status indicator on all tabs", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");

    await element(by.text("Systems")).tap();
    await expectVisible("status-indicator");

    await element(by.text("Profile")).tap();
    await expectVisible("status-indicator");
  });

  it("should show storage manager in profile", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-manager");
    await expectVisible("storage-empty");
  });

  it("should show profile with contributor and status", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("profile-contributor");
    await expectVisible("profile-status");
    await expectVisible("profile-pending-section");
  });
});

