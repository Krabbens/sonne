import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, unlink, symlink} from 'node:fs/promises';
import path from 'node:path';
import {fixture, ids} from './fixture.mjs';
import {createStudioServer} from '../server.mjs';
import {createShared, createProject, compileTeamPrompt, createProjectMemory, PROJECT_MEMORY_CONTEXT_LIMIT, PROJECT_MEMORY_PATH} from '../dist/model.mjs';
import {personalPrompt} from '../openclaw-plugin/index.mjs';

const memoryFile = f => path.join(f.promptsDir, 'shared/PROJECT_MEMORY.json');
const loadMemory = async f => JSON.parse(await readFile(memoryFile(f), 'utf8'));
const context = index => ({agentId:'sonne',channel:'discord',senderId:ids[index],trigger:'user'});

test('the applied shared prompt contains the project brief while owners and other project sections live in memory', () => {
  const shared = createShared();
  shared.project.overview = 'Applied project brief.'; shared.project.area = '1200';
  shared.project.energy = '85'; shared.project.energyUnit = 'kWh/m²/year';
  shared.project.costOther = '30'; shared.costCategories = [{id:'logistics',name:'Site logistics',amount:'75'}];
  shared.owners.coordination = {name:'Morgan Owner',feedback:'Owner requirement.'};
  shared.sources = [{id:'rooms',name:'rooms.csv',type:'text/csv',size:10,category:'Room schedule',note:'Room requirements.',text:'A,10',truncated:false,agentPath:'/workspace/files/prompt-studio/shared/rooms/rooms.csv'}];
  const prompt = compileTeamPrompt(shared), memory = createProjectMemory(shared);
  assert.ok(prompt.includes('Applied project brief.')); assert.ok(prompt.includes('1200 m²'));
  for (const text of ['## Owners', 'Morgan Owner', 'Owner requirement.', 'Estimated energy use', 'Site logistics', 'rooms.csv', 'A,10']) assert.ok(!prompt.includes(text));
  assert.deepEqual(memory.owners, shared.owners);
  assert.ok(memory.context.includes('Owner name: Morgan Owner'));
  assert.ok(memory.context.includes('Owner requirement.'));
  assert.equal(memory.performance.energy, '85'); assert.equal(memory.costs.total, 105);
  assert.equal(memory.files[0].text, 'A,10');
  assert.ok(memory.context.includes('Estimated energy use: 85 kWh/m²/year'));
  assert.ok(memory.context.includes('Site logistics: 75 USD'));
  assert.ok(memory.context.includes(shared.sources[0].agentPath));
});

test('saving a project updates bot memory and copies original files without applying a prompt', async t => {
  const f = await fixture(t), alice = await f.login(0), shared = createShared();
  const original = 'Room A,10\nRoom B,20\n';
  await f.api('/api/team/files/rooms', 'PUT', original, alice, {'Content-Type':'application/octet-stream'});
  shared.project.overview = 'Draft brief that has not been applied.';
  shared.project.energy = '150'; shared.project.costOther = '30';
  shared.owners.architecture = {name:'Morgan Owner',feedback:'Retain the courtyard.'};
  shared.costCategories = [{id:'logistics',name:'Site logistics',amount:'75'}];
  shared.sources.push({id:'rooms',name:'rooms.csv',type:'text/csv',size:Buffer.byteLength(original),discipline:'project',category:'Room schedule',note:'Room areas.',text:'Fabricated browser excerpt.'});
  assert.equal((await f.api('/api/team', 'PUT', {revision:0,requestId:'memory-save',workspace:shared}, alice)).status, 200);
  const memory = await loadMemory(f);
  assert.equal(memory.revision, 1); assert.equal(memory.performance.energy, '150');
  assert.deepEqual(memory.owners, shared.owners);
  assert.equal(memory.costs.total, 105); assert.equal(memory.history[0].by.id, ids[0]);
  assert.equal(memory.files[0].text, original);
  assert.equal(await readFile(path.join(f.agentFilesDir,'prompt-studio/shared/rooms/rooms.csv'),'utf8'), original);
  await assert.rejects(readFile(path.join(f.promptsDir,'shared/PROMPT')), {code:'ENOENT'});
  const bot = (await personalPrompt(context(0), f.promptsDir)).appendSystemContext;
  assert.ok(bot.includes('Estimated energy use: 150 kWh/year'));
  assert.ok(bot.includes('Owner name: Morgan Owner')); assert.ok(bot.includes('Retain the courtyard.'));
  assert.ok(bot.includes('Site logistics: 75 USD')); assert.ok(bot.includes('rooms.csv'));
  assert.ok(bot.includes(PROJECT_MEMORY_PATH));
  assert.ok(!bot.includes('Draft brief that has not been applied.'));
  assert.ok(memory.history.some(r => r.changes.some(c => c.after === shared.project.overview)));
});

test('the next turn loads changed project memory and restart restores it without publishing drafts', async t => {
  const f = await fixture(t), alice = await f.login(0), shared = createShared();
  shared.project.energy = '100';
  await f.api('/api/team', 'PUT', {revision:0,workspace:shared}, alice);
  assert.ok((await personalPrompt(context(0), f.promptsDir)).appendSystemContext.includes('Estimated energy use: 100 kWh/year'));
  shared.project.energy = '180';
  await f.api('/api/team', 'PUT', {revision:1,workspace:shared}, alice);
  assert.ok((await personalPrompt(context(0), f.promptsDir)).appendSystemContext.includes('Estimated energy use: 180 kWh/year'));
  await unlink(memoryFile(f));
  const restarted = await createStudioServer(f.options);
  try {
    const restored = await loadMemory(f);
    assert.equal(restored.revision, 2); assert.equal(restored.performance.energy, '180');
    assert.equal(restored.history.length, 2);
    assert.ok((await personalPrompt(context(1), f.promptsDir)).appendSystemContext.includes('Estimated energy use: 180 kWh/year'));
    await assert.rejects(readFile(path.join(f.promptsDir,'shared/PROMPT')), {code:'ENOENT'});
  } finally {await new Promise(resolve => restarted.close(resolve));}
});

