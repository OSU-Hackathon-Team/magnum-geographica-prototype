import type { Database } from "../../src/db/index.js";

/**
 * Walk a Drizzle `sql` template tree and produce a SQL string with
 * parameters inlined (`'<value>'`) or rendered as `<param:N>` for non-string
 * values. Used by the mock `execute()` so tests can match on SQL substrings —
 * `String(sql)` would otherwise return `"[object Object]"`.
 *
 * The walker is deliberately tolerant: anything it doesn't understand is
 * stringified and inlined. That's fine for test assertions on SQL shape.
 */
function materializeSql(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    const candidate = node as {
      value?: unknown[] | string;
      queryChunks?: unknown[];
      decoder?: unknown;
    };
    // StringChunk: drizzle wraps raw SQL fragments as { value: string[] }
    if (Array.isArray(candidate.value)) {
      return candidate.value.map((v) => materializeSql(v)).join("");
    }
    if (typeof candidate.value === "string") return candidate.value;
    // SQL template: walk children
    if (Array.isArray(candidate.queryChunks)) {
      return candidate.queryChunks.map((c) => materializeSql(c)).join("");
    }
  }
  // Param/Placeholder: render as `'<value>'` (the param's raw value) so tests
  // can match against it without depending on drizzle's param escaping.
  const stringified = String(node);
  if (stringified !== "[object Object]") return stringified;
  try {
    return JSON.stringify(node);
  } catch {
    return "";
  }
}

export interface MockState {
  systems: Array<Record<string, unknown>>;
  superSystems: Array<Record<string, unknown>>;
  subSystems: Array<Record<string, unknown>>;
  systemSuperSystems: Array<Record<string, unknown>>;
  trailSubSystems: Array<Record<string, unknown>>;
  trails: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  wikiPages: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  entityStats: Array<Record<string, unknown>>;
  entityProtection: Array<Record<string, unknown>>;
  patrolFlags: Array<Record<string, unknown>>;
  presets: Array<Record<string, unknown>>;
  gpsTraces: Array<Record<string, unknown>>;
  traceSystems: Array<Record<string, unknown>>;
  gpsTraceSegments: Array<Record<string, unknown>>;
  traceSegmentVotes: Array<Record<string, unknown>>;
  synthesisRuns: Array<Record<string, unknown>>;
  insertCalls: Array<{ table: string; values: unknown }>;
  updateCalls: Array<{ table: string; values: unknown; where: unknown }>;
  deleteCalls: Array<{ table: string; where: unknown }>;
  executeCalls: Array<{ sql: string }>;
  selectDebug: boolean;
  /**
   * Programmatic overrides for `db.execute(sql)`. When the SQL (lowercased)
   * contains a substring of a key, the corresponding rows are returned
   * instead of the default `[]`. Allows tests to simulate partial-empty
   * result sets (e.g. systems returned but no trails/features).
   */
  executeRouter: Array<{ match: string; rows: Record<string, unknown>[] }>;
}

const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function getTableName(table: unknown): string {
  if (table && typeof table === "object") {
    const name = (table as Record<symbol, unknown>)[DRIZZLE_NAME];
    if (typeof name === "string") return name;
  }
  return "";
}

type WhereFn = (row: Record<string, unknown>) => boolean;

function evalWhere(where: unknown): WhereFn {
  // Best-effort filter: walk a tree of Drizzle `eq`/`and` predicates and
  // produce a JS predicate that compares `row[col.name] === value`. Unknown
  // shapes return a no-op (true) so we don't drop rows unnecessarily.
  const fn = compileWhere(where);
  return fn ?? (() => true);
}

/**
 * Map of DB column names (snake_case, as Drizzle reports them via
 * `col.name`) to the in-memory field name (camelCase) used by the mock's
 * in-memory state. Drizzle's `eq(col, value)` returns a SQL whose column
 * chunk has the snake-case name; our `state.<table>` rows are stored under
 * the camelCase alias. We bridge the two here.
 */
