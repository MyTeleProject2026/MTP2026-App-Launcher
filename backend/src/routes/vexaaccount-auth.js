import crypto from 'node:crypto';
import {
  buildAuthorizeUrl, createLoginTransaction, decryptSecret, encryptSecret,
  exchangeAuthorizationCode, fetchVexaUser, readCookies, refreshVexaToken, serializeCookie
} from '../auth/vexaaccount-sso.js';

const SESSION_COOKIE='mtp_session';

export function registerVexaAuthRoutes(app,{pool,ensureUser}) {
  async function ensureAuthTables() {
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
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_sso_login_transactions (
      state VARCHAR(128) PRIMARY KEY,
      verifier VARCHAR(128) NOT NULL,
      challenge VARCHAR(128) NOT NULL,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      INDEX idx_mtp_login_transactions_expires (expires_at)
    )`);
  }
  const authTablesReady=ensureAuthTables().catch(()=>null);

  async function saveLoginTransaction(tx) {
    if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
    await authTablesReady;
    await pool.execute('DELETE FROM mtp_sso_login_transactions WHERE expires_at<=UTC_TIMESTAMP()');
    await pool.execute('INSERT INTO mtp_sso_login_transactions(state,verifier,challenge,created_at,expires_at) VALUES(?,?,?,?,?)',[tx.state,tx.verifier,tx.challenge,new Date(),new Date(Date.now()+10*60*1000)]);
  }

  async function consumeLoginTransaction(state) {
    if (!pool) return null;
    await authTablesReady;
    const conn=await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows]=await conn.execute('SELECT state,verifier,challenge,created_at,expires_at FROM mtp_sso_login_transactions WHERE state=? AND expires_at>UTC_TIMESTAMP() LIMIT 1 FOR UPDATE',[state]);
      const tx=rows[0];
      if (!tx) { await conn.rollback(); return null; }
      await conn.execute('DELETE FROM mtp_sso_login_transactions WHERE state=?',[state]);
      await conn.commit();
      return tx;
    } catch (e) { await conn.rollback().catch(()=>{}); throw e; }
    finally { conn.release(); }
  }

  async function createSession(profile,tokens) {
    if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
    await authTablesReady;
    const userId=await ensureUser(profile.sub,profile.sub);
    const id=crypto.randomBytes(48).toString('base64url');
    const expiresIn=Math.max(60,Number(tokens.expires_in||3600));
    const expiresAt=new Date(Date.now()+30*24*60*60*1000);
    const accessExpiresAt=new Date(Date.now()+expiresIn*1000);
    await pool.execute(`INSERT INTO mtp_sso_sessions(id,user_id,vexa_subject,profile_json,access_token_enc,refresh_token_enc,access_expires_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`,[id,userId,profile.sub,JSON.stringify(profile),encryptSecret(tokens.access_token),tokens.refresh_token?encryptSecret(tokens.refresh_token):null,accessExpiresAt,expiresAt]);
    return {id,profile};
  }

  async function loadSession(req,{refresh=true}={}) {
    const id=readCookies(req)[SESSION_COOKIE];
    if (!id || !pool) return null;
    await authTablesReady;
    const [rows]=await pool.execute(`SELECT * FROM mtp_sso_sessions WHERE id=? AND expires_at>UTC_TIMESTAMP() LIMIT 1`,[id]);
    const session=rows[0]; if (!session) return null;
    let accessToken=decryptSecret(session.access_token_enc);
    let refreshToken=session.refresh_token_enc?decryptSecret(session.refresh_token_enc):null;
    const expiresAt=session.access_expires_at?new Date(session.access_expires_at).getTime():0;
    if (refresh && refreshToken && expiresAt && expiresAt-Date.now()<60000) {
      const refreshed=await refreshVexaToken(refreshToken);
      accessToken=refreshed.access_token;
      refreshToken=refreshed.refresh_token||refreshToken;
      await pool.execute(`UPDATE mtp_sso_sessions SET access_token_enc=?,refresh_token_enc=?,access_expires_at=? WHERE id=?`,[encryptSecret(accessToken),encryptSecret(refreshToken),new Date(Date.now()+Math.max(60,Number(refreshed.expires_in||3600))*1000),id]);
    }
    return {id,profile:typeof session.profile_json==='string'?JSON.parse(session.profile_json):session.profile_json,accessToken};
  }

  app.get('/api/auth/login',async(_req,res)=>{
    try { const tx=createLoginTransaction(); await saveLoginTransaction(tx); res.redirect(302,buildAuthorizeUrl(tx)); }
    catch (error) { res.status(503).json({error:error.message||'VEXA_SSO_UNAVAILABLE'}); }
  });

  app.post('/api/auth/callback',async(req,res)=>{
    try {
      const {code,state}=req.body||{};
      if(!code||!state) return res.status(400).json({error:'INVALID_SSO_STATE'});
      const tx=await consumeLoginTransaction(String(state));
      if(!tx) return res.status(400).json({error:'INVALID_SSO_STATE'});
      const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);
      const profile=await fetchVexaUser(tokens.access_token);
      const session=await createSession(profile,tokens);
      res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));
      res.json({authenticated:true,profile:session.profile});
    } catch (e) { res.status(401).json({error:e.message||'SSO_LOGIN_FAILED'}); }
  });

  async function handleBrowserCallback(req,res) {
    const frontend=(process.env.FRONTEND_ORIGIN||'').split(',')[0].trim().replace(/\/$/,'');
    const fail=(code)=>res.redirect(302,`${frontend}/?sso_error=${encodeURIComponent(code)}`);
    try {
      const {code,state,error,error_description}=req.query;
      if(error) return fail(error_description||error);
      if(!code||!state) return fail('INVALID_SSO_STATE');
      const tx=await consumeLoginTransaction(String(state));
      if(!tx) return fail('INVALID_SSO_STATE');
      const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);
      const profile=await fetchVexaUser(tokens.access_token);
      const session=await createSession(profile,tokens);
      res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));
      res.redirect(302,`${frontend}/`);
    } catch (e) { return fail(e.message||'SSO_LOGIN_FAILED'); }
  }

  app.get('/auth/callback',handleBrowserCallback);
  app.get('/auth/vexaaccount/callback',handleBrowserCallback);

  app.get('/api/auth/session',async(req,res)=>{try{const session=await loadSession(req);if(!session)return res.status(401).json({error:'AUTH_REQUIRED'});res.json({authenticated:true,profile:session.profile});}catch{res.status(401).json({error:'AUTH_INVALID'});}});
  app.post('/api/auth/logout',async(req,res)=>{const id=readCookies(req)[SESSION_COOKIE];if(id&&pool)await pool.execute('DELETE FROM mtp_sso_sessions WHERE id=?',[id]).catch(()=>{});res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,'',{maxAge:0,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));res.status(204).end();});
  return async function auth(req,res,next){try{const session=await loadSession(req);if(!session?.profile?.sub)return res.status(401).json({error:'AUTH_REQUIRED'});req.vexaUser=session.profile;req.mtpSession=session;next();}catch{res.status(401).json({error:'AUTH_INVALID'});}};
}
