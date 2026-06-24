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
  trails: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  wikiPages: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
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
  return () => true;
}

function pickRows(state: MockState, table: unknown): unknown[] {
  const name = getTableName(table);
  if (name === "trails") return [...state.trails];
  if (name === "features") return [...state.features];
  if (name === "systems") return [...state.systems];
  if (name === "super_systems") return [];
  if (name === "sub_systems") return [];
  if (name === "trail_segments") return [];
  if (name === "trail_systems") return [];
  if (name === "wiki_pages") return [...state.wikiPages];
  if (name === "revisions") return [...state.revisions];
  if (name === "citations") return [...state.citations];
  if (name === "users") return [...state.users];
  return [];
}

function applyWhere(rows: unknown[], where: unknown): unknown[] {
  const fn = evalWhere(where);
  return rows.filter((r) => fn(r as Record<string, unknown>));
}

function applyOrderBy(rows: unknown[]): unknown[] {
  return rows;
}

function applyLimitOffset(rows: unknown[], limit: number, offset: number): unknown[] {
  return rows.slice(offset, offset + limit);
}

export function createMockDb(): { db: Database; state: MockState } {
  const state: MockState = {
    systems: [],
    trails: [],
    features: [],
    wikiPages: [],
    revisions: [],
    citations: [],
    users: [],
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
    chain.orderBy = () => chain;

    const origThen = chain.then;
    chain.then = (
      onfulfilled?: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => {
      let result = rows;
      if (whereFilter) result = applyWhere(result, whereFilter);
      result = applyOrderBy(result);
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
      chain.values = (values: unknown) => {
        state.insertCalls.push({ table: tableName, values });
        return chain;
      };
      chain.returning = () => {
        const call = state.insertCalls[state.insertCalls.length - 1];
        const values = (call?.values as object) ?? {};
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
        return Promise.resolve([
          { id: "00000000-0000-0000-0000-000000000001", ...defaults, ...values },
        ]);
      };
      chain.onConflictDoNothing = () => chain;
      return chain;
    },
    update: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      chain.set = (values: unknown) => {
        chain.values = () => values;
        return chain;
      };
      chain.where = (where: unknown) => {
        state.updateCalls.push({ table: tableName, values: {}, where });
        return chain;
      };
      chain.returning = () => Promise.resolve([{ id: "00000000-0000-0000-0000-000000000001" }]);
      return chain;
    },
    delete: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      chain.where = (where: unknown) => {
        state.deleteCalls.push({ table: tableName, where });
        return chain;
      };
      chain.returning = () => Promise.resolve([]);
      return chain;
    },
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
  };

  return { db: mockDb as unknown as Database, state };
}
