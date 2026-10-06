import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTodoServer } from '../server.js';

async function start(t) {
  const server = createTodoServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route = '/api/tasks', method = 'GET', data) => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, body: await res.json() };
  };
  return { base, request };
}

test('export returns every task as a downloadable JSON file', async t => {
  const { base, request } = await start(t);
  await request('/api/tasks', 'POST', { text: 'Buy milk' });
  await request('/api/tasks', 'POST', { text: 'Read a book' });

  const res = await fetch(base + '/api/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="tasks-\d{4}-\d{2}-\d{2}\.json"$/);
  const body = await res.json();
  assert.equal(body.tasks.length, 2);
  assert.deepEqual(body.tasks.map(task => task.text), ['Buy milk', 'Read a book']);
});

test('export of an empty list and rejection of writes', async t => {
  const { base } = await start(t);
  const res = await fetch(base + '/api/export');
  assert.deepEqual((await res.json()).tasks, []);
  assert.equal((await fetch(base + '/api/export', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/export', { method: 'DELETE' })).status, 405);
});
