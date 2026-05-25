// ====== НАСТРОЙКИ (замени своими данными) ======
const CLIENT_ID = 'тут_будет_твой_github_oauth_client_id';  // получим на следующем шаге
const REPO_OWNER = 'WZCasper';                // твой логин на GitHub
const REPO_NAME = 'telegram-bot';                         // имя репозитория
const BRANCH = 'main';

let accessToken = sessionStorage.getItem('gh_token');
let configSha = null;
let config = null;

// Проверка авторизации при загрузке
async function init() {
  if (!accessToken) {
    document.getElementById('loginBtn').style.display = 'block';
    return;
  }
  document.getElementById('loginBtn').style.display = 'none';
  document.getElementById('editor').style.display = 'block';
  await loadConfig();
  renderUI();
}

// OAuth вход
document.getElementById('loginBtn').addEventListener('click', () => {
  const redirectUri = window.location.origin + window.location.pathname;
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&scope=repo`;
});

// Получение токена после редиректа
if (window.location.hash) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  const token = params.get('access_token');
  if (token) {
    sessionStorage.setItem('gh_token', token);
    window.location.hash = '';
    accessToken = token;
    init();
  }
}

// Загрузка конфига с GitHub
async function loadConfig() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json?ref=${BRANCH}`;
  const resp = await fetch(url, {
    headers: { Authorization: `token ${accessToken}` }
  });
  const data = await resp.json();
  configSha = data.sha;
  config = JSON.parse(atob(data.content)); // декодируем base64
}

// Отрисовка интерфейса на основе конфига
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
            <select class="resp-type">
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

document.getElementById('addTriggerBtn').addEventListener('click', () => {
  const container = document.getElementById('triggersContainer');
  const div = document.createElement('div');
  div.className = 'trigger-row';
  div.innerHTML = `
    <strong>Триггер:</strong> <input type="text" class="trigger-key" value="">
    <div class="responses-list">
      <div class="response-item">
        <select class="resp-type">
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
    <select class="resp-type">
      <option value="text">Текст</option>
      <option value="photo">Картинка</option>
    </select>
    <input type="text" class="resp-text" value="">
    <button onclick="this.parentElement.remove()">❌</button>
  `;
  responsesDiv.appendChild(item);
  // Обработчик смены типа
  item.querySelector('.resp-type').addEventListener('change', function() {
    const input = this.nextElementSibling;
    if (this.value === 'text') {
      input.className = 'resp-text';
      input.placeholder = '';
    } else {
      input.className = 'resp-file';
      input.placeholder = 'URL или путь к файлу';
    }
  });
}

// Сохранение конфига
document.getElementById('saveBtn').addEventListener('click', async () => {
  // Собираем данные из формы
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

  // Коммитим изменения через GitHub API
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2))));
  const body = {
    message: 'Обновление конфигурации через веб-интерфейс',
    content: content,
    branch: BRANCH,
    sha: configSha
  };
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (resp.ok) {
    document.getElementById('status').innerText = '✅ Конфигурация сохранена!';
    await loadConfig(); // обновить SHA
  } else {
    const err = await resp.json();
    document.getElementById('status').innerText = '❌ Ошибка сохранения: ' + err.message;
  }
});

// Загрузка изображений (будет реализована позже)
document.getElementById('imageUpload').addEventListener('change', async (e) => {
  // Пока просто покажем, что нужно доработать
  alert('Функция загрузки изображений будет готова после настройки GitHub OAuth и прав доступа. Пока используй прямые ссылки на изображения.');
});

init();
