backend/src/auth/vexaaccount-sso.js
// MTP2026 Apps Launcher — production VexaAccount SSO service
// File: backend/src/auth/vexaaccount-sso.js
const crypto=require('crypto');
const config=JSON.parse(process.env.VEXA_ACCOUNT_SSO_CONFIG);
const CLIENT_ID=process.env.VEXA_ACCOUNT_CLIENT_ID||config.clientId;
const CLIENT_SECRET=process.env.VEXA_ACCOUNT_CLIENT_SECRET;
if(!CLIENT_ID||!CLIENT_SECRET)throw new Error('VexaAccount SSO credentials are missing');
const states=new Map();
function createState(){const state=crypto.randomBytes(32).toString('hex');states.set(state,Date.now()+300000);return state}
function consumeState(state){const exp=states.get(state);states.delete(state);return Boolean(exp&&exp>Date.now())}
function authorizationUrl(){const state=createState();const u=new URL(config.url+'/api/sso/authorize');u.searchParams.set('response_type','code');u.searchParams.set('client_id',CLIENT_ID);u.searchParams.set('redirect_uri',config.redirectUri);u.searchParams.set('scope',config.scopes.join(' '));u.searchParams.set('state',state);return {url:u.toString(),state}}
async function exchangeCode(code){const body=new URLSearchParams({grant_type:'authorization_code',code,client_id:CLIENT_ID,client_secret:CLIENT_SECRET,redirect_uri:config.redirectUri});const r=await fetch(config.url+'/api/sso/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error_description||d.error||'VexaAccount token exchange failed');return d}
async function userInfo(token){const r=await fetch(config.url+'/api/sso/userinfo',{headers:{Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'VexaAccount userinfo failed');return d}
module.exports={createState,consumeState,authorizationUrl,exchangeCode,userInfo,config};
