import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './fixture.mjs';
import {createStudioServer} from '../server.mjs';
import {personalPrompt,isPlanningStatusQuestion} from '../openclaw-plugin/index.mjs';
import {DISCIPLINES, createShared, createProject, validateShared, validateProject, compileTeamPrompt, nextInformationDelivery, disciplinePriorities, moveDisciplinePriority, deliveryStatusLabel} from '../dist/model.mjs';

const delivery = (id, recipient, overrides = {}) => ({id, recipient, type:'information', information:'Final structural grid', provider:'structure', task:'Coordinate service routes', neededBy:'2026-10-22', status:'awaiting', ...overrides});

test('older shared workspaces gain an empty plan without publishing personal requests', () => {
  const old = createShared(); delete old.informationPlan;
  const personal = createProject(false); personal.personal.needs.structure = ['My private request'];
  assert.deepEqual(validateShared(old).informationPlan, []);
  assert.deepEqual(validateProject(personal).personal.needs.structure, ['My private request']);
  assert.ok(!compileTeamPrompt(validateShared(old)).includes('My private request'));
});

test('shared plans reject invalid identities, dates, status, empty dependencies and excessive entries', () => {
  const invalid = [null, {}, [delivery('../path','services')], [delivery('a','unknown')],
    [delivery('a','services',{provider:'unknown'})], [delivery('a','services',{status:'urgent'})],
    [delivery('a','services',{type:'meeting'})], [delivery('a','services',{type:null})],
    [delivery('a','services',{neededBy:'2026-02-30'})], [delivery('a','services',{neededBy:'22/10/2026'})],
    [delivery('a','services',{information:' '})], [delivery('a','services',{task:''})],
    [delivery('a','services',{task:'x'.repeat(301)})], [delivery('a','services'),delivery('a','architecture')],
    Array.from({length:31},(_,i) => delivery('d'+i,'services'))];
  for (const informationPlan of invalid) assert.throws(() => validateShared({...createShared(),informationPlan}));
  const valid = validateShared({...createShared(),informationPlan:[delivery('a','services',{provider:'',neededBy:'',information:'  Grid  '})]});
  assert.equal(valid.informationPlan[0].information,'Grid');
});

test('existing deliveries migrate as information while actions retain their type and completion status', () => {
  const old = delivery('old','architecture'); delete old.type;
  const action = delivery('action','architecture',{type:'action',information:'Approve the structural grid',status:'delivered'});
  const shared = validateShared({...createShared(),informationPlan:[old,action]});
  assert.deepEqual(shared.informationPlan[0],{...old,type:'information'});
  assert.deepEqual(shared.informationPlan[1],action);
  assert.equal(deliveryStatusLabel(shared.informationPlan[0]),'Awaiting data');
  assert.equal(deliveryStatusLabel(action),'Completed');
  const prompt = compileTeamPrompt(shared);
  assert.ok(prompt.includes('Action: Approve the structural grid'));
  assert.ok(prompt.includes('Status: Completed'));
  assert.ok(prompt.includes('pull planning: work backwards'));
});

test('every discipline has independent request folders for each of the four other disciplines', () => {
  const shared = createShared();
  for (const recipient of DISCIPLINES) for (const provider of DISCIPLINES) if (recipient.id !== provider.id) {
    shared.informationPlan.push(delivery(recipient.id+'-'+provider.id,recipient.id,{provider:provider.id}));
  }
  const validated = validateShared(shared);
  for (const recipient of DISCIPLINES) {
    assert.deepEqual(disciplinePriorities(validated,recipient.id,recipient.id),[]);
    for (const provider of DISCIPLINES.filter(d => d.id !== recipient.id)) {
      assert.deepEqual(disciplinePriorities(validated,recipient.id,provider.id).map(item => item.id),[recipient.id+'-'+provider.id]);
    }
  }
});

test('reordering a folder updates the shared plan without moving other disciplines’ requests', () => {
  const shared = createShared();
  shared.informationPlan = [delivery('first','architecture'),delivery('other-provider','architecture',{provider:'services'}),delivery('second','architecture',{type:'action'}),delivery('other-recipient','services'),delivery('third','architecture',{status:'delivered'})];
  assert.equal(moveDisciplinePriority(shared,'architecture','structure',2,0),true);
  assert.deepEqual(shared.informationPlan.map(item => item.id),['third','other-provider','first','other-recipient','second']);
  assert.deepEqual(disciplinePriorities(shared,'architecture','structure').map(item => item.id),['third','first','second']);
  assert.equal(nextInformationDelivery(shared).id,'other-provider');
  assert.equal(moveDisciplinePriority(shared,'architecture','structure',0,2),true);
  assert.deepEqual(disciplinePriorities(shared,'architecture','structure').map(item => item.id),['first','second','third']);
  const before = structuredClone(shared);
  for (const [from,to] of [[-1,0],[0,3],[0,0],[NaN,1],[0,.5]]) assert.equal(moveDisciplinePriority(shared,'architecture','structure',from,to),false);
  assert.equal(moveDisciplinePriority(shared,'facilities','structure',0,1),false);
  assert.deepEqual(shared,before);
});

