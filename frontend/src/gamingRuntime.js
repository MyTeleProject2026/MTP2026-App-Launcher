/* Native-capable gaming input layer. It uses the real Gamepad API exposed by
 * the host OS/webview and emits stable MTP2026 events to the launcher UI. */

let active = true;
let frame;
const previous = new Map();

function poll() {
  if (!active) return;
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  pads.forEach(pad => {
    const old = previous.get(pad.index) || [];
    pad.buttons.forEach((button, index) => {
      const was = !!old[index];
      if (button.pressed && !was) window.dispatchEvent(new CustomEvent('mtp2026:gamepad-button', { detail: { index: pad.index, button: index, value: button.value } }));
    });
    previous.set(pad.index, pad.buttons.map(button => button.pressed));
    window.dispatchEvent(new CustomEvent('mtp2026:gamepad-state', { detail: { index: pad.index, id: pad.id, axes: [...pad.axes], buttons: pad.buttons.map(b => ({ pressed: b.pressed, value: b.value })) } }));
  });
  frame = requestAnimationFrame(poll);
}

window.addEventListener('gamepadconnected', event => window.dispatchEvent(new CustomEvent('mtp2026:gamepad-connected', { detail: { index: event.gamepad.index, id: event.gamepad.id } })));
window.addEventListener('gamepaddisconnected', event => { previous.delete(event.gamepad.index); window.dispatchEvent(new CustomEvent('mtp2026:gamepad-disconnected', { detail: { index: event.gamepad.index, id: event.gamepad.id } })); });
window.MTP2026Gaming = { start() { if (!active) { active = true; poll(); } }, stop() { active = false; cancelAnimationFrame(frame); }, connected: () => navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [] };
poll();
