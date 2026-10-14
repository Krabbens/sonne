import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { createStudioServer } from '../server.mjs';

export const ids = ['111111111111111111', '222222222222222222'];
export async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-profiles-'));
  const dataDir = path.join(root, 'data'), promptsDir = path.join(root, 'active'), agentFilesDir = path.join(root, 'files'), accountsPath = path.join(root, 'accounts.json');
  await mkdir(promptsDir); await mkdir(agentFilesDir);
  await writeFile(accountsPath, JSON.stringify({version: 1, users: ids.map(id => ({id, name: id}))}));
  await writeFile(path.join(promptsDir, 'users.json'), JSON.stringify(ids));
  const calls = [];
  const options = {dataDir, promptsDir, agentFilesDir, accountsPath,
    oauth: {clientId: '999999999999999999', clientSecret: 'synthetic-secret', redirectUri: 'http://localhost:9080/auth/discord/callback'},
    oauthFetch: async (url, request) => {
      calls.push({url, request});
      if (url.endsWith('/oauth2/token')) {
        const code = request.body.get('code');
        if (code === 'network-error') throw new Error('Private upstream details');
        if (code === 'bad-token') return Response.json({error: 'Private token details'}, {status: 400});
        return Response.json({access_token: 'synthetic-token-' + code, token_type: 'Bearer', scope: 'identify'});
      }
      const code = request.headers.Authorization.replace('Bearer synthetic-token-', '');
      return Response.json({id: ids[Number(code)] || '333333333333333333', global_name: ['Alice', 'Bob'][Number(code)] || 'Outsider'});
    }, ...overrides};
  const server = await createStudioServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, {recursive: true});});
  const api = (route, method = 'GET', value, cookie = '', headers = {}) => new Promise((resolve, reject) => {
    const body = value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value);
    const request = httpRequest(base + route, {method, headers: {Host: 'localhost:9080', 'Content-Type': 'application/json', 'X-Prompt-Studio': '1', Cookie: cookie, ...(body === undefined ? {} : {'Content-Length': Buffer.byteLength(body)}), ...headers}}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) responseHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
        resolve(new Response(Buffer.concat(chunks), {status: response.statusCode, headers: responseHeaders}));
      });
      response.on('error', reject);
    });
    request.on('error', reject); request.end(body);
  });
  async function start() {
    const response = await api('/auth/discord');
    assert.equal(response.status, 303);
    return {target: new URL(response.headers.get('location')), cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  const callback = (flow, code = '0', extra = '') => api('/auth/discord/callback?state=' + flow.target.searchParams.get('state') + '&code=' + encodeURIComponent(code) + extra, 'GET', undefined, flow.cookie);
  async function login(i) {
    const response = await callback(await start(), String(i));
    assert.equal(response.headers.get('location'), '/');
    return response.headers.getSetCookie().find(value => value.startsWith('sonne_studio=')).split(';')[0];
  }
  return {api, start, callback, login, root, dataDir, promptsDir, agentFilesDir, options, calls};
}
