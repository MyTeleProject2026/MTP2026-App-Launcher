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
      #mtp2026-desktop-window{resize:both;min-width:min(320px,94vw);min-height:240px;max-width:94vw;max-height:88vh;overflow:auto;touch-action:pan-x pan-y}
      #mtp2026-desktop-window .mtp-desktop-window-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;cursor:move;touch-action:none;user-select:none}
      #mtp2026-desktop-window .mtp-desktop-window-head [data-close]{margin-left:auto;cursor:pointer}
      #mtp2026-desktop-window .mtp-pc-card{cursor:pointer;user-select:none}
      #mtp2026-desktop-window .mtp-pc-card:focus-visible{outline:2px solid #55c9ff;outline-offset:2px}
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
    const search = panel.querySelector('.mtp-start-search');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase();
      panel.querySelectorAll('.mtp-start-item').forEach(item => { item.hidden = Boolean(query) && !item.textContent.toLocaleLowerCase().includes(query); });
      panel.querySelectorAll('[data-start-action]').forEach(item => { item.hidden = Boolean(query) && !item.textContent.toLocaleLowerCase().includes(query); });
    });
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      const first = [...panel.querySelectorAll('.mtp-start-item, [data-start-action]')].find(item => !item.hidden);
      if (first) first.click();
    });
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
    panel.querySelector('.mtp-start-search').value = '';
    panel.querySelectorAll('.mtp-start-item, [data-start-action]').forEach(item => { item.hidden = false; });
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) panel.querySelector('.mtp-start-search').focus();
  }

  const WORKSPACE_KEY = 'mtp2026-desktop-virtual-files-v1';
  const readWorkspace = () => {
    try { const value = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; }
  };
  const writeWorkspace = items => { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(items)); };
  const folderName = path => path === '/' ? 'This PC' : path.split('/').filter(Boolean).pop();
  function openFileExplorer() {
    let win = document.getElementById('mtp2026-desktop-window');
    if (!win) {
      win = document.createElement('div'); win.id = 'mtp2026-desktop-window';
      win.innerHTML = `<div class="mtp-desktop-window-head"><span>📁</span><b data-window-title>File Explorer · This PC</b><button type="button" data-minimize aria-label="Minimize File Explorer" title="Minimize">−</button><button type="button" data-maximize aria-label="Maximize File Explorer" title="Maximize">□</button><button type="button" data-close aria-label="Close File Explorer" title="Close">×</button></div>
        <div class="mtp-desktop-window-body">
          <div class="mtp-explorer-toolbar" style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px">
            <button type="button" data-explorer-action="back">← Back</button><button type="button" data-explorer-action="new-file">＋ New file</button><button type="button" data-explorer-action="new-folder">＋ New folder</button><button type="button" data-explorer-action="upload">↑ Import text file</button><button type="button" data-explorer-action="rename">Rename</button><button type="button" data-explorer-action="download">Download</button><button type="button" data-explorer-action="delete">Delete</button><button type="button" data-explorer-action="pick-folder">Open device folder</button><button type="button" data-native-action="new-file">New device file</button><button type="button" data-native-action="new-folder">New device folder</button><input type="file" data-explorer-file hidden accept=".txt,.md,.json,.csv,.html,.css,.js,.xml,.log">
          </div>
          <div data-explorer-breadcrumb style="color:#8da3bc;font-size:11px;margin:8px 0 12px">This PC</div>
          <div class="mtp-pc-grid" data-explorer-grid></div>
          <p data-explorer-status role="status" aria-live="polite" style="color:#9eb4cd;font-size:12px;padding:8px 2px">Virtual workspace is stored in this browser on this device.</p>
          <div data-native-folder hidden style="margin-top:14px"><b>Granted device folder</b><div data-native-list class="mtp-pc-grid" style="margin-top:8px"></div></div>
        </div><div style="height:33px;border-top:1px solid rgba(255,255,255,.08);padding:0 12px;display:flex;align-items:center;color:#7188a2;font-size:10px">MTP2026 virtual workspace · browser storage</div>`;
      document.body.appendChild(win);
      const body = win.querySelector('.mtp-desktop-window-body');
      const status = win.querySelector('[data-explorer-status]');
      const grid = win.querySelector('[data-explorer-grid]');
      let currentPath = '/';
      let selectedId = null;
      let nativeDirectory = null;
      let nativeDirectoryStack = [];
      const statusMessage = message => { status.textContent = message; };
      const pathJoin = (parent, name) => (parent === '/' ? '' : parent.replace(/\/$/, '')) + '/' + name;
      const safeName = value => String(value || '').trim().replace(/[\\/\\\\]/g, '-').replace(/[\\x00-\\x1f]/g, '').slice(0, 120);
      const itemsAt = path => readWorkspace().filter(item => item.parent === path);
      const selectedItem = () => readWorkspace().find(item => item.id === selectedId);
      const buttonStyle = `.mtp-explorer-toolbar button{border:1px solid rgba(150,190,230,.2);border-radius:8px;background:#11233a;color:#e8f4ff;padding:8px 10px;font-size:11px;cursor:pointer}.mtp-explorer-toolbar button:hover{background:#1b3554}.mtp-explorer-toolbar button:focus-visible{outline:2px solid #55c9ff;outline-offset:2px}`;
      if (!document.getElementById('mtp2026-explorer-toolbar-style')) { const style=document.createElement('style');style.id='mtp2026-explorer-toolbar-style';style.textContent=buttonStyle;document.head.appendChild(style); }
      const render = () => {
        selectedId = selectedId && readWorkspace().some(item => item.id === selectedId && item.parent === currentPath) ? selectedId : null;
        win.querySelector('[data-window-title]').textContent = 'File Explorer · ' + folderName(currentPath);
        win.querySelector('[data-explorer-breadcrumb]').textContent = 'This PC' + (currentPath === '/' ? '' : '  /  ' + currentPath.split('/').filter(Boolean).join('  /  '));
        grid.innerHTML = '';
        if (currentPath === '/') {
          const folders = ['Desktop','Documents','Downloads','Pictures','Music','Games','MTP2026 Cloud','Device Storage'];
          folders.forEach((name,index) => {
            const card=document.createElement('button');card.type='button';card.className='mtp-pc-card';card.style.cssText='color:#eef6ff;text-align:left;cursor:pointer';
            card.innerHTML='<b>'+['🗂','📄','⬇','🖼','🎵','🎮','☁','💾'][index]+' '+esc(name)+'</b><small>Open virtual '+esc(name)+' workspace</small>';
            card.addEventListener('click',()=>{currentPath='/'+name;render();statusMessage('Opened '+name+'. Changes are stored in this browser profile.');});
            grid.appendChild(card);
          });
        } else {
          const back=document.createElement('button');back.type='button';back.className='mtp-pc-card';back.innerHTML='<b>↩ Parent folder</b><small>Go up one level</small>';back.addEventListener('click',()=>{currentPath=currentPath.split('/').slice(0,-1).join('/')||'/';selectedId=null;render();});grid.appendChild(back);
          const entries=itemsAt(currentPath).sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||a.name.localeCompare(b.name));
          if(!entries.length){const empty=document.createElement('p');empty.style.cssText='color:#8197b0;font-size:12px;grid-column:1/-1';empty.textContent='This folder is empty. Create a file or import a text document to get started.';grid.appendChild(empty);}
          entries.forEach(item=>{
            const card=document.createElement('button');card.type='button';card.className='mtp-pc-card';card.style.cssText='color:#eef6ff;text-align:left;cursor:pointer'+(item.id===selectedId?';outline:2px solid #55c9ff':'');
            card.innerHTML='<b>'+esc(item.kind==='folder'?'📁':'📄')+' '+esc(item.name)+'</b><small>'+esc(item.kind==='folder'?'Folder':(item.size||new Blob([item.content||'']).size)+' bytes · '+(item.updatedAt||'local file'))+'</small>';
            card.addEventListener('click',()=>{selectedId=item.id;if(item.kind==='folder'){currentPath=pathJoin(currentPath,item.name);selectedId=null;render();}else{render();statusMessage('Selected '+item.name+'. Use Download, Rename, or Delete.');}});
            card.addEventListener('dblclick',()=>{if(item.kind==='folder'){currentPath=pathJoin(currentPath,item.name);selectedId=null;render();}else{const blob=new Blob([item.content||''],{type:item.mime||'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);statusMessage('Downloaded '+item.name+'.');}});
            grid.appendChild(card);
          });
        }
        const nativeWrap=win.querySelector('[data-native-folder]');
        nativeWrap.hidden=!nativeDirectory;
        if(nativeDirectory) renderNativeDirectory();
      };
      const editNativeTextFile = async (name, handle) => {
        let file;
        try {
          file = await handle.getFile();
          if (file.size > 2 * 1024 * 1024) { statusMessage('The built-in editor supports text files up to 2 MB.'); return; }
          const initialText = await file.text();
          const overlay = document.createElement('div');
          overlay.setAttribute('role', 'dialog');
          overlay.setAttribute('aria-modal', 'true');
          overlay.setAttribute('aria-label', 'Edit ' + name);
          overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.68);display:grid;place-items:center;padding:16px;box-sizing:border-box';
          const panel = document.createElement('section');
          panel.style.cssText = 'width:min(760px,100%);height:min(78vh,680px);display:flex;flex-direction:column;gap:10px;padding:14px;box-sizing:border-box;border:1px solid rgba(150,190,230,.25);border-radius:14px;background:#091426;color:#eef6ff;box-shadow:0 20px 70px rgba(0,0,0,.6)';
          const heading = document.createElement('b'); heading.textContent = 'Edit device file · ' + name;
          const note = document.createElement('small'); note.textContent = 'Changes write directly to the device folder you granted. Save only when you want to replace this file’s contents.'; note.style.cssText = 'color:#91a7c1;line-height:1.5';
          const editor = document.createElement('textarea'); editor.value = initialText; editor.setAttribute('aria-label', 'File contents');
          editor.spellcheck = false;
          editor.style.cssText = 'flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;padding:12px;border:1px solid rgba(150,190,230,.22);border-radius:9px;background:#050d18;color:#eaf5ff;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace';
          const footer = document.createElement('div'); footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap';
          const button = (label, primary, action) => { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.style.cssText='border:1px solid rgba(150,190,230,.25);border-radius:8px;padding:9px 13px;background:'+(primary?'#1766a8':'#11233a')+';color:#fff;cursor:pointer'; b.onclick=action; footer.appendChild(b); return b; };
          const close = () => overlay.remove();
          button('Cancel', false, close);
          const save = button('Save changes', true, async () => {
            save.disabled = true; save.textContent = 'Saving…';
            try {
              const writable = await handle.createWritable();
              await writable.write(editor.value);
              await writable.close();
              close();
              statusMessage('Saved changes to device file ' + name + '.');
              await renderNativeDirectory();
            } catch (error) {
              save.disabled = false; save.textContent = 'Save changes';
              statusMessage('Could not save ' + name + ': ' + error.message);
            }
          });
          panel.append(heading, note, editor, footer); overlay.appendChild(panel); win.appendChild(overlay);
          editor.focus();
          overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
        } catch (error) { statusMessage('Could not open ' + name + ': ' + error.message); }
      };
      const renderNativeDirectory = async () => {
        const target=win.querySelector('[data-native-list]');target.innerHTML='';
        try {
          const nativeWrap=win.querySelector('[data-native-folder]');
          let nav=nativeWrap.querySelector('[data-native-nav]');
          if(!nav){nav=document.createElement('div');nav.setAttribute('data-native-nav','');nav.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0';nativeWrap.insertBefore(nav,target);}
          nav.innerHTML='';
          const location=document.createElement('small');
          location.textContent='Folder path: /'+nativeDirectoryStack.map(item=>item.name).join('/');
          location.style.cssText='color:#91a7c1;flex:1;min-width:150px;overflow-wrap:anywhere';
          nav.appendChild(location);
          if(nativeDirectoryStack.length){
            const up=document.createElement('button');up.type='button';up.textContent='↑ Up one folder';
            up.style.cssText='border:1px solid rgba(150,190,230,.2);border-radius:7px;background:#11233a;color:#e8f4ff;padding:6px 8px;font-size:10px;cursor:pointer';
            up.onclick=async()=>{const parent=nativeDirectoryStack.pop();nativeDirectory=parent.handle;await renderNativeDirectory();};
            nav.appendChild(up);
          }
          for await (const [name,handle] of nativeDirectory.entries()) {
            const card=document.createElement('div');card.className='mtp-pc-card';
            const title=document.createElement('b');title.textContent=(handle.kind==='directory'?'📁 ':'📄 ')+name;
            const detail=document.createElement('small');detail.textContent='Granted device folder · '+handle.kind;
            card.append(title,detail);
            const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-top:9px';
            const makeButton=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='border:1px solid rgba(150,190,230,.2);border-radius:7px;background:#11233a;color:#e8f4ff;padding:6px 8px;font-size:10px;cursor:pointer';b.onclick=action;actions.appendChild(b);};
            if(handle.kind==='directory'){
              makeButton('Open folder',async()=>{nativeDirectoryStack.push({name,handle:nativeDirectory});nativeDirectory=handle;await renderNativeDirectory();});
            }
            if(handle.kind==='file'){
              if (/\.(txt|md|json|csv|html|css|js|xml|log|yaml|yml|ini|conf|sh|py)$/i.test(name)) makeButton('Edit text',()=>editNativeTextFile(name,handle));
              makeButton('Import copy',async()=>{
                try{
                  const file=await handle.getFile();
                  if(file.size>2*1024*1024){statusMessage('Import is limited to text files up to 2 MB.');return;}
                  const content=await file.text();
                  const destination=currentPath==='/'?'/Documents':currentPath;
                  const name=safeName(file.name);
                  if(readWorkspace().some(x=>x.parent===destination&&x.name.toLowerCase()===name.toLowerCase())){statusMessage('A virtual file with that name already exists in '+destination+'.');return;}
                  saveItem({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),parent:destination,name,kind:'file',content,mime:file.type||'text/plain;charset=utf-8',size:file.size,updatedAt:new Date().toISOString()});
                  currentPath=destination;render();statusMessage('Imported a text copy of '+name+' into '+destination+'.');
                }catch(error){statusMessage('Import failed: '+error.message);}
              });
              makeButton('Download',async()=>{try{const file=await handle.getFile();const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);statusMessage('Downloaded '+name+'.');}catch(error){statusMessage('Download failed: '+error.message);}});
            }
            makeButton('Delete',async()=>{
              if(!confirm('Delete '+name+' from the selected device folder?'))return;
              try{await nativeDirectory.removeEntry(name,{recursive:handle.kind==='directory'});statusMessage('Deleted '+name+' from the granted device folder.');await renderNativeDirectory();}
              catch(error){statusMessage('Delete failed: '+error.message);}
            });
            card.appendChild(actions);target.appendChild(card);
          }
          if(!target.children.length){const empty=document.createElement('p');empty.style.cssText='color:#8197b0;font-size:12px;grid-column:1 / -1';empty.textContent='This granted device folder is empty.';target.appendChild(empty);}
        } catch(error){statusMessage('Could not read the granted folder: '+error.message);}
      };
      const saveItem = item => { const all=readWorkspace();all.push(item);writeWorkspace(all);selectedId=item.id;render(); };
      const selectedAction = action => {
        const item=selectedItem();
        if(!item){statusMessage('Select a file first.');return;}
        const all=readWorkspace();
        if(action==='rename'){const name=safeName(prompt('New name',item.name));if(!name){statusMessage('Rename cancelled.');return;}if(all.some(x=>x.parent===item.parent&&x.name.toLowerCase()===name.toLowerCase()&&x.id!==item.id)){statusMessage('A file or folder with that name already exists.');return;}writeWorkspace(all.map(x=>x.id===item.id?{...x,name,updatedAt:new Date().toISOString()}:x));statusMessage('Renamed to '+name+'.');render();}
        if(action==='delete'){if(!confirm('Delete "'+item.name+'" from this browser workspace?'))return;const removeIds=new Set([item.id]);if(item.kind==='folder'){const prefix=pathJoin(item.parent,item.name);let changed=true;while(changed){changed=false;all.forEach(x=>{if(x.parent===prefix||[...removeIds].some(id=>all.find(y=>y.id===id)?.kind==='folder'&&x.parent===pathJoin(all.find(y=>y.id===id).parent,all.find(y=>y.id===id).name))){if(!removeIds.has(x.id)){removeIds.add(x.id);changed=true;}}});}}writeWorkspace(all.filter(x=>!removeIds.has(x.id)));selectedId=null;render();statusMessage('Deleted '+item.name+' from browser storage.');}
        if(action==='download'){if(item.kind==='folder'){statusMessage('Choose a file to download.');return;}const url=URL.createObjectURL(new Blob([item.content||''],{type:item.mime||'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);statusMessage('Downloaded '+item.name+'.');}
      };
      let maximized = false;
      let previousWindowBounds = null;
      win.querySelector('[data-minimize]').onclick=()=>{win.style.display='none';};
      win.querySelector('[data-maximize]').onclick=()=>{
        if(!maximized){
          previousWindowBounds={inset:win.style.inset,left:win.style.left,top:win.style.top,right:win.style.right,bottom:win.style.bottom,width:win.style.width,height:win.style.height};
          win.style.inset='12px 12px 64px';win.style.left='12px';win.style.top='12px';win.style.right='12px';win.style.bottom='64px';win.style.width='auto';win.style.height='auto';
          maximized=true;win.querySelector('[data-maximize]').textContent='❐';win.querySelector('[data-maximize]').setAttribute('aria-label','Restore File Explorer');win.querySelector('[data-maximize]').title='Restore';
        }else{
          const b=previousWindowBounds||{};win.style.inset=b.inset||'8vh 7vw 10vh';win.style.left=b.left||'';win.style.top=b.top||'';win.style.right=b.right||'';win.style.bottom=b.bottom||'';win.style.width=b.width||'';win.style.height=b.height||'';
          maximized=false;win.querySelector('[data-maximize]').textContent='□';win.querySelector('[data-maximize]').setAttribute('aria-label','Maximize File Explorer');win.querySelector('[data-maximize]').title='Maximize';
        }
      };
      win.querySelector('[data-close]').onclick=()=>{win.style.display='none';};
      win.querySelector('[data-explorer-action="back"]').onclick=()=>{if(currentPath==='/'){statusMessage('You are already at This PC.');return;}currentPath=currentPath.split('/').slice(0,-1).join('/')||'/';selectedId=null;render();};
      win.querySelector('[data-explorer-action="new-file"]').onclick=()=>{if(currentPath==='/'){statusMessage('Open a folder before creating a file.');return;}const name=safeName(prompt('File name (for example notes.txt)','notes.txt'));if(!name)return;if(itemsAt(currentPath).some(x=>x.name.toLowerCase()===name.toLowerCase())){statusMessage('That name already exists in this folder.');return;}const content=prompt('Text content for '+name,'')??null;if(content===null)return;saveItem({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),parent:currentPath,name,kind:'file',content,mime:'text/plain;charset=utf-8',size:new Blob([content]).size,updatedAt:new Date().toISOString()});statusMessage('Created '+name+'.');};
      win.querySelector('[data-explorer-action="new-folder"]').onclick=()=>{if(currentPath==='/'){statusMessage('Open a folder before creating a subfolder.');return;}const name=safeName(prompt('Folder name','New Folder'));if(!name)return;if(itemsAt(currentPath).some(x=>x.name.toLowerCase()===name.toLowerCase())){statusMessage('That name already exists in this folder.');return;}saveItem({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),parent:currentPath,name,kind:'folder',content:'',updatedAt:new Date().toISOString()});statusMessage('Created folder '+name+'.');};
      win.querySelector('[data-explorer-action="upload"]').onclick=()=>{if(currentPath==='/'){statusMessage('Open a folder before importing a file.');return;}win.querySelector('[data-explorer-file]').click();};
      win.querySelector('[data-explorer-file]').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>2*1024*1024){statusMessage('For this browser workspace, import text files up to 2 MB.');return;}try{const content=await file.text();const name=safeName(file.name);if(itemsAt(currentPath).some(x=>x.name.toLowerCase()===name.toLowerCase())){statusMessage('A file with that name already exists. Rename it before importing.');return;}saveItem({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),parent:currentPath,name,kind:'file',content,mime:file.type||'text/plain;charset=utf-8',size:file.size,updatedAt:new Date().toISOString()});statusMessage('Imported '+name+' into browser storage.');}catch(error){statusMessage('Import failed: '+error.message);}};
      win.querySelector('[data-explorer-action="rename"]').onclick=()=>selectedAction('rename');
      win.querySelector('[data-explorer-action="download"]').onclick=()=>selectedAction('download');
      win.querySelector('[data-explorer-action="delete"]').onclick=()=>selectedAction('delete');
      win.querySelector('[data-explorer-action="pick-folder"]').onclick=async()=>{if(!window.showDirectoryPicker){statusMessage('Device folder access is not supported in this browser. Use Import text file or the virtual workspace instead.');return;}try{nativeDirectory=await window.showDirectoryPicker({mode:'readwrite'});nativeDirectoryStack=[];statusMessage('Device folder access granted for this session. Native folder changes are separate from the virtual workspace.');render();}catch(error){statusMessage(error.name==='AbortError'?'Folder selection cancelled.':'Could not open folder: '+error.message);}};
      win.querySelector('[data-native-action="new-file"]').onclick=async()=>{
        if(!nativeDirectory){statusMessage('Open a device folder first.');return;}
        if(!window.showDirectoryPicker){statusMessage('Device folder access is not supported in this browser.');return;}
        const name=safeName(prompt('New device text file name','notes.txt'));if(!name)return;
        const content=prompt('Text content for '+name,'');if(content===null){statusMessage('File creation cancelled.');return;}
        try{
          for await (const [existingName] of nativeDirectory.entries()) {
            if(existingName.toLocaleLowerCase()===name.toLocaleLowerCase()){statusMessage('A device file or folder with that name already exists. Choose another name.');return;}
          }
          const handle=await nativeDirectory.getFileHandle(name,{create:true});
          const writable=await handle.createWritable();
          await writable.write(content);await writable.close();
          statusMessage('Created '+name+' in the granted device folder.');await renderNativeDirectory();
        }catch(error){statusMessage('Could not create device file: '+error.message);}
      };
      win.querySelector('[data-native-action="new-folder"]').onclick=async()=>{
        if(!nativeDirectory){statusMessage('Open a device folder first.');return;}
        const name=safeName(prompt('New device folder name','New Folder'));if(!name)return;
        try{await nativeDirectory.getDirectoryHandle(name,{create:true});statusMessage('Created device folder '+name+'.');await renderNativeDirectory();}
        catch(error){statusMessage('Could not create device folder: '+error.message);}
      };
      const head=win.querySelector('.mtp-desktop-window-head');let drag=null;
      head.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const rect=win.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};head.setPointerCapture?.(event.pointerId);});
      head.addEventListener('pointermove',event=>{if(!drag)return;const left=Math.max(0,Math.min(window.innerWidth-win.offsetWidth,drag.left+event.clientX-drag.x));const top=Math.max(0,Math.min(window.innerHeight-100,drag.top+event.clientY-drag.y));win.style.left=left+'px';win.style.top=top+'px';win.style.right='auto';win.style.bottom='auto';});
      const stopDrag=()=>{drag=null;};head.addEventListener('pointerup',stopDrag);head.addEventListener('pointercancel',stopDrag);
      render();
    }
    win.style.display='block';
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
