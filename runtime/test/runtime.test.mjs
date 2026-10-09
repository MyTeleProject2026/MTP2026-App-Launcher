import test from 'node:test';
import assert from 'node:assert/strict';

test('runtime image profile allowlist is explicit', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /new Set\(\['mtp2026', 'android', 'desktop', 'gaming'\]\)/);
  assert.match(source, /GUEST_BUNDLE_CHECKSUM_MISMATCH/);
  assert.match(source, /MTP2026 GUI COMPOSITOR STARTED/);
  assert.match(source, /authorization.*Bearer/);
  assert.match(source, /realGuest:s\.confirmed/);
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

test('frontend selection and authentication never invoke guest boot automatically', async () => {
  const fs = await import('node:fs/promises');
  const root = new URL('../../', import.meta.url);
  for (const frontend of ['frontend-MTP2026OS','frontend-MTP2026-Android','Frontend-MTP202026-ROG_gamingOS']) {
    const startup = await fs.readFile(new URL(`${frontend}/src/startupOrchestrator.js`, root), 'utf8');
    assert.doesNotMatch(startup, /MTP2026Runtime\?\.boot/, `${frontend} must not boot after login`);
    assert.match(startup, /mtp2026:frontend-selected/);
  }
  for (const frontend of ['frontend-MTP2026OS','frontend-MTP2026-Android','Frontend-MTP202026-ROG_gamingOS','frontend-MTP2026-2Desktop']) {
    const access = await fs.readFile(new URL(`${frontend}/src/guestAccess.jsx`, root), 'utf8');
    const effect = access.match(/useEffect\(\(\)=>\{[\s\S]*?\},\[profile\.id\]\);/)?.[0] || '';
    assert.doesNotMatch(effect, /bootGuest\(/, `${frontend} must not boot on mount/profile selection`);
    assert.match(access, /startGuestExplicit/);
  }
});

test('changing a device mode never starts the QEMU runtime', async () => {
  const fs = await import('node:fs/promises');
  const root = new URL('../../', import.meta.url);
  for (const frontend of ['frontend-MTP2026OS','frontend-MTP2026-Android','Frontend-MTP202026-ROG_gamingOS']) {
    const native = await fs.readFile(new URL(`${frontend}/src/nativePlatformApi.js`, root), 'utf8');
    assert.doesNotMatch(native, /MTP2026Runtime\?\.boot/, `${frontend} mode changes must not boot a guest`);
  }
});

test('runtime health distinguishes process availability from boot readiness', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /configured:Boolean\(apiKey && publicUrl/);
  assert.match(source, /bootMediaReady:media\.ready/);
  assert.match(source, /GUEST_BOOT_MEDIA_INCOMPLETE/);
  assert.match(source, /physical-test-manifest\.json/);
});

test('remote runtime E2E negotiates the real VNC RFB framebuffer', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../scripts/e2e.mjs', import.meta.url), 'utf8');
  assert.match(source, /new WebSocket\(websocketUrl\)/);
  assert.match(source, /VNC_RFB_HANDSHAKE_TIMEOUT/);
  assert.match(source, /VNC RFB handshake passed/);
  assert.match(source, /guest framebuffer dimensions must be plausible/);
});
