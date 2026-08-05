# Деплой https://gosphoto.ru

Схема как у **fixaverse.ru** (`masterdoc-toir`): статика на VPS `91.207.75.72`, nginx + certbot, GitHub Actions rsync.

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

Скопируй те же, что на `masterdoc-app/masterdoc-toir` / `client-app`:

| Secret | Назначение |
|--------|------------|
| `DEPLOY_SSH_PRIVATE_KEY` | SSH-ключ на web VPS |
| `DEPLOY_USER` | пользователь SSH |
| `CERTBOT_EMAIL` | email для Let's Encrypt (опционально, дефолт `admin@gosphoto.ru`) |

```bash
# из репо, где секреты уже есть — значения вручную в UI:
# Settings → Secrets and variables → Actions
# или: gh secret set DEPLOY_SSH_PRIVATE_KEY -R gosphoto/landing < key.pem
```

## Что делает CI

На push в `main`:

1. Проверяет `index.html`, `css/`, `assets/`, `deploy/`, `api/`
2. rsync сайта → `/var/www/gosphoto.ru/`
3. rsync `api/` → `/opt/gosphoto-api/` + `docker compose up -d --build`
4. Ставит nginx + certbot → `/opt/gosphoto-landing/` (`/api/` и `/health` → gate)
5. Smoke curl лендинга + `/health`

Ручной запуск: Actions → **Deploy gosphoto.ru** → Run workflow.

## После первого деплоя

Открой https://gosphoto.ru — должен открыться лендинг Госфото.
