import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowUpRight, Cpu, Gamepad2, HardDrive, Monitor, RefreshCw, ShieldCheck, Smartphone, TriangleAlert, Wifi } from 'lucide-react';
import './style.css';

const API = String(import.meta.env.VITE_API_BASE_URL || 'https://mtp2026-app-launcher-backend.onrender.com').replace(/\/$/, '');
const SYSTEMS = [
  { id: 'desktop', title: 'MTP2026 Desktop OS', detail: 'Desktop shell and productivity profile', url: 'https://mtp2026-desktopos-peun.onrender.com', icon: Monitor },
  { id: 'gaming', title: 'MTP2026 Gaming OS', detail: 'Gaming-oriented independent frontend', url: 'https://mtp2026-rog-gaming-os.onrender.com', icon: Gamepad2 },
  { id: 'android', title: 'MTP2026 Android OS', detail: 'Mobile profile and package handoff', url: 'https://mtp2026-android-os.onrender.com', icon: Smartphone },
  { id: 'mtp2026', title: 'MTP2026 Device OS', detail: 'General-purpose mobile/device profile', url: 'https://mtp2026-device-os.onrender.com', icon: Cpu },
];
function App() {
  const [health, setHealth] = useState({ state: 'checking' });
  const [manifest, setManifest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    const results = await Promise.allSettled([
      fetch(API + '/api/health', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Backend health HTTP ' + r.status); return r.json(); }),
      fetch(API + '/api/guest-runtime-manifest', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Guest manifest HTTP ' + r.status); return r.json(); })
    ]);
    if (results[0].status === 'fulfilled') setHealth({ state: 'online', ...results[0].value });
    else { setHealth({ state: 'offline' }); setError(results[0].reason?.message || 'Backend is unreachable.'); }
    if (results[1].status === 'fulfilled') setManifest(results[1].value);
    else { setManifest(null); setError(prev => [prev, results[1].reason?.message].filter(Boolean).join(' ')); }
    setCheckedAt(new Date());
    setBusy(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const guestIds = useMemo(() => Object.keys(manifest?.guests || {}), [manifest]);
  const hasEmulator = Boolean(window.MTP2026NativeGuestRuntime?.bootGuest || window.MTP2026QemuWasmRuntime?.boot);
  const hasImageSources = SYSTEMS.every(s => {
    const g = manifest?.guests?.[s.id];
    return Boolean(g?.imageSource?.url && g?.imageSource?.sha256);
  });
  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="MTP2026 App Launcher home"><span className="brandmark">M</span><span><b>MTP2026</b><small>APP LAUNCHER · HOST</small></span></a>
      <div className="top-actions"><span className={'health-pill ' + health.state}><i />{health.state === 'online' ? 'Backend connected' : health.state === 'checking' ? 'Checking backend' : 'Backend unavailable'}</span><button className="icon-button" onClick={refresh} disabled={busy} title="Refresh status"><RefreshCw size={17} className={busy ? 'spin' : ''}/></button></div>
    </header>
    <section className="hero">
      <div className="eyebrow"><ShieldCheck size={15}/> SHARED IDENTITY · INDEPENDENT OS SITES</div>
      <h1>Your systems.<br/><span>One control center.</span></h1>
      <p>Manage access to each separately deployed MTP2026 frontend. The host does not automatically boot a guest when you sign in. Choose a system to open its own site.</p>
      <div className="hero-stats">
        <div><small>OS frontends</small><strong>4 independent sites</strong></div>
        <div><small>Identity</small><strong>VexaAccount SSO</strong></div>
        <div><small>Backend</small><strong>{health.database ? 'Connected · TiDB' : health.state === 'online' ? 'Online · DB not confirmed' : 'Not reachable'}</strong></div>
      </div>
    </section>
    <section className="section-head"><div><span className="eyebrow">OS LIBRARY</span><h2>Installed environments</h2></div><span className="muted">Open independently ↗</span></section>
    <section className="system-grid">
      {SYSTEMS.map(s => { const Icon=s.icon; const g=manifest?.guests?.[s.id]; return <article className="system-card" key={s.id}>
        <div className="card-top"><span className="system-icon"><Icon size={22}/></span><span className={'runtime-tag ' + (g ? 'configured' : 'unknown')}>{g ? 'Manifest found' : 'Runtime unverified'}</span></div>
        <h3>{s.title}</h3><p>{s.detail}</p>
        <div className="card-meta"><span><HardDrive size={14}/>{g?.architecture?.toUpperCase() || 'ARM64 target'}</span><span><Activity size={14}/>{g?.runtimeBackend || 'Runtime not reported'}</span></div>
        <a className="launch-link" href={s.url} target="_blank" rel="noreferrer">Open {s.title.replace('MTP2026 ','')} <ArrowUpRight size={16}/></a>
      </article>; })}
    </section>
    <section className="runtime-panel">
      <div className="runtime-title"><span className="system-icon"><Cpu size={22}/></span><div><span className="eyebrow">VIRTUALIZATION</span><h2>Full-system runtime diagnostics</h2></div></div>
      <div className="runtime-warning"><TriangleAlert size={20}/><div><b>{hasEmulator ? 'A runtime provider is present in this host context' : 'Full-system emulator is not attached to this host page'}</b><p>{hasEmulator ? 'A provider was detected in this browser context. Each OS still needs a compatible boot image and a confirmed boot result.' : 'The static host cannot itself execute ARM64 guest instructions. A QEMU system-emulator build or a native/remote VM runner must be deployed and connected before a guest can truthfully be marked running.'}</p></div></div>
      <div className="diagnostics">
        <div><span>Backend API</span><strong className={health.state}>{health.state === 'online' ? 'Reachable' : health.state === 'checking' ? 'Checking…' : 'Unavailable'}</strong></div>
        <div><span>Guest manifest</span><strong>{manifest ? 'Loaded' : 'Not loaded'}</strong></div>
        <div><span>Profiles in shared manifest</span><strong>{guestIds.length ? guestIds.join(', ') : 'Not reported'}</strong></div>
        <div><span>Images configured for all four profiles</span><strong>{hasImageSources ? 'Yes' : 'Not confirmed'}</strong></div>
        <div><span>Actual QEMU/native provider in host context</span><strong>{hasEmulator ? 'Detected' : 'Missing'}</strong></div>
      </div>
      {error && <p className="error-note">{error}</p>}
      <p className="small-note">A configured manifest or a “100% boot” animation is not proof of OS execution. MTP2026 reports real guest status only when an emulator confirms the boot. Last checked: {checkedAt ? checkedAt.toLocaleTimeString() : 'not yet checked'}.</p>
    </section>
    <footer><span>MTP2026 App Launcher · Host control plane</span><span><Wifi size={14}/> Shared backend, separate frontends</span></footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
