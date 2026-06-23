const { by, element, expect, waitFor } = require("detox");

async function waitForScreen(testID, timeout = 30000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

async function tapByTestID(testID) {
  await element(by.id(testID)).tap();
}

async function typeByTestID(testID, text) {
  await element(by.id(testID)).typeText(text);
}

async function scrollToTestID(testID, parentID = null) {
  if (parentID) {
    await waitFor(element(by.id(testID)))
      .toBeVisible()
      .whileElement(by.id(parentID))
      .scroll(500, "down");
  } else {
    await element(by.id(testID)).scrollTo("bottom");
  }
}

async function scrollDown(screenID, pixels = 500) {
  await element(by.id(screenID)).scroll(pixels, "down");
}

async function expectVisible(testID, timeout = 30000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

async function expectExists(testID, timeout = 15000) {
  await waitFor(element(by.id(testID)))
    .toExist()
    .withTimeout(timeout);
}

async function expectText(testID, text) {
  await expect(element(by.id(testID))).toHaveText(text);
}

module.exports = {
  waitForScreen,
  tapByTestID,
  typeByTestID,
  scrollToTestID,
  scrollDown,
  expectVisible,
  expectExists,
  expectText,
  by,
  element,
  expect,
};

