import React, { useRef, useState } from 'react';
import { Check, Download, ImagePlus, Monitor, Smartphone, Gamepad2, Trash2, RotateCcw, Star, Pin, X, ExternalLink, Code2, Cpu } from 'lucide-react';
import './device-mode.css';
import { setNativeMode } from './nativePlatformApi.js';

export const DEVICE_MODES = {
  mtp2026: { label: 'MTP2026 Device OS', icon: Smartphone, orientation: 'portrait' },
  android: { label: 'MTP2026 Android OS', icon: Smartphone, orientation: 'portrait' },
  desktop: { label: 'MTP2026 Desktop OS', icon: Monitor, orientation: 'landscape' },
  gaming: { label: 'MTP2026 Gaming OS', icon: Gamepad2, orientation: 'responsive' }
};

export const MTP2026_ARM64_BOOT_GITHUB_URL = 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/tree/main/os/arm64-kernel';

export function getDeviceMode(mode) {
  const aliases = { ios: 'mtp2026', windows: 'desktop' };
  const normalized = aliases[mode] || mode;
  return DEVICE_MODES[normalized] ? normalized : 'android';
}

export function applyNativeDeviceMode(mode) {
  const normalized = getDeviceMode(mode);
  void setNativeMode(normalized).catch(() => {});
  try { window.MTP2026WebOS?.setMode?.(normalized); } catch (_) {}
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized } }));
  return normalized;
}

export function DeviceModeSettings({ value, onChange }) {
  const current = getDeviceMode(value);
  return <div className="device-mode-settings">
    <div className="device-mode-grid">{Object.entries(DEVICE_MODES).map(([id, item]) => {
      const Icon = item.icon;
      return <button key={id} type="button" className={`device-mode-card ${current === id ? 'active' : ''}`} onClick={() => { onChange(id); applyNativeDeviceMode(id); }}>
        <span className="device-mode-icon"><Icon/></span>
        <span><b>{item.label}</b><small>{item.orientation === 'portrait' ? 'Portable portrait' : item.orientation === 'landscape' ? 'Desktop landscape' : 'Portrait + landscape'}</small></span>
        {current === id && <Check className="device-mode-check"/>}
      </button>;
    })}</div>

    <div className="mtp2026-arm64-boot-panel">
      <div className="mtp2026-arm64-boot-icon"><Cpu/></div>
      <div className="mtp2026-arm64-boot-copy">
        <strong>MTP2026 ARM64 OS</strong>
        <span>ARM64 guest boot foundation shared by all four MTP2026 OS experiences</span>
        <small>Each mode has its own MTP2026 shell and application behavior. Physical guest boot still requires a compatible native/emulator backend and an appropriate guest image.</small>
      </div>
      <a className="mtp2026-arm64-boot-link" href={MTP2026_ARM64_BOOT_GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Open MTP2026 ARM64 boot GitHub source">
        <Code2/> <span>ARM64 GitHub</span> <ExternalLink/>
      </a>
    </div>
  </div>;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    if (file.size > 200 * 1024) return reject(new Error('Application icons must be 200 KB or smaller.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected icon.'));
    reader.readAsDataURL(file);
  });
}

export function ApplicationSettingsModal({ app, onClose, onPatch, onRemove, onOpen }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [icon, setIcon] = useState(app?.userIconUrl || app?.iconUrl || '');
  if (!app) return null;

  async function upload(file) {
    setError(''); setBusy(true);
    try { const value = await readImage(file); await onPatch(app.id, 'userIconUrl', value); setIcon(value); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function resetIcon() {
    setError(''); setBusy(true);
    try { await onPatch(app.id, 'userIconUrl', null); setIcon(app.iconUrl || ''); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal app-settings-modal">
    <div className="modal-head"><div><h2>Application Settings</h2><p>Manage this application in your MTP2026 launcher.</p></div><button className="close" onClick={onClose}><X/></button></div>
    <div className="modal-body app-settings-body">
      {error && <div className="error"><X/><span>{error}</span></div>}
      <div className="app-settings-identity"><div className="app-settings-icon">{icon ? <img src={icon} alt=""/> : <span>🌐</span>}</div><div><h3>{app.title}</h3><p>{app.url}</p><small>{app.pwaSupported ? 'PWA Ready' : 'Web App'}</small></div></div>
      <div className="icon-upload-panel"><div><b>Application icon</b><small>Use a square PNG, JPG, WEBP, or SVG image. Stored with your launcher profile.</small></div><div className="icon-upload-actions"><button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus/> {busy ? 'Saving…' : 'Upload icon'}</button><button className="btn" disabled={busy || !app.userIconUrl} onClick={resetIcon}><RotateCcw/> Reset</button><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])}/></div></div>
      <div className="app-setting-row"><span><Star/> Favorite</span><button className={`setting-switch ${app.favorite ? 'on' : ''}`} onClick={() => onPatch(app.id, 'favorite', !app.favorite)}>{app.favorite ? 'On' : 'Off'}</button></div>
      <div className="app-setting-row"><span><Pin/> Pin to top</span><button className={`setting-switch ${app.pinned ? 'on' : ''}`} onClick={() => onPatch(app.id, 'pinned', !app.pinned)}>{app.pinned ? 'On' : 'Off'}</button></div>
      <div className="app-setting-row"><span><Download/> Installed in launcher</span><strong className="installed-label">Installed</strong></div>
      <div className="app-setting-actions"><button className="btn primary" onClick={() => onOpen(app)}><ExternalLink/> Open full-screen workspace</button><button className="btn danger" onClick={() => onRemove(app.id)}><Trash2/> Uninstall / remove</button></div>
      <p className="app-settings-note">Uninstall removes the application from this VexaAccount launcher library. It does not delete the external website or service.</p>
    </div>
  </div></div>;
} 
