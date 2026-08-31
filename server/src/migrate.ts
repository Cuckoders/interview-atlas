import 'dotenv/config';

import { readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

const migrationsUrl = new URL('../migrations/', import.meta.url);
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(fileURLToPath(migrationsUrl))).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const name = basename(file);
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (applied.rowCount) continue;
    const sql = await readFile(new URL(file, migrationsUrl), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
