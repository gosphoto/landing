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

## SEO / зеркала (фаза 0–1)

- `https://www.gosphoto.ru/*` → **301** на `https://gosphoto.ru$request_uri`
- `https://gosphoto.ru/index.html` → **301** `/`
- HTTP (80) для apex и www → **301** на `https://gosphoto.ru$request_uri`
- Clean URL: `/foto-na-zagranpasport`, `/foto-na-pasport` (+ 301 с `.html`)

Вручную в Вебмастере (API не умеет регион):

1. ~~Привязать Метрику **111303098** + «Обход по счётчикам»~~ ✅
2. Региональность → **Россия** (если ещё не отправлено)
3. После деплоя фазы 1 — переобход двух новых URL
