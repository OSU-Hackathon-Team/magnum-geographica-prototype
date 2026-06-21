# @magnum/app

Expo (React Native + React Native Web) app. `expo-router` for file-based navigation.

## Scripts

```bash
bun run start        expo start (dev menu)
bun run web          expo start --web
bun run android      expo start --android
bun run ios          expo start --ios
bun run build        expo export --platform all
bun run typecheck    tsc --noEmit
bun run lint         eslint src app
```

## Layout

```
app/                 file-based routes
  _layout.tsx        providers (theme, offline, gesture handler)
  (tabs)/
    _layout.tsx      tab nav + header status indicator
    explore.tsx      map placeholder
    systems.tsx      list (fetches from API)
    trails.tsx       list (fetches from API)
    profile.tsx      settings: contributor name, status, storage
src/
  components/
    ui/              Button, Card, SearchBar, DifficultyBadge, SegmentTypeBadge
    offline/         StatusIndicator
  providers/         ThemeProvider, OfflineProvider
  stores/            zustand: auth, offline, map, ui
app.json             Expo config
babel.config.js      babel-preset-expo
metro.config.js      monorepo-aware Metro + .js -> .ts resolver
```

## Env

Configure via `app.json` `extra` or `.env` (with `EXPO_PUBLIC_` prefix):

- `EXPO_PUBLIC_API_URL` — default `http://localhost:3000`
- `EXPO_PUBLIC_MARTIN_URL` — default `http://localhost:3001`
- `EXPO_PUBLIC_TILE_URL` — OSM tile URL template

## Why `app/` at the package root

PLAN.md had `src/app/`, but the standard Expo + `expo-router` convention is `app/` at the project root. We keep `src/` for non-route code (components, stores, providers). See root README for the rationale.
