/** @type {import('jest').Config} */
module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.test.cjs"],
  testTimeout: 300000,
  setupTimeout: 180000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  testEnvironment: "detox/runners/jest/testEnvironment",
  setupFilesAfterEnv: ["./e2e/setup.cjs"],
  reporters: ["detox/runners/jest/reporter"],
  verbose: true,
};
