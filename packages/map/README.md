# @magnum/map

OpenLayers wrapper that works on both web and React Native.

## How it picks an implementation

- `MapContainer.web.tsx` — direct OpenLayers on web (via `react-native-web`).
- `MapContainer.native.tsx` — WebView that loads a bundled HTML page with OpenLayers, bridged via `postMessage` (wired up in Phase 1).
- `MapContainer.tsx` — `Platform.select` + `require` to pick the right one at runtime, so the unused branch is not bundled.

`ol/ol.css` is imported in the web build; the native bundle never pulls in `ol`.

## Exports

```ts
import { MapContainer, defaultMapConfig } from "@magnum/map";
import type { MapContainerProps } from "@magnum/map";
```

`defaultMapConfig` lives in `src/shared/config.ts` and is the single source of truth for tile URLs, center, zoom range. Override via `MapContainerProps.config`.

## Phase 0 status

- Web: renders an OSM base layer at Ohio center, zoom 6, with a click handler.
- Native: WebView with OL loaded from CDN, `mapClick` events posted back via `window.ReactNativeWebView.postMessage`.

Phase 1 will wire trails, systems, and features as vector tile layers + the WebView bridge handlers.
