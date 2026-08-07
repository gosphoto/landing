# Деплой https://gosphoto.ru

Схема как у **fixaverse.ru** (`masterdoc-toir`): статика на VPS `91.207.75.72`, nginx + certbot, GitHub Actions rsync.

Бэкенд — **80.87.196.33:8111** (`/opt/gosphoto-api`, cutout u2net). Nginx лендинга на `91.207.75.72` проксирует `/api/` и `/health` туда.

## DNS (reg.ru)

A-записи на **`91.207.75.72`**:

| Хост | Тип | Значение |
|------|-----|----------|
| `@` (gosphoto.ru) | A | `91.207.75.72` |
| `www` | A | `91.207.75.72` |

Проверка:

```bash
dig +short gosphoto.ru A
dig +short www.gosphoto.ru A
```

## GitHub secrets (`gosphoto/landing`)

| Secret | Назначение |
|--------|------------|
| `DEPLOY_SSH_PRIVATE_KEY` | SSH-ключ на web VPS |
| `DEPLOY_USER` | пользователь SSH |
| `CERTBOT_EMAIL` | email для Let's Encrypt (опционально, дефолт `admin@gosphoto.ru`) |

Секреты API (`OPENROUTER_*`) — только в [gosphoto/api](https://github.com/gosphoto/api/settings/secrets/actions).

## Что делает CI

На push в `main`:

1. Проверяет `index.html`, `css/`, `assets/`, `deploy/`
2. rsync сайта → `/var/www/gosphoto.ru/`
3. Ставит nginx + certbot → `/opt/gosphoto-landing/`
4. Smoke curl

Ручной запуск: Actions → **Deploy gosphoto.ru** → Run workflow.

## После первого деплоя

Открой https://gosphoto.ru — должен открыться лендинг Госфото.
