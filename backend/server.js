import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 4000);
const issuer = (process.env.VEXA_ACCOUNT_ISSUER_URL || process.env.VEXA_ACCOUNT_ISSUER || 'https://api-vexaaccount.onrender.com').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL || '';

function createDbPool() {
  if (!databaseUrl) return null;
  const parsed = new URL(databaseUrl);
  const sslEnabled = process.env.TIDB_SSL !== 'false';
  return mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 4000),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: sslEnabled ? { rejectUnauthorized: process.env.TIDB_SSL_REJECT_UNAUTHORIZED === 'true' } : undefined,
    timezone: 'Z'
  });
}

const pool = createDbPool();
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: '256kb' }));

function errorCode(e) { return e instanceof Error ? e.message : 'UNKNOWN_ERROR'; }

async function verifyToken(req) {
  const authorization = req.header('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${issuer}/api/sso/userinfo`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('AUTH_INVALID');
  const profile = await response.json();
  if (!profile?.sub) throw new Error('AUTH_INVALID');
  return profile;
}

async function auth(req, res, next) {
  try { req.vexaUser = await verifyToken(req); next(); }
  catch (e) { res.status(401).json({ error: errorCode(e) === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'AUTH_INVALID' }); }
}

function normalizeUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:') throw new Error('ONLY_HTTPS_URLS_ALLOWED');
  if (!url.hostname || url.username || url.password) throw new Error('INVALID_URL');
  url.hash = '';
  return url.toString();
}

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  if (normalized === 'localhost' || normalized === '::1' || normalized.endsWith('.local')) return true;
  if (net.isIPv4(normalized)) return normalized.startsWith('10.') || normalized.startsWith('127.') || normalized.startsWith('169.254.') || normalized.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) || normalized.startsWith('0.') || normalized.startsWith('100.64.');
  if (net.isIPv6(normalized)) return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:192.168.');
  return false;
}

async function safeHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (isPrivateAddress(host)) throw new Error('PRIVATE_HOST_BLOCKED');
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some(r => isPrivateAddress(r.address))) throw new Error('PRIVATE_HOST_BLOCKED');
}

function firstMatch(html, regex) { return html.match(regex)?.[1]?.replace(/\s+/g, ' ').trim() || null; }

async function fetchMetadata(target) {
  const parsed = new URL(target);
  await safeHost(parsed.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(parsed, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'MTP2026-App-Launcher/1.0' } });
    if (response.status >= 300 && response.status < 400) return { title: parsed.hostname, iconUrl: new URL('/favicon.ico', parsed).toString(), manifestUrl: null, pwaSupported: false, themeColor: null };
    if (!response.ok) throw new Error('UPSTREAM_HTTP_ERROR');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return { title: parsed.hostname, iconUrl: new URL('/favicon.ico', parsed).toString(), manifestUrl: null, pwaSupported: false, themeColor: null };
    const html = (await response.text()).slice(0, 1000000);
    const title = (firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || parsed.hostname).slice(0, 160);
    const icon = firstMatch(html, /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/i);
    const manifest = firstMatch(html, /<link[^>]+rel=["'][^"']*manifest[^"']*["'][^>]+href=["']([^"']+)["']/i);
    return { title, iconUrl: icon ? new URL(icon, parsed).toString() : new URL('/favicon.ico', parsed).toString(), manifestUrl: manifest ? new URL(manifest, parsed).toString() : null, pwaSupported: Boolean(manifest), themeColor: firstMatch(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) };
  } finally { clearTimeout(timer); }
}

