// Optional end-to-end suite: Node 22+ and a local Chrome/Chromium executable.
// No npm packages required. Uses Chrome's local debugging protocol.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createTodoServer } from '../server.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'todo-chrome-'));
const server = createTodoServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { const { readFile } = await import('node:fs/promises'); port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
  }
  if (!port) throw Error('Chrome did not start. Set CHROME to your executable path.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0; const pending = new Map(), errors = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const waitFor = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw Error(`Timed out: ${expression}`);
  };
  const count = () => evaluate("document.querySelectorAll('.task').length");
  const add = async text => {
    const before = await count();
    await evaluate(`document.querySelector('#new-task').value=${JSON.stringify(text)};document.querySelector('#add-form').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.task').length===${before + 1} && !document.querySelector('#new-task').disabled`);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: base });
  await waitFor("document.querySelector('#status')?.textContent === 'List loaded.'");
  assert.equal(await count(), 0);
  await evaluate("document.querySelector('#new-task').value='   ';document.querySelector('#add-form').requestSubmit()");
  assert.equal(await count(), 0); assert.equal(await evaluate("document.querySelector('#error').hidden"), false);
  await add('Plan the weekend'); await add('Read a chapter');
  await evaluate("document.querySelector('.task input').click()");
  await waitFor("document.querySelectorAll('.task.done').length===1 && !document.querySelector('#new-task').disabled");
  await evaluate("document.querySelector('[data-filter=active]').click()"); assert.equal(await count(), 1);
  await evaluate("document.querySelector('[data-filter=done]').click()"); assert.equal(await count(), 1);
  await evaluate("document.querySelector('.task input').click()");
  await waitFor("document.querySelectorAll('.task').length===0 && !document.querySelector('#new-task').disabled");
  await evaluate("document.querySelector('[data-filter=all]').click();document.querySelector('.actions button').click()");
  await evaluate("document.querySelector('.edit-form input').value='Plan a quiet weekend';document.querySelector('.edit-form').requestSubmit()");
  await waitFor("document.querySelector('.task .text')?.textContent==='Plan a quiet weekend' && !document.querySelector('#new-task').disabled");
  await evaluate("document.querySelector('.actions button').click();document.querySelector('.edit-form button[type=button]').click()");
  assert.equal(await evaluate("!!document.querySelector('.edit-form')"), false);
  await send('Page.reload');
  await waitFor("document.querySelector('#status')?.textContent==='List loaded.'"); assert.equal(await count(), 2);
  // An independent HTTP client sees browser-created tasks, and its write appears on refresh.
  const shared = await (await fetch(base + '/api/tasks')).json(); assert.equal(shared.tasks.length, 2);
  await fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'From another client' }) });
  await evaluate("document.querySelector('#refresh').click()"); await waitFor("document.querySelectorAll('.task').length===3 && !document.querySelector('#new-task').disabled");
  await add('<img src=x onerror=alert(1)>'); assert.equal(await evaluate("document.querySelectorAll('#tasks img').length"), 0);
  await evaluate("document.querySelectorAll('.actions')[3].querySelectorAll('button')[1].click()");
  await waitFor("document.querySelectorAll('.task').length===3 && !document.querySelector('#new-task').disabled");
  await evaluate("document.querySelector('.task input').click()"); await waitFor("document.querySelector('.task.done') && !document.querySelector('#new-task').disabled");
  await evaluate("document.querySelector('#clear').click()"); await waitFor("document.querySelectorAll('.task').length===2 && !document.querySelector('#new-task').disabled");
  const output = process.env.SCREENSHOT_DIR || path.join(tmpdir(), 'todo-node-screenshots'); await mkdir(output, { recursive: true });
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    await delay(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  }
  assert.deepEqual(errors, []);
  // A disconnected server produces a visible error rather than a false saved state.
  await new Promise(resolve => server.close(resolve));
  await evaluate("document.querySelector('#refresh').click()");
  await waitFor("!document.querySelector('#error').hidden && !document.querySelector('#refresh').disabled");
  console.log(`Browser tests passed: CRUD, filters, cancel, reload, shared client, plain-text rendering, clear completed, error display, mobile/desktop overflow, no JS exceptions. Screenshots: ${output}`);
} finally {
  ws?.close(); chrome.kill('SIGTERM');
  await new Promise(resolve => server.close(resolve));
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
