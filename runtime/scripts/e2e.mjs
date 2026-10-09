import assert from 'node:assert/strict';
import WebSocket from 'ws';

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
  const token = new URL(start.body.viewerUrl).pathname.split('/').filter(Boolean).at(-1);
  const websocketUrl = base.replace(/^http/, 'ws') + '/ws/' + encodeURIComponent(token);
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket(websocketUrl);
    let buffer=Buffer.alloc(0), stage=0, timer;
    const finish=error=>{clearTimeout(timer);try{ws.close();}catch{};error?reject(error):resolve();};
    timer=setTimeout(()=>finish(new Error('VNC_RFB_HANDSHAKE_TIMEOUT')),12000);
    ws.on('error',finish);
    ws.on('message',data=>{
      buffer=Buffer.concat([buffer,Buffer.from(data)]);
      try {
        if(stage===0 && buffer.length>=12) {
          const version=buffer.subarray(0,12).toString('ascii');
          assert.match(version,/^RFB 003\\.00[38]\\n$/,'VNC bridge must expose an RFB server banner');
          ws.send(version);buffer=buffer.subarray(12);stage=1;
        }
        if(stage===1 && buffer.length>=1) {
          const count=buffer[0];
          if(count<1)throw new Error('VNC_SERVER_OFFERED_NO_SECURITY_TYPES');
          if(buffer.length<1+count)return;
          const types=buffer.subarray(1,1+count);
          if(!types.includes(1))throw new Error('VNC_NO_AUTH_SECURITY_TYPE_UNAVAILABLE');
          ws.send(Buffer.from([1]));buffer=buffer.subarray(1+count);stage=2;
        }
        if(stage===2 && buffer.length>=4) {
          if(buffer.readUInt32BE(0)!==0)throw new Error('VNC_SECURITY_NEGOTIATION_FAILED');
          ws.send(Buffer.from([1]));buffer=buffer.subarray(4);stage=3;
        }
        if(stage===3 && buffer.length>=24) {
          const width=buffer.readUInt16BE(0),height=buffer.readUInt16BE(2),nameLength=buffer.readUInt32BE(20);
          if(width<1||height<1||nameLength>4096)throw new Error('VNC_SERVER_INIT_INVALID');
          if(buffer.length<24+nameLength)return;
          assert.ok(width>=320&&height>=200,'guest framebuffer dimensions must be plausible');
          console.log(`VNC RFB handshake passed: ${width}x${height}`);
          finish();
        }
      } catch(error) { finish(error); }
    });
  });
  const stop=await request(`/internal/stop/${sessionId}`,{method:'POST',body:JSON.stringify({ownerId})});
  assert.equal(stop.response.status,200,JSON.stringify(stop.body));
  started=false;
  const status=await request(`/internal/status/${sessionId}?ownerId=${encodeURIComponent(ownerId)}`);
  assert.equal(status.response.status,404,'stopped guest must no longer be exposed as running');
  console.log(`PASS: ${profile} boot confirmed, noVNC viewer reachable, stop confirmed`);
} finally {
  if(started) await request(`/internal/stop/${sessionId}`,{method:'POST',body:JSON.stringify({ownerId})}).catch(()=>{});
}
