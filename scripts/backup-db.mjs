import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const source = process.env.DATABASE_PATH ?? "/data/anerith.db";
const dir = process.env.BACKUP_DIR ?? "/backups";
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(dir, `anerith-${stamp}.db`);

const db = new DatabaseSync(source);
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

console.log(`Backup written to ${target}`);
