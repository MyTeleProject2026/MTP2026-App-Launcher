import fs from 'node:fs/promises';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const pool = mysql.createPool({
  host: parsed.hostname,
  port: Number(parsed.port || 4000),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  waitForConnections: true,
  connectionLimit: 2,
  ssl: process.env.TIDB_SSL === 'false' ? undefined : {
    rejectUnauthorized: process.env.TIDB_SSL_REJECT_UNAUTHORIZED === 'true'
  },
  timezone: 'Z'
});

try {
  const schema = await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log(`TiDB schema initialized: ${statements.length} statements.`);
} finally {
  await pool.end();
}
