import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

const migrationUrl = new URL('../migrations/001_vacancies.sql', import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(sql);
  console.log('Applied 001_vacancies.sql');
} finally {
  await pool.end();
}
