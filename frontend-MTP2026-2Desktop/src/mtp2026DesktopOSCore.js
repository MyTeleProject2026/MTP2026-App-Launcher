const STORAGE_KEY = 'mtp2026:desktop:os-core:v2';
const EVENT = 'mtp2026:os-state';
const LOCK_KEY = 'mtp2026:desktop:session-lock:v1';

const DEFAULT_SERVICES = Object.freeze({
  'desktop-shell': 'running',
  'window-manager': 'running',
  'session-manager': 'running',
  'filesystem': 'running',
  'notification-center': 'running',
  'application-manager': 'running',
  'guest-runtime': 'ready',
});

const DEFAULT_STATE = Object.freeze({
  power: 'on',
  session: 'active',
  sessionUser: 'MTP2026 User',
  network: 'online',
  services: DEFAULT_SERVICES,
  processes: {},
  settings: {},
  security: { locked: false },
  boot: { phase: 'ready', progress: 100 },
  events: [],
  updatedAt: 0,
});

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE, services: { ...DEFAULT_SERVICES }, security: { ...DEFAULT_STATE.security }, boot: { ...DEFAULT_STATE.boot } };
    return {
      ...DEFAULT_STATE, ...raw,
      services: { ...DEFAULT_SERVICES, ...(raw.services || {}) },
      security: { ...DEFAULT_STATE.security, ...(raw.security || {}) },
      boot: { ...DEFAULT_STATE.boot, ...(raw.boot || {}) },
      events: Array.isArray(raw.events) ? raw.events.slice(-100) : [],
    };
  } catch {
    return { ...DEFAULT_STATE, services: { ...DEFAULT_SERVICES }, security: { ...DEFAULT_STATE.security }, boot: { ...DEFAULT_STATE.boot } };
  }
}

function emit(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
  return state;
}

function appendEvent(state, type, detail = {}) {
  return {
    ...state,
    events: [...(state.events || []), { id: `event-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, detail, at: Date.now() }].slice(-100),
    updatedAt: Date.now(),
  };
}

export function getDesktopOSState() { return readState(); }

export function patchDesktopOSState(patch = {}, event) {
  let state = { ...readState(), ...patch, updatedAt: Date.now() };
  if (event) state = appendEvent(state, event.type, event.detail);
  return emit(state);
}

export function registerDesktopProcess(process) {
  const state = readState();
  const id = process.id || `process-${Date.now()}`;
  state.processes = {
    ...state.processes,
    [id]: { id, name: process.name || id, type: process.type || 'application', status: process.status || 'running', startedAt: process.startedAt || Date.now(), owner: process.owner || 'MTP2026' },
  };
  return emit({ ...state, updatedAt: Date.now() });
}

export function updateDesktopProcess(id, patch = {}) {
  const state = readState();
  if (!state.processes[id]) return state;
  return emit({ ...state, processes: { ...state.processes, [id]: { ...state.processes[id], ...patch } }, updatedAt: Date.now() });
}

export function unregisterDesktopProcess(id) {
  const state = readState();
  const next = { ...state.processes };
  delete next[id];
  return emit({ ...state, processes: next, updatedAt: Date.now() });
}

export function setDesktopServiceState(id, status) {
  const state = readState();
  return emit({ ...state, services: { ...state.services, [id]: status }, updatedAt: Date.now() });
}

export function getDesktopServices() { return Object.entries(readState().services || {}).map(([id, status]) => ({ id, status })); }
export function getDesktopProcesses() { return Object.values(readState().processes || {}); }

export function setDesktopSessionState(session) {
  return patchDesktopOSState({ session }, { type: 'session.state', detail: { session } });
}

export function setDesktopPowerState(power) {
  return patchDesktopOSState({ power }, { type: 'power.state', detail: { power } });
}

export function setDesktopBootState(boot) {
  return patchDesktopOSState({ boot }, { type: 'boot.state', detail: boot });
}

export function setDesktopNetworkState(network) {
  return patchDesktopOSState({ network }, { type: 'network.state', detail: { network } });
}

export function setDesktopOSSetting(key, value) {
  const state = readState();
  return emit({ ...state, settings: { ...(state.settings || {}), [key]: value }, updatedAt: Date.now() });
}

export function setDesktopLocked(locked) {
  try { localStorage.setItem(LOCK_KEY, locked ? 'locked' : 'unlocked'); } catch {}
  return patchDesktopOSState({ security: { ...readState().security, locked: Boolean(locked) } }, { type: locked ? 'session.locked' : 'session.unlocked', detail: {} });
}

export function isDesktopLocked() {
  try { return localStorage.getItem(LOCK_KEY) === 'locked'; } catch { return Boolean(readState().security?.locked); }
}

export function addDesktopSystemEvent(type, detail = {}) {
  return patchDesktopOSState({}, { type, detail });
}

export function clearDesktopSystemEvents() {
  const state = readState();
  return emit({ ...state, events: [], updatedAt: Date.now() });
}

export function subscribeDesktopOSState(listener) {
  const handler = event => listener(event.detail || readState());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
