import { by, element, expect } from "detox";

export async function waitForScreen(testID: string, timeout = 15000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

export async function tapByTestID(testID: string) {
  await element(by.id(testID)).tap();
}

export async function typeByTestID(testID: string, text: string) {
  await element(by.id(testID)).typeText(text);
}

export async function scrollToTestID(testID: string) {
  await element(by.id(testID)).scrollTo("bottom");
}

export async function expectVisible(testID: string) {
  await expect(element(by.id(testID))).toBeVisible();
}

export async function expectText(testID: string, text: string) {
  await expect(element(by.id(testID))).toHaveText(text);
}

export async function expectToContainText(testID: string, text: string) {
  const el = element(by.id(testID));
  await expect(el).toBeVisible();
}

export { by, element, expect };
