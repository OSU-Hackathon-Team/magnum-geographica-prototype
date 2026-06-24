# @magnum/shared

Types, Zod schemas, API client, and constants shared across the Magnum stack.

Consumed by:

- `@magnum/api` — uses types for route validation
- `@magnum/app` — uses the typed API client and constants
- `@magnum/map` — uses color/icon constants for layer styling

## Layout

```
src/
  constants.ts        enums + colors + icons + storage caps
  types/              entity types (mirrors DB schema)
  schemas/            Zod input + entity schemas
  api/
    client.ts         low-level fetch wrapper with auth headers
    endpoints.ts      typed Magnum API surface
    types.ts          request/response DTOs
  index.ts            barrel
test/                 bun test files
```

## Scripts

```bash
bun run typecheck     tsc --noEmit
bun run lint          eslint src
bun run test          bun test
```
