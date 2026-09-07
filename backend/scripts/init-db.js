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
  queueLimit: 0,
  ssl: process.env.TIDB_SSL === 'false' ? undefined : {
    rejectUnauthorized: process.env.TIDB_SSL_REJECT_UNAUTHORIZED === 'true'
  },
  timezone: 'Z'
});

function splitSql(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      current += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && ch === '-' && next === '-') {
      current += ch + next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (!quote && ch === '/' && next === '*') {
      current += ch + next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote) {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      } else if (ch === '\\') {
        current += next || '';
        i += 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

try {
  await pool.execute('SELECT 1');
  const schema = await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const statements = splitSql(schema).filter(statement => !/^--/.test(statement));
  for (const statement of statements) await pool.query(statement);
  // TiDB limits indexed utf8mb4 keys to 3072 bytes. Canonical URLs can be
  // 2048 characters (8192 bytes), so keep the full URL unindexed and use a
  // fixed SHA-256 digest for uniqueness. The compatibility steps make this
  // safe for databases created by older revisions.
  await pool.query('ALTER TABLE applications ADD COLUMN IF NOT EXISTS canonical_url_hash CHAR(64) NULL');
  await pool.query("UPDATE applications SET canonical_url_hash=SHA2(canonical_url,256) WHERE canonical_url_hash IS NULL OR canonical_url_hash=''");
  const [indexes] = await pool.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applications' AND COLUMN_NAME='canonical_url_hash' AND NON_UNIQUE=0 LIMIT 1");
  if (!indexes.length) await pool.query('CREATE UNIQUE INDEX uq_applications_canonical_url_hash ON applications(canonical_url_hash)');
  console.log(`TiDB schema initialized/verified: ${statements.length} statements.`);
} catch (error) {
  console.error(`TiDB schema initialization failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
