import { expectVisible, tapByTestID, typeByTestID, waitForScreen } from "../helpers/test-utils";

describe("Tab Navigation", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should land on Explore tab by default", async () => {
    await waitForScreen("explore-screen");
  });

  it("should navigate to Systems tab", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
  });

  it("should navigate to Trails tab", async () => {
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");
  });

  it("should navigate to Profile tab", async () => {
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
  });

  it("should show status indicator in header", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("status-indicator");
    await expectVisible("status-dot");
    await expect(element(by.id("status-label"))).toHaveText("Online");
  });

  it("should cycle through all tabs and back", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
  });
});
