// Type stubs for react-native-background-geolocation. We only use a
// small slice of the API; the full typings live in the npm package
// but we don't need them to typecheck (and installing the typings
// would force a full type-graph rebuild for the native package
// which the build doesn't need).

declare module "react-native-background-geolocation" {
  export interface BGGLocation {
    coords: {
      longitude: number;
      latitude: number;
      altitude?: number | null;
      accuracy?: number;
      speed?: number;
      heading?: number;
    };
    timestamp?: string | number;
    uuid?: string;
  }

  export interface BGGConfig {
    desiredAccuracy?: number;
    distanceFilter?: number;
    stopOnTerminate?: boolean;
    startOnBoot?: boolean;
    preventSuspend?: boolean;
    heartbeatInterval?: number;
    locationAuthorizationRequest?: string;
    locationAuthorizationAlert?: {
      titleWhenNotEnabled?: string;
      titleWhenDisabled?: string;
      instructions?: string;
      cancelButton?: string;
      settingsButton?: string;
    };
    foregroundService?: boolean;
    notification?: {
      title?: string;
      text?: string;
      channelName?: string;
      smallIcon?: string;
    };
    extras?: Record<string, unknown>;
  }

  export interface BGGModule {
    ready: (config: BGGConfig) => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    changePace: (moving: boolean) => Promise<void>;
    onLocation: (cb: (loc: BGGLocation) => void) => () => void;
    onMotionChange: (cb: (e: { isMoving: boolean }) => void) => () => void;
    onHeartbeat: (cb: (e: unknown) => void) => () => void;
    getCurrentPosition: () => Promise<BGGLocation>;
    destroyLocations: () => Promise<void>;
    logger: { enable: () => void };
  }

  const bgg: BGGModule;
  export default bgg;
}
