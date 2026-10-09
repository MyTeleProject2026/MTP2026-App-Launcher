import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Globe2, UserRound, X } from 'lucide-react';
import './styles.css';
import MTP2026DesktopShell from './MTP2026DesktopShell.jsx';
import './mtp2026DesktopShell.css';
import { API, finishVexaLogin, signOut, startVexaLogin } from './auth';

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function DesktopLogin({ error, onGuest }) {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    try {
      await startVexaLogin({ prompt: 'select_account' });
    } catch (e) {
      window.dispatchEvent(new CustomEvent('mtp2026:desktop-auth-error', { detail: { error: String(e?.message || e) } }));
    } finally {
      setBusy(false);
    }
  }

  return <main className="vexa-login-page">
    <section className="vexa-login-card">
      <div className="vexa-login-brand">
        <div className="brand-mark"><span>M</span></div>
        <div><strong>MTP2026 Desktop OS</strong><small>Secure VexaAccount session</small></div>
      </div>
      <div className="vexa-login-copy">
        <div className="eyebrow">MTP2026 DESKTOP EDITION</div>
        <h1>Enter your Desktop OS</h1>
        <p>Sign in with VexaAccount to open the MTP2026 desktop shell. The legacy App Launcher workspace is no longer part of this application.</p>
      </div>
      {error && <div className="error"><X/><span>{error}</span></div>}
      <button className="vexa-primary-provider" type="button" disabled={busy} onClick={signIn}>
        <UserRound/> {busy ? 'Opening secure sign-in…' : 'Continue with VexaAccount'}
      </button>
      <button className="mtp-guest-login-entry" type="button" onClick={onGuest}>
        <Globe2/> Continue as Guest
      </button>
      <div className="mtp-guest-entry-note">Guest mode opens the MTP2026-owned desktop environment without exposing the host device application launcher.</div>
    </section>
  </main>;
}

class DesktopErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[MTP2026 Desktop OS]', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#070811', color: '#f6f7ff', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <section style={{ width: 'min(620px,100%)', padding: 28, border: '1px solid rgba(139,92,246,.35)', borderRadius: 20, background: '#121628', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', fontWeight: 800, color: '#22d3ee' }}>MTP2026 DESKTOP OS</div>
        <h1>Desktop shell failed to render</h1>
        <p>The current Desktop OS could not initialize. The retired App Launcher interface is not used as a fallback.</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, borderRadius: 10, background: 'rgba(0,0,0,.25)', color: '#fca5a5', fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '11px 16px', border: 0, borderRadius: 10, cursor: 'pointer', fontWeight: 800 }}>Reload Desktop OS</button>
      </section>
    </main>;
  }
}

function DesktopApp() {
  // Start directly in the desktop shell. Authentication and optional guest-runtime
  // setup must never block the basic desktop workspace from appearing.
  const [guestProfile, setGuestProfile] = useState('mtp2026');
  const [apps, setApps] = useState([]);
  const [profile, setProfile] = useState(null);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    setLoading(true);
    try {
      const session = await finishVexaLogin();
      if (session?.profile) {
        setProfile(session.profile);
        setLogged(true);
        return;
      }
      setLogged(false);
      setProfile(null);
    } catch (e) {
      setError(String(e?.message || e));
      setLogged(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadApps() {
    try {
      const response = await fetch(`${API}/apps`, { credentials: 'include' });
      if (response.status === 401) {
        await signOut();
        setLogged(false);
        setProfile(null);
        setApps([]);
        return;
      }
      if (response.ok) setApps(await json(response));
      else setApps([]);
    } catch (e) {
      console.warn('[MTP2026 Desktop OS] application library unavailable:', e);
      setApps([]);
    }
  }

  useEffect(() => {
    const authError = event => setError(event.detail?.error || 'VexaAccount sign-in failed.');
    window.addEventListener('mtp2026:desktop-auth-error', authError);
    loadSession();
    return () => window.removeEventListener('mtp2026:desktop-auth-error', authError);
  }, []);

  useEffect(() => {
    if (logged) loadApps();
  }, [logged]);

  async function exitDesktop() {
    await signOut().catch(() => {});
    setLogged(false);
    setProfile(null);
    setApps([]);
    window.location.assign(window.location.pathname);
  }

  if (guestProfile) return <MTP2026DesktopShell apps={apps} profile={profile} onExit={() => window.location.reload()} />;
  if (loading) return <main className="vexa-login-page"><section className="vexa-login-card"><div className="vexa-login-brand"><div className="brand-mark"><span>M</span></div><div><strong>MTP2026 Desktop OS</strong><small>Starting secure desktop session…</small></div></div></section></main>;
  if (!logged) return <DesktopLogin error={error} onGuest={() => setGuestProfile('mtp2026')} />;

  return <DesktopErrorBoundary>
    <MTP2026DesktopShell apps={apps} profile={profile} onExit={exitDesktop} />
  </DesktopErrorBoundary>;
}

createRoot(document.getElementById('root')).render(<DesktopApp />);
