// Workaround for Hermes "Error.stack getter called with an invalid receiver"
// Runtime error-reporting code (Expo/React Native/LogBox) calls error.stack
// on objects that Hermes does not recognise as Error instances, which
// throws instead of returning undefined.  Wrap the getter so it returns
// undefined instead of crashing.
if (global.HermesInternal) {
  const desc = Object.getOwnPropertyDescriptor(Error.prototype, "stack");
  if (desc && desc.get) {
    const orig = desc.get;
    Object.defineProperty(Error.prototype, "stack", {
      get() {
        try {
          return orig.call(this);
        } catch {
          return undefined;
        }
      },
      configurable: true,
      enumerable: false,
    });
  }
}
