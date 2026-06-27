import { eq, or } from "drizzle-orm";
import { db, pool } from "./db/index.js";
import { users } from "./db/schema.js";
import { USER_ROLES } from "@magnum/shared/constants";

type Role = (typeof USER_ROLES)[number];

function usage(): never {
  console.error("Usage: bun run src/set-role.ts <username-or-email> <role>");
  console.error(`  role must be one of: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

const identifier = process.argv[2];
const role = process.argv[3] as Role | undefined;

if (!identifier || !role) usage();
if (!(USER_ROLES as readonly string[]).includes(role)) {
  console.error(`Invalid role: ${role}`);
  console.error(`Valid roles: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

const user = await db.query.users.findFirst({
  where: or(eq(users.username, identifier), eq(users.email, identifier)),
  columns: { id: true, username: true, email: true, role: true },
});

if (!user) {
  console.error(`User not found: ${identifier}`);
  process.exit(1);
}

await db.update(users).set({ role }).where(eq(users.id, user.id));

console.log(`${user.username} (${user.email}): ${user.role} -> ${role}`);

await pool.end();
