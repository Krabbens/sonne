import http from 'node:http';
import { readFile, writeFile, mkdir, rename, lstat, readdir, access, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createDiscordAuth } from './discord-auth.mjs';
import { compilePrompt, compileTeamPrompt, compilePersonalPrompt, createProjectMemory, PROJECT_MEMORY_MAX_BYTES, validateProject, createProject, createShared, validateShared, projectChanges, historyCSV, isProjectHistoryField, MAX_FILE, MAX_TOTAL, TEXT_LIMIT } from './dist/model.mjs';

export const START = '<!-- SONNE PROJECT PROMPT START -->';
export const END = '<!-- SONNE PROJECT PROMPT END -->';
export const PROMPT_BUDGET = 40000;
const root = path.dirname(fileURLToPath(import.meta.url));
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const safeName = name => name.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '_').slice(0, 150) || 'source';
const digest = text => createHash('sha256').update(text).digest('hex');
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function updateSoul(original, prompt, limit = PROMPT_BUDGET) {
  if (prompt.includes(START) || prompt.includes(END)) throw new ApiError(422, 'The brief contains reserved integration markers. Remove them before applying.');
  const starts = original.split(START).length - 1, ends = original.split(END).length - 1;
  if (starts !== ends || starts > 1 || (starts && original.indexOf(START) > original.indexOf(END))) throw new ApiError(409, 'The managed section in SOUL.md needs operator review. No prompt was applied.');
  const section = `${START}\n## Active project brief\n\n${prompt.trimEnd()}\n${END}`;
  const result = starts ? original.slice(0, original.indexOf(START)) + section + original.slice(original.indexOf(END) + END.length) : original.trimEnd() + '\n\n' + section + '\n';
  if (result.length > limit) throw new ApiError(413, `The compiled instructions exceed the ${limit.toLocaleString('en-US')}-character agent budget. Shorten the brief or remove text sources before applying.`);
  return result;
}

