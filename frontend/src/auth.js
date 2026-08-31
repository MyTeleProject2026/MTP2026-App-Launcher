const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const issuer = import.meta.env.VITE_VEXA_ACCOUNT_ISSUER_URL || '';
const clientId = import.meta.env.VITE_VEXA_ACCOUNT_CLIENT_ID || '';
const redirectUri = import.meta.env.VITE_VEXA_ACCOUNT_REDIRECT_URI || `${window.location.origin}/auth/callback`;

function base64url(bytes) {
  let s=''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function sha256(value) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); }

export async function startVexaLogin() {
  if (!issuer || !clientId) throw new Error('VEXA_SSO_NOT_CONFIGURED');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await sha256(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem('mtp_pkce_verifier', verifier);
  sessionStorage.setItem('mtp_oauth_state', state);
  const params = new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid profile email',state,code_challenge:challenge,code_challenge_method:'S256'});
  window.location.assign(`${issuer.replace(/\/$/,'')}/api/sso/authorize?${params}`);
}

export async function finishVexaLogin() {
  const params = new URLSearchParams(window.location.search);
  const code=params.get('code'); const state=params.get('state');
  if(!code) return null;
  if(state !== sessionStorage.getItem('mtp_oauth_state')) throw new Error('OAUTH_STATE_MISMATCH');
  const verifier=sessionStorage.getItem('mtp_pkce_verifier');
  const response=await fetch(`${API}/auth/callback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,state,code_verifier:verifier,redirect_uri:redirectUri})});
  const data=await response.json(); if(!response.ok) throw new Error(data.error||'SSO_LOGIN_FAILED');
  sessionStorage.removeItem('mtp_pkce_verifier'); sessionStorage.removeItem('mtp_oauth_state');
  localStorage.setItem('mtp_access_token',data.access_token); localStorage.setItem('mtp_profile',JSON.stringify(data.profile||{}));
  window.history.replaceState({},'',window.location.pathname); return data;
}
export function accessToken(){return localStorage.getItem('mtp_access_token')||'';}
export function signOut(){localStorage.removeItem('mtp_access_token');localStorage.removeItem('mtp_profile');}
export { API };