function subjectUuid(subject) {
  const hex = crypto.createHash('sha256').update(String(subject)).digest('hex').slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function ensureUser(subject, profileId) {
  if (!pool) return null;
  const id = subjectUuid(subject);
  await pool.execute(`INSERT INTO mtp_users(id, vexa_account_subject, profile_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE profile_id=VALUES(profile_id), updated_at=CURRENT_TIMESTAMP`, [id, subject, profileId || subject]);
  return id;
}

app.get('/api/health', async (_req, res) => {
  let database = false;
  if (pool) { try { await pool.execute('SELECT 1'); database = true; } catch {} }
  res.json({ ok: true, service: 'MTP2026 App Launcher', database, databaseType: 'TiDB MySQL' });
});
app.get('/api/config', (_req, res) => res.json({ service: 'MTP2026 App Launcher', sso: { issuer, configured: Boolean(process.env.VEXA_ACCOUNT_CLIENT_ID && process.env.VEXA_ACCOUNT_CLIENT_SECRET) }, databaseConfigured: Boolean(pool), databaseType: 'TiDB MySQL' }));

app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code, redirect_uri, code_verifier } = req.body || {};
    if (!code || !redirect_uri || !code_verifier) return res.status(400).json({ error: 'INVALID_CALLBACK' });
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id: process.env.VEXA_ACCOUNT_CLIENT_ID || '', client_secret: process.env.VEXA_ACCOUNT_CLIENT_SECRET || '', code_verifier });
    const tokenResponse = await fetch(`${issuer}/api/sso/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) return res.status(401).json({ error: 'SSO_TOKEN_EXCHANGE_FAILED' });
    const profileResponse = await fetch(`${issuer}/api/sso/userinfo`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(7000) });
    if (!profileResponse.ok) return res.status(401).json({ error: 'SSO_USERINFO_FAILED' });
    res.json({ access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, profile: await profileResponse.json() });
  } catch { res.status(502).json({ error: 'SSO_UNAVAILABLE' }); }
});

app.get('/api/apps', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const [rows] = await pool.execute(`SELECT a.id,a.canonical_url AS url,a.title,a.description,a.icon_url AS iconUrl,a.manifest_url AS manifestUrl,a.theme_color AS themeColor,a.pwa_supported AS pwaSupported,ua.category,ua.is_favorite AS favorite,ua.is_pinned AS pinned,ua.sort_order AS sortOrder FROM user_applications ua JOIN applications a ON a.id=ua.application_id WHERE ua.user_id=? ORDER BY ua.is_pinned DESC,ua.is_favorite DESC,ua.sort_order,a.title`, [uid]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'LIBRARY_LOAD_FAILED' }); }
});

app.post('/api/apps', auth, async (req, res) => {
  try {
    const url = normalizeUrl(req.body?.url);
    const metadata = await fetchMetadata(url);
    if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', preview: { url, ...metadata } });
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const applicationId = crypto.randomUUID();
    const [insert] = await pool.execute(`INSERT INTO applications(id,canonical_url,title,description,icon_url,manifest_url,theme_color,pwa_supported,metadata) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),icon_url=VALUES(icon_url),manifest_url=VALUES(manifest_url),theme_color=VALUES(theme_color),pwa_supported=VALUES(pwa_supported),metadata=VALUES(metadata),updated_at=CURRENT_TIMESTAMP`, [applicationId, url, metadata.title, null, metadata.iconUrl, metadata.manifestUrl, metadata.themeColor, metadata.pwaSupported ? 1 : 0, JSON.stringify(metadata)]);
    const id = insert.insertId ? String(insert.insertId) : applicationId;
    const [existing] = await pool.execute('SELECT id FROM applications WHERE canonical_url=? LIMIT 1', [url]);
    const realId = existing[0]?.id || id;
    await pool.execute(`INSERT IGNORE INTO user_applications(user_id,application_id) VALUES(?,?)`, [uid, realId]);
    res.status(201).json({ id: realId, url, ...metadata, favorite: false, pinned: false });
  } catch (e) {
    const code = errorCode(e);
    res.status(400).json({ error: ['PRIVATE_HOST_BLOCKED','ONLY_HTTPS_URLS_ALLOWED'].includes(code) ? code : 'INVALID_OR_UNAVAILABLE_URL' });
  }
});

app.patch('/api/apps/:id', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const allowed = { favorite: 'is_favorite', pinned: 'is_pinned', category: 'category', sortOrder: 'sort_order' };
    const entries = Object.entries(allowed).filter(([key]) => Object.hasOwn(req.body || {}, key));
    if (!entries.length) return res.status(400).json({ error: 'NO_CHANGES' });
    const values = entries.map(([key]) => key === 'favorite' || key === 'pinned' ? (req.body[key] ? 1 : 0) : req.body[key]);
    const sets = entries.map(([_, column], i) => `${column}=?`);
    values.push(uid, req.params.id);
    await pool.execute(`UPDATE user_applications SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND application_id=?`, values);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'UPDATE_FAILED' }); }
});

app.delete('/api/apps/:id', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try { const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub); await pool.execute('DELETE FROM user_applications WHERE user_id=? AND application_id=?', [uid, req.params.id]); res.status(204).end(); }
  catch { res.status(400).json({ error: 'DELETE_FAILED' }); }
});

app.listen(port, () => console.log(`MTP2026 App Launcher API listening on ${port}`));
