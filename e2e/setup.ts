import { device } from "detox";

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    launchArgs: { mockApi: "true" },
  });
});

afterAll(async () => {
  await device.terminateApp();
});