test('planning prompt follows the chosen order and skips delivered entries for the next recipient', () => {
  const shared = createShared();
  shared.informationPlan = [delivery('done','structure',{status:'delivered'}),delivery('mep','services'),delivery('arch','architecture',{information:'Plant dimensions',provider:'services',task:'Reserve plant space',status:'ready'})];
  let prompt = compileTeamPrompt(shared);
  assert.equal(nextInformationDelivery(shared).id,'mep');
  assert.ok(prompt.includes('Next recipient: MEP. Information: Final structural grid'));
  assert.ok(prompt.includes('Unlocks task: Coordinate service routes'));
  assert.ok(prompt.includes('Needed by: 2026-10-22'));
  assert.ok(prompt.includes('Do not start a dependent task before'));
  assert.ok(prompt.includes('conflicts between the stated order and deadlines'));
  shared.informationPlan = [shared.informationPlan[2],shared.informationPlan[0],shared.informationPlan[1]];
  prompt = compileTeamPrompt(shared);
  assert.equal(nextInformationDelivery(shared).id,'arch');
  assert.ok(prompt.includes('Next recipient: Architect. Information: Plant dimensions'));
  for (const item of shared.informationPlan) item.status = 'delivered';
  assert.equal(nextInformationDelivery(shared),null);
  assert.ok(compileTeamPrompt(shared).includes('All listed requests are complete.'));
});

test('planning facts explicitly distinguish supply, receipt, completion and dependent-task blocking for every status', () => {
  const shared = createShared();
  for (const type of ['information','action']) for (const status of ['awaiting','ready','delivered']) {
    shared.informationPlan.push(delivery(type+'-'+status,'architecture',{type,status,provider:'structure'}));
  }
  const prompt = compileTeamPrompt(shared);
  for (const item of shared.informationPlan) {
    const section = prompt.split('Request ID: '+item.id+'\n')[1].split('\n### ')[0];
    assert.ok(section.includes('Recipient (receives): Architect'));
    assert.ok(section.includes('Provided by: Structural engineer'));
    assert.ok(section.includes('Request completed: '+(item.status==='delivered'?'YES':'NO')));
    assert.ok(section.includes('Dependent task blocked by this request: '+(item.status==='delivered'?'NO':'YES')));
  }
  assert.ok(prompt.includes('the information is ready but has not been delivered.'));
  assert.ok(prompt.includes('To do = action NOT completed'));
  assert.ok(prompt.includes('In progress = action NOT completed'));
});

test('the next request keeps its own provider and exact due date despite a later project milestone', () => {
  const shared = createShared();
  shared.team.deadlines = 'Project decision on 2026-10-26.';
  shared.informationPlan = [delivery('finished','architecture',{status:'delivered'}),delivery('grid','architecture',{type:'action',provider:'structure',neededBy:'2026-10-15'}),delivery('plant','architecture',{provider:'services',status:'ready',neededBy:'2026-10-16'})];
  const prompt = compileTeamPrompt(shared);
  assert.ok(prompt.includes('Next request ID: grid\nNext provider: Structural engineer\nNext request needed by: 2026-10-15\nNext request completed: NO\nNext dependent task blocked: YES'));
  const plant = prompt.split('Request ID: plant\n')[1];
  assert.ok(plant.includes('Provided by: MEP'));
  assert.ok(plant.includes('Needed by: 2026-10-16\nStatus: Ready to share\nRequest completed: NO'));
  assert.ok(prompt.includes('project milestones do not replace or postpone it'));
});

