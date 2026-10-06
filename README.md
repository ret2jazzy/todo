# Node.js todo list

A small web app built from scratch with Node.js, HTML, CSS, and vanilla JavaScript. No frameworks, external packages, database, or build step.

## Run

1. Install Node.js 22 or newer.
2. Extract this folder and open a terminal in it.
3. Run `npm start` (or `node server.js`). No `npm install` is needed.
4. Open http://127.0.0.1:3000 in your browser.
5. Stop the server with Ctrl+C.

Do not open `public/index.html` directly: the page needs the Node server for its API.

## What it does

- Add and edit tasks (up to 500 characters).
- Complete or reopen tasks.
- Delete a task or clear completed tasks.
- Filter All, Active, or Done and view task counts.
- Refresh to pick up changes made by other browsers or clients.
- Use a responsive layout with labeled controls and inline error messages.

## Storage: memory, not durable persistence

Tasks live in a JavaScript Map inside the running Node process, not in browser localStorage. Closing a browser or refreshing the page does not clear the list while that same server is still running. Browsers connected to the same server share one list; click Refresh or reload to see others' changes. There is no automatic live-update feed.

Stopping, restarting, crashing, or redeploying the server clears every task. Different server processes have separate lists. This version does not write any task data to disk and does not import tasks from the older browser-only app. For tasks to survive a restart, add a database such as SQLite or explicit file storage instead.

## Local use and limits

The server listens on 127.0.0.1 by default. There are no user accounts or permissions: anyone able to access a server instance can view, edit, or delete its shared list. Do not expose this demo to the public internet as-is. Task text is rendered as plain text, and the server validates JSON and task fields, caps requests at 8 KiB, caps the list at 10,000 tasks, and serves only its three known public assets. These safeguards are not a substitute for authentication, HTTPS, deployment security, or rate limits.

To change the port on macOS/Linux: `PORT=4000 npm start`.
In Windows PowerShell: `$env:PORT=4000; npm start`.
Optional `HOST` changes the listening interface. Setting it to `0.0.0.0` makes the app reachable on the network and should only be done on a trusted private network with appropriate firewall rules. Never share sensitive tasks on an unauthenticated exposed server.

Simultaneous edits to the same task use the last received update. Mutating requests are disabled within one browser while it waits for a response. If the server becomes unreachable, the app reports an error; refresh to check current state before repeating a write.

## Tests

`npm test` runs the included Node API tests with no extra dependencies.

`npm run test:browser` runs the included end-to-end browser suite. It requires local Google Chrome and Node 22+. On macOS/Linux set `CHROME=/path/to/chrome` if it is not named `google-chrome`; on Windows set `$env:CHROME` in PowerShell to the executable path. The script starts a temporary local server and a separate temporary Chrome profile, closes both afterward, and saves desktop/mobile PNG screenshots under your OS temporary folder. Optional `SCREENSHOT_DIR` changes the output folder. The script's `--no-sandbox` Chrome flag is for isolated testing environments; this test navigates only to its own local demo.

Verified with Node 22.23.3 and Chrome: add/edit/cancel/complete/reopen/delete, all filters, clear completed, task counts, whitespace rejection, reload survival, independent-client shared state, plain-text rendering of HTML-like input, visible connection errors, no uncaught JavaScript exceptions, and no horizontal overflow at 390px and 1280px. Desktop and mobile screenshots were visually inspected. API tests also cover invalid fields/JSON, request size limits, cross-origin rejection, static asset restrictions, concurrent creates, and empty storage in a new server instance. Not tested in Firefox or Safari.

## Files

- `server.js`: Node HTTP server and in-memory store.
- `public/`: frontend HTML, CSS, and JavaScript.
- `test/api.test.js`: API tests using Node's built-in test runner.
- `test/browser.mjs`: dependency-free Chrome end-to-end test.

## API

| Method | Route | Body / result |
| --- | --- | --- |
| GET | /api/tasks | Returns `{ tasks: [...] }` |
| POST | /api/tasks | `{ text }`; returns `{ task }` with HTTP 201 |
| PATCH | /api/tasks/:id | `{ text }`, `{ completed }`, or both; returns `{ task }` |
| DELETE | /api/tasks/:id | Deletes one task; returns `{ deleted: true }` |
| DELETE | /api/tasks | Deletes only completed tasks; returns `{ deleted: number }` |

A task has `id`, `text`, `completed`, and `createdAt`. Send `Content-Type: application/json` with POST and PATCH. Errors are `{ error: message }` with an appropriate HTTP status.
