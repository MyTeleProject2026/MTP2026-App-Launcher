/* MTP2026 Desktop OS workspace layer. This is an MTP2026-owned desktop experience, not Microsoft Windows firmware. */
(() => {
  if (window.__MTP2026_DESKTOP_EXPERIENCE__) return;
  window.__MTP2026_DESKTOP_EXPERIENCE__ = true;

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const isDesktop = () => document.documentElement.dataset.mtpDeviceMode === 'desktop' || document.documentElement.dataset.mtpDeviceMode === 'windows';
  const root = () => document.getElementById('mtp2026-guest-shell');
  const apps = () => {
    try { return JSON.parse(localStorage.getItem('mtp2026-installed-vexastore-apps-v3') || '[]'); } catch (_) { return []; }
  };
  const dispatch = name => window.dispatchEvent(new CustomEvent(name));
  const openExternal = url => { try { window.MTP2026NativePlatform?.nativeOpenExternal?.(url); } catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); } };

  function styles() {
    if (document.getElementById('mtp2026-desktop-experience-style')) return;
    const style = document.createElement('style');
    style.id = 'mtp2026-desktop-experience-style';
    style.textContent = `
      #mtp2026-guest-shell .mtp-desktop-workspace{position:relative;min-height:100%;overflow:hidden;background:radial-gradient(circle at 50% 0%,#172c4c 0,#0b1628 45%,#06101e 100%)}
      #mtp2026-guest-shell .mtp-desktop-icons{position:absolute;inset:18px 18px 58px;display:grid;grid-template-columns:repeat(auto-fill,82px);grid-auto-rows:86px;gap:8px;align-content:start;z-index:3}
      #mtp2026-guest-shell .mtp-desktop-icon{border:1px solid transparent;background:transparent;color:#eef7ff;border-radius:10px;padding:7px 4px;display:grid;place-items:center;gap:4px;cursor:pointer;text-align:center;font-size:10px;text-shadow:0 1px 3px #000}
      #mtp2026-guest-shell .mtp-desktop-icon:hover{background:rgba(120,190,255,.12);border-color:rgba(160,210,255,.2)}
      #mtp2026-guest-shell .mtp-desktop-icon .ico{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:rgba(255,255,255,.09);font-size:20px}
      #mtp2026-guest-shell .mtp-desktop-taskbar{position:absolute;left:10px;right:10px;bottom:9px;height:46px;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:rgba(7,16,29,.88);backdrop-filter:blur(18px);display:flex;align-items:center;gap:5px;padding:4px 7px;z-index:20;box-shadow:0 10px 35px rgba(0,0,0,.4)}
      #mtp2026-guest-shell .mtp-task-button{height:38px;min-width:38px;border:0;border-radius:9px;background:transparent;color:#eaf5ff;cursor:pointer;padding:0 9px}.mtp-task-button:hover{background:rgba(255,255,255,.09)}
      #mtp2026-guest-shell .mtp-task-start{font-size:21px;font-weight:900}.mtp-task-search{flex:0 0 180px;text-align:left;color:#91a7c1!important;background:rgba(255,255,255,.055)!important}
      #mtp2026-guest-shell .mtp-task-apps{display:flex;gap:3px;flex:1;justify-content:center;min-width:0}.mtp-task-app{font-size:17px}.mtp-task-tray{display:flex;align-items:center;gap:9px;color:#b8c7d9;font-size:10px;padding:0 7px}.mtp-task-tray b{font-size:11px;color:#edf6ff}
      #mtp2026-desktop-start{position:fixed;z-index:2147482490;width:min(560px,calc(100vw - 24px));max-height:min(650px,calc(100vh - 78px));overflow:auto;border:1px solid rgba(255,255,255,.15);border-radius:18px;background:rgba(7,16,29,.96);backdrop-filter:blur(24px);box-shadow:0 24px 80px rgba(0,0,0,.55);padding:15px;color:#edf6ff;display:none}
      #mtp2026-desktop-start.open{display:block}.mtp-start-search{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:#101e31;color:#fff;border-radius:10px;padding:10px}.mtp-start-title{margin:14px 2px 8px;font-size:11px;color:#89a6c5}.mtp-start-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.mtp-start-item{border:0;border-radius:10px;background:#0e1b2d;color:#fff;padding:10px;text-align:left;cursor:pointer}.mtp-start-item:hover{background:#162943}.mtp-start-item b{display:block;font-size:11px}.mtp-start-item small{display:block;color:#7f95ae;font-size:9px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #mtp2026-desktop-window{position:fixed;z-index:2147482480;inset:8vh 7vw 10vh;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#091426;color:#eef6ff;box-shadow:0 30px 100px rgba(0,0,0,.65);display:none;overflow:hidden}.mtp-desktop-window-head{height:42px;display:flex;align-items:center;gap:9px;padding:0 12px;background:#0d1b2d;border-bottom:1px solid rgba(255,255,255,.1)}.mtp-desktop-window-head b{font-size:12px;flex:1}.mtp-desktop-window-head button{border:0;background:transparent;color:#fff;font-size:18px}.mtp-desktop-window-body{padding:16px;overflow:auto;height:calc(100% - 75px)}.mtp-pc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px}.mtp-pc-card{padding:13px;border-radius:11px;background:#0e1c30;border:1px solid rgba(255,255,255,.07)}.mtp-pc-card b{font-size:12px}.mtp-pc-card small{display:block;color:#8095ae;margin-top:5px;font-size:10px}
      @media(max-width:700px){#mtp2026-guest-shell .mtp-desktop-icons{grid-template-columns:repeat(4,70px);gap:5px;inset:10px 8px 60px}.mtp-task-search{display:none!important}#mtp2026-desktop-start{left:8px!important;bottom:65px!important}.mtp-start-grid{grid-template-columns:repeat(2,1fr)}#mtp2026-desktop-window{inset:7vh 3vw 9vh}}
    `;
    document.head.appendChild(style);
  }

  function startPanel() {
    let panel = document.getElementById('mtp2026-desktop-start');
    if (panel) return panel;
    panel = document.createElement('div'); panel.id = 'mtp2026-desktop-start';
    panel.innerHTML = `<input class="mtp-start-search" placeholder="Search apps, settings and files" aria-label="Search desktop"><div class="mtp-start-title">Pinned</div><div class="mtp-start-grid" data-start-grid></div><div class="mtp-start-title">System</div><div class="mtp-start-grid"><button class="mtp-start-item" data-start-action="files"><b>📁 File Explorer</b><small>This PC · MTP2026 Files</small></button><button class="mtp-start-item" data-start-action="settings"><b>⚙ Settings</b><small>Device & OS · account</small></button><button class="mtp-start-item" data-start-action="account"><b>VexaAccount</b><small>Profile · security · session</small></button><button class="mtp-start-item" data-start-action="store"><b>VexaStore</b><small>Applications</small></button><button class="mtp-start-item" data-start-action="device"><b>Device & OS</b><small>Switch guest profile</small></button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-start-action="files"]').onclick = () => { panel.classList.remove('open'); openFileExplorer(); };
    panel.querySelector('[data-start-action="settings"]').onclick = () => { panel.classList.remove('open'); dispatch('mtp2026:open-settings'); };
    panel.querySelector('[data-start-action="account"]').onclick = () => { panel.classList.remove('open'); dispatch('mtp2026:open-account'); };
    panel.querySelector('[data-start-action="store"]').onclick = () => openExternal('https://www.vexastore.2bd.net/');
    panel.querySelector('[data-start-action="device"]').onclick = () => { panel.classList.remove('open'); document.querySelector('#mtp2026-guest-shell [data-action="device-os"]')?.click(); };
    return panel;
  }

  function openStart(button) {
    const panel = startPanel();
    const rect = button.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, rect.left))}px`;
    panel.style.bottom = '65px';
    const grid = panel.querySelector('[data-start-grid]');
    const installed = apps();
    grid.innerHTML = installed.length ? installed.slice(0, 16).map((app, index) => `<button class="mtp-start-item" data-app-start="${esc(app.id || app.slug || app.url)}"><b>${esc(app.name || app.title || `VexaApp ${index + 1}`)}</b><small>${esc(app.url || '')}</small></button>`).join('') : '<div style="grid-column:1/-1;color:#8197b0;font-size:11px;padding:8px">No installed WebApps. Open VexaStore or Install WebApp to add one.</div>';
    grid.querySelectorAll('[data-app-start]').forEach(b => b.onclick = () => { const id = b.dataset.appStart; const target = document.querySelector(`#mtp2026-guest-shell [data-app-id="${CSS.escape(id)}"]`); target?.click(); panel.classList.remove('open'); });
    panel.classList.toggle('open');
  }

  function openFileExplorer() {
    let win = document.getElementById('mtp2026-desktop-window');
    if (!win) {
      win = document.createElement('div'); win.id = 'mtp2026-desktop-window';
      win.innerHTML = `<div class="mtp-desktop-window-head"><span>📁</span><b>This PC · MTP2026 Files</b><button type="button" data-close>×</button></div><div class="mtp-desktop-window-body"><div style="color:#8da3bc;font-size:10px;margin-bottom:12px">MTP2026 virtual storage workspace · local browser storage / native storage when available</div><div class="mtp-pc-grid"><div class="mtp-pc-card"><b>🗂 Desktop</b><small>Desktop workspace</small></div><div class="mtp-pc-card"><b>📄 Documents</b><small>MTP2026 documents</small></div><div class="mtp-pc-card"><b>⬇ Downloads</b><small>Downloaded files</small></div><div class="mtp-pc-card"><b>🖼 Pictures</b><small>Pictures and icons</small></div><div class="mtp-pc-card"><b>🎵 Music</b><small>Media storage</small></div><div class="mtp-pc-card"><b>🎮 Games</b><small>Gaming application data</small></div><div class="mtp-pc-card"><b>☁ MTP2026 Cloud</b><small>VexaAccount-synchronized workspace</small></div><div class="mtp-pc-card"><b>💾 Device Storage</b><small>OPFS / native storage</small></div></div></div><div style="height:33px;border-top:1px solid rgba(255,255,255,.08);padding:0 12px;display:flex;align-items:center;color:#7188a2;font-size:10px">ARM64 · MTP2026 Desktop OS</div>`;
      document.body.appendChild(win); win.querySelector('[data-close]').onclick = () => win.style.display = 'none';
    }
    win.style.display = 'block';
  }

  function buildTaskbar(desktop) {
    if (desktop.querySelector('.mtp-desktop-taskbar')) return;
    const taskbar = document.createElement('div'); taskbar.className = 'mtp-desktop-taskbar';
    taskbar.innerHTML = `<button class="mtp-task-button mtp-task-start" title="Start">⊞</button><button class="mtp-task-button mtp-task-search" title="Search">Search apps, settings and files</button><div class="mtp-task-apps"><button class="mtp-task-button mtp-task-app" title="File Explorer">📁</button><button class="mtp-task-button mtp-task-app" title="VexaStore">▣</button><button class="mtp-task-button mtp-task-app" title="VexaAccount">V</button></div><div class="mtp-task-tray"><span>ARM64</span><span>MTP2026</span><b data-desktop-clock></b></div>`;
    desktop.appendChild(taskbar);
    taskbar.querySelector('.mtp-task-start').onclick = e => openStart(e.currentTarget);
    taskbar.querySelector('.mtp-task-search').onclick = e => openStart(taskbar.querySelector('.mtp-task-start'));
    taskbar.querySelectorAll('.mtp-task-app')[0].onclick = openFileExplorer;
    taskbar.querySelectorAll('.mtp-task-app')[1].onclick = () => openExternal('https://www.vexastore.2bd.net/');
    taskbar.querySelectorAll('.mtp-task-app')[2].onclick = () => dispatch('mtp2026:open-account');
    const clock = taskbar.querySelector('[data-desktop-clock]');
    const tick = () => { if (clock) clock.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); };
    tick(); setInterval(tick, 30000);
  }

  function decorate() {
    if (!isDesktop()) return;
    const shell = root(); const desktop = shell?.querySelector('.mtp-guest-desktop');
    if (!desktop) return;
    styles();
    if (!desktop.querySelector('.mtp-desktop-icons')) {
      const icons = document.createElement('div'); icons.className = 'mtp-desktop-icons';
      icons.innerHTML = `<button class="mtp-desktop-icon" data-desktop-action="pc"><span class="ico">🖥</span><span>This PC</span></button><button class="mtp-desktop-icon" data-desktop-action="files"><span class="ico">📁</span><span>File Explorer</span></button><button class="mtp-desktop-icon" data-desktop-action="store"><span class="ico">▣</span><span>VexaStore</span></button><button class="mtp-desktop-icon" data-desktop-action="account"><span class="ico">V</span><span>VexaAccount</span></button><button class="mtp-desktop-icon" data-desktop-action="settings"><span class="ico">⚙</span><span>Settings</span></button><button class="mtp-desktop-icon" data-desktop-action="webapp"><span class="ico">🌐</span><span>Install WebApp</span></button>`;
      desktop.appendChild(icons);
      icons.querySelector('[data-desktop-action="pc"]').onclick = openFileExplorer;
      icons.querySelector('[data-desktop-action="files"]').onclick = openFileExplorer;
      icons.querySelector('[data-desktop-action="store"]').onclick = () => openExternal('https://www.vexastore.2bd.net/');
      icons.querySelector('[data-desktop-action="account"]').onclick = () => dispatch('mtp2026:open-account');
      icons.querySelector('[data-desktop-action="settings"]').onclick = () => dispatch('mtp2026:open-settings');
      icons.querySelector('[data-desktop-action="webapp"]').onclick = () => desktop.querySelector('[data-action="webapp"]')?.click();
    }
    buildTaskbar(desktop);
  }

  const observer = new MutationObserver(() => { if (isDesktop()) decorate(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('mtp2026:device-mode', decorate);
  window.addEventListener('resize', () => { if (isDesktop()) decorate(); });
  window.addEventListener('keydown', event => { if (event.key === 'Meta' && !event.repeat && isDesktop()) { const start = document.querySelector('#mtp2026-guest-shell .mtp-task-start'); if (start) openStart(start); } if (event.key === 'Escape') { document.getElementById('mtp2026-desktop-start')?.classList.remove('open'); } });
  window.addEventListener('load', () => setTimeout(decorate, 500));
})();
