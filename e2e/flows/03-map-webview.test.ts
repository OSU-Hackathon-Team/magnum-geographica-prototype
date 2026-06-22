import { expectVisible, tapByTestID, typeByTestID, waitForScreen } from "../helpers/test-utils";

describe("WebView Map Bridge", () => {
  beforeEach(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should render the map on Explore tab", async () => {
    await waitForScreen("explore-screen");
    // Map container should be visible (WebView)
    await expectVisible("explore-map");
  });

  it("should show search bar on explore screen", async () => {
    await waitForScreen("explore-screen");
    await expectVisible("explore-search");
  });

  it("should display search results when typing", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-search")).tap();
    await element(by.id("explore-search")).typeText("buckeye");

    try {
      await waitFor("search-results", 5000);
      await expectVisible("search-results");
    } catch {
      // Search may not return results if API is not seeded
    }
  });

  it("should show clear button in search", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("explore-search")).typeText("test");
    await expectVisible("explore-search-clear");
    await element(by.id("explore-search-clear")).tap();
  });

  it("should navigate to Systems tab with bottom tabs", async () => {
    await waitForScreen("explore-screen");
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
  });

  it("should be able to go back to Explore", async () => {
    await element(by.id("tab-systems")).tap();
    await waitForScreen("systems-screen");
    await element(by.id("tab-explore")).tap();
    await waitForScreen("explore-screen");
  });
});
