const { expectVisible, expectExists, scrollToTestID, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Phase 5 — Segment Editing (Mobile)", () => {
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

  it("should open segment editor list when Edit Segments is tapped", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    await expectVisible("segment-edit-exit");
  });

  it("should have a merge bar with merge button", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    await expectVisible("segment-merge-bar");
    await expectVisible("segment-merge-confirm");
  });

  it("should show 0/2 selection count initially", async () => {
    await element(by.text("Trails")).tap();
    await waitForScreen("trails-screen");
    await element(by.id("trail-card-buckeye-trail")).tap();
    await waitForScreen("trail-detail-screen");
    await scrollToTestID("trail-segments-edit", "trail-detail-screen");
    await tapByTestID("trail-segments-edit");
    await waitForScreen("trail-segment-edit-list");
    await expectVisible("segment-merge-count");
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
});
