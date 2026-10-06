import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTodoServer } from '../server.js';

async function start(t) {
  const server = createTodoServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route = '/api/tasks', method = 'GET', data) => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, body: await res.json() };
  };
  return { base, request };
}
test('CRUD, shared reads, clearing, and reload survival', async t => {
  const { request } = await start(t);
  assert.deepEqual((await request()).body.tasks, []);
  const created = await request('/api/tasks', 'POST', { text: '  Buy milk  ' });
  assert.equal(created.status, 201); const task = created.body.task;
  assert.equal(task.text, 'Buy milk'); assert.equal(task.completed, false);
  assert.equal((await request()).body.tasks[0].id, task.id);
  const edited = await request(`/api/tasks/${task.id}`, 'PATCH', { text: 'Buy oat milk', completed: true });
  assert.equal(edited.body.task.text, 'Buy oat milk'); assert.equal(edited.body.task.completed, true);
  assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', { completed: false })).body.task.completed, false);
  const other = (await request('/api/tasks', 'POST', { text: 'Read a book' })).body.task;
  await request(`/api/tasks/${task.id}`, 'PATCH', { completed: true });
  assert.equal((await request('/api/tasks', 'DELETE')).body.deleted, 1);
  assert.deepEqual((await request()).body.tasks.map(x => x.id), [other.id]);
  assert.equal((await request(`/api/tasks/${other.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/api/tasks/${other.id}`, 'DELETE')).status, 404);
});
test('validation, atomic edits, plain text, origin checks and static allowlist', async t => {
  const { request, base } = await start(t);
  for (const data of [{ text: '   ' }, { text: 12 }, { text: 'x'.repeat(501) }, { text: 'ok', completed: true }, [], null]) {
    assert.equal((await request('/api/tasks', 'POST', data)).status, 400);
  }
  const task = (await request('/api/tasks', 'POST', { text: '<img src=x onerror=alert(1)>' })).body.task;
  assert.equal(task.text, '<img src=x onerror=alert(1)>');
  assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', { text: 'changed', completed: 'yes' })).status, 400);
  assert.equal((await request()).body.tasks[0].text, task.text);
  assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', {})).status, 400);
  assert.equal((await request('/api/tasks', 'PUT')).status, 405);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(9000) }) })).status, 413);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: '{"text":"no"}' })).status, 403);
  for (const route of ['/', '/app.js', '/style.css']) {
    const res = await fetch(base + route); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(base + '/server.js')).status, 404);
  assert.equal((await fetch(base + '/package.json')).status, 404);
});
test('concurrent additions retain distinct IDs', async t => {
  const { request } = await start(t);
  await Promise.all(Array.from({ length: 30 }, (_, i) => request('/api/tasks', 'POST', { text: `Task ${i}` })));
  const tasks = (await request()).body.tasks;
  assert.equal(tasks.length, 30); assert.equal(new Set(tasks.map(x => x.id)).size, 30);
});
test('new server instance starts empty, unlike a browser refresh', async t => {
  const first = await start(t); await first.request('/api/tasks', 'POST', { text: 'Temporary' });
  assert.equal((await first.request()).body.tasks.length, 1);
  const second = await start(t); assert.deepEqual((await second.request()).body.tasks, []);
});
