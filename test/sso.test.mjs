import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginTransaction, pkceChallenge, serializeCookie, readCookies } from '../backend/src/auth/vexaaccount-sso.js';

test('PKCE transaction is cryptographically shaped and internally consistent', () => {
  const tx = createLoginTransaction();
  assert.equal(tx.challenge, pkceChallenge(tx.verifier));
  assert.ok(tx.state.length >= 32);
  assert.ok(tx.verifier.length >= 43);
  assert.ok(tx.challenge.length >= 43);
});

test('session cookie is HttpOnly, Secure and SameSite=Lax in production mode', () => {
  const cookie = serializeCookie('mtp_session', 'abc', { maxAge: 60, httpOnly: true, secure: true, sameSite: 'Lax' });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=60/);
});

test('cookie parser handles encoded values', () => {
  const req = { headers: { cookie: 'mtp_session=hello%20world; theme=dark' } };
  assert.deepEqual(readCookies(req), { mtp_session: 'hello world', theme: 'dark' });
});
