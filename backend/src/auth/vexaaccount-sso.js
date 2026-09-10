import crypto from 'node:crypto';

const DEFAULT_CONFIG = {
  url: 'https://api-vexaaccount.onrender.com',
  clientId: '',
  redirectUri: '',
  scopes: ['openid', 'profile', 'email', 'account', 'session', 'applications', 'notifications'],
  timeoutMs: 10000
};

function readConfig() {
  const raw = String(process.env.VEXA_ACCOUNT_SSO_CONFIG || '').trim();
  let parsed = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('VEXA_ACCOUNT_SSO_CONFIG_INVALID');
    }
  }

  const url = String(parsed.url || DEFAULT_CONFIG.url).trim().replace(/\/$/, '');
  const clientId = String(process.env.VEXA_ACCOUNT_CLIENT_ID || parsed.clientId || '').trim();
  const redirectUri = String(parsed.redirectUri || process.env.VEXA_ACCOUNT_REDIRECT_URI || '').trim();
  const scopes = Array.isArray(parsed.scopes) && parsed.scopes.length
    ? parsed.scopes.map(value => String(value).trim()).filter(Boolean)
    : DEFAULT_CONFIG.scopes;
  const timeoutMs = Math.min(Math.max(Number(parsed.timeoutMs || DEFAULT_CONFIG.timeoutMs), 1000), 15000);

  try {
    const provider = new URL(url);
    if (provider.protocol !== 'https:') throw new Error('VEXA_ACCOUNT_SSO_URL_MUST_BE_HTTPS');
    if (provider.username || provider.password) throw new Error('VEXA_ACCOUNT_SSO_URL_INVALID');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VEXA_')) throw error;
    throw new Error('VEXA_ACCOUNT_SSO_URL_INVALID');
  }

  if (!clientId) throw new Error('VEXA_ACCOUNT_CLIENT_ID_REQUIRED');
  if (!redirectUri) throw new Error('VEXA_ACCOUNT_REDIRECT_URI_REQUIRED');

  try {
    const redirect = new URL(redirectUri);
    if (redirect.protocol !== 'https:') throw new Error('VEXA_ACCOUNT_REDIRECT_URI_MUST_BE_HTTPS');
    if (redirect.username || redirect.password) throw new Error('VEXA_ACCOUNT_REDIRECT_URI_INVALID');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VEXA_')) throw error;
    throw new Error('VEXA_ACCOUNT_REDIRECT_URI_INVALID');
  }

  return { url, clientId, redirectUri, scopes, timeoutMs };
}

export function getVexaConfig() {
  return readConfig();
}

function clientSecret() {
  const value = String(process.env.VEXA_ACCOUNT_CLIENT_SECRET || '').trim();
  if (!value) throw new Error('VEXA_ACCOUNT_CLIENT_SECRET_REQUIRED');
  return value;
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs || 10000), 1000), 15000));
}

export function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

export function createLoginTransaction() {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { state, verifier, challenge: pkceChallenge(verifier) };
}

export function buildAuthorizeUrl(transaction, { loginHint = '', prompt = '' } = {}) {
  const config = readConfig();
  if (!transaction?.state || !transaction?.verifier || !transaction?.challenge) {
    throw new Error('INVALID_LOGIN_TRANSACTION');
  }

  const url = new URL('/api/sso/authorize', config.url);
  const params = {
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state: transaction.state,
    code_challenge: transaction.challenge,
    code_challenge_method: 'S256'
  };
  if (loginHint) params.login_hint = String(loginHint).slice(0, 320);
  if (prompt) params.prompt = String(prompt).slice(0, 80);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function postForm(pathname, values) {
  const config = readConfig();
  const response = await fetch(new URL(pathname, config.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: new URLSearchParams(values),
    signal: timeoutSignal(config.timeoutMs)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error_description || data.error || `VEXA_SSO_HTTP_${response.status}`);
  }
  return data;
}

export async function exchangeAuthorizationCode(code, verifier) {
  const config = readConfig();
  const authorizationCode = String(code || '').trim();
  const codeVerifier = String(verifier || '').trim();
  if (!authorizationCode || !codeVerifier) throw new Error('INVALID_AUTHORIZATION_CODE');
  return postForm('/api/sso/token', {
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: config.clientId,
    client_secret: clientSecret(),
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier
  });
}

export async function refreshVexaToken(refreshToken) {
  const config = readConfig();
  const token = String(refreshToken || '').trim();
  if (!token) throw new Error('REFRESH_TOKEN_REQUIRED');
  return postForm('/api/sso/token', {
    grant_type: 'refresh_token',
    refresh_token: token,
    client_id: config.clientId,
    client_secret: clientSecret()
  });
}

export async function fetchVexaUser(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('ACCESS_TOKEN_REQUIRED');
  const config = readConfig();
  const response = await fetch(new URL('/api/sso/userinfo', config.url), {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: timeoutSignal(config.timeoutMs)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.sub) throw new Error(data.message || data.error || 'INVALID_VEXA_ACCOUNT_IDENTITY');
  return data;
}

function encryptionKey() {
  const secret = String(process.env.MTP_SESSION_ENCRYPTION_KEY || '').trim();
  if (!secret) throw new Error('MTP_SESSION_ENCRYPTION_KEY_REQUIRED');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value) {
  const plaintext = String(value || '');
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptSecret(value) {
  const encoded = String(value || '').trim();
  if (!encoded) return '';
  try {
    const packed = Buffer.from(encoded, 'base64url');
    if (packed.length < 28) throw new Error('INVALID_ENCRYPTED_SECRET');
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('INVALID_ENCRYPTED_SECRET');
  }
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = process.env.NODE_ENV !== 'development', sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value ?? ''))}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(Number(maxAge) || 0))}`);
  return parts.join('; ');
}

export function readCookies(req) {
  const header = String(req?.headers?.cookie || '');
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[name] = decodeURIComponent(value); } catch { result[name] = value; }
  }
  return result;
}
