import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Use application/json.');
  }
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new RequestError(413, 'Request is too large.');
    parts.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error();
    return value;
  } catch { throw new RequestError(400, 'Send a valid JSON object.'); }
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw new RequestError(400, 'Task text must be 1 to 500 characters.');
  }
  return value.trim();
}

// Each server instance has one shared store. Nothing is written to disk.
export function createTodoServer() {
  const tasks = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    function json(status, value) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      // No cross-origin writes. This demo has no accounts or authorization.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
        throw new RequestError(403, 'Cross-origin requests are not allowed.');
      }
      if (url.pathname === '/api/tasks') {
        if (req.method === 'GET') return json(200, { tasks: [...tasks.values()] });
        if (req.method === 'POST') {
          const input = await body(req);
          if (Object.keys(input).some(key => key !== 'text')) throw new RequestError(400, 'Only text is accepted.');
          if (tasks.size >= 10000) throw new RequestError(409, 'Task limit reached. Delete some tasks first.');
          const task = { id: randomUUID(), text: text(input.text), completed: false, createdAt: new Date().toISOString() };
          tasks.set(task.id, task);
          return json(201, { task });
        }
        if (req.method === 'DELETE') {
          let deleted = 0;
          for (const [id, task] of tasks) if (task.completed) { tasks.delete(id); deleted++; }
          return json(200, { deleted });
        }
        throw new RequestError(405, 'Method not allowed.');
      }
      if (url.pathname === '/api/export') {
        if (req.method !== 'GET') throw new RequestError(405, 'Method not allowed.');
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.json"`,
        });
        return res.end(JSON.stringify({ tasks: [...tasks.values()] }, null, 2));
      }
      const match = url.pathname.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)$/);
      if (match) {
        if (!['PATCH', 'DELETE'].includes(req.method)) throw new RequestError(405, 'Method not allowed.');
        const task = tasks.get(match[1]);
        if (!task) throw new RequestError(404, 'Task no longer exists. Refresh the list.');
        if (req.method === 'DELETE') { tasks.delete(task.id); return json(200, { deleted: true }); }
        const input = await body(req);
        const keys = Object.keys(input);
        if (!keys.length || keys.some(key => !['text', 'completed'].includes(key))) throw new RequestError(400, 'Send text or completed.');
        const next = { ...task };
        if ('text' in input) next.text = text(input.text);
        if ('completed' in input) {
          if (typeof input.completed !== 'boolean') throw new RequestError(400, 'completed must be true or false.');
          next.completed = input.completed;
        }
        // Validate every field before changing the stored task.
        tasks.set(next.id, next);
        return json(200, { task: next });
      }
      const asset = assets.get(url.pathname);
      if (asset && ['GET', 'HEAD'].includes(req.method)) {
        const data = await readFile(path.join(root, 'public', asset[0]));
        res.writeHead(200, { 'Content-Type': asset[1] });
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
      throw new RequestError(404, 'Not found.');
    } catch (error) {
      if (!(error instanceof RequestError)) console.error(error);
      json(error.status || 500, { error: error.status ? error.message : 'Server error. Try again.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be 1 to 65535.');
  const server = createTodoServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Todo app: http://${host}:${port} (in-memory storage)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
