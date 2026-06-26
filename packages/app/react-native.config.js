/**
 * React Native CLI / expo-modules-autolinking overrides.
 *
 * Why: The `expo` package's Android module sets its Gradle namespace to
 * `expo.core` (for BuildConfig/R-class generation), but the actual
 * `ExpoModulesPackage` Kotlin class lives in package `expo.modules`.
 * `expo-modules-autolinking` derives the autolinking import from the Gradle
 * namespace when no explicit `packageImportPath` is provided, so it generates
 * `import expo.core.ExpoModulesPackage;` in PackageList.java, which fails to
 * compile. The expo package's own react-native.config.js would correct this,
 * but only when `useExpoModules` is detected at the *monorepo root*, which is
 * not where this project's settings.gradle lives. We pin the correct import
 * here at the app level so it is honored regardless.
 */
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
        },
      },
    },
  },
};
