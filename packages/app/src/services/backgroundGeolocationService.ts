import { PermissionsAndroid, Platform } from "react-native";
import { createMagnumClient } from "@magnum/shared";
import BackgroundGeolocation, { type Config } from "react-native-background-geolocation";
import { useAuthStore } from "../stores/authStore";
import { useTraceStore } from "../stores/traceStore";
import { useOfflineStore } from "../stores/offlineStore";
import {
  addPendingContribution,
  appendTracePoint,
  appendTracePointsBulk,
  createTraceSession,
  discardTraceSession,
  getActiveTraceSession,
  getPendingCount,
  getTraceSession,
  listTracePoints,
  recomputeTraceDistance,
  updateTraceSessionStatus,
  type TracePoint,
  type TraceSession,
} from "./offlineDataService";

/**
 * Generate a small v4-ish UUID. We don't pull in a crypto dep — the
 * session id is locally unique (one per active recording at a time)
 * and a collision would just orphan a row, not break correctness.
 */
function uuid(): string {
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Library event payload (the fields we use; the real one is larger).
 */
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

let bggInstance: typeof BackgroundGeolocation | null = null;

function loadBGG(): typeof BackgroundGeolocation | null {
  if (Platform.OS === "web") return null;
  if (!bggInstance) {
    bggInstance = BackgroundGeolocation;
    console.log("[trace] BGG loaded statically, hasReady:", typeof (BackgroundGeolocation as unknown as Record<string, unknown>).ready === "function", "hasStart:", typeof (BackgroundGeolocation as unknown as Record<string, unknown>).start === "function");
  }
  return bggInstance;
}

const SESSION_LIVE_KEY = "magnum.activeTraceSession";

/**
 * Build the config for the location manager. Tuned for foot-traces
 * (hiking); high-accuracy with motion-based power management.
 *
 *   `stopOnTerminate: false` — keep recording even if the OS kills
 *   the app; the library's foreground service handles the
 *   persistent-notification requirement.
 *   `startOnBoot: true` — survive reboots (a hiker is unlikely to
 *   reboot, but if they do we want to keep going).
 *   `preventSuspend: true` — keep CPU awake while the app is
 *   foregrounded so the map stays in sync with new points.
 *   `locationAuthorizationRequest: Always` — iOS background
 *   tracking requires "Always", not "When in use".
 */
function bggConfig(sessionId: string): Config {
  return {
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 5, // meters
    stopOnTerminate: false,
    startOnBoot: true,
    preventSuspend: true,
    heartbeatInterval: 60,
    locationAuthorizationRequest: "Always",
    locationAuthorizationAlert: {
      titleWhenOff: "Location services are off",
      titleWhenNotEnabled: "Background location is required",
      titleWhenDisabled: "Background location is disabled",
      instructions: "Magnum uses background location to record your hike.",
      cancelButton: "Cancel",
      settingsButton: "Settings",
    },
    foregroundService: true,
    notification: {
      title: "Magnum is recording your trace",
      text: "Tap to open the live trace view",
      channelName: "Trace recording",
      smallIcon: "ic_stat_notify",
    },
    // We track the in-flight session via the `extras` field; the
    // library writes it on every record so we can identify which
    // session a recovered location belongs to.
    extras: { session_id: sessionId },
  } as Config;
}

/**
 * Open a brand-new session, start the background tracker, and wire
 * the onLocation callback to write to our SQLite mirror.
 */
export async function startTraceRecording(): Promise<TraceSession> {
  const session = await createTraceSession(uuid(), new Date().toISOString());
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(SESSION_LIVE_KEY, session.id);
    }
  } catch {
    // localStorage unavailable; not fatal
  }
  const bgg = await loadBGG();
  if (bgg) {
    console.log("[trace] BGG loaded, requesting permissions...");
    if (Platform.OS === "android") {
      try {
        const fineGranted = await PermissionsAndroid.request(
          "android.permission.ACCESS_FINE_LOCATION",
          {
            title: "Location Permission",
            message: "Magnum needs location access to record your hike.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          },
        );
        console.log("[trace] Android ACCESS_FINE_LOCATION:", fineGranted);
        if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error("Location permission denied");
        }
        if (Platform.Version >= 29) {
          const bgGranted = await PermissionsAndroid.request(
            "android.permission.ACCESS_BACKGROUND_LOCATION",
            {
              title: "Background Location",
              message: "Allow Magnum to track your location even when the app is closed?",
              buttonPositive: "Allow",
              buttonNegative: "Deny",
            },
          );
          console.log("[trace] Android ACCESS_BACKGROUND_LOCATION:", bgGranted);
        }
      } catch (e) {
        console.warn("[trace] Permission request failed:", e);
        throw e;
      }
    }
    try {
      console.log("[trace] calling bgg.ready() with config...");
      await bgg.ready(bggConfig(session.id));
      console.log("[trace] bgg.ready() OK");
    } catch (e) {
      console.warn("[trace] bgg.ready() failed:", e);
      throw new Error(`Background-geolocation init failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    bgg.onLocation((loc) => {
      void persistLocation(session.id, loc);
    });
    console.log("[trace] onLocation listener registered");
    await bgg.start();
    console.log("[trace] BGG started, session=", session.id, "waiting for locations...");
  } else {
    console.warn("[trace] BGG not available (web or failed load)");
  }
  return session;
}

/**
 * Resume the library for an existing session (used by the recovery
 * flow when the user picks "Continue" after a kill). We do NOT
 * recreate the SQLite session — the existing row already has all
 * the points the library managed to write before the kill; we just
 * reattach the listener.
 */
export async function resumeTraceRecording(session: TraceSession): Promise<void> {
  const bgg = await loadBGG();
  if (bgg) {
    try {
      // The library persists its own on-disk location log; pulling
      // any pre-kill points into our mirror is handled by
      // `backfillFromBggDatabase`, called by the recovery caller.
      await bgg.ready(bggConfig(session.id));
      bgg.onLocation((loc) => {
        void persistLocation(session.id, loc);
      });
      await bgg.start();
    } catch (e) {
      console.warn("[trace] failed to resume tracker", e);
    }
  }
}

/**
 * Pause: stop the foreground service, but keep the session row open
 * so the user can resume. The library's `changePace(false)` switches
 * to a low-power "stationary" mode; we use `stop()` for a true pause
 * so the location indicator goes away.
 */
export async function pauseTraceRecording(): Promise<void> {
  const bgg = await loadBGG();
  if (bgg) {
    try {
      await bgg.stop();
    } catch (e) {
      console.warn("[trace] pause failed", e);
    }
  }
}

export async function resumeAfterPause(): Promise<void> {
  const bgg = await loadBGG();
  if (bgg) {
    try {
      await bgg.start();
    } catch (e) {
      console.warn("[trace] resume failed", e);
    }
  }
}

/**
 * Submit a finished trace. The points already live in our SQLite
 * (the live path wrote them as they arrived). We re-read them, build
 * the geometry payload, and POST to the server — or queue in
 * `pending_contributions` when offline.
 */
export async function submitTraceSession(sessionId: string): Promise<{
  submitted: boolean;
  queued: boolean;
  error?: string;
}> {
  const session = await getTraceSession(sessionId);
  if (!session) return { submitted: false, queued: false, error: "session not found" };
  const points = await listTracePoints(sessionId);
  if (points.length < 2) {
    return { submitted: false, queued: false, error: "Need at least 2 points to submit" };
  }
  const totalMeters = await recomputeTraceDistance(sessionId);
  const coords: Array<[number, number]> = points.map((p) => [p.lon, p.lat]);
  const payload = {
    geometry: { type: "LineString" as const, coordinates: coords },
    source: "recorded" as const,
    recorded_at: session.started_at,
  };
  const isOnline = useOfflineStore.getState().isOnline;
  if (!isOnline) {
    const contributor = useAuthStore.getState().contributorName || "anonymous";
    const id = await addPendingContribution("trace", "create", payload, contributor);
    await updateTraceSessionStatus(sessionId, "submitted", {
      ended_at: new Date().toISOString(),
      total_meters: totalMeters,
      pending_contribution_id: id,
    });
    await refreshPendingCount();
    return { submitted: false, queued: true };
  }
  try {
    const client = createMagnumClient(API_URL, {
      getAuthToken: () => useAuthStore.getState().token ?? undefined,
    });
    const res = await client.createTrace(payload);
    const serverId = (res.trace as { id?: string } | undefined)?.id ?? null;
    await updateTraceSessionStatus(sessionId, "submitted", {
      ended_at: new Date().toISOString(),
      total_meters: totalMeters,
      server_trace_id: serverId,
    });
    // Auto-cut segments server-side so the trace is synthesis-ready
    // even if the moderator never opens the system detail page.
    if (serverId) {
      try {
        await client.cutTraceSegments(serverId);
      } catch (e) {
        console.warn("[trace] segment cut failed", e);
      }
    }
    return { submitted: true, queued: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "submit failed";
    // Network-shaped failures fall through to the offline queue so
    // the user never loses a trace to a flaky signal.
    if (/network|fetch|timeout/i.test(msg)) {
      const contributor = useAuthStore.getState().contributorName || "anonymous";
      const id = await addPendingContribution("trace", "create", payload, contributor);
      await updateTraceSessionStatus(sessionId, "submitted", {
        ended_at: new Date().toISOString(),
        total_meters: totalMeters,
        pending_contribution_id: id,
      });
      await refreshPendingCount();
      return { submitted: false, queued: true };
    }
    return { submitted: false, queued: false, error: msg };
  }
}

async function refreshPendingCount() {
  try {
    const count = await getPendingCount();
    useOfflineStore.getState().setPendingCount(count);
  } catch {
    // ignore
  }
}

/**
 * Discard: stop the library, mark the session `discarded`. The row
 * stays around for audit but no points are uploaded.
 */
export async function discardTraceSessionById(sessionId: string): Promise<void> {
  const bgg = await loadBGG();
  if (bgg) {
    try {
      await bgg.stop();
    } catch (e) {
      console.warn("[trace] stop during discard failed", e);
    }
  }
  await discardTraceSession(sessionId);
}

/**
 * Mark a session as "ended" in the DB (used by the recovery flow's
 * "End & Save" path — it submits the recovered session and then
 * flips the local row to `submitted`).
 */
export async function endTraceSession(sessionId: string): Promise<void> {
  await updateTraceSessionStatus(sessionId, "submitted", {
    ended_at: new Date().toISOString(),
  });
}

async function persistLocation(sessionId: string, loc: BGGLocation): Promise<void> {
  const recorded_at = new Date(
    typeof loc.timestamp === "number" ? loc.timestamp : Date.now(),
  ).toISOString();
  const point = {
    lon: loc.coords.longitude,
    lat: loc.coords.latitude,
    elevation: loc.coords.altitude ?? null,
    accuracy: loc.coords.accuracy ?? null,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    recorded_at,
  };
  console.log("[trace] location received:", point.lon.toFixed(6), point.lat.toFixed(6), "acc=", point.accuracy);
  useTraceStore.getState().appendPoint(point);
  try {
    await appendTracePoint(sessionId, point);
  } catch (e) {
    console.warn("[trace] persistLocation failed", e);
  }
}

/**
 * Recovery entrypoint. Called on app launch. If a session is in
 * `recording` or `paused` we return it so the UI can prompt the
 * user. The caller decides whether to attach the library via
 * `resumeTraceRecording` or to discard.
 */
export async function checkForRecoverableSession(): Promise<TraceSession | null> {
  return getActiveTraceSession();
}

/**
 * On app launch (after a kill), pull any locations the library
 * persisted to its own on-disk DB that we haven't yet mirrored into
 * ours. The library stores them in its own SQLite file with a
 * `extras.session_id` we set in the config. We do a best-effort
 * backfill using the library's location cursor.
 */
export async function backfillFromBggDatabase(
  sessionId: string,
  fetcher: () => Promise<Array<BGGLocation>>,
): Promise<number> {
  try {
    const locations = await fetcher();
    if (locations.length === 0) return 0;
    const points = locations.map((l) => ({
      lon: l.coords.longitude,
      lat: l.coords.latitude,
      elevation: l.coords.altitude ?? null,
      accuracy: l.coords.accuracy ?? null,
      speed: l.coords.speed ?? null,
      heading: l.coords.heading ?? null,
      recorded_at: new Date(
        typeof l.timestamp === "number" ? l.timestamp : Date.now(),
      ).toISOString(),
    }));
    return appendTracePointsBulk(sessionId, points);
  } catch (e) {
    console.warn("[trace] backfill failed", e);
    return 0;
  }
}

export type { TraceSession, TracePoint };
