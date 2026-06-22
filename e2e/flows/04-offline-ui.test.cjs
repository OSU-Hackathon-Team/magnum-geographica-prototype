const { expectVisible, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Offline UI", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show download button on system detail", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("system-card-hocking-hills-state-park")).tap();
    await waitForScreen("system-detail-screen");

    await expectVisible("download-container-sys-1");
    await expectVisible("download-button-sys-1");
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
    await expectVisible("storage-delete-all");
  });

  it("should show profile with contributor and status", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("profile-contributor");
    await expectVisible("profile-status");
    await expectVisible("profile-pending-section");
  });
});