const COLUMN_NAME_MAP: Record<string, string> = {
  target_type: "targetType",
  target_id: "targetId",
  user_id: "userId",
  wiki_page_id: "wikiPageId",
  trail_id: "trailId",
  system_id: "systemId",
  super_system_id: "superSystemId",
  sub_system_id: "subSystemId",
  revision_id: "revisionId",
  patrol_flag_id: "patrolFlagId",
  created_by_user_id: "createdByUserId",
  created_by: "createdBy",
  voter_karma: "voterKarma",
  voter_tier: "voterTier",
  contributor_name: "contributorName",
  feature_id: "featureId",
  sort_order: "sortOrder",
  is_road_connector: "isRoadConnector",
  steep_grade: "steepGrade",
  one_way: "oneWay",
  ownership_source: "ownershipSource",
  source_date: "sourceDate",
  external_url: "externalUrl",
  rendered_html: "renderedHtml",
  content_md: "contentMd",
  image_data: "imageData",
  image_mime_type: "imageMimeType",
  edit_summary: "editSummary",
  contributor_name_default: "contributorName",
  action: "action",
  target_id_default: "targetId",
};

function resolveFieldName(dbColName: string): string {
  return COLUMN_NAME_MAP[dbColName] ?? dbColName;
}

function compileWhere(where: unknown): WhereFn | null {
  if (!where || typeof where !== "object") return null;
  const w = where as {
    left?: { name?: string };
    right?: unknown;
    queryChunks?: unknown[];
    value?: unknown;
    [k: string]: unknown;
  };
  // Plain `eq(col, value)` shape.
  if (w.left && typeof w.left === "object" && "name" in w.left && w.left.name && "right" in w) {
    const colName = resolveFieldName(w.left.name as string);
    const value = w.right;
    return (row) => row[colName] === value;
  }
  // Generic SQL: walk queryChunks and look for a column/Param pair (an `eq`).
  // Drizzle serializes `eq(col, value)` as SQL with queryChunks:
  //   [StringChunk(""), PgColumn(col), StringChunk(" = "), Param(value), StringChunk("")]
  if (Array.isArray(w.queryChunks)) {
    const leaves: WhereFn[] = [];
    let columnName: string | null = null;
    let columnFound = false;
    const flush = () => {
      if (columnFound) {
        // `value` was set on the parent SQL; pull it back from the outer scope.
        // The "value" we want is the most recently seen non-column chunk's value.
        // For simplicity we already track it via the parent scan.
      }
      columnFound = false;
      columnName = null;
    };
    for (const child of w.queryChunks) {
      if (!child || typeof child !== "object") continue;
      const c = child as { name?: unknown; table?: unknown; queryChunks?: unknown[]; value?: unknown };
      // PgColumn chunk: has a string `name` and a `table` reference.
      if (
        typeof c.name === "string" &&
        c.table !== undefined &&
        !Array.isArray(c.queryChunks)
      ) {
        columnName = c.name;
        columnFound = true;
        continue;
      }
      // Param chunk: Drizzle's `Param` class has `brand` and `encoder` keys
      // and a `value` payload. StringChunks also have `value` but no
      // `encoder`, so we use the presence of `encoder` (or constructor name)
      // to tell them apart.
      const ctorName = (child as { constructor?: { name?: string } }).constructor?.name;
      const isParam =
        ctorName === "Param" ||
        ("encoder" in c && c.encoder !== undefined && !Array.isArray(c.queryChunks));
      if (isParam) {
        if (columnFound && columnName) {
          const col = resolveFieldName(columnName);
          const val = (c as { value: unknown }).value;
          leaves.push((row) => row[col] === val);
          columnFound = false;
          columnName = null;
        }
        continue;
      }
      // Composite (and/or/etc.): recurse and collect any nested eq leaves.
      const nested = compileWhere(child);
      if (nested) leaves.push(nested);
    }
    if (leaves.length === 0) return null;
    return (row) => leaves.every((f) => f(row));
  }
  return null;
}

