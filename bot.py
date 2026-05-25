import json
import os
import time
import random
import asyncio
from datetime import datetime, timedelta
from telethon import TelegramClient, functions, types
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError
import git

# Загружаем конфигурацию
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# Загружаем состояние (или создаём пустое с нужными ключами)
try:
    with open('state.json', 'r') as f:
        state = json.load(f)
except:
    state = {}

# Гарантируем наличие всех необходимых ключей
state.setdefault('last_msg_id', {})
state.setdefault('joined_chats', [])

# Загружаем отложенные сообщения
try:
    with open('pending.json', 'r') as f:
        pending = json.load(f)
except:
    pending = []

# Задержка ответа в секундах
DELAY = config.get('response_delay', 5)

# Получаем сессии аккаунтов из переменной окружения (секрета GitHub)
sessions_json = os.environ.get('SESSION_STRINGS', '{}')
sessions = json.loads(sessions_json)

async def process_account(account_name, session_str):
    # Создаём клиент с строковой сессией
    client = TelegramClient(StringSession(session_str), config['api_id'], config['api_hash'])
    await client.start()
    print(f"Аккаунт {account_name} запущен")

    # === 1. Поиск и вступление в группы ===
    tags = config.get('search_tags', [])
    for tag in tags:
        try:
            result = await client(functions.contacts.SearchRequest(
                q=tag,
                limit=10
            ))
            for chat in result.chats:
                if chat.id not in state['joined_chats']:
                    try:
                        if isinstance(chat, (types.Channel, types.Chat)):
                            await client(functions.channels.JoinChannelRequest(chat))
                            print(f"Вступил в {chat.title}")
                            state['joined_chats'].append(chat.id)
                            await asyncio.sleep(2)  # защита от флуда
                    except FloodWaitError as e:
                        print(f"Флуд-блокировка, жду {e.seconds} сек.")
                        await asyncio.sleep(e.seconds)
                    except Exception as e:
                        print(f"Не удалось вступить в {chat.title}: {e}")
        except Exception as e:
            print(f"Ошибка поиска по тегу {tag}: {e}")

    # === 2. Обработка новых сообщений в группах ===
    dialogs = await client.get_dialogs()
    for dialog in dialogs:
        if not dialog.is_group and not dialog.is_channel:
            continue
        entity = dialog.entity
        last_id = state['last_msg_id'].get(str(entity.id), 0)
        messages = await client.get_messages(entity, limit=20, min_id=last_id)
        if not messages:
            continue
        new_max_id = max(m.id for m in messages)
        for msg in messages:
            if msg.out or not msg.text:
                continue
            text = msg.text.lower()
            for trigger, responses in config.get('triggers', {}).items():
                if trigger.lower() in text:
                    send_time = datetime.utcnow() + timedelta(seconds=DELAY)
                    resp = random.choice(responses)
                    pending.append({
                        "chat_id": entity.id,
                        "reply_to": msg.id,
                        "send_time": send_time.isoformat(),
                        "response": resp
                    })
                    break  # только один триггер на сообщение
        state['last_msg_id'][str(entity.id)] = new_max_id

    # === 3. Отправка отложенных ответов ===
    now = datetime.utcnow()
    remaining = []
    for item in pending:
        if datetime.fromisoformat(item['send_time']) <= now:
            try:
                resp = item['response']
                if resp['type'] == 'text':
                    await client.send_message(
                        item['chat_id'],
                        resp['text'],
                        reply_to=item['reply_to']
                    )
                elif resp['type'] == 'photo':
                    file = resp['file']
                    if file.startswith('http'):
                        await client.send_file(
                            item['chat_id'],
                            file,
                            reply_to=item['reply_to']
                        )
                    else:
                        await client.send_file(
                            item['chat_id'],
                            file,
                            reply_to=item['reply_to']
                        )
                print(f"Отправлен ответ в чат {item['chat_id']}")
            except Exception as e:
                print(f"Ошибка отправки: {e}")
        else:
            remaining.append(item)
    pending.clear()
    pending.extend(remaining)

    await client.disconnect()

def git_push():
    """Сохраняем изменения state.json и pending.json в репозиторий"""
    try:
        repo = git.Repo('.')
        repo.git.add('state.json', 'pending.json')
        if repo.index.diff('HEAD'):
            repo.index.commit('Автоматическое обновление состояния')
            repo.git.push()
            print("Состояние сохранено в GitHub")
    except Exception as e:
        print(f"Ошибка git push: {e}")

async def main():
    for acc_name, session_str in sessions.items():
        await process_account(acc_name, session_str)
    with open('state.json', 'w') as f:
        json.dump(state, f)
    with open('pending.json', 'w') as f:
        json.dump(pending, f)
    git_push()

if __name__ == '__main__':
    asyncio.run(main())
