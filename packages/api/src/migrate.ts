import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index.js";

console.log("Running migrations from ./drizzle");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete");
await pool.end();