/**
 * Apply an insert (or upsert) to the in-memory state for tables the mock
 * tracks. Best-effort: falls back to a no-op for unknown tables.
 *
 * Special handling:
 *   - `entity_stats` upsert: the inserted `upvotes` / `downvotes` / `net`
 *     values are treated as *deltas* (because the service's
 *     `onConflictDoUpdate.set` adds them to the existing values via
 *     `GREATEST(0, current + dUp)`). We mirror that math here.
 *   - `votes` upsert: the row replaces the existing one for the same
 *     (target_type, target_id, user_id) tuple.
 */
function applyInsertToState(
  state: MockState,
  tableName: string,
  row: Record<string, unknown>,
  _conflictTarget: unknown,
  _conflictSet: Record<string, unknown> | undefined,
): void {
  const target = pickTableArray(state, tableName);
  if (!target) return;
  const pkMatch = findExistingRow(target, row, tableName);
  if (pkMatch < 0) {
    target.push({ ...row });
    return;
  }
  // entity_stats: the service's onConflictDoUpdate.set arithmetic
  // (`GREATEST(0, current + dUp)` etc.) treats the inserted values as
  // *deltas*. We mirror that here regardless of whether the caller wired
  // an explicit onConflictDoUpdate — the service always uses it.
  if (tableName === "entity_stats") {
    const existing = target[pkMatch] as Record<string, unknown>;
    const dUp = Number(row.upvotes ?? 0);
    const dDown = Number(row.downvotes ?? 0);
    const dNet = Number(row.net ?? 0);
    const curUp = Number(existing.upvotes ?? 0);
    const curDown = Number(existing.downvotes ?? 0);
    const curNet = Number(existing.net ?? 0);
    target[pkMatch] = {
      ...existing,
      upvotes: Math.max(0, curUp + dUp),
      downvotes: Math.max(0, curDown + dDown),
      net: curNet + dNet,
      hidden: curNet + dNet <= -3,
      updated_at: row.updated_at ?? existing.updated_at,
    };
    return;
  }
  if (tableName === "votes") {
    target[pkMatch] = { ...target[pkMatch], ...row };
    return;
  }
  target[pkMatch] = { ...target[pkMatch], ...row };
}

/**
 * Convert a snake_case key to camelCase. Used to normalize state rows on
 * read so that the where-filter side (which translates Drizzle column
 * names to camelCase field names via COLUMN_NAME_MAP) can find rows
 * regardless of whether they were inserted with snake_case (test
 * fixtures) or camelCase (service inserts) keys.
 */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (out[k] === undefined) out[k] = v;
    // Don't overwrite an already-camelCase key with its snake_case twin.
  }
  for (const [k, v] of Object.entries(row)) {
    const camel = snakeToCamel(k);
    if (out[camel] === undefined) out[camel] = v;
  }
  return out;
}

function pickTableArray(state: MockState, tableName: string): Array<Record<string, unknown>> | null {
  switch (tableName) {
    case "users":
      return state.users;
    case "votes":
      return state.votes;
    case "entity_stats":
      return state.entityStats;
    case "entity_protection":
      return state.entityProtection;
    case "patrol_flags":
      return state.patrolFlags;
    case "presets":
      return state.presets;
    case "systems":
      return state.systems;
    case "super_systems":
      return state.superSystems;
    case "sub_systems":
      return state.subSystems;
    case "system_super_systems":
      return state.systemSuperSystems;
    case "trail_sub_systems":
      return state.trailSubSystems;
    case "trails":
      return state.trails;
    case "features":
      return state.features;
    case "wiki_pages":
      return state.wikiPages;
    case "revisions":
      return state.revisions;
    case "citations":
      return state.citations;
    case "gps_traces":
      return state.gpsTraces;
    case "trace_systems":
      return state.traceSystems;
    case "gps_trace_segments":
      return state.gpsTraceSegments;
    case "trace_segment_votes":
      return state.traceSegmentVotes;
    case "synthesis_runs":
      return state.synthesisRuns;
    default:
      return null;
  }
}

