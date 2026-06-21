import type { Database } from "../db/index.js";

export interface MockState {
  systems: Array<Record<string, unknown>>;
  trails: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  insertCalls: Array<{ table: string; values: unknown }>;
  executeCalls: Array<{ sql: string }>;
}

const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function getTableName(table: unknown): string {
  if (table && typeof table === "object") {
    const name = (table as Record<symbol, unknown>)[DRIZZLE_NAME];
    if (typeof name === "string") return name;
  }
  return "";
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
  if (name === "wiki_pages") return [];
  if (name === "revisions") return [];
  return [];
}

export function createMockDb(): { db: Database; state: MockState } {
  const state: MockState = {
    systems: [],
    trails: [],
    features: [],
    insertCalls: [],
    executeCalls: [],
  };

  function buildChain(rows: unknown[], fromTable: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const promise = Promise.resolve(rows);
    chain.then = promise.then.bind(promise);
    chain.from = (table: unknown) => {
      const name = getTableName(table);
      return name ? buildChain(pickRows(state, table), name) : buildChain([], "");
    };
    chain.where = () => chain;
    chain.limit = () => chain;
    chain.offset = () => chain;
    chain.innerJoin = () => chain;
    chain.leftJoin = () => chain;
    chain.select = () => chain;
    chain.selectDistinct = () => chain;
    chain.orderBy = () => chain;
    chain.groupBy = () => chain;
    return chain;
  }

  const mockDb = {
    select: () => buildChain(state.systems, "systems"),
    selectDistinct: () => buildChain(state.systems, "systems"),
    execute: (sql: unknown) => {
      state.executeCalls.push({ sql: String(sql) });
      return Promise.resolve({ rows: [] });
    },
    insert: (table: unknown) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      chain.values = (values: unknown) => {
        state.insertCalls.push({ table: tableName, values });
        return chain;
      };
      chain.returning = () =>
        Promise.resolve([{ id: "00000000-0000-0000-0000-000000000001" }]);
      chain.onConflictDoNothing = () => chain;
      return chain;
    },
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
  };

  return { db: mockDb as unknown as Database, state };
}
