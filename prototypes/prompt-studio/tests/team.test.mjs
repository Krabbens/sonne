import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture, ids } from './fixture.mjs';
import { createStudioServer } from '../server.mjs';
import { createProject, createShared, validateProject, validateShared, compileWorkspacePrompt, historyCSV } from '../dist/model.mjs';
import { personalPrompt } from '../openclaw-plugin/index.mjs';

test('team renaming validates shared names and persists for other users after a restart', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1);
  const initial = await (await f.api('/api/team', 'GET', undefined, alice)).json();
  assert.equal(initial.workspace.team.name, 'River Team');
  const shared = initial.workspace;
  shared.team.name = '  Cedar Team  ';
  assert.equal((await f.api('/api/team', 'PUT', {revision:initial.revision, workspace:shared}, alice)).status, 200);
  const updated = await (await f.api('/api/team', 'GET', undefined, bob)).json();
  assert.equal(updated.workspace.team.name, 'Cedar Team');
  assert.equal(JSON.parse(await readFile(path.join(f.dataDir, 'team/current.json'), 'utf8')).workspace.team.name, 'Cedar Team');
  for (const name of ['   ', 'x'.repeat(301)]) {
    shared.team.name = name;
    assert.equal((await f.api('/api/team', 'PUT', {revision:updated.revision, workspace:shared}, alice)).status, 422);
  }
  shared.team.name = 'Stale change';
  assert.equal((await f.api('/api/team', 'PUT', {revision:initial.revision, workspace:shared}, alice)).status, 409);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`, {headers:{Cookie:bob}});
    const saved = await response.json();
    assert.equal(saved.workspace.team.name, 'Cedar Team');
    assert.equal(saved.revision, updated.revision);
    assert.ok(compileWorkspacePrompt(createProject(false), saved.workspace).includes('Cedar Team'));
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
});

test('team context is shared while identity, information needs and notes stay personal', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  assert.equal((await f.api('/api/team')).status, 401);
  shared.team.name = 'Courtyard team'; shared.project.area = '1200';
  const saved = await f.api('/api/team', 'PUT', {revision:0,workspace:shared}, alice);
  assert.equal(saved.status, 200);
  assert.equal((await (await f.api('/api/team','GET',undefined,bob)).json()).workspace.project.area, '1200');
  const personal = createProject(false);
  personal.personal.discipline = 'facilities'; personal.personal.introduction = 'Alice personal introduction';
  personal.personal.needs.structure = ['Clear spans', 'Maintenance loads'];
  personal.personal.notes.push({id:'note-1',title:'Maintenance',text:'Keep service access clear.'});
  assert.equal((await f.api('/api/workspace','PUT',{revision:0,workspace:personal},alice)).status,200);
  const other = await (await f.api('/api/workspace','GET',undefined,bob)).json();
  assert.equal(other.workspace.personal.introduction, '');
  assert.deepEqual(other.workspace.personal.needs.structure, []);
  assert.ok(compileWorkspacePrompt(validateProject(personal),validateShared(shared)).includes('1. Clear spans\n2. Maintenance loads'));
});

test('project history records verified authors, previous values and units; CSV preserves safe text', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  shared.project.carbon = '1000'; shared.project.location = '=HYPERLINK("example")';
  shared.team.discordToken = 'must-not-be-stored';
  let response = await f.api('/api/team','PUT',{revision:0,workspace:shared,history:[{forged:true}],profile:{id:ids[1]}},alice);
  assert.equal(response.status,200);
  let result = await response.json();
  assert.equal(result.history[0].by.id, ids[0]);
  assert.equal(result.history[0].metrics.carbon.unit,'kgCO₂e');
  assert.equal((await (await f.api('/api/team','GET',undefined,bob)).json()).workspace.team.discordToken,undefined);
  shared.project.carbon = '1'; shared.project.carbonUnit = 'tCO₂e';
  response = await f.api('/api/team','PUT',{revision:1,workspace:shared},bob);
  result = await response.json();
  const change = result.history[1].changes.find(c => c.field === 'carbon');
  assert.deepEqual([change.before,change.beforeUnit,change.after,change.unit],['1000','kgCO₂e','1','tCO₂e']);
  assert.equal(result.history[1].by.name,'Bob');
  assert.equal((await f.api('/api/team','PUT',{revision:1,workspace:shared},alice)).status,409);
  const csv = await (await f.api('/api/team/history.csv','GET',undefined,alice)).text();
  assert.ok(csv.includes('previous_unit')); assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(!csv.includes('must-not-be-stored'));
});

test('published shared context reaches both users with only their own personal preferences', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  shared.team.values = 'Shared requirement: preserve existing trees.';
  assert.equal((await f.api('/api/team','PUT',{revision:0,workspace:shared},alice)).status,200);
  assert.equal((await f.api('/api/team/apply','POST',{revision:1},alice)).status,200);
  for (const [index,cookie] of [[0,alice],[1,bob]]) {
    const p = createProject(false); p.personal.goals = ['Alice-only objective','Bob-only objective'][index];
    await f.api('/api/workspace','PUT',{revision:0,workspace:p},cookie);
    assert.equal((await f.api('/api/apply','POST',{revision:1},cookie)).status,200);
  }
  const context = {agentId:'sonne',channel:'discord',trigger:'user'};
  const a = (await personalPrompt({...context,senderId:ids[0]},f.promptsDir)).appendSystemContext;
  const b = (await personalPrompt({...context,senderId:ids[1]},f.promptsDir)).appendSystemContext;
  assert.ok(a.includes('Shared requirement')); assert.ok(b.includes('Shared requirement'));
  assert.ok(a.includes('Alice-only')); assert.ok(!a.includes('Bob-only'));
  assert.ok(b.includes('Bob-only')); assert.ok(!b.includes('Alice-only'));
  const version = (await (await f.api('/api/workspace','GET',undefined,alice)).json()).workspace.versions.at(-1).prompt;
  assert.ok(version.includes('Shared requirement')); assert.ok(version.includes('Alice-only'));
  assert.equal(await personalPrompt({...context,senderId:'unapproved'},f.promptsDir),undefined);
});

test('shared original files and history persist without exposing personal originals', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  const text = 'Shared room schedule';
  await f.api('/api/team/files/schedule','PUT',text,alice,{'Content-Type':'application/octet-stream'});
  shared.project.area = '250';
  shared.sources.push({id:'schedule',name:'rooms.csv',size:Buffer.byteLength(text),type:'text/csv',discipline:'project',category:'Room schedule',note:'Use for room requirements.',text:null});
  assert.equal((await f.api('/api/team','PUT',{revision:0,workspace:shared},alice)).status,200);
  assert.equal(await (await f.api('/api/team/files/schedule','GET',undefined,bob)).text(),text);
  assert.equal((await f.api('/api/files/schedule','GET',undefined,bob)).status,404);
  await f.api('/api/team/apply','POST',{revision:1},alice);
  const prompt = await readFile(path.join(f.promptsDir,'shared/PROMPT'),'utf8');
  assert.ok(!prompt.includes('/workspace/files/prompt-studio/shared/schedule/rooms.csv'));
  assert.ok(!prompt.includes(text));
  const memory = JSON.parse(await readFile(path.join(f.promptsDir,'shared/PROJECT_MEMORY.json'),'utf8'));
  assert.equal(memory.files[0].agentPath, '/workspace/files/prompt-studio/shared/schedule/rooms.csv');
  assert.equal(memory.files[0].text, text);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
  try {
    const result = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`,{headers:{Cookie:bob}})).json();
    assert.equal(result.workspace.project.area,'250'); assert.equal(result.history.length,1);
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
});

test('older four-discipline profiles migrate without losing data or assigning it to the team', () => {
  const old = createProject(false); delete old.personal; delete old.disciplines.facilities;
  old.project.name = 'Earlier private project'; old.disciplines.coordination.values.objective = 'Earlier coordination objective';
  const migrated = validateProject(old);
  assert.equal(migrated.project.name,'Earlier private project');
  assert.equal(migrated.disciplines.coordination.values.objective,'Earlier coordination objective');
  assert.ok(migrated.disciplines.facilities); assert.equal(migrated.personal.discipline,'');
  assert.equal(createShared().project.name,'Untitled project');
  for (const bad of ['-1','Infinity','1e300','200 m2']) {
    const s = createShared(); s.project.area = bad; assert.throws(() => validateShared(s));
  }
  const csv = historyCSV([{at:'now',revision:1,by:{id:'id',name:'+formula'},changes:[{field:'location',label:'Location',before:'',after:'@formula',unit:''}]}]);
  assert.ok(csv.includes("'+formula")); assert.ok(csv.includes("'@formula"));
});
