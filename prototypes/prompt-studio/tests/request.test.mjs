import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJSON, requestResponse, RequestError} from '../dist/request.mjs';

test('reads recover from a short connection interruption', async () => {
  let attempts = 0; const delays = [];
  const result = await requestJSON('/api/team',{}, {fetchImpl:async () => {if (++attempts < 3) throw new TypeError('Failed to fetch'); return Response.json({revision:7});},wait:async ms => delays.push(ms)});
  assert.equal(result.revision,7); assert.equal(attempts,3); assert.deepEqual(delays,[500,1500]);
});

test('unconfirmed writes are not blindly retried and network errors explain that the draft remains open', async () => {
  let attempts = 0;
  await assert.rejects(requestJSON('/api/team',{method:'PUT',body:'{}'},{fetchImpl:async () => {attempts++; throw new TypeError('Failed to fetch');}}), error => error instanceof RequestError && error.message.includes('Your draft is still open'));
  assert.equal(attempts,1);
});

test('retrying an identified publication keeps its original request and also handles a lost response body', async () => {
  const seen = [], body = JSON.stringify({revision:4,requestId:'one-publication'});
  const result = await requestJSON('/api/team/apply',{method:'POST',body},{retry:true,wait:async () => {},fetchImpl:async (url, options) => {
    seen.push(options.body);
    if (seen.length === 1) return {json:async () => {throw new TypeError('Connection reset');}};
    return Response.json({revision:5});
  }});
  assert.equal(result.revision,5); assert.deepEqual(seen,[body,body]);
});

test('server validation and revision conflicts keep their status and are not retried', async () => {
  for (const status of [401,409,422,503]) {
    let attempts = 0;
    await assert.rejects(requestJSON('/api/team/apply',{method:'POST'},{retry:true,fetchImpl:async () => {attempts++; return Response.json({error:'Specific server response'},{status});}}), error => error.status === status && error.message === 'Specific server response');
    assert.equal(attempts,1);
  }
});

test('repeated network failure stops after three attempts and immutable file uploads can retry', async () => {
  let attempts = 0;
  await assert.rejects(requestJSON('/api/team',{}, {wait:async () => {},fetchImpl:async () => {attempts++; throw new TypeError('Failed to fetch');}}), /Connection to Sonne was interrupted/);
  assert.equal(attempts,3);
  attempts = 0;
  const response = await requestResponse('/api/files/id',{method:'PUT',body:'same-file'},{retry:true,wait:async () => {},fetchImpl:async () => {if (++attempts === 1) throw new TypeError('Failed to fetch'); return Response.json({id:'id'});}});
  assert.equal(response.status,200); assert.equal(attempts,2);
});
