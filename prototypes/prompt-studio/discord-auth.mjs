import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => /^[A-Za-z0-9_-]{43}$/.test(a || '') && /^[A-Za-z0-9_-]{43}$/.test(b || '') && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const readCookie = (request, name) => (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1) || '';
const redirect = (response, location) => { response.writeHead(303, {Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}); response.end(); };

export function validateOAuth(input = {}) {
  const config = {clientId: String(input.clientId || ''), clientSecret: String(input.clientSecret || ''), redirectUri: String(input.redirectUri || '')};
  if (!/^\d{1,20}$/.test(config.clientId) || !config.clientSecret || config.clientSecret.length > 1024 || /[\s\x00]/.test(config.clientSecret)) return null;
  let url;
  try { url = new URL(config.redirectUri); } catch { return null; }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/auth/discord/callback') return null;
  return config;
}

export async function createDiscordAuth({dataDir, users, oauth, fetchDiscord = fetch, secureCookies = false}) {
  const config = validateOAuth(oauth);
  const secure = secureCookies || (config && new URL(config.redirectUri).protocol === 'https:');
  const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const sessionFile = path.join(dataDir, 'discord-sessions.json');
  let sessions = {};
  try {
    const stat = await lstat(sessionFile);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid session store.');
    sessions = JSON.parse(await readFile(sessionFile, 'utf8'));
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions) || Object.entries(sessions).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || !value || typeof value.userId !== 'string' || typeof value.name !== 'string' || !Number.isFinite(value.expiresAt))) throw new Error('Invalid sessions.');
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Stored sessions are unreadable. Preserve and repair the session file.'); }
  let queue = Promise.resolve();
  function updateSessions(change) {
    const pending = queue.catch(() => {}).then(async () => {
      const next = Object.fromEntries(Object.entries(sessions).filter(([, value]) => value.expiresAt > Date.now() && users.has(value.userId)));
      change(next);
      const temporary = sessionFile + '.' + randomBytes(16).toString('hex');
      try { await writeFile(temporary, JSON.stringify(next), {flag: 'wx', mode: 0o600}); await rename(temporary, sessionFile); }
      finally { await unlink(temporary).catch(() => {}); }
      sessions = next;
    });
    queue = pending; return pending;
  }
  const pending = new Map(), attempts = new Map();
  function authenticate(request) {
    if (!config) return null;
    const token = readCookie(request, 'sonne_studio');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = sessions[hash(token)];
    return session && session.expiresAt > Date.now() && users.has(session.userId) ? {id: session.userId, name: session.name} : null;
  }
  async function handle(request, response, url) {
    if (url.pathname === '/api/auth' && request.method === 'GET') {
      response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify({provider: 'discord', configured: Boolean(config)})); return true;
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      const token = readCookie(request, 'sonne_studio');
      if (token) await updateSessions(next => { delete next[hash(token)]; });
      response.setHeader('Set-Cookie', cookie('sonne_studio', '', 0));
      response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end('{"ok":true}'); return true;
    }
    if (!['/auth/discord', '/auth/discord/callback'].includes(url.pathname)) return false;
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return true; }
    if (!config) { redirect(response, '/?auth=unconfigured'); return true; }
    if (url.pathname === '/auth/discord') {
      const publicUrl = new URL(config.redirectUri);
      if (request.headers.host !== publicUrl.host) { redirect(response, publicUrl.origin + '/auth/discord'); return true; }
      const now = Date.now(), address = request.socket.remoteAddress;
      for (const [key, value] of pending) if (value < now) pending.delete(key);
      for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
      const attempt = attempts.get(address) || {count: 0, until: now + 60000};
      if (attempt.count >= 20 || pending.size >= 1000) { redirect(response, '/?auth=busy'); return true; }
      attempt.count++; attempts.set(address, attempt);
      const state = randomBytes(32).toString('base64url');
      pending.set(state, now + 600000);
      response.setHeader('Set-Cookie', cookie('sonne_oauth', state, 600));
      const target = new URL('https://discord.com/oauth2/authorize');
      target.search = new URLSearchParams({client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri, scope: 'identify', state}).toString();
      redirect(response, target.href); return true;
    }
    const state = url.searchParams.get('state'), browserState = readCookie(request, 'sonne_oauth');
    response.setHeader('Set-Cookie', cookie('sonne_oauth', '', 0));
    if (request.headers.host !== new URL(config.redirectUri).host || url.searchParams.getAll('state').length !== 1 || !same(state, browserState) || !pending.has(state) || pending.get(state) < Date.now()) {
      redirect(response, '/?auth=expired'); return true;
    }
    pending.delete(state); // Consume before the token exchange; callbacks cannot be replayed.
    if (url.searchParams.has('error')) { redirect(response, '/?auth=cancelled'); return true; }
    const code = url.searchParams.get('code');
    if (url.searchParams.getAll('code').length !== 1 || !code || code.length > 2000 || /[\s\x00]/.test(code)) { redirect(response, '/?auth=failed'); return true; }
    try {
      const tokenResponse = await fetchDiscord('https://discord.com/api/v10/oauth2/token', {
        method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri}),
        signal: AbortSignal.timeout(10000), redirect: 'error'
      });
      if (!tokenResponse.ok) throw new Error('Token exchange rejected.');
      const token = await tokenResponse.json();
      if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 4096 || token.token_type?.toLowerCase() !== 'bearer' || !String(token.scope).split(/\s+/).includes('identify')) throw new Error('Invalid token response.');
      const userResponse = await fetchDiscord('https://discord.com/api/v10/users/@me', {headers: {Authorization: 'Bearer ' + token.access_token}, signal: AbortSignal.timeout(10000), redirect: 'error'});
      if (!userResponse.ok) throw new Error('Identity lookup rejected.');
      const user = await userResponse.json();
      if (typeof user.id !== 'string' || !/^\d{1,20}$/.test(user.id) || user.bot || !users.has(user.id)) { redirect(response, '/?auth=not_allowed'); return true; }
      const rawName = user.global_name || user.username || user.id;
      const name = typeof rawName === 'string' ? rawName.slice(0, 80) : user.id;
      const sessionToken = randomBytes(32).toString('base64url');
      await updateSessions(next => {
        const own = Object.entries(next).filter(([, value]) => value.userId === user.id).sort((a, b) => b[1].expiresAt - a[1].expiresAt);
        for (const [key] of own.slice(19)) delete next[key];
        next[hash(sessionToken)] = {userId: user.id, name, expiresAt: Date.now() + WEEK};
      });
      response.setHeader('Set-Cookie', [cookie('sonne_oauth', '', 0), cookie('sonne_studio', sessionToken, WEEK / 1000)]);
      // Discord access/refresh tokens are never persisted or sent to the browser.
      redirect(response, '/');
    } catch { redirect(response, '/?auth=failed'); }
    return true;
  }
  return {handle, authenticate};
}
