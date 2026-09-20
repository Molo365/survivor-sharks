import fs from "node:fs";
import path from "node:path";

const maxBytes = 100 * 1024;
const drizzleDir = path.resolve(process.cwd(), "lib/db/drizzle");
const oversized = [];

for (const name of fs.readdirSync(drizzleDir)) {
  if (!name.endsWith(".sql")) continue;

  const filePath = path.join(drizzleDir, name);
  const size = fs.statSync(filePath).size;
  if (size > maxBytes) {
    oversized.push({ name, size });
  }
}

if (oversized.length > 0) {
  for (const file of oversized) {
    console.error(
      `Migration size check failed: ${file.name} is ${file.size} bytes, exceeding the 100 KB limit.`,
    );
  }
  process.exit(1);
}

console.log("Migration size check passed: all SQL migrations are at or below 100 KB.");