test('private profile saves stay out of shared memory and unauthorised turns receive no memory', async t => {
  const f = await fixture(t), alice = await f.login(0), before = await readFile(memoryFile(f),'utf8');
  const personal = createProject(false); personal.personal.goals = 'Alice-only goal.';
  await f.api('/api/workspace','PUT',{revision:0,workspace:personal},alice);
  await f.api('/api/apply','POST',{revision:1},alice);
  assert.equal(await readFile(memoryFile(f),'utf8'), before);
  assert.ok((await personalPrompt(context(0),f.promptsDir)).appendSystemContext.includes('Alice-only goal.'));
  assert.ok(!(await personalPrompt(context(1),f.promptsDir)).appendSystemContext.includes('Alice-only goal.'));
  for (const change of [{senderId:'333'}, {senderId:'../outside'}, {channel:'slack'}, {trigger:'heartbeat'}, {agentId:'other'}]) assert.equal(await personalPrompt({...context(0),...change},f.promptsDir),undefined);
});

test('a failed memory write does not acknowledge or replace the saved draft and can retry safely', async t => {
  const f = await fixture(t), alice = await f.login(0), previous = await readFile(memoryFile(f),'utf8');
  const outside = path.join(f.root,'outside.json'); await writeFile(outside,'Do not replace.');
  await unlink(memoryFile(f)); await symlink(outside,memoryFile(f));
  const shared = createShared(); shared.project.energy = '99';
  const operation = {revision:0,requestId:'memory-retry',workspace:shared};
  assert.equal((await f.api('/api/team','PUT',operation,alice)).status,503);
  const saved = await (await f.api('/api/team','GET',undefined,alice)).json();
  assert.equal(saved.revision,0); assert.equal(saved.workspace.project.energy,'');
  assert.equal(JSON.parse(await readFile(path.join(f.dataDir,'team/current.json'),'utf8')).revision,0);
  assert.equal(await readFile(outside,'utf8'),'Do not replace.');
  await unlink(memoryFile(f)); await writeFile(memoryFile(f),previous);
  assert.equal((await f.api('/api/team','PUT',operation,alice)).status,200);
  assert.equal((await loadMemory(f)).revision,1);
  assert.equal((await f.api('/api/team','PUT',operation,alice)).status,200);
  assert.equal((await loadMemory(f)).revision,1);
});

test('memory keeps complete records while bounding the context sent to the bot', () => {
  const shared = createShared();
  for (const [id, owner] of Object.entries(shared.owners)) {
    owner.name = id + ' ' + 'n'.repeat(280);
    owner.feedback = 'Requirement.\n'.repeat(1538);
  }
  shared.costCategories = Array.from({length:30},(_,i) => ({id:'category-'+i,name:'Category '+i+' '+ 'n'.repeat(80),amount:'0'.repeat(299)+'1'}));
  shared.sources = Array.from({length:20},(_,i) => ({id:'file-'+i,name:'File '+i+' '+ 'n'.repeat(220),type:'text/plain',size:0,category:'Reference',note:'d'.repeat(2000),text:'s'.repeat(12000),truncated:true,agentPath:'/workspace/files/prompt-studio/shared/file-'+i+'/'+'f'.repeat(140)}));
  const history = Array.from({length:30},(_,i) => ({revision:i+1,at:'2026-10-14T00:00:00Z',by:{id:ids[0],name:'Alice'},changes:[{field:'energy',label:'Energy',before:'1'.repeat(20000),after:'2'.repeat(20000),beforeUnit:'kWh/year',unit:'kWh/year'}]}));
  const memory = createProjectMemory(shared,history,30);
  assert.ok(memory.context.length <= PROJECT_MEMORY_CONTEXT_LIMIT);
  assert.equal(memory.files.length,20); assert.equal(memory.files[19].text.length,12000);
  assert.equal(memory.history.length,30); assert.equal(memory.history[29].changes[0].after.length,20000);
  assert.equal(memory.costs.categories.length,30);
  assert.deepEqual(memory.owners, shared.owners);
  for (const [id, owner] of Object.entries(shared.owners)) {
    assert.ok(memory.context.includes(owner.name));
    assert.ok(memory.context.includes(`read owners.${id}.feedback in the full memory file before relying on it`));
    assert.ok(!memory.context.includes(owner.feedback));
  }
});

test('the hook rejects corrupted, overlong and symbolic project memory', async t => {
  const f = await fixture(t);
  await writeFile(memoryFile(f),'Invalid JSON.');
  await assert.rejects(personalPrompt(context(0),f.promptsDir));
  await writeFile(memoryFile(f),JSON.stringify({schemaVersion:1,revision:0,context:'x'.repeat(PROJECT_MEMORY_CONTEXT_LIMIT+1)}));
  await assert.rejects(personalPrompt(context(0),f.promptsDir));
  await unlink(memoryFile(f));
  const outside = path.join(f.root,'outside-memory.json'); await writeFile(outside,JSON.stringify({schemaVersion:1,revision:0,context:'Do not inject.'}));
  await symlink(outside,memoryFile(f));
  await assert.rejects(personalPrompt(context(0),f.promptsDir));
});
