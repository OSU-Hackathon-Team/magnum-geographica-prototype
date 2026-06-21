import { Platform } from "react-native";
import { OFFLINE_SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

type SQLResult = Array<Record<string, unknown>>;

export interface OfflineDatabase {
  exec(sql: string, params?: unknown[]): Promise<SQLResult>;
  execRaw(sql: string, params?: unknown[]): Promise<SQLResult>;
  close(): void;
}

let dbInstance: OfflineDatabase | null = null;

async function initOpSqlite(): Promise<OfflineDatabase> {
  const { open } = await import("@op-engineering/op-sqlite");
  const db = open({ name: "magnum_offline.db" });

  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA foreign_keys = ON");

  return {
    async exec(sql: string, params: unknown[] = []) {
      const result = db.execute(sql, params);
      if (!result.rows) return [];
      const columns = result.rows._array?.length
        ? Object.keys(result.rows.item(0))
        : [];
      const rows: SQLResult = [];
      for (let i = 0; i < (result.rows.length ?? 0); i++) {
        const row = result.rows.item(i);
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          obj[col] = row[col];
        }
        rows.push(obj);
      }
      return rows;
    },
    async execRaw(sql: string, params: unknown[] = []) {
      const result = db.execute(sql, params);
      if (!result.rows) return [];
      const columns = result.rows._array?.length
        ? Object.keys(result.rows.item(0))
        : [];
      const rows: SQLResult = [];
      for (let i = 0; i < (result.rows.length ?? 0); i++) {
        const row = result.rows.item(i);
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          obj[col] = row[col];
        }
        rows.push(obj);
      }
      return rows;
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
        const rows = await db.getAllAsync(sql, ...(params as []));
        return rows as SQLResult;
      }
      await db.runAsync(sql, ...(params as []));
      return [];
    },
    async execRaw(sql: string, params: unknown[] = []) {
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        const rows = await db.getAllAsync(sql, ...(params as []));
        return rows as SQLResult;
      }
      await db.runAsync(sql, ...(params as []));
      return [];
    },
    close() {
      db.closeAsync();
    },
  };
}

export async function getOfflineDb(): Promise<OfflineDatabase> {
  if (dbInstance) return dbInstance;

  if (Platform.OS === "android") {
    dbInstance = await initOpSqlite();
  } else {
    dbInstance = await initExpoSqlite();
  }

  await dbInstance.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const versionRows = await dbInstance.exec("SELECT version FROM schema_version LIMIT 1");
  const currentVersion = versionRows[0] ? Number(versionRows[0].version) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    const statements = OFFLINE_SCHEMA_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await dbInstance.exec(stmt);
    }
    if (currentVersion === 0) {
      await dbInstance.exec("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
    } else {
      await dbInstance.exec("UPDATE schema_version SET version = ?", [SCHEMA_VERSION]);
    }
  }

  return dbInstance;
}

export function closeOfflineDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
