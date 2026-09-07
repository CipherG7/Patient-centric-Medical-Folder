import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './index';

async function migrate(): Promise<void> {
  const db = getDb();

  // Create a migrations tracking table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id       SERIAL PRIMARY KEY,
      name     VARCHAR(256) NOT NULL UNIQUE,
      run_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (rows.length > 0) {
      console.log(`[migrate] Already run: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[migrate] Running: ${file} ...`);

    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await db.query('COMMIT');
      console.log(`[migrate] Done: ${file}`);
    } catch (err) {
      await db.query('ROLLBACK');
      console.error(`[migrate] FAILED: ${file}`, err);
      throw err;
    }
  }

  console.log('[migrate] All migrations complete.');
  await closeDb();
}

migrate().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});