function findExistingRow(
  target: Array<Record<string, unknown>>,
  row: Record<string, unknown>,
  tableName: string,
): number {
  if (tableName === "entity_stats") {
    return target.findIndex(
      (r) => r.target_type === row.target_type && r.target_id === row.target_id,
    );
  }
  if (tableName === "votes") {
    return target.findIndex(
      (r) =>
        r.target_type === row.target_type &&
        r.target_id === row.target_id &&
        r.user_id === row.user_id,
    );
  }
  if (tableName === "entity_protection") {
    return target.findIndex(
      (r) => r.target_type === row.target_type && r.target_id === row.target_id,
    );
  }
  if (tableName === "users" && typeof row.id === "string") {
    return target.findIndex((r) => r.id === row.id);
  }
  if (tableName === "presets") {
    return target.findIndex((r) => r.key === row.key);
  }
  return -1;
}

function pickRows(state: MockState, table: unknown): unknown[] {
  const name = getTableName(table);
  const rows = pickTableArray(state, name);
  if (!rows) return [];
  return rows.map((r) => normalizeRowKeys(r as Record<string, unknown>));
}


function applyWhere(rows: unknown[], where: unknown): unknown[] {
  const fn = evalWhere(where);
  return rows.filter((r) => fn(r as Record<string, unknown>));
}

