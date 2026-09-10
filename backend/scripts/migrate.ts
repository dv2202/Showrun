import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
try {
  const migrationsDirectory = dirname(fileURLToPath(new URL('../migrations/.keep', import.meta.url)));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(join(migrationsDirectory, migrationFile), 'utf8');
    await pool.query(sql);
  }
  process.stdout.write('Database migration completed\n');
} finally {
  await pool.end();
}
