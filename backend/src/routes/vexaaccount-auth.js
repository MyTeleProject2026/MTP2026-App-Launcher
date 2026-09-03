import crypto from 'node:crypto';
import {
  buildAuthorizeUrl, createLoginTransaction, decryptSecret, encryptSecret,
  exchangeAuthorizationCode, fetchVexaUser, getVexaConfig, readCookies,
  refreshVexaToken, serializeCookie
} from '../auth/vexaaccount-sso.js';

const LOGIN_COOKIE='mtp_vexa_login';
const SESSION_COOKIE='mtp_session';
const loginTransactions=new Map();

function cleanupTransactions() {
  const cutoff=Date.now()-10*60*1000;
  for (const [key,value] of loginTransactions) if (value.createdAt<cutoff) loginTransactions.delete(key);
}

export function registerVexaAuthRoutes(app,{pool,ensureUser}) {
  async function ensureSessionTable() {
    if (!pool) return;
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_sso_sessions (
      id VARCHAR(128) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      vexa_subject VARCHAR(255) NOT NULL,
      profile_json JSON NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NULL,
      access_expires_at DATETIME NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mtp_sso_sessions_subject (vexa_subject),
      INDEX idx_mtp_sso_sessions_expires (expires_at)
    )`);
  }
  const sessionReady=ensureSessionTable().catch(()=>null);

  async function createSession(profile,tokens) {
    if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
    await sessionReady;
    const userId=await ensureUser(profile.sub,profile.sub);
    const id=crypto.randomBytes(48).toString('base64url');
    const expiresIn=Math.max(60,Number(tokens.expires_in||3600));
    const expiresAt=new Date(Date.now()+30*24*60*60*1000);
    const accessExpiresAt=new Date(Date.now()+expiresIn*1000);
    await pool.execute(
      `INSERT INTO mtp_sso_sessions(id,user_id,vexa_subject,profile_json,access_token_enc,refresh_token_enc,access_expires_at,expires_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [id,userId,profile.sub,JSON.stringify(profile),encryptSecret(tokens.access_token),tokens.refresh_token?encryptSecret(tokens.refresh_token):null,accessExpiresAt,expiresAt]
    );
    return {id,profile};
  }

  async function loadSession(req,{refresh=true}={}) {
    const id=readCookies(req)[SESSION_COOKIE];
    if (!id || !pool) return null;
    await sessionReady;
    const [rows]=await pool.execute(`SELECT * FROM mtp_sso_sessions WHERE id=? AND expires_at>UTC_TIMESTAMP() LIMIT 1`,[id]);
    const session=rows[0]; if (!session) return null;
    let accessToken=decryptSecret(session.access_token_enc);
    let refreshToken=session.refresh_token_enc?decryptSecret(session.refresh_token_enc):null;
    const expiresAt=session.access_expires_at?new Date(session.access_expires_at).getTime():0;
    if (refresh && refreshToken && expiresAt && expiresAt-Date.now()<60000) {
      const refreshed=await refreshVexaToken(refreshToken);
      accessToken=refreshed.access_token;
      refreshToken=refreshed.refresh_token||refreshToken;
      await pool.execute(`UPDATE mtp_sso_sessions SET access_token_enc=?,refresh_token_enc=?,access_expires_at=? WHERE id=?`,
        [encryptSecret(accessToken),encryptSecret(refreshToken),new Date(Date.now()+Math.max(60,Number(refreshed.expires_in||3600))*1000),id]);
    }
    return {id,profile:typeof session.profile_json==='string'?JSON.parse(session.profile_json):session.profile_json,accessToken};
  }

  app.get('/api/auth/login',(req,res)=>{
    try {
      cleanupTransactions();
      const tx=createLoginTransaction();
      const id=crypto.randomBytes(32).toString('base64url');
      loginTransactions.set(id,{...tx,createdAt:Date.now()});
      res.setHeader('Set-Cookie',serializeCookie(LOGIN_COOKIE,id,{maxAge:600,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));
      res.redirect(302,buildAuthorizeUrl(tx));
    } catch (error) { res.status(503).json({error:error.message||'VEXA_SSO_UNAVAILABLE'}); }
  });

  app.post('/api/auth/callback',async(req,res)=>{
    try {
      cleanupTransactions();
      const {code,state}=req.body||{};
      const tx=state?loginTransactions.get(String(state)):null;
      if (state) loginTransactions.delete(String(state));
      if (!code||!state||!tx||tx.state!==state||Date.now()-tx.createdAt>10*60*1000) return res.status(400).json({error:'INVALID_SSO_STATE'});
      const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);
      const profile=await fetchVexaUser(tokens.access_token);
      const session=await createSession(profile,tokens);
      res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));
      res.json({authenticated:true,profile:session.profile});
    } catch (e) { res.status(401).json({error:e.message||'SSO_LOGIN_FAILED'}); }
  });

  app.get('/auth/vexaaccount/callback',async(req,res)=>{
    const frontend=(process.env.FRONTEND_ORIGIN||'').split(',')[0].trim().replace(/\/$/,'');
    const fail=(code)=>res.redirect(302,`${frontend}/?sso_error=${encodeURIComponent(code)}`);
    try {
      const {code,state,error,error_description}=req.query;
      if (error) return fail(error_description||error);
      const loginId=readCookies(req)[LOGIN_COOKIE];
      const tx=loginId?loginTransactions.get(loginId):null;
      loginTransactions.delete(loginId);
      if (!code||!state||!tx||tx.state!==state||Date.now()-tx.createdAt>10*60*1000) return fail('INVALID_SSO_STATE');
      const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);
      const profile=await fetchVexaUser(tokens.access_token);
      const session=await createSession(profile,tokens);
      res.setHeader('Set-Cookie',[
        serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}),
        serializeCookie(LOGIN_COOKIE,'',{maxAge:0,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'})
      ]);
      res.redirect(302,`${frontend}/`);
    } catch (e) { return fail(e.message||'SSO_LOGIN_FAILED'); }
  });

  app.get('/api/auth/session',async(req,res)=>{
    try {
      const session=await loadSession(req);
      if (!session) return res.status(401).json({error:'AUTH_REQUIRED'});
      res.json({authenticated:true,profile:session.profile});
    } catch { res.status(401).json({error:'AUTH_INVALID'}); }
  });

  app.post('/api/auth/logout',async(req,res)=>{
    const id=readCookies(req)[SESSION_COOKIE];
    if (id&&pool) await pool.execute('DELETE FROM mtp_sso_sessions WHERE id=?',[id]).catch(()=>{});
    res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,'',{maxAge:0,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));
    res.status(204).end();
  });

  return async function auth(req,res,next) {
    try {
      const session=await loadSession(req);
      if (!session?.profile?.sub) return res.status(401).json({error:'AUTH_REQUIRED'});
      req.vexaUser=session.profile;
      req.mtpSession=session;
      next();
    } catch (e) { res.status(401).json({error:'AUTH_INVALID'}); }
  };
}
