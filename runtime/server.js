import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const port = Number(process.env.PORT || 10000);
const apiKey = process.env.MTP2026_RUNTIME_API_KEY || '';
const publicUrl = String(process.env.MTP2026_RUNTIME_PUBLIC_URL || '').replace(/\/$/, '');
const releaseBase = String(process.env.MTP2026_RELEASE_BASE_URL || 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test').replace(/\\/+$/, '');
const root = process.env.MTP2026_RUNTIME_DATA_DIR || '/var/lib/mtp2026';
const tempRoot = '/tmp/mtp2026-guests';
const maxGuests = Math.max(1, Math.min(8, Number(process.env.MTP2026_MAX_GUESTS || 4)));
const profiles = new Set(['mtp2026', 'android', 'desktop', 'gaming']);
const sessions = new Map();
const safeId = v => /^[a-zA-Z0-9_-]{12,100}$/.test(String(v || ''));
const jsonError = (res, code, status=400) => res.status(status).json({ error: code });
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

let mediaHealthCache = { checkedAt: 0, ready: false, profiles: [], error: 'BOOT_MEDIA_NOT_CHECKED' };
async function checkBootMedia() {
  if (Date.now() - mediaHealthCache.checkedAt < 30000) return mediaHealthCache;
  try {
    const response = await fetch(`${releaseBase}/physical-test-manifest.json`, { redirect:'follow', signal:AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`PHYSICAL_TEST_MANIFEST_HTTP_${response.status}`);
    const manifest = await response.json();
    if (manifest.schema !== 'mtp2026-physical-arm64-test-v2') throw new Error('PHYSICAL_TEST_MANIFEST_SCHEMA_INVALID');
    const readyProfiles = [...profiles].filter(id => {
      const item = manifest.guests?.[id];
      return item?.architecture === 'arm64' && item?.imageSource?.kind === 'arm64-qemu-guest-bundle' && /^[a-f0-9]{64}$/i.test(String(item?.imageSource?.sha256 || ''));
    });
    if (readyProfiles.length !== profiles.size) throw new Error('GUEST_BOOT_MEDIA_INCOMPLETE');
    mediaHealthCache = { checkedAt:Date.now(), ready:true, profiles:readyProfiles, error:null };
  } catch(error) {
    mediaHealthCache = { checkedAt:Date.now(), ready:false, profiles:[], error:String(error?.message||error) };
  }
  return mediaHealthCache;
}
app.get('/health', async (_req,res) => {
  const media = await checkBootMedia();
  res.set('Cache-Control','no-store').json({
    ok:true,
    service:'mtp2026-qemu-runtime',
    engine:'qemu-system-aarch64',
    configured:Boolean(apiKey && publicUrl && /^https:\\/\\//.test(publicUrl)),
    bootMediaReady:media.ready,
    bootMediaProfiles:media.profiles,
    bootMediaError:media.error,
    profiles:[...profiles],
    activeGuests:sessions.size,
    capacity:maxGuests
  });
});
app.use('/novnc', express.static('/usr/share/novnc', { fallthrough:false, index:false, maxAge:'1h' }));
app.get('/viewer/:token', (req,res) => {
  const guest = [...sessions.values()].find(s => s.viewerToken === req.params.token && s.confirmed);
  if (!guest) return jsonError(res,'VIEWER_TOKEN_INVALID',404);
  const base = publicUrl || `${req.protocol}://${req.get('host')}`;
  res.redirect(302, `${base}/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=ws/${encodeURIComponent(guest.viewerToken)}`);
});
function internal(req,res,next) {
  if (!apiKey || req.get('authorization') !== `Bearer ${apiKey}`) return jsonError(res,'RUNTIME_UNAUTHORIZED',401);
  next();
}
async function sha256File(file) {
  const hash=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{ const input=fs.createReadStream(file); input.on('data',d=>hash.update(d)); input.on('error',reject); input.on('end',resolve); });
  return hash.digest('hex');
}
async function downloadBundle(profile, file) {
  const url = `${releaseBase}/mtp2026-${profile}-arm64-guest.tar.gz`;
  const response = await fetch(url, { redirect:'follow', signal:AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`GUEST_BUNDLE_DOWNLOAD_${response.status}`);
  const temp = file + '.part';
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));
  await fsp.rename(temp,file);
  const manifestResponse = await fetch(`${releaseBase}/physical-test-manifest.json`, { redirect:'follow', signal:AbortSignal.timeout(20000) });
  if (!manifestResponse.ok) throw new Error('PHYSICAL_TEST_MANIFEST_UNAVAILABLE');
  const manifest = await manifestResponse.json();
  const expected = manifest.guests?.[profile]?.imageSource?.sha256;
  if (!/^[a-f0-9]{64}$/i.test(String(expected||''))) throw new Error('GUEST_BUNDLE_CHECKSUM_MISSING');
  const actual = await sha256File(file);
  if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error('GUEST_BUNDLE_CHECKSUM_MISMATCH');
  return actual;
}
function waitForBoot(session, timeoutMs=90000) {
  return new Promise(resolve=>{
    const started=Date.now();
    const timer=setInterval(async()=>{
      if (session.process.exitCode !== null) { clearInterval(timer); resolve(false); return; }
      let log=''; try { log=await fsp.readFile(session.logFile,'utf8'); } catch {}
      if (/MTP2026 GUEST SYSTEM/.test(log) && /MTP2026 GUI COMPOSITOR STARTED/.test(log)) {
        session.confirmed=true; session.status='running'; session.bootConfirmedAt=new Date().toISOString();
        clearInterval(timer); resolve(true); return;
      }
      if (Date.now()-started >= timeoutMs) { clearInterval(timer); resolve(false); }
    },500);
  });
}
async function stopSession(s) {
  if (!s) return;
  s.status='stopping';
  try { s.process.kill('SIGTERM'); } catch {}
  await Promise.race([new Promise(resolve=>s.process.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4000))]);
  if (s.process.exitCode === null) { try { s.process.kill('SIGKILL'); } catch {} }
  for (const ws of s.viewers) { try { ws.close(1001,'Guest stopped'); } catch {} }
  sessions.delete(s.id);
  if (s.bundleDir) await fsp.rm(s.bundleDir,{recursive:true,force:true}).catch(()=>{});
}
app.post('/internal/start',internal,async(req,res)=>{
  const profile=String(req.body?.profile||'');
  const ownerId=String(req.body?.ownerId||'');
  const id=String(req.body?.sessionId||'');
  if (!publicUrl || !/^https:\/\//.test(publicUrl)) return jsonError(res,'RUNTIME_PUBLIC_URL_NOT_CONFIGURED',503);
  if (!profiles.has(profile)) return jsonError(res,'GUEST_PROFILE_INVALID');
  if (!ownerId || ownerId.length>160 || !safeId(id)) return jsonError(res,'GUEST_SESSION_INVALID');
  if (sessions.size>=maxGuests) return jsonError(res,'RUNTIME_CAPACITY_REACHED',429);
  if ([...sessions.values()].some(s=>s.ownerId===ownerId && s.profile===profile)) return jsonError(res,'GUEST_ALREADY_RUNNING',409);
  const display=[...Array(maxGuests+4).keys()].map(i=>i+1).find(n=>![...sessions.values()].some(s=>s.display===n));
  if (!display) return jsonError(res,'RUNTIME_DISPLAY_CAPACITY_REACHED',429);
  const bundleDir=path.join(tempRoot,id);
  try {
    await fsp.mkdir(bundleDir,{recursive:true});
    const bundle=path.join(bundleDir,'guest.tar.gz');
    const checksum=await downloadBundle(profile,bundle);
    const allowedFiles=new Set([`mtp2026-${profile}-arm64-linux.Image`,`mtp2026-${profile}-initramfs.cpio.gz`,'mtp2026-arm64-boot-firmware.bin',`mtp2026-${profile}-boot-disk.img`,'firmware-manifest.json','boot-manifest.json']);
    const listing=spawn('tar',['-tzf',bundle],{stdio:['ignore','pipe','ignore']});
    let entries=''; listing.stdout.setEncoding('utf8'); listing.stdout.on('data',chunk=>{entries+=chunk;});
    const listCode=await new Promise((resolve,reject)=>{listing.once('error',reject);listing.once('exit',resolve);});
    if(listCode!==0||entries.trim().split('\n').some(name=>!allowedFiles.has(name)||name.includes('..')||name.includes('/'))) throw new Error('GUEST_BUNDLE_CONTENTS_INVALID');
    await new Promise((resolve,reject)=>{const p=spawn('tar',['-xzf',bundle,'-C',bundleDir,'--no-same-owner','--no-same-permissions'],{stdio:'ignore'});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error('GUEST_BUNDLE_EXTRACT_FAILED')));});
    await fsp.rm(bundle,{force:true});
    const kernel=`mtp2026-${profile}-arm64-linux.Image`;
    const initrd=`mtp2026-${profile}-initramfs.cpio.gz`;
    const firmware='mtp2026-arm64-boot-firmware.bin';
    const bootDisk=`mtp2026-${profile}-boot-disk.img`;
    for (const name of [kernel,initrd,firmware,bootDisk]) if (!(await fsp.stat(path.join(bundleDir,name)).catch(()=>null))?.isFile()) throw new Error('GUEST_BUNDLE_FILE_MISSING_'+name);
    const ownerKey=crypto.createHash('sha256').update(ownerId).digest('hex').slice(0,32);
    const dataDir=path.join(root,'users',ownerKey);
    await fsp.mkdir(dataDir,{recursive:true});
    const dataDisk=path.join(dataDir,`${profile}.qcow2`);
    if (!(await fsp.stat(dataDisk).catch(()=>null))) {
      const q=spawn('qemu-img',['create','-f','qcow2',dataDisk,profile==='gaming'?'16G':profile==='desktop'?'8G':'4G'],{stdio:'ignore'});
      const code=await new Promise((resolve,reject)=>{q.once('error',reject);q.once('exit',resolve);});
      if (code!==0) throw new Error('GUEST_DATA_DISK_CREATE_FAILED');
    }
    const logFile=path.join(bundleDir,'serial.log');
    const args=['-name',`mtp2026-${profile}-${id}`,'-M','virt','-cpu','cortex-a72','-m',profile==='gaming'?'4096':'2048','-display','none','-vnc',`127.0.0.1:${display}`,'-serial',`file:${logFile}`,'-bios',path.join(bundleDir,firmware),'-drive',`if=none,id=bootdisk,format=raw,file=${path.join(bundleDir,bootDisk)}`,'-device','virtio-blk-device,drive=bootdisk','-drive',`if=none,id=datadisk,format=qcow2,file=${dataDisk}`,'-device','virtio-blk-device,drive=datadisk','-device','virtio-gpu-pci','-device','virtio-keyboard-pci','-device','virtio-mouse-pci','-device','virtio-tablet-pci','-device','virtio-net-device,netdev=net0','-netdev','user,id=net0','-audiodev','driver=none,id=mtp2026audio','-device','virtio-sound-device,audiodev=mtp2026audio'];
    const child=spawn('qemu-system-aarch64',args,{stdio:'ignore'});
    const guest={id,profile,ownerId,display,port:5900+display,viewerToken:crypto.randomBytes(32).toString('base64url'),process:child,status:'booting',confirmed:false,viewers:new Set(),bundleDir,logFile,checksum,startedAt:new Date().toISOString()};
    sessions.set(id,guest);
    child.once('exit',()=>{if(guest.status!=='stopping'){guest.status='stopped';guest.confirmed=false;}});
    const ready=await waitForBoot(guest,90000);
    if (!ready) { const log=await fsp.readFile(logFile,'utf8').catch(()=> ''); await stopSession(guest); await fsp.rm(bundleDir,{recursive:true,force:true}).catch(()=>{}); return res.status(504).json({error:'GUEST_BOOT_NOT_CONFIRMED',detail:log.slice(-2500)}); }
    return res.status(201).json({sessionId:id,profile,architecture:'arm64',provider:'remote-qemu-system-aarch64',realGuest:true,ready:true,running:true,bootConfirmedAt:guest.bootConfirmedAt,viewerUrl:`${publicUrl}/viewer/${guest.viewerToken}`,bundleSha256:checksum});
  } catch(error) {
    const detail=String(error?.message||error);
    const s=sessions.get(id); if(s) await stopSession(s);
    await fsp.rm(bundleDir,{recursive:true,force:true}).catch(()=>{});
    return res.status(502).json({error:'GUEST_START_FAILED',detail});
  }
});
app.get('/internal/status/:id',internal,(req,res)=>{
  const s=sessions.get(req.params.id);
  if(!s || s.ownerId!==String(req.query.ownerId||'')) return jsonError(res,'GUEST_SESSION_NOT_FOUND',404);
  res.json({sessionId:s.id,profile:s.profile,status:s.status,running:s.status==='running'&&s.confirmed,ready:s.confirmed,realGuest:s.confirmed,provider:'remote-qemu-system-aarch64',startedAt:s.startedAt,bootConfirmedAt:s.bootConfirmedAt||null});
});
app.post('/internal/stop/:id',internal,async(req,res)=>{
  const s=sessions.get(req.params.id);
  if(!s || s.ownerId!==String(req.body?.ownerId||'')) return jsonError(res,'GUEST_SESSION_NOT_FOUND',404);
  await stopSession(s);
  res.json({ok:true,sessionId:req.params.id,status:'stopped'});
});
server.on('upgrade',(req,socket,head)=>{
  const match=/^\/ws\/([A-Za-z0-9_-]+)$/.exec(new URL(req.url,'http://runtime.local').pathname);
  const guest=match?[...sessions.values()].find(s=>s.viewerToken===match[1]&&s.confirmed):null;
  if(!guest){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{
    const tcp=net.createConnection({host:'127.0.0.1',port:guest.port});
    guest.viewers.add(ws);
    tcp.on('data',data=>{if(ws.readyState===ws.OPEN)ws.send(data,{binary:true});});
    ws.on('message',data=>{if(!tcp.destroyed)tcp.write(Buffer.from(data));});
    const cleanup=()=>{guest.viewers.delete(ws);tcp.destroy();};
    ws.on('close',cleanup);ws.on('error',cleanup);tcp.on('error',()=>ws.close());tcp.on('close',()=>ws.close());
  });
});
server.listen(port,'0.0.0.0',()=>console.log(`MTP2026 QEMU runtime listening on ${port}`));