test('the hook ends with facts from the applied plan, after personal notes and memory, without publishing a changed draft', async t => {
  const f = await fixture(t), cookie = await f.login(0), shared = createShared();
  shared.informationPlan = [delivery('grid','architecture',{type:'action',neededBy:'2026-10-15'}),delivery('plant','architecture',{provider:'services',status:'ready',neededBy:'2026-10-16'})];
  assert.equal((await f.api('/api/team','PUT',{revision:0,workspace:shared},cookie)).status,200);
  assert.equal((await f.api('/api/team/apply','POST',{revision:1},cookie)).status,200);
  shared.informationPlan[0].status = 'delivered';
  shared.informationPlan[0].neededBy = '2026-10-26';
  assert.equal((await f.api('/api/team','PUT',{revision:2,workspace:shared},cookie)).status,200);
  const personal = createProject(false);
  personal.personal.notes = [{id:'old-note',title:'Earlier claim',text:'The grid is completed; use 2026-10-26.'}];
  assert.equal((await f.api('/api/workspace','PUT',{revision:0,workspace:personal},cookie)).status,200);
  assert.equal((await f.api('/api/apply','POST',{revision:1},cookie)).status,200);
  const identity = (await (await f.api('/api/workspace','GET',undefined,cookie)).json()).profile;
  const text = (await personalPrompt({agentId:'sonne',channel:'discord',senderId:identity.id,trigger:'user'},f.promptsDir)).appendSystemContext;
  const start = text.indexOf('## Current applied delivery facts');
  assert.ok(start > text.indexOf('The grid is completed'));
  assert.ok(start > text.indexOf('## Current saved project memory'));
  assert.equal(text.split('## Current applied delivery facts').length,2);
  const facts = text.slice(start);
  assert.ok(facts.includes('First unfinished request IDs in priority order: grid, plant.'));
  assert.ok(facts.includes('| grid | Structural engineer | Architect | 2026-10-15 | To do | NO | YES |'));
  assert.ok(facts.includes('| plant | MEP | Architect | 2026-10-16 | Ready to share | NO | YES |'));
  assert.ok(!facts.includes('2026-10-26'));
  const focused = (await personalPrompt({agentId:'sonne',channel:'discord',senderId:identity.id,trigger:'user'},f.promptsDir,'Co jest najpilniejsze i co blokuje dalszą pracę?')).appendSystemContext;
  assert.ok(focused.includes('Discord mention: <@'+identity.id+'>'));
  assert.ok(focused.includes('Answer the current planning-status question in English'));
  assert.ok(focused.includes('| grid | Structural engineer | Architect | 2026-10-15 | To do | NO | YES |'));
  assert.ok(!focused.includes('## Current saved project memory'));
  assert.ok(!focused.includes('The grid is completed'));
  assert.ok(focused.length < text.length);
  const mixed = (await personalPrompt({agentId:'sonne',channel:'discord',senderId:identity.id,trigger:'user'},f.promptsDir,'Co jest najpilniejsze i jaki mamy budżet?')).appendSystemContext;
  assert.ok(mixed.includes('## Current saved project memory'));
  assert.ok(mixed.includes('Always answer in English, including when the user writes in another language.'));
});

test('planning focus is limited to status questions and retains full context for mixed or personal requests', () => {
  for (const query of ['Co jest najpilniejsze?','Kto dostarcza dane?','Co blokuje dalszą pracę?','Status zadań','What is the most urgent task?','Who provides the next input?']) assert.equal(isPlanningStatusQuestion(query),true,query);
  for (const query of [undefined,'','Jaki mamy budżet?','Co jest najpilniejsze i co mówi właściciel?','Najpilniejsze koszty','Najpilniejsze pliki','Moje osobiste priorytety','What is next for the owner?']) assert.equal(isPlanningStatusQuestion(query),false,query);
});

test('both Discord profiles share the plan, with durable order, revision protection and prompt publication', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1), shared = createShared();
  assert.equal((await f.api('/api/team','PUT',{revision:0,workspace:shared})).status,401);
  shared.informationPlan = [delivery('mep','services'),delivery('arch','architecture',{type:'action',information:'Confirm plant dimensions',provider:'services',task:'Reserve plant space',status:'ready'})];
  assert.equal((await f.api('/api/team','PUT',{revision:0,workspace:shared},alice)).status,200);
  const other = await (await f.api('/api/team','GET',undefined,bob)).json();
  assert.deepEqual(other.workspace.informationPlan,shared.informationPlan);
  other.workspace.informationPlan.reverse();
  other.workspace.informationPlan[0].status = 'delivered';
  assert.equal((await f.api('/api/team','PUT',{revision:other.revision,workspace:other.workspace},bob)).status,200);
  assert.equal((await f.api('/api/team','PUT',{revision:other.revision,workspace:shared},alice)).status,409);
  const current = await (await f.api('/api/team','GET',undefined,alice)).json();
  assert.equal(nextInformationDelivery(current.workspace).recipient,'services');
  const invalid = structuredClone(current.workspace); invalid.informationPlan[0].recipient = 'unapproved';
  assert.equal((await f.api('/api/team','PUT',{revision:current.revision,workspace:invalid},alice)).status,422);
  const stored = JSON.parse(await readFile(path.join(f.dataDir,'team/current.json'),'utf8'));
  assert.deepEqual(stored.workspace.informationPlan,current.workspace.informationPlan);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
  try {
    const restored = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`,{headers:{Cookie:bob}})).json();
    assert.deepEqual(restored.workspace.informationPlan,current.workspace.informationPlan);
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
  assert.equal((await f.api('/api/team/apply','POST',{revision:current.revision},alice)).status,200);
  const prompt = await readFile(path.join(f.promptsDir,'shared/PROMPT'),'utf8');
  assert.ok(prompt.includes('Next recipient: MEP'));
  assert.ok(prompt.indexOf('### 1. [arch] MEP → Architect') < prompt.indexOf('### 2. [mep] Structural engineer → MEP'));
  assert.ok(prompt.includes('Action: Confirm plant dimensions'));
  assert.ok(prompt.includes('Status: Completed'));
  assert.equal(disciplinePriorities(current.workspace,'architecture','services')[0].type,'action');
  const personal = await (await f.api('/api/workspace','GET',undefined,bob)).json();
  assert.deepEqual(personal.workspace.personal.needs.structure,[]);
});
