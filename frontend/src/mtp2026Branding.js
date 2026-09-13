const BRAND_MARK = '/branding/mtp2026-mark.svg';
const BRAND_LOGO = '/branding/mtp2026-logo-horizontal.svg';

function addBranding() {
  const shell = document.querySelector('.mtp-ios-shell');
  if (!shell || shell.dataset.mtpBrandingReady === '1') return;
  shell.dataset.mtpBrandingReady = '1';

  const header = shell.querySelector('.mtp-ios-header');
  if (header) {
    const eyebrow = header.querySelector('.mtp-ios-eyebrow');
    if (eyebrow) {
      eyebrow.textContent = 'MTP2026 DEVICE OS';
      eyebrow.style.color = '#12c8ff';
      eyebrow.style.letterSpacing = '.18em';
    }
    const title = header.querySelector('h1');
    if (title) {
      title.textContent = 'MTP2026 Device';
      title.style.background = 'linear-gradient(90deg,#fff0a0,#ffd34a 45%,#12c8ff)';
      title.style.webkitBackgroundClip = 'text';
      title.style.backgroundClip = 'text';
      title.style.color = 'transparent';
    }
    if (!header.querySelector('.mtp2026-brand-mark')) {
      const img = document.createElement('img');
      img.className = 'mtp2026-brand-mark';
      img.src = BRAND_MARK;
      img.alt = 'MTP2026';
      img.width = 42;
      img.height = 42;
      img.style.width = '42px';
      img.style.height = '42px';
      img.style.borderRadius = '13px';
      img.style.boxShadow = '0 8px 28px rgba(18,200,255,.22)';
      header.prepend(img);
    }
  }

  if (!shell.querySelector('.mtp2026-brand-watermark')) {
    const watermark = document.createElement('div');
    watermark.className = 'mtp2026-brand-watermark';
    watermark.innerHTML = `<img src="${BRAND_LOGO}" alt="MYTELEPROJECT2026" />`;
    Object.assign(watermark.style, {
      position: 'absolute',
      left: '50%',
      bottom: '34px',
      transform: 'translateX(-50%)',
      width: 'min(62vw, 260px)',
      opacity: '.12',
      pointerEvents: 'none',
      zIndex: '0',
    });
    const img = watermark.querySelector('img');
    if (img) Object.assign(img.style, { width: '100%', display: 'block' });
    shell.appendChild(watermark);
  }
}

const observer = new MutationObserver(addBranding);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('mtp2026:device-mode', addBranding);
window.addEventListener('mtp2026:default-system-os', addBranding);
addBranding();

export { BRAND_MARK, BRAND_LOGO };
