const STORAGE_KEY = 'mtp2026:desktop:os-core:v1';

const DEFAULT_STATE = Object.freeze({
  power: 'on',
  session: 'active',
  network: 'online',
  services: {},
  processes: {},
  settings: {},
  updatedAt: 0,
});

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return raw && typeof raw === 'object' ? { ...DEFAULT_STATE, ...raw } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  window.dispatchEvent(new CustomEvent('mtp2026:os-state', { detail: state }));
  return state;
}

export function getDesktopOSState() {
  return readState();
}

export function patchDesktopOSState(patch = {}) {
  return writeState({ ...readState(), ...patch, updatedAt: Date.now() });
}

export function registerDesktopProcess(process) {
  const state = readState();
  const id = process.id || `process-${Date.now()}`;
  state.processes = {
    ...state.processes,
    [id]: {
      id,
      name: process.name || id,
      type: process.type || 'application',
      status: process.status || 'running',
      startedAt: process.startedAt || Date.now(),
      owner: process.owner || 'MTP2026',
    },
  };
  writeState({ ...state, updatedAt: Date.now() });
  return id;
}

export function updateDesktopProcess(id, patch = {}) {
  const state = readState();
  if (!state.processes[id]) return state;
  state.processes = { ...state.processes, [id]: { ...state.processes[id], ...patch } };
  return writeState({ ...state, updatedAt: Date.now() });
}

export function unregisterDesktopProcess(id) {
  const state = readState();
  const next = { ...state.processes };
  delete next[id];
  return writeState({ ...state, processes: next, updatedAt: Date.now() });
}

export function setDesktopServiceState(id, status) {
  const state = readState();
  state.services = { ...state.services, [id]: status };
  return writeState({ ...state, updatedAt: Date.now() });
}

export function getDesktopProcesses() {
  return Object.values(readState().processes || {});
}

export function setDesktopSessionState(session) {
  return patchDesktopOSState({ session });
}

export function setDesktopPowerState(power) {
  return patchDesktopOSState({ power });
}

export function setDesktopOSSetting(key, value) {
  const state = readState();
  return writeState({
    ...state,
    settings: { ...(state.settings || {}), [key]: value },
    updatedAt: Date.now(),
  });
}

export function subscribeDesktopOSState(listener) {
  const handler = event => listener(event.detail || readState());
  window.addEventListener('mtp2026:os-state', handler);
  return () => window.removeEventListener('mtp2026:os-state', handler);
}
