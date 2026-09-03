import crypto from 'node:crypto';

const raw = process.env.VEXA_ACCOUNT_SSO_CONFIG || '';
export function getVexaConfig() {
  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { throw new Error('VEXA_ACCOUNT_SSO_CONFIG_INVALID'); }
  }
  const url = String(parsed.url || process.env.VEXA_ACCOUNT_ISSUER_URL || process.env.VEXA_ACCOUNT_ISSUER || '').replace(/\/$/,'');
  const userUrl = String(parsed.userUrl || process.env.VEXA_ACCOUNT_USER_URL || '').replace(/\/$/,'');
  const clientId = String(parsed.clientId || process.env.VEXA_ACCOUNT_CLIENT_ID || '').trim();
  const redirectUri = String(parsed.redirectUri || process.env.VEXA_ACCOUNT_REDIRECT_URI || '').trim();
  const scopes = Array.isArray(parsed.scopes) && parsed.scopes.length ? parsed.scopes : ['openid','profile','email'];
  const timeoutMs = Number(parsed.timeoutMs || 10000);
  const clientSecret = String(process.env.VEXA_ACCOUNT_CLIENT_SECRET || '');
  if (!url || !userUrl || !clientId || !redirectUri || !clientSecret) throw new Error('VEXA_SSO_NOT_CONFIGURED');
  return { url, userUrl, clientId, redirectUri, scopes, timeoutMs, clientSecret };
}

export function randomUrlToken(bytes=32) { return crypto.randomBytes(bytes).toString('base64url'); }
export function pkceChallenge(verifier) { return crypto.createHash('sha256').update(verifier).digest('base64url'); }
export function createLoginTransaction() { const state=randomUrlToken(32),verifier=randomUrlToken(48); return {state,verifier,challenge:pkceChallenge(verifier)}; }

export function buildAuthorizeUrl(transaction) {
  const cfg=getVexaConfig();
  const query=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:cfg.scopes.join(' '),state:transaction.state,code_challenge:transaction.challenge,code_challenge_method:'S256'}).toString();
  const url=new URL('/',cfg.userUrl);
  url.hash=`#/sso/authorize?${query}`;
  return url.toString();
}

export async function exchangeAuthorizationCode(code,verifier) {
  const cfg=getVexaConfig();
  const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:cfg.redirectUri,client_id:cfg.clientId,client_secret:cfg.clientSecret,code_verifier:verifier});
  const response=await fetch(new URL('/api/sso/token',cfg.url),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(cfg.timeoutMs)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.access_token)throw new Error(payload.error||'SSO_TOKEN_EXCHANGE_FAILED');
  return payload;
}

export async function refreshVexaToken(refreshToken) {
  const cfg=getVexaConfig();
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,client_id:cfg.clientId,client_secret:cfg.clientSecret});
  const response=await fetch(new URL('/api/sso/token',cfg.url),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(cfg.timeoutMs)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.access_token)throw new Error(payload.error||'SSO_REFRESH_FAILED');
  return payload;
}

export async function fetchVexaUser(accessToken) {
  const cfg=getVexaConfig();
  const response=await fetch(new URL('/api/sso/userinfo',cfg.url),{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(Math.min(cfg.timeoutMs,7000))});
  const profile=await response.json().catch(()=>({}));
  if(!response.ok||!profile?.sub)throw new Error('SSO_USERINFO_FAILED');
  return profile;
}

export function serializeCookie(name,value,options={}){const parts=[`${name}=${encodeURIComponent(value)}`];if(options.maxAge!=null)parts.push(`Max-Age=${Math.max(0,Math.floor(options.maxAge))}`);parts.push(`Path=${options.path||'/'}`);if(options.httpOnly!==false)parts.push('HttpOnly');if(options.secure!==false)parts.push('Secure');parts.push(`SameSite=${options.sameSite||'Lax'}`);return parts.join('; ');}
export function readCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));}
export function encryptSecret(value){const key=crypto.createHash('sha256').update(process.env.MTP_SESSION_ENCRYPTION_KEY||process.env.VEXA_ACCOUNT_CLIENT_SECRET||'').digest();const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);const tag=cipher.getAuthTag();return Buffer.concat([iv,tag,ciphertext]).toString('base64url');}
export function decryptSecret(value){const raw=Buffer.from(String(value),'base64url');const key=crypto.createHash('sha256').update(process.env.MTP_SESSION_ENCRYPTION_KEY||process.env.VEXA_ACCOUNT_CLIENT_SECRET||'').digest();const iv=raw.subarray(0,12),tag=raw.subarray(12,28),ciphertext=raw.subarray(28);const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');}
