import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LogIn, Plus, Smartphone, Monitor, Gamepad2, Trash2, LogOut, Globe2 } from 'lucide-react';
import { MTP2026_GUEST_PROFILES } from './mtp2026GuestProfiles.js';
import { MTP2026Arm64Firmware } from './mtp2026Arm64Firmware.jsx';

const GUEST_PROFILES = [
  MTP2026_GUEST_PROFILES.mtp2026,
  MTP2026_GUEST_PROFILES.android,
  MTP2026_GUEST_PROFILES.windows11,
  MTP2026_GUEST_PROFILES.gaming
];

const ICONS = { mtp2026: Smartphone, android: Smartphone, windows11: Monitor, gaming: Gamepad2 };

function storageKey(profileId) { return `mtp2026:guest-apps:${profileId}`; }

function loadApps(profileId) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(profileId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}

function saveApps(profileId, apps) {
  localStorage.setItem(storageKey(profileId), JSON.stringify(apps));
}

export function GuestAccess({ initialProfile='mtp2026', onLogin }) {
  const [profileId, setProfileId] = useState(initialProfile);
  const [booted, setBooted] = useState(false);
  const [apps, setApps] = useState(() => loadApps(initialProfile));
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const profile = useMemo(
    () => GUEST_PROFILES.find(item => item.id === profileId) || GUEST_PROFILES[0],
    [profileId]
  );
  const Icon = ICONS[profile.id] || Smartphone;

  useEffect(() => {
    setApps(loadApps(profileId));
    setError('');
  }, [profileId]);

  function switchProfile(id) {
    setBooted(false);
    setProfileId(id);
    document.documentElement.dataset.mtpGuestProfile = id;
  }

  function addApp(event) {
    event.preventDefault();
    setError('');
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') throw new Error('Only HTTPS application URLs are accepted.');
      const next = [{
        id: crypto.randomUUID(),
        title: parsed.hostname.replace(/^www\./, ''),
        url: parsed.toString(),
        createdAt: new Date().toISOString()
      }, ...apps];
      setApps(next);
      saveApps(profileId, next);
      setUrl('');
    } catch (e) {
      setError(e.message || 'Enter a valid HTTPS application URL.');
    }
  }

  function removeApp(id) {
    const next = apps.filter(app => app.id !== id);
    setApps(next);
    saveApps(profileId, next);
  }

  if (!booted) return <MTP2026Arm64Firmware profileId={profile.id} onReady={() => setBooted(true)} />;

  return <main className="mtp-guest-page" data-profile={profile.id}>
    <section className="mtp-guest-shell">
      <header className="mtp-guest-header">
        <div className="mtp-guest-brand">
          <div className="mtp-guest-brand-mark">M</div>
          <div><strong>MTP2026 Guest</strong><small>Guest profile • no VexaAccount required</small></div>
        </div>
        <button className="mtp-guest-login" type="button" onClick={onLogin}><LogIn/> Sign in with VexaAccount</button>
      </header>

      <div className="mtp-guest-profile-strip">
        {GUEST_PROFILES.map(item => {
          const ProfileIcon = ICONS[item.id] || Smartphone;
          return <button key={item.id} type="button" className={profile.id === item.id ? 'active' : ''} onClick={() => switchProfile(item.id)}>
            <ProfileIcon/><span><b>{item.shortLabel}</b><small>{item.label}</small></span>
          </button>;
        })}
      </div>

      <section className="mtp-guest-hero">
        <div className="mtp-guest-hero-icon"><Icon/></div>
        <div>
          <div className="mtp-guest-kicker">DIRECT GUEST ACCESS</div>
          <h1>{profile.label}</h1>
          <p>Use this MTP2026 profile immediately in the browser. Web applications are available without signing in and are stored locally on this device for the guest profile.</p>
        </div>
      </section>

      <section className="mtp-guest-apps">
        <div className="mtp-guest-section-head"><div><h2>Guest applications</h2><p>{apps.length} application{apps.length === 1 ? '' : 's'} on this device</p></div></div>
        <form className="mtp-guest-add" onSubmit={addApp}>
          <Globe2/><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-web-app.example" aria-label="Web application URL"/>
          <button type="submit"><Plus/> Add application</button>
        </form>
        {error && <div className="mtp-guest-error">{error}</div>}
        <div className="mtp-guest-grid">
          {apps.map(app => <article className="mtp-guest-app" key={app.id}>
            <div className="mtp-guest-app-icon"><Globe2/></div>
            <div className="mtp-guest-app-copy"><h3>{app.title}</h3><p>{app.url}</p></div>
            <div className="mtp-guest-app-actions">
              <a href={app.url} target="_blank" rel="noopener noreferrer"><ExternalLink/> Launch</a>
              <button type="button" onClick={() => removeApp(app.id)} aria-label={`Remove ${app.title}`}><Trash2/></button>
            </div>
          </article>)}
          {!apps.length && <div className="mtp-guest-empty">Add a web application above to create your first guest app.</div>}
        </div>
      </section>

      <footer className="mtp-guest-footer">
        <span>Guest data stays on this browser/device. Sign in to VexaAccount for cloud-synchronized MTP2026 application libraries.</span>
        <button type="button" onClick={onLogin}><LogOut/> Switch to account</button>
      </footer>
    </section>
  </main>;
}
