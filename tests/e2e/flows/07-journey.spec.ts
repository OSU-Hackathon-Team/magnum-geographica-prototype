import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test("end-to-end: browse a system and follow a trail through to its details", async ({ page }) => {
  await installApiMock(page);

  await page.goto("/");
  await expect(page.getByTestId("explore-screen")).toBeVisible();

  await page.getByRole("tab", { name: "Systems" }).click();
  await page.getByTestId("system-card-hocking-hills-state-park").click();
  await expect(page).toHaveURL(/\/system\/hocking-hills-state-park$/);
  await expect(page.getByTestId("system-name")).toHaveText("Hocking Hills State Park");

  await page.getByTestId("system-trail-card-buckeye-trail").click();
  await expect(page).toHaveURL(/\/trail\/buckeye-trail$/);
  await expect(page.getByTestId("trail-name")).toHaveText("Buckeye Trail");
  await expect(page.getByTestId("trail-verified")).toBeVisible();
  await expect(page.getByTestId("trail-segment-seg-1")).toBeVisible();
  await expect(page.getByTestId("trail-feature-f-1")).toBeVisible();
});
