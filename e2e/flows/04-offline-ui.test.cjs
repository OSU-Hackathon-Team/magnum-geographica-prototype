const { expectVisible, waitForScreen, by, element } = require("../helpers/test-utils.cjs");
const { device } = require("detox");

describe("Offline Flow — Download and Browse", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show status indicator on all tabs", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await expectVisible("status-indicator");

    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("status-indicator");

    await element(by.text("Explore")).tap();
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");
  });

  it("should show storage manager in profile", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-manager");
  });

  it("should show profile with contributor and status", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("profile-contributor", 15000);
    await expectVisible("profile-status", 15000);
  });

  it("should show download area button on explore map", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("explore-download-area");
  });
});
