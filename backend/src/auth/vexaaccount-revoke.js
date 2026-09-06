export async function revokeVexaSession(refreshToken) {
  const token = String(refreshToken || '').trim();
  if (!token) return false;
  const raw = process.env.VEXA_ACCOUNT_SSO_CONFIG || '';
  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { throw new Error('VEXA_ACCOUNT_SSO_CONFIG_INVALID'); }
  }
  const baseUrl = 'https://api-vexaaccount.onrender.com';
  const timeoutMs = Math.min(Number(parsed.timeoutMs || 10000), 7000);
  const body = new URLSearchParams({ refresh_token: token });
  const response = await fetch(new URL('/api/sso/logout', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });
  return response.ok;
}
