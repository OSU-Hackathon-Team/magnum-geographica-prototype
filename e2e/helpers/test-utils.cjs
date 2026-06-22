const { by, element, expect } = require("detox");

async function waitForScreen(testID, timeout = 15000) {
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

async function scrollToTestID(testID) {
  await element(by.id(testID)).scrollTo("bottom");
}

async function expectVisible(testID) {
  await expect(element(by.id(testID))).toBeVisible();
}

async function expectText(testID, text) {
  await expect(element(by.id(testID))).toHaveText(text);
}

module.exports = {
  waitForScreen,
  tapByTestID,
  typeByTestID,
  scrollToTestID,
  expectVisible,
  expectText,
  by,
  element,
  expect,
};
