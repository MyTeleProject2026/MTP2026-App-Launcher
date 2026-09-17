/* Load the legacy/augmentation experience layer only after the authenticated React launcher exists. */
(() => {
  if (window.__MTP2026_EXPERIENCE_LOADER__) return;
  window.__MTP2026_EXPERIENCE_LOADER__ = true;

  let loaded = false;
  const load = () => {
    if (loaded || !document.querySelector('.app-shell')) return;
    loaded = true;
    import('./experience.js').catch(error => {
      loaded = false;
      console.warn('[MTP2026] authenticated experience layer failed to load:', error);
    });
    observer?.disconnect();
  };

  const observer = new MutationObserver(load);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', load, { once: true });
  load();
})();
