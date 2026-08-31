import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Plus, Star, RefreshCw, Bell, ChevronDown, Menu, X, ExternalLink, CheckCircle2, Globe2, LogIn, LogOut, Settings, Clock3, Grid2X2, Sparkles, Download, Trash2 } from 'lucide-react';
import './styles.css';
import { API, startVexaLogin, finishVexaLogin, accessToken, signOut } from './auth';

function storedProfile() { try { return JSON.parse(localStorage.getItem('mtp_profile') || 'null'); } catch { return null; } }
function initials(profile) { const name = profile?.name || profile?.email || 'Vexa Creator'; return name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); }

function App() {
  const [apps, setApps] = useState([]);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(storedProfile());
  const [menu, setMenu] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [logged, setLogged] = useState(Boolean(accessToken()));
  const [view, setView] = useState('launcher');
  const [filter, setFilter] = useState('all');
  const [recentApps, setRecentApps] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);

  const headers = () => { const t = accessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

  const load = async (silent = false) => {
    if (!accessToken()) { setApps([]); setRecentApps([]); return; }
    if (!silent) setSyncing(true);
    try {
      const [libraryResponse, recentResponse] = await Promise.all([
        fetch(`${API}/apps`, { headers: headers() }),
        fetch(`${API}/apps/recent`, { headers: headers() })
      ]);
      if (libraryResponse.status === 401 || recentResponse.status === 401) { logout(); throw new Error('Your VexaAccount session has expired.'); }
      if (!libraryResponse.ok) throw new Error('Unable to load your application library.');
      setApps(await libraryResponse.json());
      if (recentResponse.ok) setRecentApps(await recentResponse.json());
      setError('');
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };

  useEffect(() => {
    finishVexaLogin().then(d => { if (d?.profile) { setProfile(d.profile); setLogged(true); } return load(true); }).catch(e => setError(e.message));
    const handler = e => { e.preventDefault?.(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => { if (logged && view === 'recent') load(true); }, [logged, view]);

  async function login() { setError(''); try { await startVexaLogin(); } catch (e) { setError(e.message); } }
  function logout() { signOut(); setLogged(false); setProfile(null); setApps([]); setRecentApps([]); setMenu(false); }

  async function add() {
    let parsed;
    try { parsed = new URL(url.trim()); } catch { setError('Please enter a valid HTTPS URL.'); return; }
    if (parsed.protocol !== 'https:') { setError('Only HTTPS application URLs are accepted.'); return; }
    setError(''); setLoading(true);
    try {
      const r = await fetch(`${API}/apps`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ url: parsed.toString() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create application.');
      setUrl(''); setShowAdd(false); await load(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function patch(id, key, value) {
    try {
      const r = await fetch(`${API}/apps/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ [key]: value }) });
      if (r.status === 401) return logout();
      if (!r.ok) throw new Error('Could not update application.');
      await load(true);
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    try {
      const r = await fetch(`${API}/apps/${id}`, { method: 'DELETE', headers: headers() });
      if (r.status === 401) return logout();
      if (!r.ok) throw new Error('Could not remove application.');
      await load(true);
    } catch (e) { setError(e.message); }
  }

  async function openApp(app) {
    try {
      const r = await fetch(`${API}/apps/${app.id}/open`, { method: 'POST', headers: headers() });
      if (r.status === 401) return logout();
      if (!r.ok) throw new Error('Could not record recent activity.');
      setRecentApps(prev => [app, ...prev.filter(x => x.id !== app.id)]);
      setApps(prev => prev.map(x => x.id === app.id ? { ...x, lastOpenedAt: new Date().toISOString() } : x));
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e.message);
      window.open(app.url, '_blank', 'noopener,noreferrer');
    }
  }

  async function install() { if (!installPrompt) return; await installPrompt.prompt(); setInstallPrompt(null); }

  const filtered = useMemo(() => {
    let list = view === 'recent' ? recentApps : apps;
    if (view === 'favorites') list = list.filter(a => a.favorite);
    if (filter === 'favorite') list = list.filter(a => a.favorite);
    if (filter === 'pwa') list = list.filter(a => a.pwaSupported);
    if (filter === 'web') list = list.filter(a => !a.pwaSupported);
    const q = query.trim().toLowerCase();
    return list.filter(a => `${a.title} ${a.url} ${a.description || ''} ${a.category || ''}`.toLowerCase().includes(q));
  }, [apps, recentApps, query, view, filter]);

  const name = profile?.name || profile?.email || 'Vexa Creator';
  const validPreview = (() => { try { const p = new URL(url); return p.protocol === 'https:' ? p : null; } catch { return null; } })();
  const recentIds = new Set(recentApps.map(a => a.id));

  function nav(next) { setView(next); setSidebar(false); setQuery(''); setFilter('all'); if (next === 'recent' && logged) load(true); }

  return <div className="app-shell">
    <div className={`mobile-overlay ${sidebar ? 'show' : ''}`} onClick={() => setSidebar(false)} />
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span>M</span></div><div><strong>MTP2026</strong><small>App Launcher</small></div></div>
      <div className="nav-label">Workspace</div>
      <nav className="nav">
        <button className={view === 'launcher' ? 'active' : ''} onClick={() => nav('launcher')}><Grid2X2 className="ico"/> Launcher</button>
        <button className={view === 'applications' ? 'active' : ''} onClick={() => nav('applications')}><Grid2X2 className="ico"/> Applications</button>
        <button className={view === 'favorites' ? 'active' : ''} onClick={() => nav('favorites')}><Star className="ico"/> Favorites</button>
        <button className={view === 'recent' ? 'active' : ''} onClick={() => nav('recent')}><Clock3 className="ico"/> Recent</button>
      </nav>
      <div className="nav-spacer" />
      {installPrompt && <button className="install-side" onClick={install}><Download/><span><b>Install MTP2026</b><small>Install launcher PWA</small></span></button>}
      <div className="sync-card"><div className="sync-top"><span><i className="dot"/> Cloud Synced</span><span>{logged ? 'LIVE' : 'OFFLINE'}</span></div><p>VexaAccount library synchronization</p><div className="sync-bar"><span className={syncing ? 'busy' : ''}/></div></div>
      <button className="profile-mini" onClick={() => setMenu(v => !v)}><div className="avatar">{initials(profile)}</div><span><b>{name}</b><small>VexaAccount · {logged ? 'Connected' : 'Not signed in'}</small></span><ChevronDown className="profile-chevron"/></button>
      {menu && <div className="account-menu"><div className="account-head"><div className="avatar">{initials(profile)}</div><div><b>{name}</b><small>{profile?.email || 'VexaAccount'}</small></div></div><hr/>{logged ? <button onClick={logout}><LogOut/> Sign out</button> : <button onClick={login}><LogIn/> Sign in with VexaAccount</button>}<button onClick={() => setError('Settings will use VexaAccount profile preferences in the next integration step.')}><Settings/> Settings</button></div>}
    </aside>

    <main className="main">
      <header className="topbar">
        <button className="icon-btn mobile-menu" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu/></button>
        <div className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search applications..."/><kbd>⌘ K</kbd></div>
        <div className="top-actions"><button className="icon-btn" onClick={() => load()} title="Sync"><RefreshCw className={syncing ? 'spin' : ''}/></button><button className="icon-btn notification" onClick={() => setError('No new notifications.')} title="Notifications"><Bell/><i/></button><button className="account-btn" onClick={() => setMenu(v => !v)}><div className="avatar">{initials(profile)}</div><span>{name}</span><ChevronDown/></button></div>
      </header>

      <section className="hero"><div><div className="eyebrow">VexaAccount · Cloud Workspace</div><h1>Your <span>digital universe.</span></h1><p>One elegant home for every application you use. Your MTP2026 library follows your VexaAccount across phone, tablet, laptop and desktop.</p></div><div className="hero-orbit"><div className="ring"/><div className="ring r2"/><div className="orb"/></div></section>

      <div className="apps-header"><div><div className="section-title">{view === 'favorites' ? 'Favorite Applications' : view === 'recent' ? 'Recently Opened' : 'My Applications'} <small>{view === 'recent' ? recentApps.length : apps.length} {(view === 'recent' ? recentApps.length : apps.length) === 1 ? 'app' : 'apps'}</small></div><p>Your personal cloud-synchronized application library</p></div><button className="primary-add" onClick={() => { setError(''); setShowAdd(true); }} disabled={!logged}><span>＋</span> Add Application</button></div>
      {!logged && <div className="login-banner"><div><Sparkles/><div><b>Connect your VexaAccount</b><span>Sign in to synchronize your application library across devices.</span></div></div><button onClick={login}><LogIn/> Sign in</button></div>}
      {error && <div className="error"><X/> <span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      <div className="control-row"><div className="filters">{[['all','All'],['favorite','Favorites'],['pwa','PWA Ready'],['web','Web Apps']].map(([id,label]) => <button key={id} className={`filter ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      <section className="grid">
        {filtered.map((a, i) => <article className={`card ${recentIds.has(a.id) ? 'recent-card' : ''}`} key={a.id} style={{ animationDelay: `${i * 35}ms` }} onClick={() => openApp(a)}>
          <div className="card-top"><div className="app-icon">{a.iconUrl ? <img src={a.iconUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }}/>: <Globe2/>}</div><button className={`fav ${a.favorite ? 'on' : ''}`} onClick={e => { e.stopPropagation(); patch(a.id, 'favorite', !a.favorite); }}>{a.favorite ? '★' : '☆'}</button></div>
          <h3>{a.title}</h3><div className="domain">{(() => { try { return new URL(a.url).hostname; } catch { return a.url; } })()}</div><p className="desc">{a.description || 'Web application in your MTP2026 library.'}</p>
          <div className="card-bottom">{a.pwaSupported ? <span className="pwa"><CheckCircle2/> PWA Ready</span> : <span className="web">Web App</span>}<div className="card-actions"><button onClick={e => { e.stopPropagation(); patch(a.id, 'favorite', !a.favorite); }} className={a.favorite ? 'active' : ''}><Star/></button><button onClick={e => { e.stopPropagation(); remove(a.id); }}><Trash2/></button><button className="launch" onClick={e => { e.stopPropagation(); openApp(a); }}>Open <ExternalLink/></button></div></div>
          {a.lastOpenedAt && <div className="last-opened"><Clock3/> {new Date(a.lastOpenedAt).toLocaleString()}</div>}
        </article>)}
        {!filtered.length && <div className="empty-state"><div className="empty-icon">◌</div><h3>{logged ? (view === 'recent' ? 'Nothing opened recently' : 'No applications found') : 'Sign in to open your library'}</h3><p>{logged ? 'Try another filter or add a new application.' : 'Your MTP2026 applications will appear here after VexaAccount SSO.'}</p>{logged && view !== 'recent' && <button className="primary-add" onClick={() => setShowAdd(true)}>＋ Add Application</button>}</div>}
      </section>

      <section className="stats"><div className="stat"><small>Applications</small><b>{apps.length}</b></div><div className="stat"><small>PWA Ready</small><b>{apps.filter(a => a.pwaSupported).length}<em>●</em></b></div><div className="stat"><small>Favorites</small><b>{apps.filter(a => a.favorite).length}</b></div><div className="stat"><small>Sync Status</small><b className="status-value">Cloud <em>● Online</em></b></div></section>
      <footer>MTP2026 App Launcher · Connected through VexaAccount · Cloud library</footer>
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowAdd(false)}><div className="modal"><div className="modal-head"><div><h2>Add Application</h2><p>Add any legitimate web application to your MTP2026 cloud library.</p></div><button className="close" onClick={() => setShowAdd(false)}><X/></button></div><div className="modal-body"><label className="url-label">APPLICATION URL</label><div className="url-wrap"><Globe2/><input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-application.com"/></div><div className={`url-status ${url && !validPreview ? 'invalid' : validPreview ? 'valid' : ''}`}>{!url ? 'Enter a secure HTTPS application URL.' : validPreview ? '✓ Valid HTTPS application URL detected.' : 'Please enter a valid HTTPS URL.'}</div>{validPreview && <div className="preview show"><div className="preview-icon">🌐</div><div><b>{validPreview.hostname.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</b><small>{validPreview.hostname}</small></div></div>}<div className="detect-box"><div>✓ Website title detection</div><div>✓ Favicon detection</div><div>✓ PWA manifest detection</div><div>✓ Installability indicators</div></div><div className="info-box">MTP2026 supports arbitrary legitimate web applications. The server validates HTTPS URLs and safely checks public metadata; PWA detection is used when the application's public manifest is available.</div><div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn primary" disabled={!validPreview || loading || !logged} onClick={add}>{loading ? 'Creating...' : 'Create Application'}</button></div></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
