const {
  waitForScreen,
  expectVisible,
  tapByTestID,
  sleep,
  forceStopApp,
  by,
  element,
  expect: dExpect,
} = require("../helpers/test-utils.cjs");

const { execSync } = require("child_process");
const { device } = require("detox");
const assert = require("assert");

async function launchAndWait() {
  await device.launchApp({ newInstance: true });
  await sleep(15000);
  await waitForScreen("explore-screen", 60000);
}

describe("10 Tile Rendering — Online", () => {
  beforeAll(async () => {
    await forceStopApp();
    await sleep(1000);
  });

  afterAll(async () => {
    await sleep(2000);
    // Static map.html assertions via Node's assert module — Detox's test
    // environment overrides the global `expect`, so we can't use Jest's.
    const html = execSync(
      'adb shell "run-as org.magnum.app cat files/magnum-map/map.html"',
      { encoding: "utf8", timeout: 10000 },
    );
    assert.ok(html.length > 5000, "map.html must be > 5000 bytes");
    assert.ok(
      html.includes("http://localhost:3001/basemap/{z}/{x}/{y}"),
      "must have simplified base layer URL",
    );
    assert.ok(
      html.includes("https://tiles.maps.eox.at/"),
      "must have satellite base layer URL",
    );
    assert.ok(
      !/\/\/\+\$\/,'/.test(html),
      "must not contain broken regex ///+$/,'",
    );
    await sleep(2000);
  });

  it("launches and reaches explore with map", async () => {
    await launchAndWait();
    await expectVisible("explore-map", 15000);
    await expectVisible("explore-base-layer-switcher-trigger", 15000);
    await expectVisible("explore-download-area", 15000);
  });

  it("switches to satellite without crashing", async () => {
    await sleep(2000);
    await tapByTestID("explore-base-layer-switcher-trigger");
    await expectVisible("explore-base-layer-switcher-option-satellite", 15000);
    await tapByTestID("explore-base-layer-switcher-option-satellite");
    await sleep(4000);
    // dExpect is the Detox expect
    await dExpect(element(by.id("explore-screen"))).toBeVisible();
  });

  it("switches back to simplified without crashing", async () => {
    await sleep(2000);
    await tapByTestID("explore-base-layer-switcher-trigger");
    await expectVisible("explore-base-layer-switcher-option-simplified", 15000);
    await tapByTestID("explore-base-layer-switcher-option-simplified");
    await sleep(4000);
    await dExpect(element(by.id("explore-screen"))).toBeVisible();
  });
});
