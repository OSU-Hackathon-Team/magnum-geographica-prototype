// Detox config. Loaded by `detox test ...` automatically.
// Reads host ports from .env so this works whether you're on the default
// instance (3000/3001/8081) or a shifted one (see scripts/ports.sh).
const fs = require("node:fs");
const path = require("node:path");

// Tiny .env loader (avoids adding dotenv as a dep).
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(path.join(__dirname, ".env"));
loadEnv(path.join(__dirname, ".env.example"));

const API_PORT = Number(process.env.API_HOST_PORT || 3000);
const MARTIN_PORT = Number(process.env.MARTIN_HOST_PORT || 3001);
const METRO_PORT = Number(process.env.METRO_HOST_PORT || 8081);

module.exports = {
  logger: {
    level: "info",
  },
  testRunner: {
    $0: "jest",
    args: {
      config: "e2e/jest.config.cjs",
      _: ["e2e"],
    },
  },
  behavior: {
    init: {
      reinstallApp: true,
      launchApp: true,
    },
  },
  apps: {
    "android.debug": {
      type: "android.apk",
      binaryPath: "packages/app/android/app/build/outputs/apk/debug/app-debug.apk",
      testBinaryPath:
        "packages/app/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
      build:
        "export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && cd packages/app/android && ./gradlew app:assembleDebug app:assembleAndroidTest -DtestBuildType=debug -x lint -x test -PreactNativeArchitectures=x86_64",
      reversePorts: [METRO_PORT, API_PORT, MARTIN_PORT],
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "packages/app/android/app/build/outputs/apk/release/app-release.apk",
      testBinaryPath:
        "packages/app/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk",
      build:
        "export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && cd packages/app/android && ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release -x lint -x test -PreactNativeArchitectures=x86_64",
    },
  },
  devices: {
    emulator: {
      type: "android.emulator",
      device: { avdName: "test_device" },
    },
  },
  configurations: {
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
    "android.emu.release": {
      device: "emulator",
      app: "android.release",
    },
  },
};
