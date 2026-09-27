/* MTP2026 native-capable gaming input layer.
 * Uses the real Gamepad API exposed by the host OS/webview. Polling is enabled
 * for Gaming mode and the runtime also listens for the first-launch/default-mode
 * event so controller support is ready immediately after OS selection. */

let active = false;
let frame = null;
let gamingMode = false;
const previous = new Map();

function connectedPads() {
  return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
}

function emitConnection(pad, connected = true) {
  window.dispatchEvent(new CustomEvent(
    connected ? 'mtp2026:gamepad-connected' : 'mtp2026:gamepad-disconnected',
    { detail: { index: pad.index, id: pad.id } },
  ));
}

function poll() {
  frame = null;
  if (!active || !gamingMode) return;

  const seen = new Set();
  connectedPads().forEach((pad) => {
    seen.add(pad.index);
    const oldButtons = previous.get(pad.index) || [];
    const buttons = pad.buttons.map((button) => ({ pressed: button.pressed, value: button.value }));

    buttons.forEach((button, index) => {
      if (button.pressed && !oldButtons[index]) {
        window.dispatchEvent(new CustomEvent('mtp2026:gamepad-button', {
          detail: { index: pad.index, button: index, value: button.value },
        }));
      }
    });

    previous.set(pad.index, buttons.map((button) => button.pressed));
    window.dispatchEvent(new CustomEvent('mtp2026:gamepad-state', {
      detail: {
        index: pad.index,
        id: pad.id,
        connected: true,
        mapping: pad.mapping,
        axes: [...pad.axes],
        buttons,
      },
    }));
  });

  for (const [index] of previous) {
    if (!seen.has(index)) previous.delete(index);
  }
  frame = requestAnimationFrame(poll);
}

function startPolling() {
  if (active) return;
  active = true;
  poll();
}

function stopPolling() {
  active = false;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}

function applyMode(mode) {
  gamingMode = mode === 'gaming';
  if (gamingMode) {
    startPolling();
    connectedPads().forEach((pad) => {
      if (!previous.has(pad.index)) emitConnection(pad, true);
    });
  } else {
    stopPolling();
    previous.clear();
  }
}

window.addEventListener('mtp2026:device-mode', (event) => applyMode(event.detail?.mode));
window.addEventListener('mtp2026:default-system-os', (event) => applyMode(event.detail?.mode));
window.addEventListener('gamepadconnected', (event) => {
  if (gamingMode) emitConnection(event.gamepad, true);
});
window.addEventListener('gamepaddisconnected', (event) => {
  previous.delete(event.gamepad.index);
  if (gamingMode) emitConnection(event.gamepad, false);
});

window.MTP2026Gaming = {
  start() { startPolling(); },
  stop() { stopPolling(); },
  setMode(mode) { applyMode(mode); },
  connected: connectedPads,
  isGamingMode: () => gamingMode,
};

const startupMode = document.documentElement.dataset.mtpDefaultSystem || document.documentElement.dataset.deviceMode || null;
applyMode(startupMode);
