import { db } from "./db/index.js";
import { seedOhioData } from "./services/seed.js";

const result = await seedOhioData(db);
console.log("seed complete:", result);
process.exit(0);
