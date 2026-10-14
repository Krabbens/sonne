import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStudioServer, updateSoul, START, END } from '../server.mjs';
import { createProject, compilePrompt } from '../dist/model.mjs';

async function fixture(t, connected = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-server-'));
  const dataDir = path.join(root, 'data'), workspaceDir = path.join(root, 'workspace'), agentFilesDir = path.join(root, 'agent-files');
  await mkdir(workspaceDir); await mkdir(agentFilesDir);
  await writeFile(path.join(workspaceDir, 'SOUL.md'), '# Persona\nBe concise.\n');
  await writeFile(path.join(workspaceDir, 'AGENTS.md'), 'Preserve these working rules.\n');
  const options = connected ? { dataDir, workspaceDir, agentFilesDir } : { dataDir };
  const server = await createStudioServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); });
  const api = (route, method = 'GET', value = undefined, headers = {}) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Prompt-Studio': '1', ...headers }, ...(value === undefined ? {} : { body: typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value) }) });
  return { root, dataDir, workspaceDir, agentFilesDir, server, base, api, options };
}

test('shared drafts persist and stale revisions cannot overwrite someone else', async t => {
  const f = await fixture(t);
  const initial = await (await f.api('/api/workspace')).json(); assert.equal(initial.revision, 0);
  const project = createProject(false); project.project.name = 'Team project';
  assert.equal((await f.api('/api/workspace', 'PUT', { revision: 0, workspace: project })).status, 200);
  project.project.name = 'Stale overwrite';
  assert.equal((await f.api('/api/workspace', 'PUT', { revision: 0, workspace: project })).status, 409);
  assert.equal((await (await f.api('/api/workspace')).json()).workspace.project.name, 'Team project');
  assert.equal(JSON.parse(await readFile(path.join(f.dataDir, 'current.json'))).revision, 1);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  const restored = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/workspace`)).json();
  assert.equal(restored.workspace.project.name, 'Team project');
  restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));
});

test('apply updates the mounted prompt, preserves persona and rules, and exposes original files', async t => {
  const f = await fixture(t), project = createProject(false), text = 'Retain the existing trees.';
  project.project.name = 'Pavilion'; project.disciplines.architecture.values.objective = 'Compare two options.';
  assert.equal((await f.api('/api/files/source-1', 'PUT', text, { 'Content-Type': 'application/octet-stream' })).status, 200);
  project.sources.push({ id: 'source-1', name: 'brief.md', discipline: 'architecture', category: 'Design brief', size: Buffer.byteLength(text), type: 'text/markdown', note: '', text: 'Forged client text', truncated: false });
  assert.equal((await f.api('/api/workspace', 'PUT', { revision: 0, workspace: project })).status, 200);
  const result = await (await f.api('/api/apply', 'POST', { revision: 1 })).json();
  assert.ok(result.applied.hash); assert.equal(result.revision, 2); assert.equal(result.workspace.versions.length, 1);
  const prompt = await readFile(path.join(f.workspaceDir, 'PROMPT'), 'utf8'), soul = await readFile(path.join(f.workspaceDir, 'SOUL.md'), 'utf8');
  assert.equal(prompt, compilePrompt(result.workspace));
  assert.ok(prompt.includes(text)); assert.ok(!prompt.includes('Forged client text'));
  assert.ok(prompt.includes('/workspace/files/prompt-studio/source-1/brief.md'));
  assert.ok(soul.startsWith('# Persona\nBe concise.\n')); assert.ok(soul.includes(prompt.trim()));
  assert.equal(await readFile(path.join(f.workspaceDir, 'AGENTS.md'), 'utf8'), 'Preserve these working rules.\n');
  assert.equal(await readFile(path.join(f.agentFilesDir, 'prompt-studio', 'source-1', 'brief.md'), 'utf8'), text);
  assert.equal(await readFile(path.join(f.dataDir, 'backups', result.applied.id, 'SOUL.md'), 'utf8'), '# Persona\nBe concise.\n');
  assert.equal((await f.api('/api/apply', 'POST', { revision: 1 })).status, 409);
  assert.equal((await f.api('/api/apply', 'POST', { revision: 2 })).status, 200);
  const updated = await readFile(path.join(f.workspaceDir, 'SOUL.md'), 'utf8');
  assert.equal(updated.split(START).length - 1, 1); assert.equal(updated.split(END).length - 1, 1);
});

test('overlong instructions and reserved markers leave the active prompt untouched', async t => {
  const f = await fixture(t), project = createProject(false);
  await writeFile(path.join(f.workspaceDir, 'PROMPT'), 'Previously active');
  project.disciplines.architecture.values.objective = 'x'.repeat(20000);
  project.disciplines.architecture.values.spatial = 'y'.repeat(20000);
  await f.api('/api/workspace', 'PUT', { revision: 0, workspace: project });
  assert.equal((await f.api('/api/apply', 'POST', { revision: 1 })).status, 413);
  assert.equal(await readFile(path.join(f.workspaceDir, 'PROMPT'), 'utf8'), 'Previously active');
  assert.equal(await readFile(path.join(f.workspaceDir, 'SOUL.md'), 'utf8'), '# Persona\nBe concise.\n');
  assert.throws(() => updateSoul('Persona', START), /reserved integration markers/);
  assert.throws(() => updateSoul('Persona\n' + START, 'Brief'), /operator review/);
});

test('unconnected workspaces and symlink targets never report a successful apply', async t => {
  const f = await fixture(t, false);
  assert.equal((await f.api('/api/apply', 'POST', { revision: 0 })).status, 503);
  const g = await fixture(t); const target = path.join(g.root, 'outside');
  await writeFile(target, 'Do not alter'); await symlink(target, path.join(g.workspaceDir, 'PROMPT'));
  assert.equal((await g.api('/api/apply', 'POST', { revision: 0 })).status, 409);
  assert.equal(await readFile(target, 'utf8'), 'Do not alter');
});

test('cross-site mutations, traversal and fabricated source records are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.api('/api/workspace', 'PUT', {}, { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await f.api('/api/files/bad%2Fid', 'PUT', 'x', { 'Content-Type': 'application/octet-stream' })).status, 400);
  const project = createProject(false);
  project.sources.push({ id: '../outside', name: 'x.txt', discipline: 'architecture', category: 'Reference', size: 1, type: 'text/plain', note: '', text: 'x' });
  assert.equal((await f.api('/api/workspace', 'PUT', { revision: 0, workspace: project })).status, 400);
  assert.equal((await (await f.api('/api/workspace')).json()).revision, 0);
  assert.equal((await fetch(f.base + '/server.mjs')).status, 404);
  assert.equal((await fetch(f.base + '/')).status, 200);
});

test('corrupt persisted data is preserved and prevents a misleading empty workspace', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.dataDir, 'current.json'), '{broken');
  await assert.rejects(() => createStudioServer(f.options), /Stored workspace is unreadable/);
  assert.equal(await readFile(path.join(f.dataDir, 'current.json'), 'utf8'), '{broken');
});
