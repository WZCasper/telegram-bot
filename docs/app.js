// ====== ВАШИ ДАННЫЕ ======
const REPO_OWNER = 'wzcasper';             // ваш логин на GitHub
const REPO_NAME = 'telegram-bot';          // имя репозитория
const BRANCH = 'main';

// Сохраняем токен в sessionStorage при ручном вводе
let accessToken = sessionStorage.getItem('gh_token');
let configSha = null;
let config = null;

// DOM элементы
const loginSection = document.getElementById('loginSection');
const editorSection = document.getElementById('editorSection');
const tokenInput = document.getElementById('tokenInput');
const saveTokenBtn = document.getElementById('saveTokenBtn');
const loginBtn = document.getElementById('loginBtn');  // больше не нужен, но оставим для совместимости
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

// Проверка при загрузке
function init() {
  if (accessToken) {
    showEditor();
    loadConfig().then(renderUI);
  } else {
    showLogin();
  }
}

function showLogin() {
  loginSection.style.display = 'block';
  editorSection.style.display = 'none';
}

function showEditor() {
  loginSection.style.display = 'none';
  editorSection.style.display = 'block';
}

// Ручной вход по токену
saveTokenBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (token) {
    sessionStorage.setItem('gh_token', token);
    accessToken = token;
    tokenInput.value = '';
    showEditor();
    loadConfig().then(renderUI);
  }
});

// Загрузка конфига с GitHub API
async function loadConfig() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json?ref=${BRANCH}`;
  const resp = await fetch(url, {
    headers: { Authorization: `token ${accessToken}` }
  });
  const data = await resp.json();
  configSha = data.sha;
  config = JSON.parse(atob(data.content)); // декодируем base64
}

// Рендеринг UI
function renderUI() {
  document.getElementById('tagsInput').value = config.search_tags.join(', ');
  document.getElementById('delayInput').value = config.response_delay;
  renderTriggers();
}

function renderTriggers() {
  const container = document.getElementById('triggersContainer');
  container.innerHTML = '';
  for (const [trigger, responses] of Object.entries(config.triggers)) {
    const div = document.createElement('div');
    div.className = 'trigger-row';
    div.innerHTML = `
      <strong>Триггер:</strong> <input type="text" class="trigger-key" value="${escapeHtml(trigger)}">
      <div class="responses-list">
        ${responses.map((r, i) => `
          <div class="response-item">
            <select class="resp-type" onchange="switchInputType(this)">
              <option value="text" ${r.type==='text'?'selected':''}>Текст</option>
              <option value="photo" ${r.type==='photo'?'selected':''}>Картинка</option>
            </select>
            ${r.type==='text'
              ? `<input type="text" class="resp-text" value="${escapeHtml(r.text||'')}">`
              : `<input type="text" class="resp-file" value="${escapeHtml(r.file||'')}" placeholder="URL или путь к файлу">`
            }
            <button onclick="this.parentElement.remove()">❌</button>
          </div>
        `).join('')}
      </div>
      <button onclick="addResponse(this)">➕ Добавить ответ</button>
      <button onclick="this.parentElement.remove()">🗑️ Удалить триггер</button>
    `;
    container.appendChild(div);
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function switchInputType(selectEl) {
  const inputEl = selectEl.nextElementSibling;
  if (selectEl.value === 'text') {
    inputEl.className = 'resp-text';
    inputEl.placeholder = '';
  } else {
    inputEl.className = 'resp-file';
    inputEl.placeholder = 'URL или путь к файлу';
  }
}

// Добавление триггера
document.getElementById('addTriggerBtn').addEventListener('click', () => {
  const container = document.getElementById('triggersContainer');
  const div = document.createElement('div');
  div.className = 'trigger-row';
  div.innerHTML = `
    <strong>Триггер:</strong> <input type="text" class="trigger-key" value="">
    <div class="responses-list">
      <div class="response-item">
        <select class="resp-type" onchange="switchInputType(this)">
          <option value="text">Текст</option>
          <option value="photo">Картинка</option>
        </select>
        <input type="text" class="resp-text" value="">
        <button onclick="this.parentElement.remove()">❌</button>
      </div>
    </div>
    <button onclick="addResponse(this)">➕ Добавить ответ</button>
    <button onclick="this.parentElement.remove()">🗑️ Удалить триггер</button>
  `;
  container.appendChild(div);
});

function addResponse(button) {
  const responsesDiv = button.parentElement.querySelector('.responses-list');
  const item = document.createElement('div');
  item.className = 'response-item';
  item.innerHTML = `
    <select class="resp-type" onchange="switchInputType(this)">
      <option value="text">Текст</option>
      <option value="photo">Картинка</option>
    </select>
    <input type="text" class="resp-text" value="">
    <button onclick="this.parentElement.remove()">❌</button>
  `;
  responsesDiv.appendChild(item);
}

// Сохранение конфига
saveBtn.addEventListener('click', async () => {
  config.search_tags = document.getElementById('tagsInput').value.split(',').map(s => s.trim()).filter(s => s);
  config.response_delay = parseInt(document.getElementById('delayInput').value) || 0;

  const triggers = {};
  document.querySelectorAll('.trigger-row').forEach(row => {
    const key = row.querySelector('.trigger-key').value.trim();
    if (!key) return;
    const responses = [];
    row.querySelectorAll('.response-item').forEach(item => {
      const type = item.querySelector('.resp-type').value;
      if (type === 'text') {
        const text = item.querySelector('.resp-text')?.value || '';
        responses.push({ type: 'text', text });
      } else {
        const file = item.querySelector('.resp-file')?.value || '';
        responses.push({ type: 'photo', file });
      }
    });
    triggers[key] = responses;
  });
  config.triggers = triggers;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2))));
  const body = {
    message: 'Обновление конфигурации через веб-интерфейс',
    content: content,
    branch: BRANCH,
    sha: configSha
  };
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json`;
  try {
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (resp.ok) {
      statusDiv.innerText = '✅ Конфигурация сохранена!';
      await loadConfig(); // обновить SHA
    } else {
      const err = await resp.json();
      statusDiv.innerText = '❌ Ошибка сохранения: ' + err.message;
    }
  } catch (e) {
    statusDiv.innerText = '❌ Сетевая ошибка: ' + e.message;
  }
});

init();
