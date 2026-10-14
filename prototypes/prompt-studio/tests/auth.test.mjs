import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixture.mjs';
import { validateOAuth } from '../discord-auth.mjs';

test('Discord authorization requests only identity and stores opaque, revocable sessions', async t => {
  const f = await fixture(t), flow = await f.start();
  assert.equal(flow.target.origin + flow.target.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(flow.target.searchParams.get('scope'), 'identify');
  assert.equal(flow.target.searchParams.get('redirect_uri'), f.options.oauth.redirectUri);
  assert.equal(flow.target.searchParams.get('client_secret'), null);
  const response = await f.callback(flow);
  assert.equal(response.headers.get('location'), '/');
  const cookies = response.headers.getSetCookie(), session = cookies.find(value => value.startsWith('sonne_studio='));
  assert.match(session, /HttpOnly; SameSite=Lax; Max-Age=604800/);
  assert.ok(cookies.some(value => value.startsWith('sonne_oauth=;') && value.includes('Max-Age=0')));
  assert.equal(f.calls[0].request.body.get('client_secret'), 'synthetic-secret');
  assert.equal(f.calls[0].request.body.get('grant_type'), 'authorization_code');
  assert.equal(f.calls[1].url, 'https://discord.com/api/v10/users/@me');
  const file = path.join(f.dataDir, 'discord-sessions.json'), stored = await readFile(file, 'utf8');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  for (const secret of ['synthetic-secret', 'synthetic-token', session.split(';')[0].split('=')[1]]) assert.ok(!stored.includes(secret));
  for (const route of ['/discord-auth.mjs', '/oauth.json', '/discord-sessions.json']) assert.equal((await f.api(route)).status, 404);
  const replay = await f.callback(flow);
  assert.equal(replay.headers.get('location'), '/?auth=expired');
  assert.equal(f.calls.length, 2);
});

test('OAuth state must match the browser and is single use, including cancellation', async t => {
  const f = await fixture(t), flow = await f.start(), state = flow.target.searchParams.get('state');
  for (const [query, cookie] of [
    ['state=' + state + '&code=0', ''],
    ['state=' + state + '&code=0', 'sonne_oauth=' + 'x'.repeat(43)],
    ['state=' + state + '&state=' + state + '&code=0', flow.cookie],
    ['state=' + encodeURIComponent('ą'.repeat(43)) + '&code=0', flow.cookie]
  ]) assert.equal((await f.api('/auth/discord/callback?' + query, 'GET', undefined, cookie)).headers.get('location'), '/?auth=expired');
  assert.equal(f.calls.length, 0);
  const cancelled = await f.api('/auth/discord/callback?state=' + state + '&error=access_denied', 'GET', undefined, flow.cookie);
  assert.equal(cancelled.headers.get('location'), '/?auth=cancelled');
  assert.equal((await f.callback(flow)).headers.get('location'), '/?auth=expired');
  assert.equal(f.calls.length, 0);
});

test('unapproved accounts and Discord failures never grant profile access or expose upstream errors', async t => {
  const f = await fixture(t);
  for (const [code, error] of [['outsider', 'not_allowed'], ['bad-token', 'failed'], ['network-error', 'failed']]) {
    const response = await f.callback(await f.start(), code);
    assert.equal(response.headers.get('location'), '/?auth=' + error);
    assert.ok(!response.headers.get('set-cookie').includes('sonne_studio='));
    assert.equal(await response.text(), '');
  }
  assert.equal((await f.api('/api/workspace')).status, 401);
});

test('unconfigured OAuth disables sign-in and rejects legacy access codes and cookies', async t => {
  const f = await fixture(t, {oauth: {}});
  assert.deepEqual(await (await f.api('/api/auth')).json(), {provider: 'discord', configured: false});
  assert.equal((await f.api('/auth/discord')).headers.get('location'), '/?auth=unconfigured');
  assert.equal((await f.api('/api/login', 'POST', {code: 'old-code'})).status, 404);
  assert.equal((await f.api('/api/workspace', 'GET', undefined, 'sonne_studio=111111111111111111.9999999999.signature')).status, 401);
  assert.equal(f.calls.length, 0);
});

test('OAuth uses its canonical host, rejects public HTTP and uses Secure cookies on HTTPS', async t => {
  const f = await fixture(t, {oauth: {clientId: '999999999999999999', clientSecret: 'synthetic-secret', redirectUri: 'https://studio.example/auth/discord/callback'}});
  const canonical = await f.api('/auth/discord');
  assert.equal(canonical.headers.get('location'), 'https://studio.example/auth/discord');
  assert.equal(canonical.headers.get('set-cookie'), null);
  const start = await f.api('/auth/discord', 'GET', undefined, '', {Host: 'studio.example'});
  assert.ok(start.headers.get('set-cookie').endsWith('; Secure'));
  for (const redirectUri of ['http://studio.example/auth/discord/callback', 'https://studio.example/other', 'https://studio.example/auth/discord/callback?x=1', 'https://user:pass@studio.example/auth/discord/callback']) assert.equal(validateOAuth({...f.options.oauth, redirectUri}), null);
});
