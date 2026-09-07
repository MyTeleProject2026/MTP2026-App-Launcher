import crypto from 'node:crypto';
import {
  buildAuthorizeUrl, createLoginTransaction, decryptSecret, encryptSecret,
  exchangeAuthorizationCode, fetchVexaUser, readCookies, refreshVexaToken, serializeCookie
} from '../auth/vexaaccount-sso.js';
import { revokeVexaSession } from '../auth/vexaaccount-revoke.js';

const SESSION_COOKIE='mtp_session';

export function registerVexaAuthRoutes(app,{pool,ensureUser}) {
  async function ensureAuthTables() {
    if (!pool) return;
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_sso_sessions (id VARCHAR(128) PRIMARY KEY,user_id CHAR(36) NOT NULL,vexa_subject VARCHAR(255) NOT NULL,profile_json JSON NOT NULL,access_token_enc TEXT NOT NULL,refresh_token_enc TEXT NULL,access_expires_at DATETIME NULL,expires_at DATETIME NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_mtp_sso_sessions_subject(vexa_subject),INDEX idx_mtp_sso_sessions_expires(expires_at))`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_sso_login_transactions (state VARCHAR(128) PRIMARY KEY,verifier VARCHAR(128) NOT NULL,challenge VARCHAR(128) NOT NULL,created_at DATETIME NOT NULL,expires_at DATETIME NOT NULL,INDEX idx_mtp_login_transactions_expires(expires_at))`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_user_preferences (user_id CHAR(36) NOT NULL PRIMARY KEY,theme VARCHAR(20) NOT NULL DEFAULT 'system',default_view VARCHAR(30) NOT NULL DEFAULT 'launcher',open_behavior VARCHAR(30) NOT NULL DEFAULT 'new_tab',compact_mode TINYINT(1) NOT NULL DEFAULT 0,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS mtp_notifications (id CHAR(36) NOT NULL PRIMARY KEY,user_id CHAR(36) NOT NULL,type VARCHAR(40) NOT NULL DEFAULT 'system',title VARCHAR(160) NOT NULL,message VARCHAR(500) NOT NULL,read_at DATETIME NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_mtp_notifications_user(user_id,created_at),INDEX idx_mtp_notifications_unread(user_id,read_at,created_at))`);
  }
  const authTablesReady=ensureAuthTables();

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
    const expiresAt=new Date(Date.now()+30*24*60*60*1000);
    const accessExpiresAt=new Date(Date.now()+Math.max(60,Number(tokens.expires_in||3600))*1000);
    await pool.execute(`INSERT INTO mtp_sso_sessions(id,user_id,vexa_subject,profile_json,access_token_enc,refresh_token_enc,access_expires_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`,[id,userId,profile.sub,JSON.stringify(profile),encryptSecret(tokens.access_token),tokens.refresh_token?encryptSecret(tokens.refresh_token):null,accessExpiresAt,expiresAt]);
    await pool.execute(`INSERT IGNORE INTO mtp_user_preferences(user_id) VALUES(?)`,[userId]);
    const [existing]=await pool.execute('SELECT id FROM mtp_notifications WHERE user_id=? LIMIT 1',[userId]);
    if (!existing.length) await pool.execute('INSERT INTO mtp_notifications(id,user_id,type,title,message) VALUES(?,?,?,?,?)',[crypto.randomUUID(),userId,'security','MTP2026 connected','Your MTP2026 launcher session is now connected to VexaAccount.']);
    return {id,profile,userId};
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
    return {id,userId:session.user_id,profile:typeof session.profile_json==='string'?JSON.parse(session.profile_json):session.profile_json,accessToken,refreshToken};
  }

  app.get('/api/auth/login',async(req,res)=>{try{const tx=createLoginTransaction();await saveLoginTransaction(tx);const loginHint=String(req.query.login_hint||'').trim();const prompt=String(req.query.prompt||'').trim();res.redirect(302,buildAuthorizeUrl(tx,{loginHint,prompt}));}catch(error){res.status(503).json({error:error.message||'VEXA_SSO_UNAVAILABLE'});}});

  app.post('/api/auth/callback',async(req,res)=>{try{const {code,state}=req.body||{};if(!code||!state)return res.status(400).json({error:'INVALID_SSO_STATE'});const tx=await consumeLoginTransaction(String(state));if(!tx)return res.status(400).json({error:'INVALID_SSO_STATE'});const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);const profile=await fetchVexaUser(tokens.access_token);const session=await createSession(profile,tokens);res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));res.json({authenticated:true,profile:session.profile});}catch(e){res.status(401).json({error:e.message||'SSO_LOGIN_FAILED'});}});

  async function handleBrowserCallback(req,res){const frontend=(process.env.FRONTEND_ORIGIN||'').split(',')[0].trim().replace(/\/$/,'');const fail=code=>res.redirect(302,`${frontend}/?sso_error=${encodeURIComponent(code)}`);try{const {code,state,error,error_description}=req.query;if(error)return fail(error_description||error);if(!code||!state)return fail('INVALID_SSO_STATE');const tx=await consumeLoginTransaction(String(state));if(!tx)return fail('INVALID_SSO_STATE');const tokens=await exchangeAuthorizationCode(String(code),tx.verifier);const profile=await fetchVexaUser(tokens.access_token);const session=await createSession(profile,tokens);res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,session.id,{maxAge:30*24*60*60,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));res.redirect(302,`${frontend}/`);}catch(e){return fail(e.message||'SSO_LOGIN_FAILED');}}
  app.get('/auth/callback',handleBrowserCallback);
  app.get('/auth/vexaaccount/callback',handleBrowserCallback);

  app.get('/api/auth/session',async(req,res)=>{try{const session=await loadSession(req);if(!session)return res.status(401).json({error:'AUTH_REQUIRED'});res.json({authenticated:true,profile:session.profile});}catch{res.status(401).json({error:'AUTH_INVALID'});}});
  app.post('/api/auth/logout',async(req,res)=>{const id=readCookies(req)[SESSION_COOKIE];if(id&&pool){try{const [rows]=await pool.execute('SELECT refresh_token_enc FROM mtp_sso_sessions WHERE id=? LIMIT 1',[id]);if(rows[0]?.refresh_token_enc)await revokeVexaSession(decryptSecret(rows[0].refresh_token_enc)).catch(()=>false);}catch{}await pool.execute('DELETE FROM mtp_sso_sessions WHERE id=?',[id]).catch(()=>{});}res.setHeader('Set-Cookie',serializeCookie(SESSION_COOKIE,'',{maxAge:0,httpOnly:true,sameSite:'Lax',secure:process.env.NODE_ENV!=='development'}));res.status(204).end();});

  const auth=async(req,res,next)=>{try{const session=await loadSession(req);if(!session?.profile?.sub)return res.status(401).json({error:'AUTH_REQUIRED'});req.vexaUser=session.profile;req.mtpSession=session;next();}catch{res.status(401).json({error:'AUTH_INVALID'});}};

  app.get('/api/settings',auth,async(req,res)=>{try{const [rows]=await pool.execute('SELECT theme,default_view AS defaultView,open_behavior AS openBehavior,compact_mode AS compactMode FROM mtp_user_preferences WHERE user_id=?',[req.mtpSession.userId]);res.json(rows[0]||{theme:'system',defaultView:'launcher',openBehavior:'new_tab',compactMode:false});}catch{res.status(500).json({error:'SETTINGS_LOAD_FAILED'});}});
  app.patch('/api/settings',auth,async(req,res)=>{try{const body=req.body||{};const allowed={theme:['system','light','dark'],defaultView:['launcher','applications','favorites','recent'],openBehavior:['new_tab','same_tab'],compactMode:[true,false]};for(const key of Object.keys(body)){if(!allowed[key]||!allowed[key].includes(body[key]))return res.status(400).json({error:'INVALID_SETTING'});}const userId=req.mtpSession.userId;await pool.execute('INSERT INTO mtp_user_preferences(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=user_id',[userId]);if(Object.hasOwn(body,'theme'))await pool.execute('UPDATE mtp_user_preferences SET theme=? WHERE user_id=?',[body.theme,userId]);if(Object.hasOwn(body,'defaultView'))await pool.execute('UPDATE mtp_user_preferences SET default_view=? WHERE user_id=?',[body.defaultView,userId]);if(Object.hasOwn(body,'openBehavior'))await pool.execute('UPDATE mtp_user_preferences SET open_behavior=? WHERE user_id=?',[body.openBehavior,userId]);if(Object.hasOwn(body,'compactMode'))await pool.execute('UPDATE mtp_user_preferences SET compact_mode=? WHERE user_id=?',[body.compactMode?1:0,userId]);res.json({ok:true});}catch{res.status(500).json({error:'SETTINGS_UPDATE_FAILED'});}});

  app.get('/api/notifications',auth,async(req,res)=>{try{const limit=Math.min(100,Math.max(1,Number(req.query.limit||30)));const [rows]=await pool.execute('SELECT id,type,title,message,read_at AS readAt,created_at AS createdAt FROM mtp_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?',[req.mtpSession.userId,limit]);res.json(rows);}catch{res.status(500).json({error:'NOTIFICATIONS_LOAD_FAILED'});}});
  app.post('/api/notifications/:id/read',auth,async(req,res)=>{try{const [result]=await pool.execute('UPDATE mtp_notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE id=? AND user_id=?',[req.params.id,req.mtpSession.userId]);if(!result.affectedRows)return res.status(404).json({error:'NOTIFICATION_NOT_FOUND'});res.json({ok:true});}catch{res.status(500).json({error:'NOTIFICATION_UPDATE_FAILED'});}});
  app.post('/api/notifications/read-all',auth,async(req,res)=>{try{await pool.execute('UPDATE mtp_notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE user_id=?',[req.mtpSession.userId]);res.json({ok:true});}catch{res.status(500).json({error:'NOTIFICATIONS_UPDATE_FAILED'});}});

  return auth;
}
