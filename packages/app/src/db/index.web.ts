type SQLResult = Array<Record<string, unknown>>;

export interface OfflineDatabase {
  exec(sql: string, params?: unknown[]): Promise<SQLResult>;
  execRaw(sql: string, params?: unknown[]): Promise<SQLResult>;
  close(): void;
}

const stubDb: OfflineDatabase = {
  async exec(_sql: string, _params: unknown[] = []) {
    return [];
  },
  async execRaw(_sql: string, _params: unknown[] = []) {
    return [];
  },
  close() {
    // no-op
  },
};

export async function initDatabase(): Promise<OfflineDatabase> {
  return stubDb;
}

let dbInstance: OfflineDatabase | null = null;
let initPromise: Promise<OfflineDatabase> | null = null;

export async function getOfflineDb(): Promise<OfflineDatabase> {
  if (initPromise) return initPromise;

  initPromise = Promise.resolve(stubDb).then((db) => {
    dbInstance = db;
    return db;
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
