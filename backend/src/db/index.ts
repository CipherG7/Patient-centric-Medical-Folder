import { Pool, PoolConfig } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

/**
 * Returns a singleton PostgreSQL connection pool.
 * Lazily connects on first call.
 */
export function getDb(): Pool {
  if (!pool) {
    const opts: PoolConfig = {
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };
    pool = new Pool(opts);

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Gracefully close the pool (e.g. on server shutdown).
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Pool closed.');
  }
}

