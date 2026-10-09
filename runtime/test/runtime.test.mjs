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

test('all four OS frontends preserve the selected origin and reject simulated boot', async () => {
  const fs = await import('node:fs/promises');
  const root = new URL('../../', import.meta.url);
  const frontends = [
    'frontend-MTP2026-2Desktop',
    'frontend-MTP2026-Android',
    'frontend-MTP2026OS',
    'Frontend-MTP202026-ROG_gamingOS'
  ];
  for (const frontend of frontends) {
    const auth = await fs.readFile(new URL(`${frontend}/src/auth/vexaAuth.js`, root), 'utf8');
    assert.match(auth, /params\.set\('return_origin',\s*returnOrigin\)/, `${frontend} must return to the selected frontend`);
    const boot = await fs.readFile(new URL(`${frontend}/src/guestBootController.js`, root), 'utf8');
    assert.match(boot, /REAL_GUEST_RUNTIME_NOT_CONFIGURED/);
    assert.match(boot, /result\?\.realGuest !== true/);
    assert.doesNotMatch(boot, /phase:\s*'browser-shell'/, `${frontend} must not simulate a running guest`);
  }
});
