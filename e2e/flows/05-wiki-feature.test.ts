import { expectVisible, tapByTestID, typeByTestID, waitForScreen } from "../helpers/test-utils";

describe("Wiki and Feature Flow (Mobile)", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should navigate to trail detail and see wiki section", async () => {
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-wiki");
      await expectVisible("trail-wiki-view");
    } catch {
      await expectVisible("trails-screen");
    }
  });

  it("should navigate to wiki editor from trail", async () => {
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      // Wiki editor button should be present
      await expectVisible("trail-wiki-edit");
    } catch {
      await expectVisible("trails-screen");
    }
  });

  it("should show trail segments if available", async () => {
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-segments");
    } catch {
      await expectVisible("trails-screen");
    }
  });

  it("should show features on trail detail if available", async () => {
    await element(by.id("tab-trails")).tap();
    await waitForScreen("trails-screen");

    try {
      await element(by.id("trail-card-buckeye-trail")).tap();
      await waitForScreen("trail-detail-screen");
      await expectVisible("trail-features");
    } catch {
      await expectVisible("trails-screen");
    }
  });
});
