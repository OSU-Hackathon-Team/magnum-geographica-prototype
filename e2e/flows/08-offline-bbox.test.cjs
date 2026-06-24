const { expectVisible, waitForScreen, by, element } = require("../helpers/test-utils.cjs");
const { device } = require("detox");

describe("Offline BBox Download Flow", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show download area button on explore screen", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("explore-download-area");
  });

  it("should enter draw mode when download area is tapped", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-download-area")).tap();
    await expectVisible("explore-draw-banner");
    await expectVisible("explore-draw-cancel");
  });

  it("should cancel draw mode", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-download-area")).tap();
    await expectVisible("explore-draw-banner");
    await element(by.id("explore-draw-cancel")).tap();
    await expectVisible("explore-download-area");
  });

  it("should show storage manager in profile", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-manager");
  });

  it("should show empty storage message when no regions", async () => {
    await element(by.text("Profile")).tap();
    await waitForScreen("profile-screen");
    await expectVisible("storage-empty");
  });
});
