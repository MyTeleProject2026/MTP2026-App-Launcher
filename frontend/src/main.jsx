import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Star, RefreshCw, Bell, ChevronDown, Menu, X, ExternalLink, CheckCircle2, Globe2, LogIn, LogOut, Settings, Clock3, Grid2X2, Sparkles, Download, Trash2, Check, UserRound, CircleHelp, KeyRound, ArrowRightLeft, Maximize2, Minimize2 } from 'lucide-react';
import './styles.css';
import { API, startVexaLogin, finishVexaLogin, signOut } from './auth';
import { DeviceModeSettings, ApplicationSettingsModal, getDeviceMode } from './launcherPlatform.jsx';

const defaults = { theme: 'system', defaultView: 'launcher', openBehavior: 'new_tab', compactMode: false, deviceMode: 'android' };

function initials(profile) {
  const name = profile?.name || profile?.email || 'Vexa Creator';
  return name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function VexaAvatar({ profile, className = 'avatar' }) {
  if (profile?.picture) return <div className={className}><img src={profile.picture} alt="" /></div>;
  return <div className={className}>{initials(profile)}</div>;
}

function LoginScreen({ error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const provider = 'https://vexaaccount-management.onrender.com';

  async function continueToVexa(options = {}) {
    setBusy(true);
    try { await startVexaLogin({ loginHint: email.trim(), ...options }); }
    finally { setBusy(false); setPassword(''); }
  }

  function submit(e) { e.preventDefault(); continueToVexa({ prompt: 'login' }); }

  return <main className="vexa-login-page">
    <section className="vexa-login-card">
      <div className="vexa-login-brand"><div className="brand-mark"><span>V</span></div><div><strong>VexaAccount SSO</strong><small>on MTP2026 App Launcher</small></div></div>
      <div className="vexa-login-copy"><div className="eyebrow">LOGIN WITH VEXA ACCOUNT</div><h1>Welcome back</h1><p>Sign in to securely use your Vexa identity with MTP2026.</p></div>
      {error && <div className="error"><X/><span>{error}</span></div>}
      <button className="vexa-primary-provider" type="button" disabled={busy} onClick={() => continueToVexa({ prompt: 'select_account' })}><UserRound/> Continue with VexaAccount</button>
      <div className="login-divider"><span>or continue with your VexaAccount</span></div>
      <form className="vexa-login-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="User@example.com" /></label>
        <label>Password<div className="password-row"><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /><KeyRound/></div></label>
        <button className="text-link" type="button" onClick={() => window.location.assign(provider)}>Forgot password?</button>
        <button className="vexa-submit" type="submit" disabled={busy}>{busy ? 'Opening VexaAccount…' : 'Sign in'}</button>
      </form>
      <div className="vexa-login-links"><p>Don't have an account? <button type="button" onClick={() => window.location.assign(provider)}>Create one</button></p><button className="help-link" type="button" onClick={() => window.location.assign(provider)}><CircleHelp/> Help with signing in</button></div>
      <div className="vexa-login-security">Your password is never sent to or stored by MTP2026. VexaAccount completes credential, recovery, verification and 2FA on its own secure sign-in flow.</div>
    </section>
  </main>;
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
  const [showProfile, setShowProfile] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [workspaceApp, setWorkspaceApp] = useState(null);
  const [workspaceFull, setWorkspaceFull] = useState(false);
  const workspaceRef = useRef(null);

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
      if (session?.profile) { setProfile(session.profile); setLogged(true); return; }
      setLogged(false);
    }).catch(e => setError(e.message));
    const handler = e => { e.preventDefault?.(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => { if (logged) load(true); }, [logged]);
  useEffect(() => {
    if (settings.theme === 'dark') document.documentElement.dataset.theme = 'dark';