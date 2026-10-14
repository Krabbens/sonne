import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture, ids} from './fixture.mjs';
import {createStudioServer} from '../server.mjs';
import {createShared, validateShared, totalProjectCosts, compileTeamPrompt, createProjectMemory} from '../dist/model.mjs';

test('older workspaces retain their uncategorised costs and start with no custom categories', () => {
  const previous = createShared();
  delete previous.costCategories;
  previous.project.costOther = '90.50';
  const migrated = validateShared(previous);
  assert.deepEqual(migrated.costCategories, []);
  assert.equal(migrated.project.costOther, '90.50');
  assert.equal(totalProjectCosts(migrated), 90.5);
  assert.equal(compileTeamPrompt(migrated), compileTeamPrompt(previous));
});

test('custom categories contribute to the memory total once and stay out of the applied brief', () => {
  const shared = createShared();
  shared.project.currency = 'EUR';
  shared.project.costStructure = '100.25';
  shared.project.costOther = '50.50';
  shared.costCategories = [{id:'transport',name:'Transport',amount:'250'}, {id:'insurance',name:'Insurance',amount:''}, {id:'permits',name:'Permits',amount:'0'}];
  const validated = validateShared(shared), prompt = createProjectMemory(validated).context;
  assert.equal(totalProjectCosts(validated), 400.75);
  assert.ok(prompt.includes('Other costs: 50.50 EUR'));
  assert.ok(prompt.includes('Transport: 250 EUR'));
  assert.ok(prompt.includes('Insurance: No amount supplied'));
  assert.ok(prompt.includes('Permits: 0 EUR'));
  assert.ok(prompt.includes('Total of entered costs: 400.75 EUR'));
  assert.ok(!compileTeamPrompt(validated).includes('Transport'));
});

