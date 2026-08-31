import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '256kb' }));

const pool = process.env.DATABASE_URL ? mysql.createPool(process.env.DATABASE_URL) : null;

function requireAuth(req, res, next) {
  const subject = req.header('x-vexa-account-subject');
  if (!subject) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  req.vexaUser = { subject, profileId: req.header('x-vexa-profile-id') || null };
  next();
}

function normalizeUrl(value) {
  const parsed = new URL(String(value).trim());
  if (!['https:'].includes(parsed.protocol)) throw new Error('ONLY_HTTPS_URLS_ALLOWED');
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed.toString();
}

function isPrivateIp(address) {
  const a = address.toLowerCase();
  return a === 'localhost' || a === '::1' || a.startsWith('127.') || a.startsWith('10.') || a.startsWith('192.168.') || a.startsWith('169.254.') || a.startsWith('172.16.') || a.startsWith('172.17.') || a.startsWith('172.18.') || a.startsWith('172.19.') || a.startsWith('172.2') || a.startsWith('172.30.') || a.startsWith('172.31.') || a.startsWith('0.') || a.startsWith('100.64.') || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:');
}

async function assertSafeHost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('PRIVATE_HOST_BLOCKED');
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some(r => isPrivateIp(r.address))) throw new Error('PRIVATE_HOST_BLOCKED');
}

async function fetchMetadata(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const parsed = new URL(target);
    await assertSafeHost(parsed.hostname);
    const response = await fetch(parsed, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'MTP2026-App-Launcher/1.0' } });
    if (response.status >= 300 && response.status < 400) return { title: parsed.hostname, iconUrl: new URL('/favicon.ico', parsed).toString(), pwaSupported: false };
    if (!response.ok) throw new Error('UPSTREAM_HTTP_ERROR');
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return { title: parsed.hostname, iconUrl: new URL('/favicon.ico', parsed).toString(), pwaSupported: false };
    const html = (await response.text()).slice(0, 1000000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || parsed.hostname;
    const icon = html.match(/<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1];
    const manifest = html.match(/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["']/i)?.[1];
    return {
      title: title.slice(0, 160),
      iconUrl: icon ? new URL(icon, parsed).toString() : new URL('/favicon.ico', parsed).toString(),
      manifestUrl: manifest ? new URL(manifest, parsed).toString() : null,
      pwaSupported: Boolean(manifest),
      themeColor: html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1] || null
    };
  } finally { clearTimeout(timer); }
}

async function ensureUser(subject, profileId) {
  if (!pool) return crypto.createHash('sha256').update(subject).digest('hex');
  const id = crypto.createHash('sha256').update(subject).digest('hex').slice(0, 32);
  await pool.execute(`INSERT INTO mtp_users (id, vexa_account_subject, profile_id) VALUES (UUID_TO_BIN(?), ?, ?) ON DUPLICATE KEY UPDATE profile_id=VALUES(profile_id), updated_at=NOW()`, [id, subject, profileId]);
  return id;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'MTP2026 App Launcher' }));

app.get('/api/config', (_req, res) => res.json({
  service: 'MTP2026 App Launcher',
  sso: { issuer: process.env.VEXA_ACCOUNT_ISSUER_URL || null, configured: Boolean(process.env.VEXA_ACCOUNT_ISSUER_URL && process.env.VEXA_ACCOUNT_CLIENT_ID) }
}));

app.get('/api/apps', requireAuth, async (req, res) => {
  if (!pool) return res.json([]);
  const userId = await ensureUser(req.vexaUser.subject, req.vexaUser.profileId);
  const [rows] = await pool.execute(`SELECT a.id, a.canonical_url AS url, a.title, a.description, a.icon_url AS iconUrl, a.manifest_url AS manifestUrl, a.theme_color AS themeColor, a.pwa_supported AS pwaSupported, ua.category, ua.is_favorite AS favorite, ua.is_pinned AS pinned, ua.sort_order AS sortOrder FROM user_applications ua JOIN applications a ON a.id=ua.application_id WHERE ua.user_id=UUID_TO_BIN(?) ORDER BY ua.is_pinned DESC, ua.is_favorite DESC, ua.sort_order ASC, a.title ASC`, [userId]);
  res.json(rows);
});

app.post('/api/apps', requireAuth, async (req, res) => {
  try {
    const url = normalizeUrl(req.body?.url);
    const metadata = await fetchMetadata(url);
    if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', preview: { url, ...metadata } });
    const userId = await ensureUser(req.vexaUser.subject, req.vexaUser.profileId);
    const appId = crypto.randomUUID();
    await pool.execute(`INSERT INTO applications (id, canonical_url, title, description, icon_url, manifest_url, theme_color, pwa_supported, metadata) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), icon_url=VALUES(icon_url), manifest_url=VALUES(manifest_url), theme_color=VALUES(theme_color), pwa_supported=VALUES(pwa_supported), metadata=VALUES(metadata), updated_at=NOW()`, [appId, url, metadata.title, metadata.description || null, metadata.iconUrl, metadata.manifestUrl, metadata.themeColor, metadata.pwaSupported, JSON.stringify(metadata)]);
    const [existing] = await pool.execute('SELECT id FROM applications WHERE canonical_url=?', [url]);
    const realId = existing[0].id;
    await pool.execute(`INSERT IGNORE INTO user_applications (user_id, application_id) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?))`, [userId, realId]);
    res.status(201).json({ id: realId, url, ...metadata, favorite: false, pinned: false });
  } catch (error) {
    const code = error.message === 'PRIVATE_HOST_BLOCKED' ? 'PRIVATE_HOST_BLOCKED' : error.message === 'ONLY_HTTPS_URLS_ALLOWED' ? 'ONLY_HTTPS_URLS_ALLOWED' : 'INVALID_OR_UNAVAILABLE_URL';
    res.status(400).json({ error: code });
  }
});

app.patch('/api/apps/:id', requireAuth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  const userId = await ensureUser(req.vexaUser.subject, req.vexaUser.profileId);
  const fields = []; const values = [];
  for (const [key, column] of Object.entries({ favorite: 'is_favorite', pinned: 'is_pinned', category: 'category', sortOrder: 'sort_order' })) {
    if (Object.hasOwn(req.body || {}, key)) { fields.push(`${column}=?`); values.push(key === 'favorite' || key === 'pinned' ? Boolean(req.body[key]) : req.body[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: 'NO_CHANGES' });
  values.push(userId, req.params.id);
  await pool.execute(`UPDATE user_applications SET ${fields.join(', ')}, updated_at=NOW() WHERE user_id=UUID_TO_BIN(?) AND application_id=UUID_TO_BIN(?)`, values);
  res.json({ ok: true });
});

app.delete('/api/apps/:id', requireAuth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  const userId = await ensureUser(req.vexaUser.subject, req.vexaUser.profileId);
  await pool.execute('DELETE FROM user_applications WHERE user_id=UUID_TO_BIN(?) AND application_id=UUID_TO_BIN(?)', [userId, req.params.id]);
  res.status(204).end();
});

app.listen(port, () => console.log(`MTP2026 App Launcher API listening on ${port}`));
