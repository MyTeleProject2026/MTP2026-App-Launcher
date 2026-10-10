import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowUpRight, Cpu, Download, Gamepad2, HardDrive, Monitor, RefreshCw, ShieldCheck, Smartphone, TriangleAlert, Wifi, X, Star, Clock3 } from 'lucide-react';
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
  const [runtime, setRuntime] = useState({ state: 'checking' });
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const [error, setError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const [installing, setInstalling] = useState(false);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('mtp2026-host-favorites') || '[]'); } catch { return []; } });
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('mtp2026-host-recent') || '[]'); } catch { return []; } });
  const [installedApps, setInstalledApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState('');
  const [activeWebApp, setActiveWebApp] = useState(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appReloadToken, setAppReloadToken] = useState(0);
  const toggleFavorite = id => setFavorites(current => { const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]; localStorage.setItem('mtp2026-host-favorites', JSON.stringify(next)); return next; });
  const recordLaunch = id => setRecent(current => { const next = [id, ...current.filter(x => x !== id)].slice(0, 5); localStorage.setItem('mtp2026-host-recent', JSON.stringify(next)); return next; });
  useEffect(() => {
    const onBeforeInstall = event => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); setInstallHelp(false); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const loadInstalledApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const response = await fetch(API + '/api/apps', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Application library HTTP ' + response.status);
      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.apps) ? payload.apps : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.apps) ? payload.data.apps : [];
      const safeApps = list.filter(app => app && app.url).map(app => {
        try { const url = new URL(String(app.url)); if (url.protocol !== 'https:') return null; return { ...app, url: url.toString(), title: String(app.title || app.name || url.hostname), name: String(app.name || app.title || url.hostname) }; } catch { return null; }
      }).filter(Boolean).filter((app, index, all) => all.findIndex(other => other.url === app.url) === index);
      setInstalledApps(safeApps);
      setAppsError('');
    } catch (error) {
      setAppsError(String(error?.message || 'Could not load the installed WebApp library.'));
    } finally { setAppsLoading(false); }
  }, []);
  useEffect(() => {
    loadInstalledApps();
    const onFocus = () => loadInstalledApps();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadInstalledApps]);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const installApp = async () => {
    if (installPrompt) {
      setInstalling(true);
      try { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
      finally { setInstalling(false); }
    } else setInstallHelp(true);
  };
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    const results = await Promise.allSettled([
      fetch(API + '/api/health', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Backend health HTTP ' + r.status); return r.json(); }),
      fetch(API + '/api/guest-runtime-manifest', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Guest manifest HTTP ' + r.status); return r.json(); }),
      fetch(API + '/api/runtime/health', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Remote QEMU runtime HTTP ' + r.status); return r.json(); })
    ]);
    if (results[0].status === 'fulfilled') setHealth({ state: 'online', ...results[0].value });
    else { setHealth({ state: 'offline' }); setError(results[0].reason?.message || 'Backend is unreachable.'); }
    if (results[1].status === 'fulfilled') setManifest(results[1].value);
    else { setManifest(null); setError(prev => [prev, results[1].reason?.message].filter(Boolean).join(' ')); }
    if (results[2].status === 'fulfilled' && results[2].value?.engine === 'qemu-system-aarch64') {
      const value = results[2].value;
      setRuntime({ state: value.configured && value.bootMediaReady ? 'online' : 'incomplete', ...value });
    } else setRuntime({ state: 'unavailable', error: results[2].reason?.message || results[2].value?.error || 'Remote QEMU runtime is not configured.' });
    setCheckedAt(new Date());
    setBusy(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const guestIds = useMemo(() => Object.keys(manifest?.guests || {}), [manifest]);
  const hasEmulator = runtime.state === 'online' && runtime.engine === 'qemu-system-aarch64' && runtime.configured === true && runtime.bootMediaReady === true;
  const hasImageSources = SYSTEMS.every(s => {
    const g = manifest?.guests?.[s.id];
    return Boolean(g?.imageSource?.url && g?.imageSource?.sha256);
  });
  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="MTP2026 App Launcher home"><span className="brandmark">M</span><span><b>MTP2026</b><small>APP LAUNCHER · HOST</small></span></a>
      <div className="top-actions">{!isInstalled && <button className="install-button" onClick={installApp} disabled={installing}><Download size={15}/>{installing ? 'Opening…' : 'Install app'}</button>}<span className={'health-pill ' + health.state}><i />{health.state === 'online' ? 'Backend connected' : health.state === 'checking' ? 'Checking backend' : 'Backend unavailable'}</span><button className="icon-button" onClick={refresh} disabled={busy} title="Refresh status"><RefreshCw size={17} className={busy ? 'spin' : ''}/></button></div>
    </header>
    {installHelp && !isInstalled && <div className="install-overlay" role="presentation" onClick={event => { if (event.target === event.currentTarget) setInstallHelp(false); }}><section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="install-close" onClick={() => setInstallHelp(false)} aria-label="Close install instructions"><X size={18}/></button><img src="/mtp2026-icon.svg" alt="MTP2026 app icon"/><h2 id="install-title">Install MTP2026</h2><p>Add the Host Dashboard to your home screen for an app-style launch.</p>{isIOS ? <ol><li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> to finish.</li></ol> : <ol><li>Open your browser menu (⋮).</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm the installation prompt.</li></ol>}<button className="install-primary" onClick={() => setInstallHelp(false)}>Got it</button></section></div>}
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
    <section className="section-head"><div><span className="eyebrow">QUICK ACCESS</span><h2>Favorites & recent</h2></div><span className="muted"><Star size={13}/> {favorites.length} favorites · <Clock3 size={13}/> {recent.length} recent</span></section>
    {(favorites.length > 0 || recent.length > 0) && <section className="quick-access">{[...favorites.map(id=>({id,kind:'Favorite'})),...recent.filter(id=>!favorites.includes(id)).map(id=>({id,kind:'Recent'}))].map(item=>{const s=SYSTEMS.find(x=>x.id===item.id);if(!s)return null;return <a key={item.kind+item.id} href={s.url} target="_blank" rel="noreferrer" onClick={()=>recordLaunch(s.id)}><span>{item.kind}</span><b>{s.title}</b><ArrowUpRight size={14}/></a>})}</section>}
    <section className="system-grid">
      {SYSTEMS.map(s => { const Icon=s.icon; const g=manifest?.guests?.[s.id]; return <article className="system-card" key={s.id}>
        <div className="card-top"><span className="system-icon"><Icon size={22}/></span><span className={'runtime-tag ' + (g ? 'configured' : 'unknown')}>{g ? 'Manifest found' : 'Runtime unverified'}</span></div>
        <button className="favorite-toggle" onClick={()=>toggleFavorite(s.id)} aria-label={(favorites.includes(s.id)?'Remove':'Add')+' '+s.title+' '+(favorites.includes(s.id)?'from':'to')+' favorites'} aria-pressed={favorites.includes(s.id)}><Star size={16} fill={favorites.includes(s.id)?'currentColor':'none'}/></button><h3>{s.title}</h3><p>{s.detail}</p>
        <div className="card-meta"><span><HardDrive size={14}/>{g?.architecture?.toUpperCase() || 'ARM64 target'}</span><span><Activity size={14}/>{g?.runtimeBackend || 'Runtime not reported'}</span></div>
        <a className="launch-link" href={s.url} target="_blank" rel="noreferrer" onClick={()=>recordLaunch(s.id)}>Open {s.title.replace('MTP2026 ','')} <ArrowUpRight size={16}/></a>
      </article>; })}
    </section>
    <section className="webapp-library">
      <div className="section-head"><div><span className="eyebrow">APPLICATION LIBRARY</span><h2>Installed WebApps</h2></div><button className="icon-button" type="button" onClick={loadInstalledApps} disabled={appsLoading} title="Refresh installed WebApps"><RefreshCw size={16} className={appsLoading ? 'spin' : ''}/></button></div>
      <p className="small-note">Open installed HTTPS WebApps inside the Host Launcher’s own application window. Sites that prohibit embedded display can still be opened in a separate browser tab.</p>
      {appsError && <p className="error-note">{appsError}</p>}
      {appsLoading && installedApps.length === 0 ? <div className="webapp-empty">Loading your installed application library…</div> : installedApps.length ? <div className="webapp-grid">{installedApps.map((app, index) => <button type="button" className="webapp-card" key={app.id || app.slug || app.url} onClick={() => { setActiveWebApp(app); setAppLoading(true); }}><span className="webapp-icon">{app.userIconUrl || app.iconUrl ? <img src={app.userIconUrl || app.iconUrl} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <span>{String(app.title || app.name || 'W').slice(0,1).toUpperCase()}</span>}</span><span className="webapp-copy"><b>{app.title || app.name || 'WebApp'}</b><small>{new URL(app.url).hostname}</small></span><ArrowUpRight size={15}/></button>)}</div> : <div className="webapp-empty">No installed WebApps were returned by the shared library. Sign in to the relevant MTP2026 OS and install apps from VexaStore, then refresh this list.</div>}
    </section>
    {activeWebApp && <div className="host-webapp-overlay" role="dialog" aria-modal="true" aria-label={(activeWebApp.title || activeWebApp.name || 'WebApp') + ' application window'} onClick={event => { if (event.target === event.currentTarget) setActiveWebApp(null); }}>
      <section className="host-webapp-window">
        <header><div className="host-webapp-title"><span className="webapp-icon">{activeWebApp.userIconUrl || activeWebApp.iconUrl ? <img src={activeWebApp.userIconUrl || activeWebApp.iconUrl} alt=""/> : <span>{String(activeWebApp.title || activeWebApp.name || 'W').slice(0,1).toUpperCase()}</span>}</span><div><b>{activeWebApp.title || activeWebApp.name || 'WebApp'}</b><small>Host Launcher · in-app WebApp window</small></div></div><div className="host-webapp-actions"><button type="button" onClick={() => { setAppLoading(true); setAppReloadToken(token => token + 1); }}>↻ <span>Reload</span></button><a href={activeWebApp.url} target="_blank" rel="noopener noreferrer">↗ <span>Open in browser</span></a><button type="button" onClick={() => setActiveWebApp(null)} aria-label="Close WebApp">×</button></div></header>
        <div className="host-webapp-frame">{appLoading && <div className="host-webapp-loading">Opening {activeWebApp.title || activeWebApp.name || 'WebApp'}…</div>}<iframe key={activeWebApp.url + ':' + appReloadToken} title={activeWebApp.title || activeWebApp.name || 'MTP2026 WebApp'} src={activeWebApp.url} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation; notifications" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads" onLoad={() => setAppLoading(false)}/></div>
        <footer><span>{new URL(activeWebApp.url).hostname}</span><span>If this site blocks embedded display, choose “Open in browser”.</span></footer>
      </section>
    </div>}
    <section className="runtime-panel">
      <div className="runtime-title"><span className="system-icon"><Cpu size={22}/></span><div><span className="eyebrow">VIRTUALIZATION</span><h2>Full-system runtime diagnostics</h2></div></div>
      <div className="runtime-warning"><TriangleAlert size={20}/><div><b>{hasEmulator ? 'Remote QEMU and boot media are ready' : runtime.state === 'incomplete' ? 'Remote QEMU is reachable but not ready to boot' : 'Full-system emulator is not attached to this host page'}</b><p>{hasEmulator ? 'The remote QEMU service reports valid configuration and verified boot bundles. A guest starts only after the user presses Start.' : runtime.state === 'incomplete' ? `Runtime configuration: ${runtime.configured ? 'ready' : 'missing API key or public URL'}. Boot media: ${runtime.bootMediaReady ? 'verified' : runtime.bootMediaError || 'not verified'}.` : 'The static host cannot execute ARM64 guest instructions itself. Deploy the dedicated QEMU service and configure its runtime URL, API key, public viewer URL, and verified boot-media release.'}</p></div></div>
      <div className="diagnostics">
        <div><span>Backend API</span><strong className={health.state}>{health.state === 'online' ? 'Reachable' : health.state === 'checking' ? 'Checking…' : 'Unavailable'}</strong></div>
        <div><span>Guest manifest</span><strong>{manifest ? 'Loaded' : 'Not loaded'}</strong></div>
        <div><span>Profiles in shared manifest</span><strong>{guestIds.length ? guestIds.join(', ') : 'Not reported'}</strong></div>
        <div><span>Images configured for all four profiles</span><strong>{hasImageSources ? 'Yes' : 'Not confirmed'}</strong></div>
        <div><span>Remote QEMU runtime service</span><strong>{runtime.state === 'online' ? 'Ready' : runtime.state === 'incomplete' ? 'Needs configuration' : runtime.state === 'checking' ? 'Checking…' : 'Not connected'}</strong></div>
      </div>
      {error && <p className="error-note">{error}</p>}
      <p className="small-note">A configured manifest or a “100% boot” animation is not proof of OS execution. MTP2026 reports real guest status only when an emulator confirms the boot. Last checked: {checkedAt ? checkedAt.toLocaleTimeString() : 'not yet checked'}.</p>
    </section>
    <footer><span>MTP2026 App Launcher · Host control plane</span><span><Wifi size={14}/> Shared backend, separate frontends</span></footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
