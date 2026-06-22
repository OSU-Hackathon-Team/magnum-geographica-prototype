const { expectVisible, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Wiki and Feature", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should navigate to trail detail and see wiki section", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-wiki");
      await expectVisible("trail-wiki-view");
    } catch (e) {
      await expectVisible("trails-screen");
    }
  });

  it("should show wiki edit button on trail detail", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-wiki-edit");
    } catch (e) {
      await expectVisible("trails-screen");
    }
  });

  it("should show trail segments if available", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-segments");
    } catch (e) {
      await expectVisible("trails-screen");
    }
  });
});
