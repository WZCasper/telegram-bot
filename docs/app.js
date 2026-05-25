// ====== НАСТРОЙКИ (замени своими данными) ======
const REPO_OWNER = 'wzcasper';          // твой логин на GitHub
const REPO_NAME = 'telegram-bot';       // имя репозитория
const BRANCH = 'main';

// DOM-элементы
const authScreen = document.getElementById('authScreen');
const mainScreen = document.getElementById('mainScreen');
const tokenInput = document.getElementById('githubToken');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');
const authError = document.getElementById('authError');

// Поля основных настроек
const groupTagsInput = document.getElementById('groupTags');
const replyDelayInput = document.getElementById('replyDelay');
const triggersContainer = document.getElementById('triggersContainer');
const addTriggerBtn = document.getElementById('addTriggerBtn');

// Toast-уведомления
const toastContainer = document.getElementById('toastContainer');

// Глобальные переменные
let accessToken = sessionStorage.getItem('gh_token');
let configSha = null;
let config = null;

// ==== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==== АВТОРИЗАЦИЯ ====
async function loadConfig() {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json?ref=${BRANCH}`;
    const resp = await fetch(url, {
        headers: { Authorization: `token ${accessToken}` }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    configSha = data.sha;
    config = JSON.parse(atob(data.content));
}

async function handleLogin() {
    const token = tokenInput.value.trim();
    if (!token) {
        authError.textContent = 'Введите токен';
        authError.style.display = 'block';
        return;
    }
    try {
        // Пробуем загрузить конфиг, чтобы проверить токен
        accessToken = token;
        await loadConfig();
        sessionStorage.setItem('gh_token', token);
        authError.style.display = 'none';
        showLoginScreen(false);
        renderAll();
        showToast('Авторизация успешна', 'success');
    } catch (err) {
        authError.textContent = 'Ошибка: неверный токен или нет доступа к репозиторию';
        authError.style.display = 'block';
        console.error(err);
    }
}

function handleLogout() {
    sessionStorage.removeItem('gh_token');
    accessToken = null;
    config = null;
    configSha = null;
    showLoginScreen(true);
    tokenInput.value = '';
}

function showLoginScreen(show) {
    authScreen.style.display = show ? 'flex' : 'none';
    mainScreen.style.display = show ? 'none' : 'block';
}

// Инициализация при загрузке
if (accessToken) {
    loadConfig()
        .then(() => {
            showLoginScreen(false);
            renderAll();
        })
        .catch(() => {
            // Токен есть, но невалидный — показываем экран входа
            sessionStorage.removeItem('gh_token');
            accessToken = null;
            showLoginScreen(true);
        });
} else {
    showLoginScreen(true);
}

// ==== ОТРИСОВКА ИНТЕРФЕЙСА ====
function renderAll() {
    // Основные настройки
    groupTagsInput.value = config.search_tags.join(', ');
    replyDelayInput.value = config.response_delay;

    // Триггеры
    renderTriggers();

    // Мультиаккаунты (если есть в config)
    renderAccounts();

    // Антифлуд и расписание — пока заглушки, можно добавить в config позже

    lucide.createIcons(); // пересоздаём иконки
}

function renderTriggers() {
    triggersContainer.innerHTML = '';
    for (const [triggerKey, responses] of Object.entries(config.triggers)) {
        const card = document.createElement('div');
        card.className = 'trigger-card';
        card.innerHTML = `
            <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Ключевое слово</label>
                <input type="text" class="form-input trigger-keyword" value="${escapeHtml(triggerKey)}" placeholder="например: привет">
            </div>
            <div class="form-group responses-block" style="margin-bottom: 0;">
                <label class="form-label">Ответы (текст или URL картинки)</label>
                <div class="responses-list" style="display: flex; flex-direction: column; gap: 8px;">
                    ${responses.map((r, idx) => `
                        <div class="response-item" style="display: flex; gap: 8px; align-items: center;">
                            <select class="resp-type" style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 5px;">
                                <option value="text" ${r.type === 'text' ? 'selected' : ''}>Текст</option>
                                <option value="photo" ${r.type === 'photo' ? 'selected' : ''}>Картинка</option>
                            </select>
                            <input type="text" class="resp-value form-input" value="${escapeHtml(r.type === 'text' ? r.text : r.file)}" placeholder="Текст ответа или URL" style="flex: 1;">
                            <button class="btn-3d btn-danger" style="padding: 5px 10px;" onclick="this.parentElement.remove()">❌</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-3d btn-secondary" style="margin-top: 5px; font-size: 12px;" onclick="addResponseField(this)">➕ Добавить вариант ответа</button>
            </div>
            <div class="trigger-delete" style="display: flex; align-items: center;">
                <button class="btn-3d btn-danger" onclick="this.closest('.trigger-card').remove()">🗑️ Удалить</button>
            </div>
        `;
        triggersContainer.appendChild(card);
    }
}

function addResponseField(button) {
    const list = button.parentElement.querySelector('.responses-list');
    const item = document.createElement('div');
    item.className = 'response-item';
    item.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    item.innerHTML = `
        <select class="resp-type" style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 5px;">
            <option value="text">Текст</option>
            <option value="photo">Картинка</option>
        </select>
        <input type="text" class="resp-value form-input" value="" placeholder="Текст ответа или URL" style="flex: 1;">
        <button class="btn-3d btn-danger" style="padding: 5px 10px;" onclick="this.parentElement.remove()">❌</button>
    `;
    list.appendChild(item);
}

// Добавление нового триггера
addTriggerBtn.addEventListener('click', () => {
    const card = document.createElement('div');
    card.className = 'trigger-card';
    card.innerHTML = `
        <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Ключевое слово</label>
            <input type="text" class="form-input trigger-keyword" placeholder="новый_триггер">
        </div>
        <div class="form-group responses-block" style="margin-bottom: 0;">
            <label class="form-label">Ответы</label>
            <div class="responses-list" style="display: flex; flex-direction: column; gap: 8px;">
                <div class="response-item" style="display: flex; gap: 8px; align-items: center;">
                    <select class="resp-type" style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; padding: 5px;">
                        <option value="text">Текст</option>
                        <option value="photo">Картинка</option>
                    </select>
                    <input type="text" class="resp-value form-input" placeholder="Текст ответа или URL" style="flex: 1;">
                    <button class="btn-3d btn-danger" style="padding: 5px 10px;" onclick="this.parentElement.remove()">❌</button>
                </div>
            </div>
            <button class="btn-3d btn-secondary" style="margin-top: 5px; font-size: 12px;" onclick="addResponseField(this)">➕ Добавить вариант ответа</button>
        </div>
        <div class="trigger-delete" style="display: flex; align-items: center;">
            <button class="btn-3d btn-danger" onclick="this.closest('.trigger-card').remove()">🗑️ Удалить</button>
        </div>
    `;
    triggersContainer.appendChild(card);
});

// Рендер аккаунтов (заглушка, можно расширить)
function renderAccounts() {
    const container = document.getElementById('accountsList');
    if (!container) return;
    container.innerHTML = '';
    if (config.accounts && Array.isArray(config.accounts)) {
        config.accounts.forEach((acc, i) => {
            const div = document.createElement('div');
            div.className = 'account-card ' + (i === 0 ? 'active' : '');
            div.innerHTML = `
                <div class="account-meta">
                    <div class="user-avatar">${acc.name ? acc.name[0].toUpperCase() : 'A'}</div>
                    <div>
                        <div class="user-name" style="font-size: 14px;">${acc.name || 'Аккаунт'}</div>
                        <span class="toggle-sub">${acc.phone || ''}</span>
                    </div>
                </div>
                <span class="bot-status">Активен</span>
            `;
            container.appendChild(div);
        });
    }
}

// ==== СОХРАНЕНИЕ ЧЕРЕЗ GITHUB API ====
saveBtn.addEventListener('click', async () => {
    try {
        // Собираем данные из формы
        const tags = groupTagsInput.value.split(',').map(s => s.trim()).filter(s => s);
        const delay = parseInt(replyDelayInput.value) || 0;

        const triggers = {};
        document.querySelectorAll('.trigger-card').forEach(card => {
            const keyword = card.querySelector('.trigger-keyword').value.trim();
            if (!keyword) return;
            const responses = [];
            card.querySelectorAll('.response-item').forEach(item => {
                const type = item.querySelector('.resp-type').value;
                const value = item.querySelector('.resp-value').value.trim();
                if (type === 'text') {
                    responses.push({ type: 'text', text: value });
                } else {
                    responses.push({ type: 'photo', file: value });
                }
            });
            triggers[keyword] = responses;
        });

        // Обновляем config
        config.search_tags = tags;
        config.response_delay = delay;
        config.triggers = triggers;
        // Дополнительные поля (пока не сохраняются, но можно добавить)
        // config.antiflood = document.getElementById('antifloodToggle').checked;
        // и т.д.

        // Получаем актуальный SHA перед сохранением
        const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json?ref=${BRANCH}`;
        const getResp = await fetch(getUrl, {
            headers: { Authorization: `token ${accessToken}` }
        });
        if (!getResp.ok) throw new Error('Не удалось получить актуальную версию config.json');
        const data = await getResp.json();
        configSha = data.sha;

        // Кодируем и отправляем
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2))));
        const putUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json`;
        const putResp = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                Authorization: `token ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Обновление конфигурации через веб-интерфейс',
                content: content,
                branch: BRANCH,
                sha: configSha
            })
        });
        if (putResp.ok) {
            saveStatus.innerHTML = '<span style="color: var(--success);">✅ Сохранено</span>';
            showToast('Конфигурация сохранена на GitHub', 'success');
        } else {
            const err = await putResp.json();
            throw new Error(err.message);
        }
    } catch (e) {
        saveStatus.innerHTML = '<span style="color: var(--error);">❌ Ошибка</span>';
        showToast('Ошибка сохранения: ' + e.message, 'error');
    }
});

// ==== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

// ==== ОБРАБОТЧИКИ КНОПОК ВХОДА/ВЫХОДА ====
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

// Авторизация по Enter в поле токена
tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});
