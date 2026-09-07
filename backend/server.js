import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { getVexaConfig } from './src/auth/vexaaccount-sso.js';
import { registerVexaAuthRoutes } from './src/routes/vexaaccount-auth.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const vexaConfig = (() => { try { return getVexaConfig(); } catch { return null; } })();
const issuer = vexaConfig?.url || 'https://api-vexaaccount.onrender.com';
const databaseUrl = process.env.DATABASE_URL || '';

function createDbPool() {
  if (!databaseUrl) return null;
  const parsed = new URL(databaseUrl);
  return mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 4000),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.TIDB_SSL === 'false' ? undefined : { rejectUnauthorized: process.env.TIDB_SSL_REJECT_UNAUTHORIZED === 'true' },
    timezone: 'Z'
  });
}

const pool = createDbPool();
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: '256kb' }));

function errorCode(e) { return e instanceof Error ? e.message : 'UNKNOWN_ERROR'; }

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

const auth = registerVexaAuthRoutes(app,{ pool, ensureUser });

app.get('/api/health', async (_req, res) => {
  let database = false;
  if (pool) { try { await pool.execute('SELECT 1'); database = true; } catch {} }
  res.json({ ok: true, service: 'MTP2026 App Launcher', database, databaseType: 'TiDB MySQL' });
});
app.get('/api/config', (_req, res) => res.json({ service: 'MTP2026 App Launcher', sso: { issuer, configured: Boolean(vexaConfig), sessionMode: 'backend-managed' }, databaseConfigured: Boolean(pool), databaseType: 'TiDB MySQL' }));

async function getLibrary(req) {
  const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
  const [rows] = await pool.execute(`SELECT a.id,a.canonical_url AS url,a.title,a.description,a.icon_url AS iconUrl,a.manifest_url AS manifestUrl,a.theme_color AS themeColor,a.pwa_supported AS pwaSupported,ua.category,ua.is_favorite AS favorite,ua.is_pinned AS pinned,ua.sort_order AS sortOrder,ua.last_opened_at AS lastOpenedAt FROM user_applications ua JOIN applications a ON a.id=ua.application_id WHERE ua.user_id=? ORDER BY ua.is_pinned DESC,ua.is_favorite DESC,ua.sort_order,a.title`, [uid]);
  return rows;
}


async function ensureSyncTables() {
  if (!pool) return;
  await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_application_connections (id CHAR(36) NOT NULL PRIMARY KEY,user_id CHAR(36) NOT NULL,application_id CHAR(36) NOT NULL,provider VARCHAR(120) NOT NULL DEFAULT 'external',connection_type VARCHAR(40) NOT NULL DEFAULT 'launcher',provider_subject VARCHAR(255) NULL,status VARCHAR(30) NOT NULL DEFAULT 'restored',last_authenticated_at DATETIME NULL,last_used_at DATETIME NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_mtp_application_connection(user_id,application_id),INDEX idx_mtp_application_connections_user(user_id,status,updated_at))`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_user_devices (id CHAR(36) NOT NULL PRIMARY KEY,user_id CHAR(36) NOT NULL,device_id VARCHAR(128) NOT NULL,device_label VARCHAR(160) NULL,last_seen_at DATETIME NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_mtp_user_device(user_id,device_id),INDEX idx_mtp_user_devices_seen(user_id,last_seen_at))`);
}
const syncTablesReady = ensureSyncTables();

async function touchDevice(req, userId) {
  if (!pool || !userId) return;
  await syncTablesReady;
  const deviceId = String(req.get('x-mtp-device-id') || '').trim().slice(0,128);
  if (!deviceId) return;
  const label = String(req.get('x-mtp-device-label') || '').trim().slice(0,160) || null;
  await pool.execute(`INSERT INTO mtp_user_devices(id,user_id,device_id,device_label,last_seen_at) VALUES(?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE device_label=COALESCE(VALUES(device_label),device_label),last_seen_at=UTC_TIMESTAMP()`,[crypto.randomUUID(),userId,deviceId,label]);
}