async function regularFile(file, optional = false) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ApiError(409, 'A target file is not a regular file. Ask the operator to check the workspace.');
    return stat;
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function atomicWrite(file, bytes, mode = 0o600) {
  await regularFile(file, true);
  const temporary = file + '.studio-' + randomUUID();
  try { await writeFile(temporary, bytes, { mode, flag: 'wx' }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => {}); }
}
async function body(request, limit) {
  let length = 0; const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new ApiError(413, 'Request exceeds the file or project size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Send JSON project data.');
  try { return JSON.parse((await body(request, 24 * 1024 * 1024)).toString('utf8')); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Invalid JSON.'); }
}
function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function createWorkspaceServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.STUDIO_DATA_DIR || path.join(root, '.data'));
  const workspaceDir = options.workspaceDir || process.env.STUDIO_AGENT_WORKSPACE;
  const agentFilesDir = options.agentFilesDir || process.env.STUDIO_AGENT_FILES;
  const profile = options.profile;
  const personalPromptDir = options.personalPromptDir;
  const isShared = options.shared === true;
  const projectMemoryFile = isShared && personalPromptDir && agentFilesDir ? path.join(personalPromptDir, 'PROJECT_MEMORY.json') : null;
  let memoryAvailable = false;
  const publishedFiles = new Map();
  const validate = isShared ? validateShared : validateProject;
  const compile = isShared ? compileTeamPrompt : options.profileMode ? compilePersonalPrompt : compilePrompt;
  const fileDir = path.join(dataDir, 'files');
  await mkdir(fileDir, { recursive: true, mode: 0o700 });
  const currentPath = path.join(dataDir, 'current.json');
  let current;
  try {
    const stored = JSON.parse(await readFile(currentPath, 'utf8'));
    current = { ...stored, workspace: validate(stored.workspace) };
    if (!Number.isInteger(current.revision) || current.revision < 0) throw new Error('Invalid revision');
    if (isShared && (!Array.isArray(current.history) || current.history.length > 2000 || current.history.some(r => !r || !Number.isFinite(Date.parse(r.at)) || !Number.isInteger(r.revision) || !r.by || typeof r.by.id !== 'string' || typeof r.by.name !== 'string' || !Array.isArray(r.changes) || r.changes.some(c => !isProjectHistoryField(c.field) || typeof c.before !== 'string' || typeof c.after !== 'string' || typeof c.unit !== 'string')))) throw new Error('Invalid project history');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Stored workspace is unreadable. Preserve the data directory and repair it before starting.');
    current = { revision: 0, workspace: isShared ? createShared() : createProject(false), applied: null, ...(isShared ? {history: []} : {}) };
  }
  let mutations = Promise.resolve();
  const serial = operation => { const pending = mutations.catch(() => {}).then(operation); mutations = pending; return pending; };
  const filePath = id => { if (!idPattern.test(id)) throw new ApiError(400, 'Invalid source identifier.'); return path.join(fileDir, id); };
  const checkRevision = revision => { if (revision !== current.revision) throw new ApiError(409, 'Someone else updated this project. Export your draft or reload the shared workspace.'); };
  async function targetReady() {
    if (isShared && !memoryAvailable) return false;
    if (personalPromptDir && agentFilesDir) {
      try { await access(personalPromptDir, constants.W_OK); await access(agentFilesDir, constants.W_OK); return true; } catch { return false; }
    }
    if (!workspaceDir || !agentFilesDir) return false;
    try { await regularFile(path.join(workspaceDir, 'SOUL.md')); await access(workspaceDir, constants.W_OK); await access(agentFilesDir, constants.W_OK); return true; }
    catch { return false; }
  }
  async function normalise(input) {
    let project;
    try { project = validate(input); } catch (error) { throw new ApiError(422, error.message); }
    if (isShared && input.costCategories === undefined) project.costCategories = structuredClone(current.workspace.costCategories);
    let total = 0;
    for (const source of project.sources) {
      const stored = filePath(source.id), stat = await regularFile(stored);
      if (stat.size !== source.size || stat.size > MAX_FILE) throw new ApiError(422, 'A source file is missing or incomplete. Add it again.');
      total += stat.size;
      if (total > MAX_TOTAL) throw new ApiError(413, 'Source files exceed the project allowance.');
      const text = /\.(txt|md|markdown|csv|json)$/i.test(source.name) ? await readFile(stored, 'utf8') : null;
      source.text = text === null ? null : text.slice(0, TEXT_LIMIT);
      source.truncated = text !== null && text.length > TEXT_LIMIT;
      delete source.blob; delete source.base64;
      if (agentFilesDir) source.agentPath = `/workspace/files/prompt-studio/${profile ? profile.id + '/' : ''}${source.id}/${safeName(source.name)}`;
      else delete source.agentPath;
    }
    return project;
  }
  async function syncProjectMemory(next) {
    if (!projectMemoryFile) return;
    const sources = [];
    for (const source of next.workspace.sources) {
      const directory = path.join(agentFilesDir, 'prompt-studio', 'shared', source.id), name = safeName(source.name);
      await mkdir(directory, {recursive: true, mode: 0o700});
      const target = path.join(directory, name), key = source.id + '/' + name, stat = await regularFile(target, true);
      if (!stat || stat.size !== source.size || publishedFiles.get(key) !== stat.mtimeMs) {
        const bytes = await readFile(filePath(source.id));
        if (bytes.length !== source.size) throw new Error('Original project file is incomplete.');
        await atomicWrite(target, bytes);
        publishedFiles.set(key, (await regularFile(target)).mtimeMs);
      }
      sources.push({...source, agentPath: `/workspace/files/prompt-studio/shared/${source.id}/${name}`});
    }
    const snapshot = createProjectMemory({...next.workspace, sources}, next.history, next.revision);
    const bytes = JSON.stringify(snapshot);
    if (Buffer.byteLength(bytes) > PROJECT_MEMORY_MAX_BYTES) throw new Error('Project memory exceeds its storage limit.');
    await atomicWrite(projectMemoryFile, bytes);
    memoryAvailable = true;
  }
  async function store(next) {
    await atomicWrite(currentPath, JSON.stringify(next));
    if (projectMemoryFile) {
      try { await syncProjectMemory(next); }
      catch {
        memoryAvailable = false;
        await atomicWrite(currentPath, JSON.stringify(current));
        throw new ApiError(503, 'Sonne’s project memory could not be updated. The draft was not saved.');
      }
    }
    current = next;
  }
  if (projectMemoryFile) {
    try { await syncProjectMemory(current); }
    catch { console.warn('Project memory is unavailable. Saved workspace data was preserved.'); }
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const activeProfile = request.studioProfile || profile;
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'same-origin');
      response.setHeader('X-Frame-Options', 'DENY');
      if (url.pathname === '/health') return send(response, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) {
          let originHost;
          try { originHost = request.headers.origin ? new URL(request.headers.origin).host : request.headers.host; } catch { throw new ApiError(403, 'Invalid request origin.'); }
          if (originHost !== request.headers.host || request.headers['x-prompt-studio'] !== '1') throw new ApiError(403, 'Cross-site changes are not allowed.');
        }
        if (url.pathname === '/api/workspace' && request.method === 'GET') return send(response, 200, { ...current, ...(activeProfile ? { profile: activeProfile } : {}), connected: await targetReady() });
        if (isShared && url.pathname === '/api/history.csv' && request.method === 'GET') {
          response.writeHead(200, {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sonne-project-history.csv"', 'Cache-Control': 'no-store'});
          response.end(historyCSV(current.history)); return;
        }
        if (url.pathname === '/api/workspace' && request.method === 'PUT') {
          const payload = await jsonBody(request);
          return await serial(async () => {
            if (payload.requestId !== undefined && (typeof payload.requestId !== 'string' || !idPattern.test(payload.requestId))) throw new ApiError(422, 'Invalid save request.');
            const operation = payload.requestId === undefined ? null : {requestId:payload.requestId, requestRevision:payload.revision, requestedBy:activeProfile?.id || null, hash:digest(JSON.stringify(payload.workspace) ?? '')};
            const result = () => ({revision:current.revision,sourcePaths:Object.fromEntries(current.workspace.sources.map(source => [source.id,source.agentPath])),...(isShared ? {history:current.history} : {})});
            if (operation && current.lastSave?.requestId === operation.requestId) {
              if (current.lastSave.requestRevision !== payload.revision || current.lastSave.requestedBy !== operation.requestedBy || current.lastSave.hash !== operation.hash || current.lastSave.revision !== current.revision) throw new ApiError(409, 'The workspace changed after this save. Reload the latest data before saving again.');
              return send(response,200,result());
            }
            checkRevision(payload.revision);
            const project = await normalise(payload.workspace);
            const removed = current.workspace.sources.filter(old => !project.sources.some(source => source.id === old.id));
            const next = {...current, revision: current.revision + 1, workspace: project};
            next.lastSave = operation ? {...operation,revision:next.revision} : null;
            if (isShared) {
              const record = projectChanges(current.workspace, project, activeProfile, next.revision);
              next.history = record ? [...current.history, record] : current.history;
              if (next.history.length > 2000 || Buffer.byteLength(JSON.stringify(next.history)) > 8 * 1024 * 1024) throw new ApiError(413, 'Project history is full. Export it and ask the administrator to archive it before making more changes.');
            }
            await store(next);
            for (const source of removed) await unlink(filePath(source.id)).catch(() => {});
            send(response, 200, result());
          });
        }
        if (url.pathname.startsWith('/api/files/')) {
          const id = decodeURIComponent(url.pathname.slice('/api/files/'.length)), file = filePath(id);
          if (request.method === 'GET') {
            await regularFile(file); const bytes = await readFile(file);
            response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'Cache-Control': 'no-store' }); return response.end(bytes);
          }
          if (request.method === 'PUT') {
            const bytes = await body(request, MAX_FILE);
            return await serial(async () => {
              if (await regularFile(file, true)) {
                const existing = await readFile(file);
                if (!existing.equals(bytes)) throw new ApiError(409, 'This source identifier already has a different file.');
              } else {
                let total = 0;
                for (const name of await readdir(fileDir)) if (idPattern.test(name)) total += (await regularFile(path.join(fileDir, name))).size;
                if (total + bytes.length > MAX_TOTAL * 2) throw new ApiError(413, 'Server upload staging is full. Ask the operator to clear unused uploads.');
                await atomicWrite(file, bytes);
              }
              send(response, 200, { id });
            });
          }
        }
        if (url.pathname === '/api/apply' && request.method === 'POST') {
          const payload = await jsonBody(request);
          return await serial(async () => {
            if (payload.requestId !== undefined && (typeof payload.requestId !== 'string' || !idPattern.test(payload.requestId))) throw new ApiError(422, 'Invalid publication request.');
            const operation = payload.requestId === undefined ? {} : {requestId:payload.requestId, requestRevision:payload.revision, requestedBy:activeProfile?.id || null};
            if (payload.requestId && current.applied?.requestId === payload.requestId) {
              if (current.applied.requestRevision !== payload.revision || current.applied.requestedBy !== (activeProfile?.id || null) || current.applied.revision !== current.revision) throw new ApiError(409, 'The workspace changed after this publication. Reload the latest data before applying again.');
              if (!await targetReady()) throw new ApiError(503, 'Sonne is not connected. Check the workspace mounts.');
              return send(response, 200, {...current, ...(activeProfile ? {profile:activeProfile} : {}), connected:true});
            }
            checkRevision(payload.revision);
            if (!await targetReady()) throw new ApiError(503, 'Sonne is not connected. Mount its workspace and file directory in the Prompt Studio service.');
            const project = await normalise(current.workspace);
            if (personalPromptDir) {
              const prompt = compile(project, activeProfile);
              if (prompt.includes(START) || prompt.includes(END)) throw new ApiError(422, 'The brief contains reserved integration markers.');
              if (prompt.length > PROMPT_BUDGET) throw new ApiError(413, 'The personal prompt exceeds the 40,000-character budget. Shorten the brief.');
              const promptPath = path.join(personalPromptDir, 'PROMPT');
              const stat = await regularFile(promptPath, true), previous = stat ? await readFile(promptPath) : null;
              const id = randomUUID(), backupDir = path.join(dataDir, 'backups', id);
              await mkdir(backupDir, { recursive: true, mode: 0o700 });
              if (previous !== null) await atomicWrite(path.join(backupDir, 'PROMPT'), previous);
              for (const source of project.sources) {
                const target = path.join(agentFilesDir, 'prompt-studio', profile.id, source.id);
                await mkdir(target, { recursive: true, mode: 0o700 });
                await atomicWrite(path.join(target, safeName(source.name)), await readFile(filePath(source.id)));
              }
              const applied = { id, at: new Date().toISOString(), hash: digest(prompt), revision: current.revision + 1, ...operation };
              if (!isShared) {
                let versionPrompt = prompt;
                if (options.sharedPromptDir) {
                  const file = path.join(options.sharedPromptDir, 'PROMPT');
                  if (await regularFile(file, true)) versionPrompt = await readFile(file, 'utf8') + '\n' + prompt;
                }
                project.versions.push({ id, title: 'Applied to Sonne', prompt: versionPrompt, createdAt: applied.at });
                project.versions = project.versions.slice(-30);
              }
              try {
                await atomicWrite(promptPath, prompt);
                await store({ ...current, revision: current.revision + 1, workspace: project, applied });
              } catch (error) {
                if (previous !== null) await atomicWrite(promptPath, previous); else await unlink(promptPath).catch(() => {});
                throw error;
              }
              return send(response, 200, { ...current, profile: activeProfile, connected: true });
            }
            const prompt = compilePrompt(project), soulPath = path.join(workspaceDir, 'SOUL.md'), promptPath = path.join(workspaceDir, 'PROMPT');
            const soulStat = await regularFile(soulPath), oldSoul = await readFile(soulPath, 'utf8');
            const newSoul = updateSoul(oldSoul, prompt);
            const promptStat = await regularFile(promptPath, true), oldPrompt = promptStat ? await readFile(promptPath) : null;
            const id = randomUUID(), backupDir = path.join(dataDir, 'backups', id);
            await mkdir(backupDir, { recursive: true, mode: 0o700 });
            await atomicWrite(path.join(backupDir, 'SOUL.md'), oldSoul);
            if (oldPrompt !== null) await atomicWrite(path.join(backupDir, 'PROMPT'), oldPrompt);
            // Sources are only exposed to the agent when the operator applies the brief.
            for (const source of project.sources) {
              const target = path.join(agentFilesDir, 'prompt-studio', source.id);
              await mkdir(target, { recursive: true, mode: 0o700 });
              await atomicWrite(path.join(target, safeName(source.name)), await readFile(filePath(source.id)));
            }
            const applied = { id, at: new Date().toISOString(), hash: digest(prompt), revision: current.revision + 1, ...operation };
            project.versions.push({ id, title: 'Applied to Sonne', prompt, createdAt: applied.at });
            project.versions = project.versions.slice(-30);
            try {
              await atomicWrite(promptPath, prompt, promptStat ? promptStat.mode & 0o777 : 0o600);
              await atomicWrite(soulPath, newSoul, soulStat.mode & 0o777);
              await store({ revision: current.revision + 1, workspace: project, applied });
            } catch (error) {
              await atomicWrite(soulPath, oldSoul, soulStat.mode & 0o777);
              if (oldPrompt !== null) await atomicWrite(promptPath, oldPrompt, promptStat.mode & 0o777);
              else await unlink(promptPath).catch(() => {});
              throw error;
            }
            send(response, 200, { ...current, connected: true });
          });
        }
        throw new ApiError(404, 'API route not found.');
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new ApiError(405, 'Method not allowed.');
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html', 'app.mjs', 'model.mjs', 'request.mjs', 'styles.css', 'favicon.svg', 'logo.png'].includes(name)) throw new ApiError(404, 'Not found.');
      const bytes = await readFile(path.join(root, 'dist', name));
      const type = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(name)];
      response.writeHead(200, { 'Content-Type': type + (name.endsWith('.png') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!response.headersSent) send(response, error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : 'The operation could not be completed. No success was recorded; check the service and workspace permissions.' });
      else response.end();
    }
  });
  return server;
}

