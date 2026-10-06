const $ = selector => document.querySelector(selector);
let tasks = [], filter = 'all', editing = null, busy = false;
async function api(path = '', options = {}) {
  const response = await fetch(`/api/tasks${path}`, {
    ...options, headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function button(label, action) {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.onclick = action;
  return element;
}
function render() {
  $('#tasks').replaceChildren();
  const visible = tasks.filter(task => filter === 'all' || (filter === 'done' ? task.completed : !task.completed));
  for (const task of visible) {
    const li = document.createElement('li'); li.className = `task${task.completed ? ' done' : ''}`; li.dataset.id = task.id;
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = task.completed;
    check.setAttribute('aria-label', `${task.completed ? 'Reopen' : 'Complete'}: ${task.text}`);
    check.onchange = () => mutate(() => api(`/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: check.checked }) }), 'Task updated.');
    li.append(check);
    if (editing === task.id) {
      const form = document.createElement('form'); form.className = 'edit-form';
      const input = document.createElement('input'); input.value = task.text; input.maxLength = 500; input.required = true;
      input.setAttribute('aria-label', 'Edit task text');
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save'; save.className = 'primary';
      form.append(input, save, button('Cancel', () => { editing = null; render(); }));
      form.onsubmit = event => { event.preventDefault(); if (!input.value.trim()) return showError('Enter some task text.'); mutate(() => api(`/${task.id}`, { method: 'PATCH', body: JSON.stringify({ text: input.value }) }), 'Task saved.'); };
      li.append(form);
    } else {
      const span = document.createElement('span'); span.className = 'text'; span.textContent = task.text;
      const actions = document.createElement('div'); actions.className = 'actions';
      const edit = button('Edit', () => { editing = task.id; render(); $('.edit-form input').focus(); });
      const remove = button('Delete', () => mutate(() => api(`/${task.id}`, { method: 'DELETE' }), 'Task deleted.'));
      edit.setAttribute('aria-label', `Edit: ${task.text}`); remove.setAttribute('aria-label', `Delete: ${task.text}`);
      actions.append(edit, remove); li.append(span, actions);
    }
    $('#tasks').append(li);
  }
  const remaining = tasks.filter(task => !task.completed).length;
  $('#count').textContent = `${remaining} active / ${tasks.length} total`;
  $('#clear').disabled = busy || !tasks.some(task => task.completed);
  $('#empty').hidden = visible.length > 0;
  $('#empty').textContent = filter === 'done' ? 'No completed tasks.' : filter === 'active' ? 'No active tasks.' : 'A clear list. Add your first task above.';
  document.querySelectorAll('[data-filter]').forEach(el => el.setAttribute('aria-pressed', String(filter === el.dataset.filter)));
  if (busy) document.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
}
function showError(message) { $('#error').textContent = message; $('#error').hidden = false; }
async function mutate(action, message, after = () => {}) {
  if (busy) return;
  busy = true; $('#error').hidden = true; render();
  try {
    await action(); after(); editing = null;
    tasks = (await api()).tasks;
    $('#status').textContent = message;
  } catch (error) {
    showError(error.message + ' Refresh to check the server state before retrying.');
    $('#status').textContent = 'Could not finish the request.';
  } finally {
    busy = false;
    document.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
    render();
  }
}
$('#add-form').onsubmit = event => {
  event.preventDefault(); const input = $('#new-task');
  if (!input.value.trim()) return showError('Enter some task text.');
  mutate(() => api('', { method: 'POST', body: JSON.stringify({ text: input.value }) }), 'Task added.', () => { input.value = ''; input.focus(); });
};
document.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { filter = el.dataset.filter; render(); });
$('#clear').onclick = () => mutate(() => api('', { method: 'DELETE' }), 'Completed tasks cleared.');
$('#refresh').onclick = () => mutate(async () => {}, 'List refreshed.');
mutate(async () => {}, 'List loaded.');