test('shared cost categories support updates, currency changes and removal with durable history and publication', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  shared.project.currency = 'EUR'; shared.project.costStructure = '1000'; shared.project.costOther = '50.50';
  shared.costCategories = [{id:'transport',name:'Transport',amount:'100.25'}, {id:'insurance',name:'Insurance',amount:'25'}, {id:'permits',name:'Permits',amount:''}];
  assert.equal((await f.api('/api/team', 'PUT', {revision:0,workspace:shared}, alice)).status, 200);
  const other = await (await f.api('/api/team', 'GET', undefined, bob)).json();
  assert.deepEqual(other.workspace.costCategories, shared.costCategories);
  other.workspace.costCategories[0] = {id:'transport',name:'Site logistics',amount:'150.75'};
  const edited = await (await f.api('/api/team', 'PUT', {revision:other.revision,workspace:other.workspace}, bob)).json();
  const change = edited.history.at(-1).changes.find(c => c.field === 'costCategory:transport');
  assert.deepEqual([change.before,change.beforeUnit,change.after,change.unit], ['100.25','EUR','150.75','EUR']);
  assert.equal(edited.history.at(-1).by.id, ids[1]);
  assert.ok(edited.history.at(-1).changes.some(c => c.field === 'costCategoryName:transport' && c.before === 'Transport' && c.after === 'Site logistics'));
  assert.equal((await f.api('/api/team', 'PUT', {revision:other.revision,workspace:shared}, alice)).status, 409);
  other.workspace.project.currency = 'GBP';
  const currencyChange = await (await f.api('/api/team', 'PUT', {revision:edited.revision,workspace:other.workspace}, bob)).json();
  assert.equal(currencyChange.history.at(-1).metrics['costCategory:transport'].unit, 'GBP');
  other.workspace.costCategories = other.workspace.costCategories.filter(c => c.id !== 'insurance');
  const removed = await (await f.api('/api/team', 'PUT', {revision:currencyChange.revision,workspace:other.workspace}, alice)).json();
  assert.ok(removed.history.at(-1).changes.some(c => c.field === 'costCategory:insurance' && c.before === '25' && c.after === ''));
  assert.equal(removed.history.at(-1).metrics['costCategory:insurance'].value, '');
  assert.equal(removed.history.at(-1).metrics['costCategory:insurance'].label, 'Other costs · Insurance');
  const current = await (await f.api('/api/team', 'GET', undefined, bob)).json();
  assert.equal(totalProjectCosts(current.workspace), 1201.25);
  assert.equal((await f.api('/api/team/apply', 'POST', {revision:removed.revision}, alice)).status, 200);
  const applied = await readFile(path.join(f.promptsDir, 'shared/PROMPT'), 'utf8');
  assert.ok(!applied.includes('Site logistics'));
  const memory = JSON.parse(await readFile(path.join(f.promptsDir, 'shared/PROJECT_MEMORY.json'), 'utf8')), prompt = memory.context;
  assert.ok(prompt.includes('Site logistics: 150.75 GBP'));
  assert.ok(prompt.includes('Total of entered costs: 1,201.25 GBP'));
  assert.ok(!memory.costs.categories.some(c => c.id === 'insurance'));
  const csv = await (await f.api('/api/team/history.csv', 'GET', undefined, bob)).text();
  assert.ok(csv.includes('costCategory:transport')); assert.ok(csv.includes('Site logistics'));
  assert.ok(csv.includes('costCategory:insurance')); assert.ok(csv.includes('EUR')); assert.ok(csv.includes('GBP'));
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`, {headers:{Cookie:bob}});
    assert.equal(response.status, 200);
    const loaded = await response.json();
    assert.deepEqual(loaded.workspace.costCategories, other.workspace.costCategories);
    assert.deepEqual(loaded.history, removed.history);
    assert.equal(loaded.workspace.project.costOther, '50.50');
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
});

test('invalid categories cannot replace a saved draft', async t => {
  const f = await fixture(t), alice = await f.login(0);
  const valid = {id:'transport',name:'Transport',amount:'12.5'};
  const invalid = [null, {}, [null], [{...valid,id:'bad/id'}], [valid,valid], [{...valid,name:' '}], [{...valid,name:'x'.repeat(101)}], [{...valid,amount:12}], ...['-1','Infinity','1e30','1000000000000001','12 EUR','x'.repeat(301)].map(amount => [{...valid,amount}]), Array.from({length:31}, (_,i) => ({...valid,id:'category-' + i}))];
  for (const costCategories of invalid) {
    const workspace = {...createShared(),costCategories};
    assert.equal((await f.api('/api/team', 'PUT', {revision:0,workspace}, alice)).status, 422);
  }
  const saved = await (await f.api('/api/team', 'GET', undefined, alice)).json();
  assert.equal(saved.revision, 0);
  assert.deepEqual(saved.workspace.costCategories, []);
  assert.equal((await f.api('/api/team', 'PUT', {revision:0,workspace:{...createShared(),costCategories:[{...valid,name:'  Transport  '}]}}, alice)).status, 200);
  assert.equal((await (await f.api('/api/team', 'GET', undefined, alice)).json()).workspace.costCategories[0].name, 'Transport');
});

test('a previously opened client can save other project fields without deleting custom categories', async t => {
  const f = await fixture(t), alice = await f.login(0), shared = createShared();
  shared.costCategories = [{id:'transport',name:'Transport',amount:'100'}];
  assert.equal((await f.api('/api/team', 'PUT', {revision:0,workspace:shared}, alice)).status, 200);
  const earlierClient = structuredClone(shared);
  delete earlierClient.costCategories;
  earlierClient.project.location = 'Updated site location';
  assert.equal((await f.api('/api/team', 'PUT', {revision:1,workspace:earlierClient}, alice)).status, 200);
  const result = await (await f.api('/api/team', 'GET', undefined, alice)).json();
  assert.equal(result.workspace.project.location, 'Updated site location');
  assert.deepEqual(result.workspace.costCategories, shared.costCategories);
});
