const DEFAULT_TIMEOUT_MS = 4500;

export function fetchWithTimeout(input, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal || controller.signal;
  return fetch(input, { ...options, signal }).finally(() => clearTimeout(timer));
}

export async function readJsonResource(url, options = {}, fallback = null) {
  try {
    const response = await fetchWithTimeout(url, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, data: fallback };
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: fallback, error };
  }
}
