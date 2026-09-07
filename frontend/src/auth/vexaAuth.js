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
  const code=params.get('code');
  const state=params.get('state');
  if(code&&state){
    const callback=await fetch(`${API}/auth/callback`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({code,state})});
    const payload=await callback.json().catch(()=>({}));
    history.replaceState({},'',window.location.pathname);
    if(!callback.ok) throw new Error(payload.error||'SSO_LOGIN_FAILED');
    return payload;
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
