import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStudioServer } from '../server.mjs';
import { createProject } from '../dist/model.mjs';
import { personalPrompt } from '../openclaw-plugin/index.mjs';
import { fixture, ids } from './fixture.mjs';

test('profiles require authentication and cannot select a different account', async t => {
  const f = await fixture(t);
  assert.equal((await f.api('/api/workspace')).status, 401);
  assert.equal((await f.api('/api/login', 'POST', {code: 'old-access-code'})).status, 404);
  const alice = await f.login(0), bob = await f.login(1);
  const project = createProject(false); project.project.name = 'Alice project';
  assert.equal((await f.api('/api/workspace', 'PUT', {revision: 0, workspace: project, profile: ids[1]}, alice)).status, 200);
  assert.equal((await (await f.api('/api/workspace?id=' + ids[0], 'GET', undefined, bob)).json()).workspace.project.name, 'Untitled project');
  assert.equal((await (await f.api('/api/workspace', 'GET', undefined, alice)).json()).profile.name, 'Alice');
  const forged = alice.slice(0, -1) + (alice.endsWith('a') ? 'b' : 'a');
  assert.equal((await f.api('/api/workspace', 'GET', undefined, forged)).status, 401);
  assert.equal((await f.api('/api/workspace', 'PUT', {}, alice, {Origin: 'https://outside.example'})).status, 403);
  assert.equal((await f.api('/api/logout', 'POST', {}, alice)).headers.get('set-cookie').includes('Max-Age=0'), true);
  assert.equal((await f.api('/api/workspace', 'GET', undefined, alice)).status, 401);
  assert.equal((await f.api('/api/workspace', 'GET', undefined, bob)).status, 200);
});

test('personal files, revisions and applied prompts remain separate across users and restarts', async t => {
  const f = await fixture(t), cookies = await Promise.all([f.login(0), f.login(1)]);
  for (let i = 0; i < 2; i++) {
    const text = ['Preserve trees.', 'Use recycled steel.'][i], project = createProject(false);
    project.disciplines.architecture.values.objective = ['Alice objective', 'Bob objective'][i];
    await f.api('/api/files/source-1', 'PUT', text, cookies[i], {'Content-Type': 'application/octet-stream'});
    project.sources.push({id: 'source-1', name: 'brief.md', size: Buffer.byteLength(text), type: 'text/markdown', discipline: 'architecture', category: 'Design brief', note: '', text: null});
    assert.equal((await f.api('/api/workspace', 'PUT', {revision: 0, workspace: project}, cookies[i])).status, 200);
  }
  await Promise.all(cookies.map(async cookie => assert.equal((await f.api('/api/apply', 'POST', {revision: 1}, cookie)).status, 200)));
  const alicePrompt = await readFile(path.join(f.promptsDir, ids[0], 'PROMPT'), 'utf8');
  const bobPrompt = await readFile(path.join(f.promptsDir, ids[1], 'PROMPT'), 'utf8');
  assert.ok(alicePrompt.includes('Alice objective')); assert.ok(!alicePrompt.includes('Bob objective')); assert.ok(!bobPrompt.includes('Alice objective'));
  assert.ok(alicePrompt.includes('/workspace/files/prompt-studio/' + ids[0] + '/source-1/brief.md'));
  assert.equal(await (await f.api('/api/files/source-1', 'GET', undefined, cookies[0])).text(), 'Preserve trees.');
  assert.equal(await (await f.api('/api/files/source-1', 'GET', undefined, cookies[1])).text(), 'Use recycled steel.');
  assert.equal((await f.api('/api/apply', 'POST', {revision: 1}, cookies[0])).status, 409);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/workspace`, {headers: {Cookie: cookies[0]}});
    assert.equal((await response.json()).revision, 2);
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
});

test('the agent hook uses only the trusted current Discord sender, with no cross-user cache', async t => {
  const f = await fixture(t), context = {agentId: 'sonne', channel: 'discord', senderId: ids[0], trigger: 'user'};
  await writeFile(path.join(f.promptsDir, ids[0], 'PROMPT'), 'Alice instructions');
  await writeFile(path.join(f.promptsDir, ids[1], 'PROMPT'), 'Bob instructions');
  const results = await Promise.all([personalPrompt(context, f.promptsDir), personalPrompt({...context, senderId: ids[1]}, f.promptsDir)]);
  assert.ok(results[0].appendSystemContext.includes('Alice instructions')); assert.ok(!results[0].appendSystemContext.includes('Bob instructions'));
  assert.ok(results[1].appendSystemContext.includes('Bob instructions'));
  for (const change of [{senderId: undefined}, {senderId: '../outside'}, {senderId: '333'}, {channel: 'slack'}, {agentId: 'other'}, {trigger: 'heartbeat'}]) assert.equal(await personalPrompt({...context, ...change}, f.promptsDir), undefined);
  await writeFile(path.join(f.promptsDir, ids[0], 'PROMPT'), 'Updated Alice');
  assert.ok((await personalPrompt(context, f.promptsDir)).appendSystemContext.includes('Updated Alice'));
  await writeFile(path.join(f.promptsDir, 'users.json'), JSON.stringify([ids[1]]));
  assert.equal(await personalPrompt(context, f.promptsDir), undefined);
});