// Each authenticated account owns a separate workspace handler. API callers
// cannot choose a profile ID: only the verified session selects the handler.
export async function createStudioServer(options = {}) {
  const accountsPath = options.accountsPath || process.env.STUDIO_ACCOUNTS_FILE;
  if (!accountsPath) return createWorkspaceServer(options);
  const dataDir = path.resolve(options.dataDir || process.env.STUDIO_DATA_DIR || path.join(root, '.data'));
  const promptsDir = options.promptsDir || process.env.STUDIO_PROMPTS_DIR;
  const agentFilesDir = options.agentFilesDir || process.env.STUDIO_AGENT_FILES;
  if (!promptsDir || !agentFilesDir) throw new Error('Profile mode requires the personal prompt and agent file mounts.');
  const accounts = JSON.parse(await readFile(accountsPath, 'utf8'));
  if (accounts.version !== 1 || !Array.isArray(accounts.users) || !accounts.users.length || accounts.users.length > 100) throw new Error('Invalid profile registry.');
  const users = new Map(), handlers = new Map();
  const sharedPromptDir = path.join(promptsDir, 'shared');
  await mkdir(sharedPromptDir, {recursive: true, mode: 0o700});
  const sharedHandler = await createWorkspaceServer({...options, dataDir: path.join(dataDir, 'team'), agentFilesDir, personalPromptDir: sharedPromptDir, shared: true, profile: {id: 'shared', name: 'Team'}});
  for (const user of accounts.users) {
    if (!/^\d{1,20}$/.test(user.id) || users.has(user.id)) throw new Error('Invalid or duplicate profile identity.');
    users.set(user.id, user);
    const personalPromptDir = path.join(promptsDir, user.id);
    await mkdir(personalPromptDir, { recursive: true, mode: 0o700 });
    handlers.set(user.id, await createWorkspaceServer({ ...options, profileMode: true, sharedPromptDir, dataDir: path.join(dataDir, 'profiles', user.id), agentFilesDir, personalPromptDir, profile: { id: user.id, name: user.name || user.id } }));
  }
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  let oauth = options.oauth;
  const oauthFile = options.oauthFile || process.env.STUDIO_OAUTH_FILE;
  if (!oauth && oauthFile) {
    try { await regularFile(oauthFile); oauth = JSON.parse(await readFile(oauthFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('OAuth configuration is unreadable. Preserve and repair the configuration file.'); }
  }
  const auth = await createDiscordAuth({dataDir, users, oauth, fetchDiscord: options.oauthFetch, secureCookies: options.secureCookies || process.env.STUDIO_SECURE_COOKIES === '1'});
  const staticHandler = handlers.values().next().value;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (url.pathname === '/health') return staticHandler.emit('request', request, response);
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.origin ? new URL(request.headers.origin).host : request.headers.host;
        if (origin !== request.headers.host || request.headers['x-prompt-studio'] !== '1') throw new ApiError(403, 'Cross-site changes are not allowed.');
      }
      if (await auth.handle(request, response, url)) return;
      if (!url.pathname.startsWith('/api/')) return staticHandler.emit('request', request, response);
      if (url.pathname === '/api/login') throw new ApiError(404, 'Use Discord sign-in.');
      const identity = auth.authenticate(request);
      if (!identity) throw new ApiError(401, 'Sign in with Discord.');
      request.studioProfile = identity;
      if (url.pathname === '/api/team' || url.pathname.startsWith('/api/team/')) {
        const suffix = url.pathname.slice('/api/team'.length);
        request.url = (suffix ? '/api' + suffix : '/api/workspace') + url.search;
        return sharedHandler.emit('request', request, response);
      }
      handlers.get(identity.id).emit('request', request, response);
    } catch (error) { send(response, error.status || 500, { error: error.status ? error.message : 'The operation could not be completed.' }); }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createStudioServer();
  const port = Number(process.env.PORT || 9080), host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Prompt Studio listening on http://${host}:${port}`));
}
