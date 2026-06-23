import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://${process.env.DB_USER ?? "magnum"}:${process.env.DB_PASSWORD ?? "changeme"}@${process.env.DB_HOST ?? "localhost"}:${process.env.DB_PORT ?? "5432"}/${process.env.DB_NAME ?? "magnum"}`;

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
export type Database = typeof db;
