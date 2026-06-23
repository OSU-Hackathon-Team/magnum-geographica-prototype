const { expectVisible, waitForScreen } = require("../helpers/test-utils");

describe("Offline Flow — Download and Browse", () => {
  it("should show status indicator on all tabs", async () => {
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");

    await element(by.id("tab-systems")).tap();
    await expectVisible("status-indicator");

    await element(by.id("tab-profile")).tap();
    await expectVisible("status-indicator");
  });

  it("should show storage manager in profile", async () => {
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-manager");
    await expectVisible("storage-delete-all");
  });

  it("should show profile with contributor and status", async () => {
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("profile-contributor");
    await expectVisible("profile-status");
    await expectVisible("profile-pending-section");
  });

  it("should show download area button on explore map", async () => {
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
    await expectVisible("explore-download-area");
  });
});
