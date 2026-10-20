import test from 'node:test';
import assert from 'node:assert/strict';

test('concurrent session readers share one anonymous cookie challenge', async () => {
  const api = await import('../app/lib/api.ts?coalesce');
  const originalFetch = globalThis.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await gate;
    return Response.json({csrf_token: 'fresh-challenge', user: null});
  };
  const readers = [api.session(), api.session()];
  try {
    assert.equal(calls, 1, 'two anonymous responses can overwrite the session cookie');
  } finally {
    release();
    await Promise.all(readers);
    globalThis.fetch = originalFetch;
  }
});

test('a sign-in waits for an in-flight challenge instead of sending the old token', async () => {
  const api = await import('../app/lib/api.ts?refresh');
  const originalFetch = globalThis.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let challengeCount = 0;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/session') {
      challengeCount++;
      if (challengeCount > 1) await gate;
      return Response.json({csrf_token: challengeCount === 1 ? 'old-token' : 'fresh-token'});
    }
    sent.push(new Headers(init.headers).get('X-CSRF-Token'));
    return Response.json({authenticated: true});
  };
  let signIn;
  try {
    await api.session();
    const refresh = api.session();
    signIn = api.apiFetch('/api/auth/login', {method: 'POST'});
    assert.deepEqual(sent, [], 'do not race the response that rotates the cookie');
    release();
    await Promise.all([refresh, signIn]);
    assert.deepEqual(sent, ['fresh-token']);
  } finally {
    release();
    await signIn;
    globalThis.fetch = originalFetch;
  }
});
