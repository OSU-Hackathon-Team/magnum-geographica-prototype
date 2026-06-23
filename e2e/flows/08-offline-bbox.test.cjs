const { expectVisible, waitForScreen } = require("../helpers/test-utils");

describe("Offline BBox Download Flow", () => {
  it("should show download area button on explore screen", async () => {
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
    await expectVisible("explore-download-area");
  });

  it("should enter draw mode when download area is tapped", async () => {
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
    await element(by.id("explore-download-area")).tap();
    await expectVisible("explore-draw-banner");
    await expectVisible("explore-draw-cancel");
  });

  it("should have storage manager with correct test ID", async () => {
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-manager");
  });

  it("should show empty storage message when no regions", async () => {
    await element(by.id("tab-profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-empty");
  });
});
