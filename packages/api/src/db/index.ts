import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://magnum:magnum@localhost:5432/magnum";

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
export type Database = typeof db;
