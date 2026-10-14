import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './fixture.mjs';
import {createStudioServer} from '../server.mjs';
import {createProject, createShared} from '../dist/model.mjs';
import {requestJSON} from '../dist/request.mjs';

test('a lost draft-save response confirms the same save without overwriting a different draft', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1);
  const shared = createShared(); shared.team.name = 'Retained draft';
  const payload = {revision:0,requestId:'draft-operation',workspace:shared};
  let attempts = 0;
  const saved = await requestJSON('/api/team',{method:'PUT',body:JSON.stringify(payload)},{retry:true,wait:async () => {},fetchImpl:async (url,options) => {
    const response = await f.api(url,options.method,JSON.parse(options.body),alice);
    if (++attempts === 1) {assert.equal(response.status,200); await response.arrayBuffer(); throw new TypeError('Connection reset');}
    return response;
  }});
  assert.equal(attempts,2); assert.equal(saved.revision,1);
  assert.equal((await f.api('/api/team','PUT',payload,bob)).status,409);
  assert.equal((await f.api('/api/team','PUT',{...payload,workspace:{...shared,team:{...shared.team,name:'Different payload'}}},alice)).status,409);
  const restarted = await createStudioServer(f.options);
  await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/team`,{method:'PUT',headers:{'Content-Type':'application/json','X-Prompt-Studio':'1',Cookie:alice},body:JSON.stringify(payload)});
    assert.equal(response.status,200); assert.equal((await response.json()).revision,1);
  } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
  const current = await (await f.api('/api/team','GET',undefined,alice)).json();
  assert.equal(current.workspace.team.name,'Retained draft');
  assert.equal(current.revision,1);
});

test('lost apply confirmations recover once for both scopes and survive a service restart', async t => {
  const f = await fixture(t), alice = await f.login(0), bob = await f.login(1);
  const personal = createProject(false); personal.personal.goals = 'Preserve this draft through retries.';
  await f.api('/api/workspace','PUT',{revision:0,workspace:personal},alice);
  for (const [route,revision,dir] of [['/api/team/apply',0,'team'],['/api/apply',1,'profiles/111111111111111111']]) {
    const payload = {revision,requestId:dir === 'team' ? 'shared-operation' : 'personal-operation'};
    let attempts = 0;
    const result = await requestJSON(route,{method:'POST',body:JSON.stringify(payload)},{retry:true,wait:async () => {},fetchImpl:async (url,options) => {
      const response = await f.api(url,options.method,JSON.parse(options.body),alice);
      if (++attempts === 1) {assert.equal(response.status,200); await response.arrayBuffer(); throw new TypeError('Failed to fetch');}
      return response;
    }});
    assert.equal(attempts,2); assert.equal(result.revision,revision+1);
    assert.equal((await readdir(path.join(f.dataDir,dir,'backups'))).length,1);
    if (dir !== 'team') assert.equal(result.workspace.versions.length,1);
    else assert.equal((await f.api(route,'POST',payload,bob)).status,409);
    const restarted = await createStudioServer(f.options);
    await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${restarted.address().port}${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Prompt-Studio':'1',Cookie:alice},body:JSON.stringify(payload)});
      assert.equal(response.status,200);
      const replay = await response.json();
      assert.equal(replay.revision,result.revision); assert.equal(replay.applied.id,result.applied.id);
      if (dir !== 'team') assert.equal(replay.workspace.versions.length,1);
    } finally {restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve));}
    assert.equal((await readdir(path.join(f.dataDir,dir,'backups'))).length,1);
  }
  assert.ok((await readFile(path.join(f.promptsDir,'111111111111111111/PROMPT'),'utf8')).includes(personal.personal.goals));
});

test('publication retries cannot confirm an edited draft or reuse another revision', async t => {
  const f = await fixture(t), alice = await f.login(0);
  const operation = {revision:0,requestId:'one-operation'};
  const applied = await (await f.api('/api/apply','POST',operation,alice)).json();
  assert.equal((await f.api('/api/apply','POST',{...operation,revision:1},alice)).status,409);
  const changed = applied.workspace; changed.personal.goals = 'A new draft';
  assert.equal((await f.api('/api/workspace','PUT',{revision:applied.revision,workspace:changed},alice)).status,200);
  assert.equal((await f.api('/api/apply','POST',operation,alice)).status,409);
  assert.equal((await readdir(path.join(f.dataDir,'profiles/111111111111111111/backups'))).length,1);
  assert.equal((await f.api('/api/apply','POST',{revision:2,requestId:'../invalid'},alice)).status,422);
  assert.equal((await f.api('/api/apply','POST',{revision:2,requestId:{}},alice)).status,422);
});