function applyOrderBy(rows: unknown[], orderBys: Array<Array<unknown>>): unknown[] {
  if (orderBys.length === 0) return rows;
  // Each .orderBy() call may pass one or more column expressions. For
  // Drizzle's `asc(col)` / `desc(col)` the expression carries the column
  // reference (with `.name`) and the direction. We extract those.
  const parsed: Array<{ col: string; dir: "asc" | "desc" }> = [];
  for (const callArgs of orderBys) {
    for (const arg of callArgs) {
      if (!arg || typeof arg !== "object") continue;
      const a = arg as {
        queryChunks?: unknown[];
      };
      // For a single asc/desc on a column, the SQL wraps the column in
      // orderBy fragments. Walk the chunks to find the column name.
      const col = findColumnInOrderBy(a);
      if (col) {
        // Drizzle tags order direction via the `desc()` helper. Detect
        // it by looking for a `direction: "desc"` marker in the
        // expression (it sets `order: "desc"` on the SQL node). We
        // avoid JSON.stringify because the column carries a back-
        // reference to its table and cycles.
        const isDesc = hasDescMarker(a);
        parsed.push({ col: resolveFieldName(col), dir: isDesc ? "desc" : "asc" });
      }
    }
  }
  if (parsed.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { col, dir } of parsed) {
      const av = (a as Record<string, unknown>)[col];
      const bv = (b as Record<string, unknown>)[col];
      if (av === bv) continue;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

function findColumnInOrderBy(node: { queryChunks?: unknown[] }): string | null {
  if (!node.queryChunks) return null;
  for (const chunk of node.queryChunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const c = chunk as { name?: unknown; table?: unknown; queryChunks?: unknown[] };
    if (typeof c.name === "string" && c.table !== undefined && !Array.isArray(c.queryChunks)) {
      return c.name;
    }
  }
  return null;
}

function hasDescMarker(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(n)) {
    if (k === "order" && v === "desc") return true;
    if (k === "direction" && v === "desc") return true;
  }
  // Walk children looking for a StringChunk whose value contains "DESC".
  if (Array.isArray(n.queryChunks)) {
    for (const c of n.queryChunks) {
      if (c && typeof c === "object") {
        const cn = c as { value?: unknown; constructor?: { name?: string } };
        if (cn.constructor?.name === "StringChunk" && Array.isArray(cn.value)) {
          if (cn.value.some((v) => typeof v === "string" && v.toLowerCase().includes("desc"))) {
            return true;
          }
        }
        if (hasDescMarker(c)) return true;
      }
    }
  }
  return false;
}

function applyLimitOffset(rows: unknown[], limit: number, offset: number): unknown[] {
  return rows.slice(offset, offset + limit);
}

export function createMockDb(): { db: Database; state: MockState } {
  const state: MockState = {
    systems: [],
    superSystems: [],
    subSystems: [],
    systemSuperSystems: [],
    trailSubSystems: [],
    trails: [],
    features: [],
    wikiPages: [],
    revisions: [],
    citations: [],
    users: [],
    votes: [],
    entityStats: [],
    entityProtection: [],
    patrolFlags: [],
    presets: [],
    gpsTraces: [],
    traceSystems: [],
    gpsTraceSegments: [],
    traceSegmentVotes: [],
    synthesisRuns: [],
    insertCalls: [],
    updateCalls: [],
    deleteCalls: [],
    executeCalls: [],
    selectDebug: false,
    executeRouter: [],
  };

  function buildChain(rows: unknown[], fromTable: string): Record<string, unknown> {
    let whereFilter: unknown = null;
    let limitVal = Infinity;
    let offsetVal = 0;
    const orderBys: Array<Array<unknown>> = [];

    const chain: Record<string, unknown> = {};
    const promise = Promise.resolve(rows);
    chain.then = promise.then.bind(promise);

    chain.from = (table: unknown) => {
      const name = getTableName(table);
      return name ? buildChain(pickRows(state, table), name) : buildChain([], "");
    };
    chain.where = (where: unknown) => {
      whereFilter = where;
      return chain;
    };
    chain.limit = (val: unknown) => {
      limitVal = Number(val) || Infinity;
      return chain;
    };
    chain.offset = (val: unknown) => {
      offsetVal = Number(val) || 0;
      return chain;
    };
    chain.innerJoin = () => chain;
    chain.leftJoin = () => chain;
    chain.orderBy = (...args: unknown[]) => {
      orderBys.push(args);
      return chain;
    };

    const origThen = chain.then;
    chain.then = (
      onfulfilled?: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => {
      let result = rows;
      if (whereFilter) result = applyWhere(result, whereFilter);
      result = applyOrderBy(result, orderBys);
      result = applyLimitOffset(result, limitVal, offsetVal);
      return Promise.resolve(result).then(onfulfilled, onrejected);
    };

    chain.select = () => chain;
    chain.selectDistinct = () => chain;
    chain.groupBy = () => chain;
    return chain;
  }

  const mockDb = {
    select: () => buildChain([], "systems"),
    selectDistinct: () => buildChain([], "systems"),
    execute: (sql: unknown) => {
      const sqlStr = materializeSql(sql);
      state.executeCalls.push({ sql: sqlStr });
      for (const route of state.executeRouter) {
        if (sqlStr.toLowerCase().includes(route.match.toLowerCase())) {
          return Promise.resolve({ rows: route.rows });
        }
      }
      return Promise.resolve({ rows: [] });
    },
    insert: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      let stashedValues: unknown = undefined;
      let conflictTarget: unknown = undefined;
      let conflictSet: Record<string, unknown> | undefined = undefined;
      let applied = false;
      const apply = () => {
        if (applied) return;
        applied = true;
        const defaults: Record<string, unknown> = {};
        if (tableName === "users") {
          defaults.role = "contributor";
          defaults.trust_score = 0;
          defaults.created_at = "2026-01-01T00:00:00.000Z";
          defaults.updated_at = "2026-01-01T00:00:00.000Z";
          defaults.display_name = null;
        }
        if (tableName === "wiki_pages") {
          defaults.rendered_html = "";
          defaults.created_at = "2026-01-01T00:00:00.000Z";
          defaults.updated_at = "2026-01-01T00:00:00.000Z";
        }
        // `values` can be a single object or an array of objects. The
        // service uses `db.insert(t).values([rowA, rowB])` for batch
        // inserts; both shapes need to land in state.
        const raw = stashedValues;
        const rows: Array<Record<string, unknown>> = Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>)
          : raw && typeof raw === "object"
            ? [raw as Record<string, unknown>]
            : [];
        for (const v of rows) {
          const row = { id: "00000000-0000-0000-0000-000000000001", ...defaults, ...v };
          applyInsertToState(state, tableName, row, conflictTarget, conflictSet);
        }
      };
      chain.values = (values: unknown) => {
        stashedValues = values;
        state.insertCalls.push({ table: tableName, values });
        // Apply to state immediately so subsequent `select`/`update` calls
        // see the row even when the caller doesn't chain `.returning()`.
        // We wait for any onConflictDoUpdate to register itself first by
        // re-applying when that method is called.
        if (!conflictTarget) apply();
        return chain;
      };
      chain.returning = () => {
        apply();
        const raw = stashedValues;
        const rows: Array<Record<string, unknown>> = Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>)
          : raw && typeof raw === "object"
            ? [raw as Record<string, unknown>]
            : [];
        const returned = rows.length > 0
          ? rows.map((v) => ({ id: "00000000-0000-0000-0000-000000000001", ...v }))
          : [{ id: "00000000-0000-0000-0000-000000000001" }];
        return Promise.resolve(returned);
      };
      chain.onConflictDoNothing = () => {
        apply();
        return chain;
      };
      chain.onConflictDoUpdate = (config: {
        target?: unknown;
        set?: Record<string, unknown>;
      }) => {
        conflictTarget = config?.target;
        conflictSet = config?.set;
        state.updateCalls.push({
          table: tableName,
          values: (config?.set as Record<string, unknown>) ?? {},
          where: { upsert: true, target: config?.target },
        });
        // Now that conflict config is set, apply the insert (which will
        // trigger the upsert path in applyInsertToState).
        apply();
        return chain;
      };
      return chain;
    },
    update: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      let stashedValues: unknown = undefined;
      let whereFilter: unknown = null;
      chain.set = (values: unknown) => {
        stashedValues = values;
        return chain;
      };
      chain.where = (where: unknown) => {
        whereFilter = where;
        state.updateCalls.push({ table: tableName, values: stashedValues as Record<string, unknown>, where });
        // Best-effort: apply the update to the in-memory state for tables
        // we can match. We resolve the where via a JS predicate built from
        // the same Drizzle leaf-walker the select chain uses.
        const target = pickTableArray(state, tableName);
        if (target && stashedValues) {
          const fn = compileWhere(where);
          if (fn) {
            for (let i = 0; i < target.length; i++) {
              if (fn(target[i] as Record<string, unknown>)) {
                target[i] = { ...(target[i] as Record<string, unknown>), ...(stashedValues as Record<string, unknown>) };
              }
            }
          }
        }
        return chain;
      };
      chain.returning = () => {
        const target = pickTableArray(state, tableName);
        const fn = compileWhere(whereFilter);
        if (!target || !fn) {
          return Promise.resolve([{ id: "00000000-0000-0000-0000-000000000001" }]);
        }
        const rows = target.filter((r) => fn(r as Record<string, unknown>));
        return Promise.resolve(rows.length > 0 ? rows : [{ id: "00000000-0000-0000-0000-000000000001" }]);
      };
      return chain;
    },
    delete: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      let whereFilter: unknown = null;
      const removed: unknown[] = [];
      chain.where = (where: unknown) => {
        whereFilter = where;
        state.deleteCalls.push({ table: tableName, where });
        const target = pickTableArray(state, tableName);
        if (target) {
          const fn = compileWhere(where);
          if (fn) {
            for (let i = target.length - 1; i >= 0; i--) {
              if (fn(target[i] as Record<string, unknown>)) {
                removed.push(target[i]);
                target.splice(i, 1);
              }
            }
          }
        }
        return chain;
      };
      chain.returning = () => Promise.resolve(removed);
      return chain;
    },
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
  };

  return { db: mockDb as unknown as Database, state };
}
