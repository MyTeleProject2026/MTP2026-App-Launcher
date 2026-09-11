(() => {
  if (window.__MTP_NETWORK_RESILIENCE__) return;
  window.__MTP_NETWORK_RESILIENCE__ = true;
  const originalFetch = window.fetch.bind(window);
  const API_HINT = '/api/';
  const CACHE_PREFIX = 'mtp2026-api-cache-v2:';
  const GET_TIMEOUT = 4200;
  const AUTH_TIMEOUT = 3000;
  const MUTATION_TIMEOUT = 6500;
  const CACHEABLE = ['/api/apps','/api/apps/experience','/api/apps/recent','/api/settings','/api/notifications'];
  const keyFor = url => `${CACHE_PREFIX}${url}`;
  const isApi = url => url.includes(API_HINT);
  const isCacheable = (url, method) => method === 'GET' && CACHEABLE.some(path => url.includes(path));
  const isAuth = url => url.includes('/api/auth/session');
  function readCache(url) { try { const raw = localStorage.getItem(keyFor(url)); if (!raw) return null; const value = JSON.parse(raw); return value && typeof value.body === 'string' ? value : null; } catch (_) { return null; } }
  function writeCache(url, response, body) { try { localStorage.setItem(keyFor(url), JSON.stringify({body,contentType:response.headers.get('content-type') || 'application/json',status:response.status,savedAt:Date.now()})); } catch (_) {} }
  function cachedResponse(entry) { return new Response(entry.body,{status:entry.status || 200,headers:{'Content-Type':entry.contentType || 'application/json','X-MTP2026-Cache':'stale'}}); }
  async function boundedFetch(input, init, timeoutMs) {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const timer = setTimeout(() => controller.abort('MTP2026_REQUEST_TIMEOUT'), timeoutMs);
    const onAbort = () => controller.abort(callerSignal.reason || 'MTP2026_CALLER_ABORT');
    callerSignal?.addEventListener('abort', onAbort, {once:true});
    try { return await originalFetch(input,{...(init || {}),signal:controller.signal}); }
    finally { clearTimeout(timer); callerSignal?.removeEventListener('abort',onAbort); }
  }
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    if (!isApi(url)) return originalFetch(input,init);
    const cacheable = isCacheable(url,method);
    const cached = cacheable ? readCache(url) : null;
    const timeout = isAuth(url) ? AUTH_TIMEOUT : method === 'GET' ? GET_TIMEOUT : MUTATION_TIMEOUT;
    if (cacheable && cached && navigator.onLine === false) return cachedResponse(cached);
    try {
      const response = await boundedFetch(input,init,timeout);
      if (cacheable && response.ok) response.clone().text().then(body => writeCache(url,response,body)).catch(() => {});
      return response;
    } catch (error) {
      if (cacheable && cached) return cachedResponse(cached);
      if (method === 'GET') return new Response(JSON.stringify({error:'MTP2026_NETWORK_TIMEOUT',stale:false}),{status:504,headers:{'Content-Type':'application/json','X-MTP2026-Timeout':'true'}});
      throw error;
    }
  };
  window.MTP2026Network = Object.freeze({
    clearCache() { try { Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k)); } catch (_) {} },
    status() { return {online:navigator.onLine !== false,bounded:true,cacheVersion:2}; }
  });
})();
