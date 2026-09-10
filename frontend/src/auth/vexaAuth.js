const API=(import.meta.env.VITE_API_BASE_URL||'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/,'');

export function startVexaLogin(options={}){
  const params=new URLSearchParams();
  if(options.loginHint) params.set('login_hint',options.loginHint);
  if(options.prompt) params.set('prompt',options.prompt);
  const suffix=params.toString();
  window.location.assign(`${API}/auth/login${suffix?`?${suffix}`:''}`);
}

export async function finishVexaLogin(){
  const params=new URLSearchParams(window.location.search);
  const error=params.get('sso_error') || params.get('error');
  if(error){
    history.replaceState({},'',window.location.pathname);
    throw new Error(params.get('error_description')||error);
  }

  // The browser callback is handled by the backend /auth/callback endpoint.
  // Do not exchange the authorization code from JavaScript: a top-level
  // navigation lets the backend set its HttpOnly SameSite=None; Secure session
  // cookie reliably, then redirects back to the launcher origin.
  const code=params.get('code');
  const state=params.get('state');
  if(code&&state){
    const callbackUrl=new URL(`${API}/auth/callback`);
    callbackUrl.searchParams.set('code',code);
    callbackUrl.searchParams.set('state',state);
    window.location.replace(callbackUrl.toString());
    return new Promise(()=>{});
  }

  const response=await fetch(`${API}/auth/session`,{credentials:'include',headers:{Accept:'application/json'}});
  if(response.status===401) return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'AUTH_SESSION_FAILED');
  return data;
}

export function getMtpDeviceId(){let id=localStorage.getItem('mtp2026_device_id');if(!id){id=crypto.randomUUID();localStorage.setItem('mtp2026_device_id',id);}return id;}

export async function api(path,options={}){
  const headers={...(options.headers||{}),'x-mtp-device-id':getMtpDeviceId()};
  return fetch(`${API}${path}`,{...options,credentials:'include',headers});
}

export async function signOut(){
  await fetch(`${API}/auth/logout`,{method:'POST',credentials:'include'}).catch(()=>{});
}

export const beginLogin=startVexaLogin;
export const finishLogin=finishVexaLogin;
export function auth(){return null;}
export function token(){return '';}
export function accessToken(){return '';}
export async function refresh(){return false;}
export async function logout(){await signOut(); window.location.assign(window.location.pathname);}
export {API};
