(() => {
  let worker = null;
  let overlay = null;
  let booted = false;
  let booting = false;
  let logLines = [];
  let state = 'idle';
  const STORAGE_KEY = 'mtp2026-web-os-files-v1';

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

  function readFiles() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  }

  function writeFiles(files) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }

  function publish() {
    window.dispatchEvent(new CustomEvent('mtp2026-webos-state', {
      detail: { state, ready: booted, booting, architecture: 'AArch64', execution: 'WebAssembly' }
    }));
  }

  function addLog(message) {
    logLines.push(String(message));
    if (logLines.length > 80) logLines = logLines.slice(-80);
    const target = overlay?.querySelector('[data-webos-log]');
    if (target) { target.textContent = logLines.join('\n'); target.scrollTop = target.scrollHeight; }
  }

  function setStatus(text, nextState = '') {
    state = nextState || state;
    const status = overlay?.querySelector('[data-webos-status]');
    if (status) { status.textContent = text; status.dataset.state = state; }
    publish();
  }

  function renderFiles() {
    const target = overlay?.querySelector('[data-webos-files]');
    if (!target) return;
    const files = readFiles();
    const entries = Object.entries(files);
    target.innerHTML = entries.length ? entries.map(([name, value]) => `<button type="button" data-file="${esc(name)}"><span>📄</span><span>${esc(name)}</span><small>${String(value).length} B</small></button>`).join('') : '<div class="mtp-webos-empty">No files yet. Use New File to create virtual storage.</div>';
    target.querySelectorAll('[data-file]').forEach(button => button.onclick = () => {
      const name = button.dataset.file;
      const value = readFiles()[name] || '';
      const editor = overlay.querySelector('[data-webos-editor]');
      if (editor) { editor.value = value; editor.dataset.filename = name; overlay.querySelector('[data-webos-file-name]').value = name; }
    });
  }

  function newFile() {
    const name = window.prompt('Virtual file name', 'welcome.txt');
    if (!name) return;
    const safe = name.trim().replace(/[\\/]/g, '_').slice(0, 120);
    if (!safe) return;
    const files = readFiles();
    files[safe] = '';
    writeFiles(files);
    overlay.querySelector('[data-webos-file-name]').value = safe;
    overlay.querySelector('[data-webos-editor]').value = '';
    renderFiles();
    addLog(`[fs] created ${safe}`);
  }

  function saveFile() {
    const name = overlay.querySelector('[data-webos-file-name]').value.trim().replace(/[\\/]/g, '_').slice(0, 120);
    if (!name) return;
    const files = readFiles();
    files[name] = overlay.querySelector('[data-webos-editor]').value;
    writeFiles(files);
    renderFiles();
    addLog(`[fs] saved ${name}`);
  }

  function startWorker() {
    if (worker) return worker;
    booting = true;
    state = 'booting';
    publish();
    worker = new Worker(new URL('./webOsWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const data = event.data || {};
      if (data.type === 'loaded') { setStatus('CPU emulator loaded', 'loaded'); addLog('[cpu] AArch64 WebAssembly engine loaded'); return; }
      if (data.type === 'booting') { booting = true; setStatus('Booting virtual ARM64 kernel…', 'booting'); addLog(`[boot] ${data.message}`); return; }
      if (data.type === 'ready') {
        booted = true;
        booting = false;
        setStatus('MTP2026 ARM64 virtual kernel ready', 'ready');
        addLog(`[boot] architecture=${data.architecture}`);
        addLog(`[boot] execution=${data.execution}`);
        addLog(`[boot] contract=${data.contract}`);
        addLog(`[boot] magic=${data.bootMagic}`);
        addLog('[kernel] virtual kernel entry reached successfully');
        addLog('[desktop] browser-hosted MTP2026 OS session online');
        overlay?.querySelector('[data-webos-start]')?.setAttribute('disabled', 'disabled');
        publish();
      }
      if (data.type === 'error') {
        booted = false;
        booting = false;
        state = 'error';
        setStatus('Virtual ARM64 boot failed', 'error');
        addLog(`[error] ${data.message}`);
        overlay?.querySelector('[data-webos-start]')?.removeAttribute('disabled');
        publish();
      }
      if (data.type === 'reset') {
        booted = false;
        booting = false;
        setStatus('Virtual machine reset', 'idle');
        addLog('[vm] reset');
        overlay?.querySelector('[data-webos-start]')?.removeAttribute('disabled');
        publish();
      }
    };
    worker.onerror = error => {
      booted = false;
      booting = false;
      state = 'error';
      setStatus('Virtual machine worker error', 'error');
      addLog(`[worker] ${error.message || 'unknown error'}`);
      publish();
    };
    worker.postMessage({ type: 'boot' });
    return worker;
  }

  function warmBoot() {
    if (booted || booting) return getState();
    addLog('[vm] background ARM64 warm boot requested');
    startWorker();
    return getState();
  }

  function getState() {
    return { state, ready: booted, booting, architecture: 'AArch64', execution: 'WebAssembly' };
  }

  function reset() {
    if (!worker) return warmBoot();
    booted = false;
    booting = false;
    state = 'idle';
    worker.postMessage({ type: 'reset' });
    worker.postMessage({ type: 'boot' });
    return getState();
  }

  function close() {
    overlay?.remove();
    overlay = null;
    document.body.classList.remove('mtp-webos-open');
    // Keep the ARM64 worker alive so reopening the virtual OS is immediate.
  }

  function open() {
    if (overlay) return;
    logLines = [];
    overlay = document.createElement('div');
    overlay.className = 'mtp-webos-overlay';
    overlay.innerHTML = `<section class="mtp-webos-window" role="dialog" aria-modal="true" aria-label="MTP2026 Web OS">
      <header class="mtp-webos-titlebar"><div><strong>MTP2026 Web OS</strong><span>Browser-hosted ARM64 virtual machine</span></div><div class="mtp-webos-title-actions"><button type="button" data-webos-start>Start VM</button><button type="button" data-webos-reset>Reset</button><button type="button" data-webos-close aria-label="Close">×</button></div></header>
      <div class="mtp-webos-body">
        <aside class="mtp-webos-sidebar"><div class="mtp-webos-brand">MTP<span>2026</span></div><button class="active" type="button">▦ Desktop</button><button type="button" data-webos-new>＋ New File</button><div class="mtp-webos-side-title">Virtual Files</div><div class="mtp-webos-files" data-webos-files></div></aside>
        <main class="mtp-webos-desktop"><div class="mtp-webos-topline"><div><span class="mtp-webos-chip">AArch64</span><span class="mtp-webos-chip">WebAssembly</span><span class="mtp-webos-chip">Virtual RAM</span></div><strong data-webos-status>${booted ? 'MTP2026 ARM64 virtual kernel ready' : booting ? 'Booting virtual ARM64 kernel…' : 'Starting…'}</strong></div>
          <div class="mtp-webos-grid"><article class="mtp-webos-card mtp-webos-terminal"><div class="mtp-webos-card-head"><b>Kernel Console</b><span>guest://mtp2026</span></div><pre data-webos-log></pre></article>
          <article class="mtp-webos-card mtp-webos-editor-card"><div class="mtp-webos-card-head"><b>Virtual Filesystem</b><div><input data-webos-file-name value="welcome.txt" aria-label="File name"><button type="button" data-webos-save>Save</button></div></div><textarea data-webos-editor spellcheck="false" placeholder="Create or select a virtual file…">MTP2026 Web OS\nBrowser-hosted virtual storage is active.\n</textarea></article>
          <article class="mtp-webos-card mtp-webos-info"><b>Virtual machine status</b><div><span>CPU</span><strong>AArch64</strong></div><div><span>Execution</span><strong>WebAssembly</strong></div><div><span>Host OS control</span><strong>None</strong></div><div><span>Physical device OS</span><strong>Unchanged</strong></div></article>
          <article class="mtp-webos-card mtp-webos-apps"><b>System Apps</b><div class="mtp-webos-app-grid"><button type="button" data-app="files">📁<span>Files</span></button><button type="button" data-app="terminal">⌘<span>Terminal</span></button><button type="button" data-app="settings">⚙<span>Settings</span></button><button type="button" data-app="network">◉<span>Network</span></button></div></article></div>
          <footer class="mtp-webos-taskbar"><span>◈ MTP2026</span><span>Virtual OS session</span><span>${new Date().toLocaleTimeString()}</span></footer>
        </main>
      </div>
    </section>`;
    document.body.appendChild(overlay);
    document.body.classList.add('mtp-webos-open');
    overlay.querySelector('[data-webos-close]').onclick = close;
    overlay.querySelector('[data-webos-start]').onclick = () => startWorker();
    overlay.querySelector('[data-webos-reset]').onclick = () => reset();
    overlay.querySelector('[data-webos-new]').onclick = newFile;
    overlay.querySelector('[data-webos-save]').onclick = saveFile;
    overlay.querySelector('[data-webos-editor]').oninput = () => {};
    overlay.querySelectorAll('[data-app]').forEach(button => button.onclick = () => {
      const app = button.dataset.app;
      if (app === 'files') { overlay.querySelector('[data-webos-file-name]').focus(); return; }
      if (app === 'terminal') { overlay.querySelector('[data-webos-log]').scrollIntoView({ behavior: 'smooth' }); return; }
      addLog(`[app] ${app} opened in the MTP2026 virtual desktop`);
    });
    renderFiles();
    addLog('[vm] creating browser-hosted AArch64 virtual machine');
    addLog('[vm] physical device bootloader/kernel will not be touched');
    if (!worker) startWorker();
    else if (booted) addLog('[vm] reusing already-ready ARM64 worker');
    publish();
  }

  window.MTP2026WebOS = Object.freeze({ open, close, warmBoot, reset, getState });
  window.addEventListener('load', () => setTimeout(warmBoot, 1200));
  publish();

  function installLauncherButton() {
    if (!document.querySelector('.app-shell') || document.querySelector('.mtp-webos-launch-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mtp-webos-launch-button';
    button.textContent = '◈ MTP2026 Web OS';
    button.title = 'Open the browser-hosted MTP2026 ARM64 virtual OS';
    button.onclick = open;
    const nav = document.querySelector('.sidebar .nav');
    if (nav) nav.parentNode.insertBefore(button, nav.nextSibling);
    else document.body.appendChild(button);
  }

  const observer = new MutationObserver(installLauncherButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(installLauncherButton, 400));
})();
