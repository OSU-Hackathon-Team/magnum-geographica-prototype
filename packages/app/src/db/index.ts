import { Platform } from "react-native";
import { OFFLINE_SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

type SQLResult = Array<Record<string, unknown>>;

export interface OfflineDatabase {
  exec(sql: string, params?: unknown[]): Promise<SQLResult>;
  execRaw(sql: string, params?: unknown[]): Promise<SQLResult>;
  close(): void;
}

type OpSqliteScalar = string | number | boolean | null | Uint8Array;

function toOpSqliteParams(params: unknown[]): OpSqliteScalar[] {
  return params.map((p): OpSqliteScalar => {
    if (p === null || p === undefined) return null;
    if (typeof p === "string" || typeof p === "number" || typeof p === "boolean") {
      return p;
    }
    if (p instanceof Uint8Array) return p;
    return String(p);
  });
}

function normalizeRows(rows: Array<Record<string, unknown>> | undefined): SQLResult {
  if (!rows) return [];
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      obj[k] = v;
    }
    return obj;
  });
}

let dbInstance: OfflineDatabase | null = null;
let initPromise: Promise<OfflineDatabase> | null = null;

async function initOpSqlite(): Promise<OfflineDatabase> {
  const { open } = await import("@op-engineering/op-sqlite");
  const db = open({ name: "magnum_offline.db" });

  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA foreign_keys = ON");

  return {
    async exec(sql: string, params: unknown[] = []) {
      const result = await db.execute(sql, toOpSqliteParams(params));
      return normalizeRows(result.rows as Array<Record<string, unknown>> | undefined);
    },
    async execRaw(sql: string, params: unknown[] = []) {
      const result = await db.execute(sql, toOpSqliteParams(params));
      return normalizeRows(result.rows as Array<Record<string, unknown>> | undefined);
    },
    close() {
      db.close();
    },
  };
}

async function initExpoSqlite(): Promise<OfflineDatabase> {
  const { openDatabaseAsync } = await import("expo-sqlite");
  const db = await openDatabaseAsync("magnum_offline.db");

  await db.execAsync("PRAGMA journal_mode = WAL");
  await db.execAsync("PRAGMA foreign_keys = ON");

  return {
    async exec(sql: string, params: unknown[] = []) {
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        const rows = await db.getAllAsync(sql, ...(params as never[]));
        return rows as SQLResult;
      }
      await db.runAsync(sql, ...(params as never[]));
      return [];
    },
    async execRaw(_sql: string, _params: unknown[] = []) {
      return [];
    },
    close() {
      void db.closeAsync();
    },
  };
}

async function initDatabase(): Promise<OfflineDatabase> {
  let db: OfflineDatabase;
  if (Platform.OS === "android") {
    db = await initOpSqlite();
  } else {
    db = await initExpoSqlite();
  }

  await db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const versionRows = await db.exec("SELECT version FROM schema_version LIMIT 1");
  const currentVersion = versionRows[0] ? Number(versionRows[0].version) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    await db.exec("BEGIN TRANSACTION");
    try {
      const statements = OFFLINE_SCHEMA_SQL
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await db.exec(stmt);
      }
      if (currentVersion === 0) {
        await db.exec("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
      } else {
        await db.exec("UPDATE schema_version SET version = ?", [SCHEMA_VERSION]);
      }
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  }

  return db;
}

export async function getOfflineDb(): Promise<OfflineDatabase> {
  if (initPromise) return initPromise;

  initPromise = initDatabase().then((db) => {
    dbInstance = db;
    return db;
  }).catch((e) => {
    initPromise = null;
    throw e;
  });

  return initPromise;
}

export function closeOfflineDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
}
