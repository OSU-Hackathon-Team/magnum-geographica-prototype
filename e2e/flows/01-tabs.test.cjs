const { expectVisible, waitForScreen } = require("../helpers/test-utils.cjs");

describe("Tab Navigation", () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it("should land on Explore tab", async () => {
    await waitForScreen("explore-screen", 60000);
  });

  it("should show status indicator", async () => {
    await waitForScreen("explore-screen", 60000);
    await expectVisible("status-indicator", 60000);
  });
});