app.get('/api/sync', auth, async (req,res) => {
  if (!pool) return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
  try {
    await touchDevice(req, req.mtpSession.userId);
    await syncTablesReady;
    const [apps, settings, notifications, connections] = await Promise.all([
      getLibrary(req),
      pool.execute('SELECT theme,default_view AS defaultView,open_behavior AS openBehavior,compact_mode AS compactMode FROM mtp_user_preferences WHERE user_id=?',[req.mtpSession.userId]).then(([r])=>r[0]||null),
      pool.execute('SELECT id,type,title,message,read_at AS readAt,created_at AS createdAt FROM mtp_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[req.mtpSession.userId]).then(([r])=>r),
      pool.execute('SELECT application_id AS applicationId,provider,connection_type AS connectionType,provider_subject AS providerSubject,status,last_authenticated_at AS lastAuthenticatedAt,last_used_at AS lastUsedAt,updated_at AS updatedAt FROM mtp_application_connections WHERE user_id=?',[req.mtpSession.userId]).then(([r])=>r)
    ]);
    res.json({profile:req.vexaUser,apps,settings,notifications,connections,synchronizedAt:new Date().toISOString()});
  } catch { res.status(500).json({error:'SYNC_LOAD_FAILED'}); }
});

app.get('/api/connections', auth, async (req,res)=>{
  if (!pool) return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
  try { await touchDevice(req,req.mtpSession.userId); await syncTablesReady; const [rows]=await pool.execute('SELECT application_id AS applicationId,provider,connection_type AS connectionType,provider_subject AS providerSubject,status,last_authenticated_at AS lastAuthenticatedAt,last_used_at AS lastUsedAt,created_at AS createdAt,updated_at AS updatedAt FROM mtp_application_connections WHERE user_id=? ORDER BY updated_at DESC',[req.mtpSession.userId]); res.json(rows); }
  catch { res.status(500).json({error:'CONNECTIONS_LOAD_FAILED'}); }
});

app.put('/api/apps/:id/connection', auth, async (req,res)=>{
  if (!pool) return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
  try {
    await touchDevice(req,req.mtpSession.userId); await syncTablesReady;
    const uid=req.mtpSession.userId;
    const [owned]=await pool.execute('SELECT 1 FROM user_applications WHERE user_id=? AND application_id=? LIMIT 1',[uid,req.params.id]);
    if(!owned.length) return res.status(404).json({error:'APPLICATION_NOT_FOUND'});
    const body=req.body||{};
    const provider=String(body.provider||'external').slice(0,120);
    const connectionType=String(body.connectionType||'launcher').slice(0,40);
    const providerSubject=body.providerSubject?String(body.providerSubject).slice(0,255):null;
    const status=['restored','connected','sign_in_required','disconnected'].includes(body.status)?body.status:'restored';
    await pool.execute(`INSERT INTO mtp_application_connections(id,user_id,application_id,provider,connection_type,provider_subject,status,last_authenticated_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider),connection_type=VALUES(connection_type),provider_subject=VALUES(provider_subject),status=VALUES(status),last_authenticated_at=VALUES(last_authenticated_at),last_used_at=VALUES(last_used_at),updated_at=CURRENT_TIMESTAMP`,[crypto.randomUUID(),uid,req.params.id,provider,connectionType,providerSubject,status,status==='connected'?new Date():null,new Date()]);
    res.json({ok:true,status});
  } catch { res.status(400).json({error:'CONNECTION_UPDATE_FAILED'}); }
});

app.get('/api/devices', auth, async (req,res)=>{
  if (!pool) return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
  try { await touchDevice(req,req.mtpSession.userId); await syncTablesReady; const [rows]=await pool.execute('SELECT id,device_id AS deviceId,device_label AS deviceLabel,last_seen_at AS lastSeenAt,created_at AS createdAt FROM mtp_user_devices WHERE user_id=? ORDER BY last_seen_at DESC',[req.mtpSession.userId]); res.json(rows); }
  catch { res.status(500).json({error:'DEVICES_LOAD_FAILED'}); }
});

app.get('/api/apps', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try { res.json(await getLibrary(req)); } catch { res.status(500).json({ error: 'LIBRARY_LOAD_FAILED' }); }
});

