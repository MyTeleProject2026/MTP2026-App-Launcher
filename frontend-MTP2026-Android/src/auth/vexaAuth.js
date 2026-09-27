const API=(import.meta.env.VITE_API_BASE_URL||'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/,'');
const API_ORIGIN=API.replace(/\/api$/,'');

function cleanCallbackUrl(){
  const path=window.location.pathname||'/';
  window.history.replaceState({},'',path);
}

function normalizeAuthError(params){
  const code=params.get('sso_error')||params.get('error');
  if(!code) return null;
  const description=params.get('error_description');
  const known={
    access_denied:'VexaAccount sign-in was cancelled.',
    INVALID_SSO_STATE:'The VexaAccount sign-in session expired. Please try again.',
    SSO_LOGIN_FAILED:'VexaAccount could not complete sign-in. Please try again.',
  };
  return description||known[code]||code;
}

export function startVexaLogin(options={}){
  const params=new URLSearchParams();
  const loginHint=String(options.loginHint||'').trim();
  const prompt=String(options.prompt||'').trim();
  if(loginHint) params.set('login_hint',loginHint);
  if(prompt) params.set('prompt',prompt);
  const suffix=params.toString();
  window.location.assign(`${API}/auth/login${suffix?`?${suffix}`:''}`);
}

export async function getVexaSession(){
  const response=await fetch(`${API}/auth/session`,{
    credentials:'include',
    headers:{Accept:'application/json'},
    cache:'no-store',
  });
  if(response.status===401) return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||`AUTH_SESSION_FAILED_${response.status}`);
  if(!data?.authenticated||!data?.profile?.sub) throw new Error('AUTH_SESSION_INVALID');
  return data;
}

export async function finishVexaLogin(){
  const params=new URLSearchParams(window.location.search);
  const callbackError=normalizeAuthError(params);
  if(callbackError){
    cleanCallbackUrl();
    throw new Error(callbackError);
  }

  // VexaAccount returns the authorization code to the launcher frontend.
  // Forward it to the backend browser callback. The backend validates the
  // stored state/PKCE transaction, exchanges the code, creates the HttpOnly
  // MTP session cookie and redirects back here.
  const code=params.get('code');
  const state=params.get('state');
  if(code&&state){
    const callbackUrl=new URL(`${API_ORIGIN}/auth/callback`);
    callbackUrl.searchParams.set('code',code);
    callbackUrl.searchParams.set('state',state);
    window.location.replace(callbackUrl.toString());
    return new Promise(()=>{});
  }

  return getVexaSession();
}

export function getMtpDeviceId(){
  let id=localStorage.getItem('mtp2026_device_id');
  if(!id){
    id=crypto.randomUUID();
    localStorage.setItem('mtp2026_device_id',id);
  }
  return id;
}

export async function api(path,options={}){
  const headers={...(options.headers||{}),'x-mtp-device-id':getMtpDeviceId()};
  return fetch(`${API}${path}`,{...options,credentials:'include',headers});
}

export async function signOut(){
  await fetch(`${API}/auth/logout`,{method:'POST',credentials:'include',headers:{Accept:'application/json'}}).catch(()=>{});
}

export const beginLogin=startVexaLogin;
export const finishLogin=finishVexaLogin;
export function auth(){return null;}
export function token(){return '';}
export function accessToken(){return '';}
export async function refresh(){return false;}
export async function logout(){await signOut(); window.location.assign(window.location.pathname);}
export {API};
