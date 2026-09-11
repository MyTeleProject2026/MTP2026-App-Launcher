import './virtual-os-runtime.css';

const API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const STORAGE_KEY = 'mtp2026-virtual-os-state-v1';
const VALID_MODES = ['android', 'ios', 'windows', 'gaming'];
const MODE_META = {
  android: { label: 'Android', orientation: 'portrait' },
  ios: { label: 'iOS', orientation: 'portrait' },
  windows: { label: 'Windows 11', orientation: 'landscape' },
  gaming: { label: 'Gaming', orientation: 'responsive' },
};

let worker = null;
let bootPromise = null;
let state = readState();
let badge = null;

function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      installed: Boolean(value.installed),
      bootCount: Number(value.bootCount || 0),
      lastBoot: value.lastBoot || null,
      architecture: value.architecture || 'AArch64',
      contract: value.contract || 'MTP2026-ARM64-BOOT-v1',
    };
  } catch {
    return { installed: false, bootCount: 0, lastBoot: null, architecture: 'AArch64', contract: 'MTP2026-ARM64-BOOT-v1' };
  }
}

function saveState(patch) {
  state = { ...state, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentMode() {
  const value = document.documentElement.dataset.mtpDeviceMode || document.documentElement.dataset.mtpDefaultSystem || 'android';
  return VALID_MODES.includes(value) ? value : 'android';
}

function setModeClass(mode) {
  document.documentElement.dataset.mtpVirtualMode = mode;
  document.body?.setAttribute('data-mtp-virtual-mode', mode);
}

function createBadge() {
  if (badge || !document.body) return;
  badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'mtp-virtual-os-badge';
  badge.title = 'MTP2026 virtual ARM64 OS status';
  badge.addEventListener('click', openPanel);
  document.body.appendChild(badge);
  renderBadge('booting', 'Starting ARM64 VM…');
}

function renderBadge(status, detail) {
  if (!badge) return;
  badge.dataset.status = status;
  badge.innerHTML = `<span class="mtp-vm-dot"></span><span><b>MTP2026 OS</b><small>${detail}</small></span>`;
}

function openPanel() {
  document.querySelector('.mtp-virtual-os-panel')?.remove();
  const panel = document.createElement('section');
  panel.className = 'mtp-virtual-os-panel';
  const mode = currentMode();
  panel.innerHTML = `<div class="mtp-vm-panel-head"><div><span class="mtp-vm-kicker">VIRTUAL MACHINE</span><h2>MTP2026 ARM64 OS</h2></div><button type="button" class="mtp-vm-close" aria-label="Close">×</button></div>
    <div class="mtp-vm-status"><span class="mtp-vm-status-led"></span><div><b id="mtp-vm-status-title">${state.installed ? 'ARM64 boot installed' : 'ARM64 boot ready to install'}</b><small id="mtp-vm-status-detail">${state.architecture} · ${MODE_META[mode].label} · ${state.contract}</small></div></div>
    <div class="mtp-vm-grid"><div><span>Architecture</span><b>AArch64</b></div><div><span>Execution</span><b>WebAssembly CPU</b></div><div><span>Boots</span><b>${state.bootCount}</b></div><div><span>Mode</span><b>${MODE_META[mode].label}</b></div></div>
    <p class="mtp-vm-copy">This browser runtime executes the MTP2026 ARM64 boot contract in a dedicated WebAssembly worker. The host Android/iOS/Windows device is not modified or flashed.</p>
    <div class="mtp-vm-actions"><button type="button" id="mtp-vm-reboot">Reboot virtual OS</button><a href="https://github.com/MyTeleProject2026/MTP2026-App-Launcher/tree/main/os/arm64-kernel" target="_blank" rel="noopener noreferrer">ARM64 source</a></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.mtp-vm-close').onclick = () => panel.remove();
  panel.querySelector('#mtp-vm-reboot').onclick = async () => {
    panel.querySelector('#mtp-vm-status-title').textContent = 'Rebooting virtual OS…';
    await boot({ force: true });
    panel.querySelector('#mtp-vm-status-title').textContent = 'ARM64 virtual OS running';
    panel.querySelector('#mtp-vm-status-detail').textContent = `${state.architecture} · ${MODE_META[currentMode()].label} · ${state.contract}`;
  };
}

function bootWorker() {
  if (bootPromise) return bootPromise;
  bootPromise = new Promise((resolve, reject) => {
    const url = new URL('./webOsWorker.js', import.meta.url);
    worker = new Worker(url, { type: 'module', name: 'mtp2026-arm64-vm' });
    const timeout = setTimeout(() => reject(new Error('ARM64 VM boot timed out')), 15000);
    worker.onmessage = event => {
      const data = event.data || {};
      if (data.type === 'booting') renderBadge('booting', 'Executing ARM64 boot…');
      if (data.type === 'ready') {
        clearTimeout(timeout);
        saveState({ installed: true, bootCount: state.bootCount + 1, lastBoot: new Date().toISOString(), architecture: data.architecture || 'AArch64', contract: data.contract || state.contract });
        renderBadge('ready', 'ARM64 virtual OS running');
        window.dispatchEvent(new CustomEvent('mtp2026:arm64-ready', { detail: data }));
        resolve(data);
      }
      if (data.type === 'error') {
        clearTimeout(timeout);
        renderBadge('error', 'ARM64 boot failed — tap for details');
        reject(new Error(data.message || 'ARM64 boot failed'));
      }
    };
    worker.onerror = error => {
      clearTimeout(timeout);
      renderBadge('error', 'ARM64 VM unavailable — tap for details');
      reject(error.error || new Error(error.message || 'ARM64 worker failed'));
    };
    worker.postMessage({ type: 'boot' });
  }).catch(error => {
    bootPromise = null;
    window.dispatchEvent(new CustomEvent('mtp2026:arm64-error', { detail: { message: error.message } }));
    return null;
  });
  return bootPromise;
}

export async function bootVirtualOs(options = {}) {
  if (options.force && worker) {
    try { worker.postMessage({ type: 'reset' }); } catch {}
    worker.terminate();
    worker = null;
    bootPromise = null;
  }
  setModeClass(currentMode());
  createBadge();
  return bootWorker();
}

export function getVirtualOsState() {
  return { ...state, mode: currentMode(), modeMeta: MODE_META[currentMode()] };
}

function syncMode() {
  const mode = currentMode();
  setModeClass(mode);
  if (badge && state.installed) renderBadge('ready', `${MODE_META[mode].label} · ARM64 VM running`);
}

window.addEventListener('mtp2026:default-system-os', syncMode);
window.addEventListener('mtp2026:device-mode', syncMode);
window.addEventListener('load', () => {
  setTimeout(() => { bootVirtualOs(); }, 250);
});

if (document.readyState !== 'loading') {
  setTimeout(() => { bootVirtualOs(); }, 250);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => { bootVirtualOs(); }, 250), { once: true });
}

window.MTP2026VirtualOS = { boot: bootVirtualOs, state: getVirtualOsState, openStatus: openPanel };
