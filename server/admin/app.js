const state = { token: '', items: [], selected: null };
const $ = (id) => document.getElementById(id);
const templates = {
  question: { shortAnswer: 'Краткий ответ', fullAnswer: 'Развёрнутый ответ', difficulty: 'Средний' },
  task: { description: 'Условие задачи', difficulty: 'Средний', estimatedMinutes: 30, skills: ['TypeScript'], starterCode: 'function solve(value) {\n  return value;\n}', solution: 'Разбор решения', runner: { language: 'javascript', entrypoint: 'solve', tests: [{ name: 'пример', args: [2], expected: 2 }] } },
  video: { author: 'Автор', durationMinutes: 15, url: 'https://example.com/video.mp4', quiz: [{ id: 'q1', prompt: 'Контрольный вопрос', options: ['Вариант A', 'Вариант B'], correctIndex: 0, explanation: 'Почему этот ответ верный.' }] },
  track: { description: 'Описание учебного трека', lessons: 8, durationMinutes: 240 },
};

$('connect').addEventListener('click', () => {
  state.token = $('token').value.trim();
  $('token').value = '';
  void loadItems();
});
$('new-item').addEventListener('click', resetForm);
$('filter-type').addEventListener('change', () => void loadItems());
$('filter-status').addEventListener('change', () => void loadItems());
$('type').addEventListener('change', () => { $('payload').value = format(templates[$('type').value]); });
$('content-form').addEventListener('submit', (event) => { event.preventDefault(); void save(); });
$('to-review').addEventListener('click', () => void transition('review'));
$('publish').addEventListener('click', () => void transition('published'));
$('archive').addEventListener('click', () => void transition('archived'));

resetForm();

async function loadItems() {
  if (!state.token) return showMessage('Введите токен редактора.', true);
  $('library-state').textContent = 'Загружаем…';
  const params = new URLSearchParams();
  if ($('filter-type').value) params.set('type', $('filter-type').value);
  if ($('filter-status').value) params.set('status', $('filter-status').value);
  try {
    state.items = await request(`/admin/content?${params}`);
    $('library-state').textContent = state.items.length ? `${state.items.length} материалов` : 'Материалов пока нет.';
    renderList();
    showMessage('CMS подключена. Токен хранится только до перезагрузки страницы.');
  } catch (error) {
    $('library-state').textContent = 'Не удалось загрузить материалы.';
    showMessage(error.message, true);
  }
}

function renderList() {
  const list = $('content-list');
  list.replaceChildren();
  for (const item of state.items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `content-card${state.selected?.id === item.id ? ' active' : ''}`;
    const title = document.createElement('strong'); title.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = `${labelType(item.type)} · ${item.specialty} · v${item.version} · ${item.status}`;
    button.append(title, meta);
    button.addEventListener('click', () => selectItem(item));
    list.append(button);
  }
}

function selectItem(item) {
  state.selected = item;
  $('type').value = item.type; $('type').disabled = true;
  $('specialty').value = item.specialty; $('title').value = item.title; $('editor').value = item.editor;
  $('source-label').value = item.sourceLabel; $('source-url').value = item.sourceUrl || '';
  $('next-review').value = toLocalDate(item.nextReviewAt); $('tags').value = item.tags.join(', ');
  $('payload').value = format(item.payload); $('version').textContent = `v${item.version}`;
  $('editor-title').textContent = item.title; setStatus(item.status); updateActions(); renderList();
}

function resetForm() {
  state.selected = null; $('content-form').reset(); $('type').disabled = false; $('type').value = 'question';
  $('specialty').value = 'Frontend'; $('next-review').value = toLocalDate(new Date(Date.now() + 90 * 86400000).toISOString());
  $('payload').value = format(templates.question); $('version').textContent = 'новая';
  $('editor-title').textContent = 'Новый материал'; setStatus('draft'); updateActions(); renderList(); showMessage('');
}

async function save() {
  try {
    const content = readForm();
    const item = state.selected
      ? await request(`/admin/content/${encodeURIComponent(state.selected.id)}`, { method: 'PUT', body: { expectedVersion: state.selected.version, content } })
      : await request('/admin/content', { method: 'POST', body: content });
    showMessage(`Сохранена версия ${item.version}.`); await loadItems(); selectItem(item);
  } catch (error) { showMessage(error.message, true); }
}

async function transition(status) {
  if (!state.selected) return showMessage('Сначала сохраните материал.', true);
  try {
    const item = await request(`/admin/content/${encodeURIComponent(state.selected.id)}/transition`, {
      method: 'POST', body: { expectedVersion: state.selected.version, status },
    });
    showMessage(`Новый статус: ${item.status}.`); await loadItems(); selectItem(item);
  } catch (error) { showMessage(error.message, true); }
}

function readForm() {
  let payload;
  try { payload = JSON.parse($('payload').value); } catch { throw new Error('Данные материала содержат некорректный JSON.'); }
  const sourceUrl = $('source-url').value.trim();
  return {
    type: $('type').value, specialty: $('specialty').value, title: $('title').value.trim(),
    editor: $('editor').value.trim(), sourceLabel: $('source-label').value.trim(),
    ...(sourceUrl ? { sourceUrl } : {}),
    nextReviewAt: new Date($('next-review').value).toISOString(),
    tags: $('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean), payload,
  };
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Ошибка API: ${response.status}`);
  return data;
}

function updateActions() {
  const status = state.selected?.status || 'draft';
  $('to-review').disabled = !state.selected || status !== 'draft';
  $('publish').disabled = !state.selected || status !== 'review';
  $('archive').disabled = !state.selected || status !== 'published';
}
function setStatus(status) { const node = $('status'); node.textContent = status; node.className = `status ${status}`; }
function showMessage(message, error = false) { const node = $('message'); node.textContent = message; node.className = `message${error ? ' error' : ''}`; }
function toLocalDate(value) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); }
function format(value) { return JSON.stringify(value, null, 2); }
function labelType(type) { return ({ question: 'Вопрос', task: 'Задача', video: 'Видео', track: 'Трек' })[type] || type; }
