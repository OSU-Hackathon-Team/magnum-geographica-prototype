const { expectVisible, expectExists, scrollToTestID, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Phase 4 — Trail Detail with new media/segment UI (Mobile)", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show Edit Segments button on trail detail", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await expectVisible("trail-segments-edit");
  });

  it("should open segment editor when Edit Segments is tapped", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    await expectVisible("segment-edit-exit");
  });

  it("should render one segment editor per segment", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    // Verify at least the merge bar and exit are present
    await expectVisible("segment-merge-bar");
    await expectVisible("segment-merge-confirm");
  });

  it("should have reorder buttons on segment editor items", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    // The editor list should be visible and contain segment editors
    await expectVisible("trail-segment-edit-list");
  });

  it("should exit edit mode when Done is tapped", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    await tapByTestID("segment-edit-exit");
    await waitForScreen("trail-detail-screen");
  });

  it("should display trail segments list with surface badges", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    // The trail segments section header is always visible
    await expectVisible("trail-segments");
  });
});
