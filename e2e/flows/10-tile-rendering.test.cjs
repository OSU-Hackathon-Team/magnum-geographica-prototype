const {
  launchAppAndWait,
  forceStopApp,
  sleep,
  waitForScreen,
  expectVisible,
  tapByTestID,
  waitForText,
  by,
  element,
  expect,
} = require("../helpers/test-utils.cjs");

const { execSync } = require("child_process");

describe("10 Tile Rendering — Online", () => {
  beforeAll(async () => {
    await forceStopApp();
    await sleep(1000);
  });

  it("launches and reaches explore with map", async () => {
    await launchAppAndWait();
    await waitForScreen("explore-screen");
    await expectVisible("explore-map", 15000);
    await expectVisible("explore-base-layer-switcher-trigger", 15000);
    await expectVisible("explore-download-area", 15000);
  });

  it("verifies the generated map.html has correct tile URLs", () => {
    // Standalone static check — no Detox gestures follow, so execSync
    // won't race.
    const html = execSync(
      'adb shell "run-as org.magnum.app cat files/magnum-map/map.html"',
      { encoding: "utf8", timeout: 10000 },
    );
    expect(html.length).toBeGreaterThan(5000);
    expect(html).toContain("http://localhost:3001/basemap/{z}/{x}/{y}");
    expect(html).toContain("https://tiles.maps.eox.at/");
    // Regression: the template-literal escape must produce valid JS regex
    expect(html).not.toMatch(/\/\/\+\$\/,'/);
  });
});

describe("10b Layer Switcher", () => {
  beforeAll(async () => {
    await sleep(3000);
  });

  it("switches to satellite without crashing", async () => {
    await tapByTestID("explore-base-layer-switcher-trigger");
    await expectVisible("explore-base-layer-switcher-option-satellite", 15000);
    await tapByTestID("explore-base-layer-switcher-option-satellite");
    await sleep(4000);
    await expect(element(by.id("explore-screen"))).toBeVisible();
  });

  it("switches back to simplified without crashing", async () => {
    await sleep(2000);
    await tapByTestID("explore-base-layer-switcher-trigger");
    await expectVisible("explore-base-layer-switcher-option-simplified", 15000);
    await tapByTestID("explore-base-layer-switcher-option-simplified");
    await sleep(4000);
    await expect(element(by.id("explore-screen"))).toBeVisible();
  });
});

describe("10c Download", () => {
  it("downloads the simplified basemap", async () => {
    await sleep(2000);
    await tapByTestID("explore-download-area");
    await expectVisible("explore-draw-banner");

    execSync("adb shell input swipe 250 1100 750 1500 5000", {
      encoding: "utf8", timeout: 15000,
    });
    await sleep(2000);

    await expectVisible("explore-download-sheet", 30000);
    await expectVisible("download-estimate", 30000);

    await tapByTestID("download-start");
    await waitForText("Downloaded successfully", 300000);

    await tapByTestID("download-sheet-close");
    await expectVisible("explore-screen", 5000);
  });

  it("shows the downloaded region in storage manager", async () => {
    await tapByTestID("tab-profile");
    await waitForScreen("profile-screen");

    await element(by.id("profile-screen")).scroll(500, "down");
    await expectVisible("storage-manager", 15000);
    await expect(element(by.id("storage-empty"))).not.toExist();
  });
});
