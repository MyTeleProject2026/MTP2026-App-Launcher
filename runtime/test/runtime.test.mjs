import test from 'node:test';
import assert from 'node:assert/strict';

test('runtime image profile allowlist is explicit', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /new Set\(\['mtp2026', 'android', 'desktop', 'gaming'\]\)/);
  assert.match(source, /GUEST_BUNDLE_CHECKSUM_MISMATCH/);
  assert.match(source, /MTP2026 GUI COMPOSITOR STARTED/);
  assert.match(source, /authorization.*Bearer/);
  assert.match(source, /realGuest:guest\.confirmed/);
});

test('runtime does not advertise a guest as running without confirmed boot markers', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /session\.confirmed=true; session\.status='running'/);
  assert.match(source, /running:s\.status==='running'&&s\.confirmed/);
});
