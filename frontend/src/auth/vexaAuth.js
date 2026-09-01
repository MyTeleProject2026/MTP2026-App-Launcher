const API=(import.meta.env.VITE_API_BASE_URL||'http://localhost:4000/api').replace(/\/$/,'');
const ISSUER=(import.meta.env.VITE_VEXA_ACCOUNT_ISSUER_URL||'https://api-vexaaccount.onrender.com').replace(/\/$/,'');
const CLIENT_ID=import.meta.env.VITE_VEXA_ACCOUNT_CLIENT_ID||'';
const REDIRECT_URI=import.meta.env.VITE_VEXA_ACCOUNT_REDIRECT_URI||`${window.location.origin}/auth/callback`;
const KEY='mtp2026_auth';
const STATE_KEY='mtp_sso_state';
const VERIFIER_KEY='mtp_sso_verifier';

function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function saveSession(data){localStorage.setItem(KEY,JSON.stringify(data));localStorage.setItem('mtp_access_token',data.access_token||'');localStorage.setItem('mtp_profile',JSON.stringify(data.profile||{}));}
function clearSession(){localStorage.removeItem(KEY);localStorage.removeItem('mtp_access_token');localStorage.removeItem('mtp_profile');}

export async function beginLogin(){
  if(!ISSUER||!CLIENT_ID) throw Error('VEXA_SSO_NOT_CONFIGURED');
  const state=b64(crypto.getRandomValues(new Uint8Array(24)));
  const verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=b64(digest);
  sessionStorage.setItem(STATE_KEY,state);
  sessionStorage.setItem(VERIFIER_KEY,verifier);
  const cfgResponse=await fetch(`${API}/config`,{headers:{Accept:'application/json'}});
  const cfg=cfgResponse.ok?await cfgResponse.json():null;
  const issuer=(cfg?.sso?.issuer||ISSUER).replace(/\/$/,'');
  const clientId=cfg?.sso?.client_id||CLIENT_ID;
  const redirect=cfg?.sso?.redirect_uri||REDIRECT_URI;
  if(!clientId||!redirect) throw Error('VEXA_SSO_NOT_CONFIGURED');
  const url=new URL(`${issuer}/api/sso/authorize`);
  url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid profile email account session applications notifications',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  location.assign(url.toString());
}

export async function finishLogin(){
  const params=new URLSearchParams(location.search);
  const code=params.get('code');
  const state=params.get('state');
  const error=params.get('error');
  if(error) throw Error(params.get('error_description')||error);
  if(!code) return null;
  const expected=sessionStorage.getItem(STATE_KEY);
  const verifier=sessionStorage.getItem(VERIFIER_KEY);
  if(!state||!expected||state!==expected||!verifier) throw Error('INVALID_SSO_STATE');
  const response=await fetch(`${API}/auth/callback`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,state,code_verifier:verifier,redirect_uri:REDIRECT_URI})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(data.error||'SSO_LOGIN_FAILED');
  saveSession(data);
  sessionStorage.removeItem(STATE_KEY);sessionStorage.removeItem(VERIFIER_KEY);
  history.replaceState({},'',location.pathname);
  return data;
}

export function auth(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
export function token(){return auth()?.access_token||localStorage.getItem('mtp_access_token')||''}
export function accessToken(){return token()}
export async function refresh(){
  const current=auth();
  if(!current?.refresh_token) return false;
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refresh_token,client_id:CLIENT_ID});
  const response=await fetch(`${ISSUER}/api/sso/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){clearSession();return false;}
  saveSession({...current,...data});
  return true;
}
export async function api(path,options={}){
  const make=()=>fetch(`${API}${path}`,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token()}`}});
  let response=await make();
  if(response.status===401&&await refresh()) response=await make();
  return response;
}
export function logout(){clearSession();location.reload()}
export function signOut(){logout()}
export {API};
