const { expectVisible, tapByTestID, typeByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Tab Navigation", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should land on Explore tab by default", async () => {
    await waitForScreen("explore-screen");
  });

  it("should navigate to Systems tab", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
  });

  it("should navigate to Trails tab", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
  });

  it("should navigate to Profile tab", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
  });

  it("should show status indicator in header", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");
    await expectVisible("status-dot");
    await expect(element(by.id("status-label"))).toHaveText("Online");
  });

  it("should cycle through all tabs and back", async () => {
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await element(by.text("Explore")).tap();
    await waitForScreen("explore-screen");
  });
});
