import assert from 'node:assert/strict';

const base=String(process.env.MTP2026_RUNTIME_URL||'').replace(/\/$/,'');
const key=String(process.env.MTP2026_RUNTIME_API_KEY||'');
const profile=String(process.env.MTP2026_E2E_PROFILE||'desktop');
if(!base||!/^https:\/\//.test(base)||!key) throw new Error('Set MTP2026_RUNTIME_URL and MTP2026_RUNTIME_API_KEY to run deployed runtime E2E.');
if(!['mtp2026','android','desktop','gaming'].includes(profile)) throw new Error('Invalid MTP2026_E2E_PROFILE');
const ownerId=`runtime-e2e-${process.env.GITHUB_RUN_ID||Date.now()}`;
const sessionId=globalThis.crypto.randomUUID().replace(/-/g,'');
const headers={'authorization':`Bearer ${key}`,'content-type':'application/json'};
async function request(path,options={}) {
  const response=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})},signal:AbortSignal.timeout(130000)});
  const body=await response.json().catch(()=>({}));
  return {response,body};
}
let started=false;
try {
  const health=await request('/health',{headers:{}});
  assert.equal(health.response.status,200,'runtime health must be reachable');
  assert.equal(health.body.engine,'qemu-system-aarch64');
  const start=await request('/internal/start',{method:'POST',body:JSON.stringify({profile,ownerId,sessionId})});
  assert.equal(start.response.status,201,JSON.stringify(start.body));
  started=true;
  assert.equal(start.body.realGuest,true,'runtime must confirm real guest execution');
  assert.equal(start.body.ready,true,'guest boot must be confirmed');
  assert.equal(start.body.running,true,'guest must be running');
  assert.match(start.body.viewerUrl,/^https:\/\//);
  const viewer=await fetch(start.body.viewerUrl,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(viewer.status,302,'viewer endpoint must issue noVNC redirect');
  assert.match(viewer.headers.get('location')||'',/\/novnc\/vnc\.html\?/,'viewer redirect must include noVNC path');
  const stop=await request(`/internal/stop/${sessionId}`,{method:'POST',body:JSON.stringify({ownerId})});
  assert.equal(stop.response.status,200,JSON.stringify(stop.body));
  started=false;
  const status=await request(`/internal/status/${sessionId}?ownerId=${encodeURIComponent(ownerId)}`);
  assert.equal(status.response.status,404,'stopped guest must no longer be exposed as running');
  console.log(`PASS: ${profile} boot confirmed, noVNC viewer reachable, stop confirmed`);
} finally {
  if(started) await request(`/internal/stop/${sessionId}`,{method:'POST',body:JSON.stringify({ownerId})}).catch(()=>{});
}
