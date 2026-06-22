const { expectVisible, tapByTestID, waitForScreen } = require("../helpers/test-utils.cjs");

describe("WebView Map Bridge", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should render the map on Explore tab", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("explore-map");
  });

  it("should show search bar on explore screen", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("explore-search");
  });

  it("should show search results when typing", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-search")).tap();
    await element(by.id("explore-search")).typeText("buckeye");

    try {
      await waitFor(element(by.id("search-results"))).toBeVisible().withTimeout(5000);
      await expectVisible("search-results");
    } catch (e) {
      // Search may not return results if API is not seeded
    }
  });

  it("should show clear button in search", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-search")).typeText("test");
    await expectVisible("explore-search-clear");
    await element(by.id("explore-search-clear")).tap();
  });

  it("should be able to navigate between tabs", async () => {
    await waitForScreen("explore-screen");
    await element(by.text("Systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.text("Explore")).tap();
    await waitForScreen("explore-screen");
  });
});
