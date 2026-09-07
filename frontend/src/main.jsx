import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Star, RefreshCw, Bell, ChevronDown, Menu, X, ExternalLink, CheckCircle2, Globe2, LogIn, LogOut, Settings, Clock3, Grid2X2, Sparkles, Download, Trash2, Check } from 'lucide-react';
import './styles.css';
import { API, startVexaLogin, finishVexaLogin, signOut } from './auth';

const defaults = { theme: 'system', defaultView: 'launcher', openBehavior: 'new_tab', compactMode: false };

function initials(profile) {
  const name = profile?.name || profile?.email || 'Vexa Creator';
  return name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function App() {
  const [apps, setApps] = useState([]);
  const [recentApps, setRecentApps] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(defaults);
  const [profile, setProfile] = useState(null);
  const [logged, setLogged] = useState(false);
  const [view, setView] = useState('launcher');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  const load = async (silent = false) => {
    if (!logged) return;
    if (!silent) setSyncing(true);
    try {
      const [library, recent, prefs, notes] = await Promise.all([
        fetch(`${API}/apps`, { credentials: 'include' }),
        fetch(`${API}/apps/recent`, { credentials: 'include' }),
        fetch(`${API}/settings`, { credentials: 'include' }),
        fetch(`${API}/notifications?limit=50`, { credentials: 'include' })
      ]);
      if ([library, recent, prefs, notes].some(r => r.status === 401)) {
        await doLogout(false);
        throw new Error('Your VexaAccount session has expired. Please sign in again.');
      }
      setApps(await json(library));
      if (recent.ok) setRecentApps(await recent.json());
      if (prefs.ok) setSettings({ ...defaults, ...(await prefs.json()) });
      if (notes.ok) setNotifications(await notes.json());
      setError('');
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };

  useEffect(() => {
    finishVexaLogin().then(async session => {
      if (session?.profile) {
        setProfile(session.profile);
        setLogged(true);
        return;
      }
      setLogged(false);
    }).catch(e => setError(e.message));
    const handler = e => { e.preventDefault?.(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => { if (logged) load(true); }, [logged]);
  useEffect(() => {
    if (settings.theme === 'dark') document.documentElement.dataset.theme = 'dark';
    else if (settings.theme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  }, [settings.theme]);

  async function login() { setError(''); await startVexaLogin(); }

  async function doLogout(redirect = true) {
    await signOut();
    setLogged(false); setProfile(null); setApps([]); setRecentApps([]); setNotifications([]); setMenu(false);
    if (redirect) window.location.assign(window.location.pathname);
  }

  async function add() {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') throw new Error('Only HTTPS application URLs are accepted.');
      setLoading(true); setError('');
      await json(await fetch(`${API}/apps`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: parsed.toString() }) }));
      setUrl(''); setShowAdd(false); await load(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function patch(id, key, value) {
    try {
      await json(await fetch(`${API}/apps/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) }));
      await load(true);
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!window.confirm('Remove this application from your launcher?')) return;
    try { await json(await fetch(`${API}/apps/${id}`, { method: 'DELETE', credentials: 'include' })); await load(true); }
    catch (e) { setError(e.message); }
  }

  async function openApp(app) {
    try {
      await json(await fetch(`${API}/apps/${app.id}/open`, { method: 'POST', credentials: 'include' }));
      setRecentApps(prev => [app, ...prev.filter(x => x.id !== app.id)]);
    } catch (e) { setError(e.message); }
    if (settings.openBehavior === 'same_tab') window.location.assign(app.url);
    else window.open(app.url, '_blank', 'noopener,noreferrer');
  }

  async function saveSetting(key, value) {
    try {
      await json(await fetch(`${API}/settings`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) }));
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (e) { setError(e.message); }
  }

  async function markRead(id) {
    try { await json(await fetch(`${API}/notifications/${id}/read`, { method: 'POST', credentials: 'include' })); setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)); }
    catch (e) { setError(e.message); }
  }

  async function markAllRead() {
    try { await json(await fetch(`${API}/notifications/read-all`, { method: 'POST', credentials: 'include' })); setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))); }
    catch (e) { setError(e.message); }
  }

  async function install() { if (installPrompt) { await installPrompt.prompt(); setInstallPrompt(null); } }

  const filtered = useMemo(() => {
    let list = view === 'recent' ? recentApps : apps;
    if (view === 'favorites') list = list.filter(a => a.favorite);
    if (filter === 'favorite') list = list.filter(a => a.favorite);
    if (filter === 'pwa') list = list.filter(a => a.pwaSupported);
    if (filter === 'web') list = list.filter(a => !a.pwaSupported);
    const q = query.trim().toLowerCase();
    return list.filter(a => `${a.title} ${a.url} ${a.description || ''} ${a.category || ''}`.toLowerCase().includes(q));
  }, [apps, recentApps, query, view, filter]);

  const unread = notifications.filter(n => !n.readAt).length;
  const name = profile?.name || profile?.email || 'Vexa Creator';
  const validPreview = (() => { try { const p = new URL(url); return p.protocol === 'https:' ? p : null; } catch { return null; } })();

  function nav(next) { setView(next); setSidebar(false); setQuery(''); setFilter('all'); }

  return <div className={`app-shell ${settings.compactMode ? 'compact-mode' : ''}`}>
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
      {menu && <div className="account-menu"><div className="account-head"><div className="avatar">{initials(profile)}</div><div><b>{name}</b><small>{profile?.email || 'VexaAccount'}</small></div></div><hr/>{logged ? <button onClick={() => doLogout()}><LogOut/> Sign out</button> : <button onClick={login}><LogIn/> Sign in with VexaAccount</button>}<button onClick={() => { setShowSettings(true); setMenu(false); }}><Settings/> Settings</button></div>}
    </aside>

    <main className="main">
      <header className="topbar">
        <button className="icon-btn mobile-menu" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu/></button>
        <div className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search applications..."/><kbd>⌘ K</kbd></div>
        <div className="top-actions"><button className="icon-btn" onClick={() => load()} title="Sync"><RefreshCw className={syncing ? 'spin' : ''}/></button><button className="icon-btn notification" onClick={() => setShowNotifications(true)} title="Notifications"><Bell/>{unread > 0 && <i/>}</button><button className="account-btn" onClick={() => setMenu(v => !v)}><div className="avatar">{initials(profile)}</div><span>{name}</span><ChevronDown/></button></div>
      </header>

      <section className="hero"><div><div className="eyebrow">VexaAccount · Cloud Workspace</div><h1>Your <span>digital universe.</span></h1><p>One elegant home for every application you use. Your MTP2026 library follows your VexaAccount across devices.</p></div><div className="hero-orbit"><div className="ring"/><div className="ring r2"/><div className="orb"/></div></section>

      <div className="apps-header"><div><div className="section-title">{view === 'favorites' ? 'Favorite Applications' : view === 'recent' ? 'Recently Opened' : 'My Applications'} <small>{view === 'recent' ? recentApps.length : apps.length} {(view === 'recent' ? recentApps.length : apps.length) === 1 ? 'app' : 'apps'}</small></div><p>Your personal cloud-synchronized application library</p></div><button className="primary-add" onClick={() => { setError(''); setShowAdd(true); }} disabled={!logged}><span>＋</span> Add Application</button></div>
      {!logged && <div className="login-banner"><div><Sparkles/><div><b>Connect your VexaAccount</b><span>Sign in to synchronize your application library across devices.</span></div></div><button onClick={login}><LogIn/> Sign in</button></div>}
      {error && <div className="error"><X/> <span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      <div className="control-row"><div className="filters">{[['all','All'],['favorite','Favorites'],['pwa','PWA Ready'],['web','Web Apps']].map(([id,label]) => <button key={id} className={`filter ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      <section className="grid">
        {filtered.map((a, i) => <article className="card" key={a.id} style={{ animationDelay: `${i * 35}ms` }} onClick={() => openApp(a)}>
          <div className="card-top"><div className="app-icon">{a.iconUrl ? <img src={a.iconUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }}/>: <Globe2/>}</div><button className={`fav ${a.favorite ? 'on' : ''}`} onClick={e => { e.stopPropagation(); patch(a.id, 'favorite', !a.favorite); }}>{a.favorite ? '★' : '☆'}</button></div>
          <h3>{a.title}</h3><div className="domain">{(() => { try { return new URL(a.url).hostname; } catch { return a.url; } })()}</div><p className="desc">{a.description || 'Web application in your MTP2026 library.'}</p>
          <div className="card-bottom">{a.pwaSupported ? <span className="pwa"><CheckCircle2/> PWA Ready</span> : <span className="web">Web App</span>}<div className="card-actions"><button onClick={e => { e.stopPropagation(); patch(a.id, 'favorite', !a.favorite); }} className={a.favorite ? 'active' : ''}><Star/></button><button onClick={e => { e.stopPropagation(); remove(a.id); }}><Trash2/></button><button className="launch" onClick={e => { e.stopPropagation(); openApp(a); }}>Open <ExternalLink/></button></div></div>
          {a.lastOpenedAt && <div className="last-opened"><Clock3/> {new Date(a.lastOpenedAt).toLocaleString()}</div>}
        </article>)}
        {!filtered.length && <div className="empty-state"><div className="empty-icon">◌</div><h3>{logged ? (view === 'recent' ? 'Nothing opened recently' : 'No applications found') : 'Sign in to open your library'}</h3><p>{logged ? 'Try another filter or add a new application.' : 'Your MTP2026 applications will appear here after VexaAccount SSO.'}</p>{logged && view !== 'recent' && <button className="primary-add" onClick={() => setShowAdd(true)}>＋ Add Application</button>}</div>}
      </section>

      <section className="stats"><div className="stat"><small>Applications</small><b>{apps.length}</b></div><div className="stat"><small>PWA Ready</small><b>{apps.filter(a => a.pwaSupported).length}<em>●</em></b></div><div className="stat"><small>Favorites</small><b>{apps.filter(a => a.favorite).length}</b></div><div className="stat"><small>Sync Status</small><b className="status-value">{logged ? 'Cloud' : 'Offline'} <em>● {logged ? 'Online' : 'Signed out'}</em></b></div></section>
      <footer>MTP2026 App Launcher · Connected through VexaAccount · Cloud library</footer>
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowAdd(false)}><div className="modal"><div className="modal-head"><div><h2>Add Application</h2><p>Add a secure HTTPS application to your cloud library.</p></div><button className="close" onClick={() => setShowAdd(false)}><X/></button></div><div className="modal-body"><label className="url-label">APPLICATION URL</label><div className="url-wrap"><Globe2/><input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-application.com"/></div><div className={`url-status ${url && !validPreview ? 'invalid' : validPreview ? 'valid' : ''}`}>{!url ? 'Enter a secure HTTPS application URL.' : validPreview ? '✓ Valid HTTPS application URL detected.' : 'Please enter a valid HTTPS URL.'}</div>{validPreview && <div className="preview show"><div className="preview-icon">🌐</div><div><b>{validPreview.hostname}</b><small>Metadata will be detected securely by MTP2026.</small></div></div>}<div className="detect-box"><div>✓ Website title detection</div><div>✓ Favicon detection</div><div>✓ PWA manifest detection</div><div>✓ SSRF/private-network protection</div></div></div><div className="modal-foot"><button className="secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary-add" disabled={!validPreview || loading} onClick={add}>{loading ? 'Adding…' : 'Add Application'}</button></div></div></div>}

    {showSettings && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowSettings(false)}><div className="modal"><div className="modal-head"><div><h2>Launcher Settings</h2><p>These preferences are stored in your MTP2026 account database.</p></div><button className="close" onClick={() => setShowSettings(false)}><X/></button></div><div className="modal-body settings-body"><label>Theme<select value={settings.theme} onChange={e => saveSetting('theme', e.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Default view<select value={settings.defaultView} onChange={e => saveSetting('defaultView', e.target.value)}><option value="launcher">Launcher</option><option value="applications">Applications</option><option value="favorites">Favorites</option><option value="recent">Recent</option></select></label><label>Open applications<select value={settings.openBehavior} onChange={e => saveSetting('openBehavior', e.target.value)}><option value="new_tab">New tab</option><option value="same_tab">Same tab</option></select></label><button className="setting-toggle" onClick={() => saveSetting('compactMode', !settings.compactMode)}><span>Compact mode</span><span>{settings.compactMode ? <Check/> : 'Off'}</span></button></div><div className="modal-foot"><button className="primary-add" onClick={() => setShowSettings(false)}>Done</button></div></div></div>}

    {showNotifications && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowNotifications(false)}><div className="modal notifications-modal"><div className="modal-head"><div><h2>Notifications</h2><p>{unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You are all caught up.'}</p></div><button className="close" onClick={() => setShowNotifications(false)}><X/></button></div><div className="notification-actions"><button onClick={markAllRead}>Mark all read</button></div><div className="notification-list">{notifications.length ? notifications.map(n => <button key={n.id} className={`notification-item ${n.readAt ? 'read' : ''}`} onClick={() => markRead(n.id)}><div><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div>{!n.readAt && <span className="unread-dot"/>}</button>) : <div className="empty-state"><div className="empty-icon"><Bell/></div><h3>No notifications</h3><p>System and launcher events will appear here.</p></div>}</div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
