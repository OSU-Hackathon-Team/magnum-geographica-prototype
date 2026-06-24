const {
  by,
  element,
  expect,
  waitFor,
  sleep,
  executeShell,
  launchAppAndWait,
  waitForScreen,
  expectVisible,
  tapByTestID,
  waitForText,
} = require("../helpers/test-utils.cjs");

describe("09a Offline — Download Basemaps", () => {
  it("downloads the simplified basemap in basic mode", async () => {
    await launchAppAndWait();

    // Enter draw mode
    await tapByTestID("explore-download-area");
    await expectVisible("explore-draw-banner");

    // Draw a bbox with a slow swipe. The DragBox wins because we
    // disable DragPan while drawing.
    await executeShell(
      "adb shell input swipe 300 1200 700 1600 4000",
    );
    await sleep(2000);

    // The DownloadAreaSheet should appear
    await expectVisible("explore-download-sheet", 30000);
    await expectVisible("download-estimate", 30000);

    // Tap Download
    await tapByTestID("download-start");

    // Wait for completion (server generates the tile pack — this can
    // take up to 2 minutes for a full-state bbox)
    await waitForText("Downloaded successfully", 300000);

    // Close the sheet
    await tapByTestID("download-sheet-close");
  });

  it("switches to satellite and downloads the satellite basemap", async () => {
    // Open the layer switcher
    await tapByTestID("explore-base-layer-switcher-trigger");
    await expectVisible("explore-base-layer-switcher-option-satellite", 15000);
    await tapByTestID("explore-base-layer-switcher-option-satellite");
    await sleep(3000);

    // Enter draw mode
    await tapByTestID("explore-download-area");
    await expectVisible("explore-draw-banner");

    // Draw a bbox
    await executeShell(
      "adb shell input swipe 250 1100 750 1500 4000",
    );
    await sleep(2000);

    await expectVisible("explore-download-sheet", 30000);
    await expectVisible("download-estimate", 30000);

    await tapByTestID("download-start");
    await waitForText("Downloaded successfully", 300000);
    await tapByTestID("download-sheet-close");
  });

  it("shows downloaded regions in the Profile storage manager", async () => {
    await tapByTestID("tab-profile");
    await waitForScreen("profile-screen");

    await element(by.id("profile-screen")).scroll(500, "down");
    await expectVisible("storage-manager", 30000);

    // Storage should NOT be empty — we just downloaded 2 regions.
    await expect(element(by.id("storage-empty"))).not.toExist();
  });
});
