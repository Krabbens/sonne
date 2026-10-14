import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture, ids} from './fixture.mjs';
import {createStudioServer} from '../server.mjs';
import {DISCIPLINES, createProject, createShared, validateShared, compileTeamPrompt, compileWorkspacePrompt, createProjectMemory, projectChanges, isProjectHistoryField} from '../dist/model.mjs';
import {personalPrompt} from '../openclaw-plugin/index.mjs';

test('existing shared workspaces gain five blank owners without changing their brief', () => {
  const previous = createShared();
  previous.team.values = 'Preserve the existing trees.';
  delete previous.owners;
  const migrated = validateShared(previous);
  assert.equal(Object.keys(migrated.owners).length, 5);
  for (const d of DISCIPLINES) assert.deepEqual(migrated.owners[d.id], {name:'', feedback:''});
  assert.equal(compileTeamPrompt(migrated), compileTeamPrompt(previous));
});

test('owner names and feedback save to bot memory and authored history without entering the applied prompt', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1);
  const initial = await (await f.api('/api/team', 'GET', undefined, alice)).json();
  const shared = initial.workspace;
  for (const [i, d] of DISCIPLINES.entries()) shared.owners[d.id] = {name:`Owner ${i + 1}`, feedback:`Requirement for ${d.name}.\nFeedback from owner ${i + 1}.`};
  assert.equal((await f.api('/api/team', 'PUT', {revision:initial.revision, workspace:shared}, alice)).status, 200);
  const other = await (await f.api('/api/team', 'GET', undefined, bob)).json();
  assert.deepEqual(other.workspace.owners, shared.owners);
  other.workspace.owners.structure.name = 'Bob Example';
  other.workspace.owners.structure.feedback = 'Keep the ground floor free of columns.';
  const updated = await (await f.api('/api/team', 'PUT', {revision:other.revision, workspace:other.workspace}, bob)).json();
  assert.equal((await f.api('/api/team', 'PUT', {revision:other.revision, workspace:shared}, alice)).status, 409);
  const stored = JSON.parse(await readFile(path.join(f.dataDir, 'team/current.json'), 'utf8'));
  assert.deepEqual(stored.workspace.owners, other.workspace.owners);
  assert.equal(stored.history.length, 2);
  assert.equal(stored.history[0].changes.length, 10);
  assert.equal(stored.history[0].by.id, ids[0]);
  assert.deepEqual(stored.history[1].by, {id:ids[1],name:'Bob'});
  assert.ok(Number.isFinite(Date.parse(stored.history[1].at)));
  assert.deepEqual(stored.history[1].changes, [
    {field:'owner:structure:name',label:'Structural engineering owner · Name',before:'Owner 2',after:'Bob Example',beforeUnit:'',unit:''},
    {field:'owner:structure:feedback',label:'Structural engineering owner · Requirements and feedback',before:shared.owners.structure.feedback,after:other.workspace.owners.structure.feedback,beforeUnit:'',unit:''}
  ]);
  const memory = JSON.parse(await readFile(path.join(f.promptsDir, 'shared/PROJECT_MEMORY.json'), 'utf8'));
  assert.equal(memory.revision, updated.revision);
  assert.deepEqual(memory.owners, other.workspace.owners);
  assert.deepEqual(memory.history, stored.history);
  const bot = (await personalPrompt({agentId:'sonne',channel:'discord',senderId:ids[0],trigger:'user'}, f.promptsDir)).appendSystemContext;
  assert.ok(bot.includes('Owner name: Bob Example'));
  assert.ok(bot.includes(other.workspace.owners.structure.feedback));
  const csv = await (await f.api('/api/team/history.csv', 'GET', undefined, alice)).text();
  assert.ok(csv.includes('"owner:structure:name","Structural engineering owner · Name","Owner 2","","Bob Example",""'));
  assert.ok(csv.includes('"owner:structure:feedback"'));
  assert.equal((await f.api('/api/team/apply', 'POST', {revision:updated.revision}, alice)).status, 200);
  const prompt = await readFile(path.join(f.promptsDir, 'shared/PROMPT'), 'utf8');
  assert.ok(!prompt.includes('## Owners'));
  for (const d of DISCIPLINES) {
    assert.ok(!prompt.includes(other.workspace.owners[d.id].name));
    assert.ok(!prompt.includes(other.workspace.owners[d.id].feedback));
  }
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`, {headers:{Cookie:bob}});
    assert.equal(response.status, 200);
    const restored = await response.json();
    assert.deepEqual(restored.workspace.owners, other.workspace.owners);
    assert.deepEqual(restored.history, stored.history);
    const restoredMemory = JSON.parse(await readFile(path.join(f.promptsDir, 'shared/PROJECT_MEMORY.json'), 'utf8'));
    assert.deepEqual(restoredMemory.owners, other.workspace.owners);
    assert.deepEqual(restoredMemory.history, stored.history);
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
});

test('team members in the same discipline remain separate from the owner in saved bot memory', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  shared.owners.coordination = {name:'Morgan Owner', feedback:'Retain access to the site throughout construction.'};
  assert.equal((await f.api('/api/team', 'PUT', {revision:0, workspace:shared}, alice)).status, 200);
  assert.equal((await f.api('/api/team/apply', 'POST', {revision:1}, alice)).status, 200);
  for (const [index, cookie] of [alice, bob].entries()) {
    const member = createProject(false);
    member.personal.discipline = 'coordination';
    member.personal.introduction = ['Alex Worker is a construction worker on the team.', 'Sam Manager coordinates the team’s construction work.'][index];
    assert.equal((await f.api('/api/workspace', 'PUT', {revision:0, workspace:member}, cookie)).status, 200);
    assert.equal((await f.api('/api/apply', 'POST', {revision:1}, cookie)).status, 200);
    const personal = await readFile(path.join(f.promptsDir, ids[index], 'PROMPT'), 'utf8');
    assert.ok(personal.includes(member.personal.introduction));
    assert.ok(personal.includes('Team member’s selected discipline: Construction manager'));
    assert.ok(!personal.includes('Morgan Owner'));
    const combined = compileWorkspacePrompt(member, shared);
    assert.ok(!combined.includes('Morgan Owner'));
    const bot = (await personalPrompt({agentId:'sonne',channel:'discord',senderId:ids[index],trigger:'user'}, f.promptsDir)).appendSystemContext;
    assert.ok(bot.includes('### Construction owner\nOwner name: Morgan Owner'));
    assert.ok(bot.includes('a construction worker on the team is not the Construction owner'));
    assert.ok(bot.includes(member.personal.introduction));
  }
  const personal = await (await f.api('/api/workspace', 'GET', undefined, alice)).json();
  personal.workspace.personal.discipline = 'facilities';
  assert.equal((await f.api('/api/workspace', 'PUT', {revision:personal.revision, workspace:personal.workspace}, alice)).status, 200);
  const team = await (await f.api('/api/team', 'GET', undefined, bob)).json();
  assert.deepEqual(team.workspace.owners, shared.owners);
  const published = await readFile(path.join(f.promptsDir, 'shared/PROMPT'), 'utf8');
  assert.ok(!published.includes('Morgan Owner'));
  assert.ok(!published.includes(shared.owners.coordination.feedback));
  assert.ok(!published.includes('Alex Worker'));
  assert.ok(!published.includes('Sam Manager'));
  const memory = JSON.parse(await readFile(path.join(f.promptsDir, 'shared/PROJECT_MEMORY.json'), 'utf8'));
  assert.deepEqual(memory.owners, shared.owners);
  assert.ok(!memory.context.includes('Alex Worker'));
  assert.ok(!memory.context.includes('Sam Manager'));
});

test('owner history supports older workspaces, clearing fields and subsequent unchanged saves', () => {
  const previous = createShared(); delete previous.owners;
  const next = createShared(); next.owners.architecture = {name:'Morgan Owner',feedback:'Keep the courtyard.'};
  const record = projectChanges(previous, next, {id:'author',name:'Author'}, 1);
  assert.equal(record.changes.length, 2);
  assert.ok(record.changes.every(c => c.before === '' && isProjectHistoryField(c.field)));
  const cleared = createShared(), removal = projectChanges(next, cleared, {id:'author',name:'Author'}, 2);
  assert.ok(removal.changes.every(c => c.after === '' && c.before));
  assert.equal(projectChanges(cleared, cleared, {id:'author',name:'Author'}, 3), null);
  const memory = createProjectMemory(cleared, [record, removal], 2);
  assert.deepEqual(memory.owners.architecture, {name:'',feedback:''});
  assert.ok(memory.context.includes('current owner records below supersede earlier owner entries in history'));
  for (const field of ['owner:unknown:name','owner:architecture:account','owner:architecture:feedback:extra']) assert.equal(isProjectHistoryField(field), false);
});

test('invalid owner fields are rejected without replacing the saved draft', async t => {
  const f = await fixture(t), alice = await f.login(0);
  for (const invalid of [null, [], {architecture:null}, {architecture:{name:123, feedback:''}}, {architecture:{name:'A', feedback:[]}}, {architecture:{name:'x'.repeat(301), feedback:''}}, {architecture:{name:'A', feedback:'x'.repeat(20001)}}]) {
    const workspace = createShared(); workspace.owners = invalid;
    assert.equal((await f.api('/api/team', 'PUT', {revision:0, workspace}, alice)).status, 422);
  }
  const saved = await (await f.api('/api/team', 'GET', undefined, alice)).json();
  assert.equal(saved.revision, 0);
  assert.deepEqual(saved.workspace.owners, createShared().owners);
});