app.post('/api/apps', auth, async (req, res) => {
  try {
    const url = normalizeUrl(req.body?.url);
    const metadata = await fetchMetadata(url);
    if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', preview: { url, ...metadata } });
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const applicationId = crypto.randomUUID();
    const canonicalUrlHash = crypto.createHash('sha256').update(url).digest('hex');
    await pool.execute(`INSERT INTO applications(id,canonical_url,canonical_url_hash,title,description,icon_url,manifest_url,theme_color,pwa_supported,metadata) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE canonical_url=VALUES(canonical_url),title=VALUES(title),icon_url=VALUES(icon_url),manifest_url=VALUES(manifest_url),theme_color=VALUES(theme_color),pwa_supported=VALUES(pwa_supported),metadata=VALUES(metadata),updated_at=CURRENT_TIMESTAMP`, [applicationId, url, canonicalUrlHash, metadata.title, null, metadata.iconUrl, metadata.manifestUrl, metadata.themeColor, metadata.pwaSupported ? 1 : 0, JSON.stringify(metadata)]);
    const [existing] = await pool.execute('SELECT id FROM applications WHERE canonical_url_hash=? AND canonical_url=? LIMIT 1', [canonicalUrlHash, url]);
    const realId = existing[0]?.id || applicationId;
    await pool.execute('INSERT IGNORE INTO user_applications(user_id,application_id) VALUES(?,?)', [uid, realId]);
    res.status(201).json({ id: realId, url, ...metadata, favorite: false, pinned: false });
  } catch (e) {
    const code = errorCode(e);
    res.status(400).json({ error: ['PRIVATE_HOST_BLOCKED','ONLY_HTTPS_URLS_ALLOWED'].includes(code) ? code : 'INVALID_OR_UNAVAILABLE_URL' });
  }
});

app.post('/api/apps/:id/open', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const [result] = await pool.execute('UPDATE user_applications SET last_opened_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND application_id=?', [uid, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
    res.json({ ok: true, lastOpenedAt: new Date().toISOString() });
  } catch { res.status(400).json({ error: 'RECENT_ACTIVITY_UPDATE_FAILED' }); }
});

app.get('/api/apps/recent', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const [rows] = await pool.execute(`SELECT a.id,a.canonical_url AS url,a.title,a.description,a.icon_url AS iconUrl,a.manifest_url AS manifestUrl,a.theme_color AS themeColor,a.pwa_supported AS pwaSupported,ua.category,ua.is_favorite AS favorite,ua.is_pinned AS pinned,ua.sort_order AS sortOrder,ua.last_opened_at AS lastOpenedAt FROM user_applications ua JOIN applications a ON a.id=ua.application_id WHERE ua.user_id=? AND ua.last_opened_at IS NOT NULL ORDER BY ua.last_opened_at DESC LIMIT 50`, [uid]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'RECENT_ACTIVITY_LOAD_FAILED' }); }
});

app.patch('/api/apps/:id', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const uid = await ensureUser(req.vexaUser.sub, req.vexaUser.sub);
    const allowed = { favorite: 'is_favorite', pinned: 'is_pinned', category: 'category', sortOrder: 'sort_order' };
    const entries = Object.entries(allowed).filter(([key]) => Object.hasOwn(req.body || {}, key));
    if (!entries.length) return res.status(400).json({ error: 'NO_CHANGES' });
    const values = entries.map(([key]) => key === 'favorite' || key === 'pinned' ? (req.body[key] ? 1 : 0) : req.body[key]);
    const sets = entries.map(([_, column]) => `${column}=?`);
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
