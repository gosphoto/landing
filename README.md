# Госфото — лендинг

Фото для Госуслуг онлайн. Домен: **gosphoto.ru** (`гос` + фото).

Дизайн в духе PhotoAiD: светлый фон, жёлтый акцент, hero с до/после.

## Продакшен

https://gosphoto.ru — деплой как у fixaverse.ru (VPS + nginx + Actions).  
Инфра: [deploy/INFRA.md](deploy/INFRA.md).

### Secrets (GitHub Actions)

| Secret | Назначение |
|--------|------------|
| `DEPLOY_SSH_PRIVATE_KEY` | SSH на VPS |
| `DEPLOY_USER` | SSH user |
| `CERTBOT_EMAIL` | Let's Encrypt (опционально) |
| `OPENROUTER_API_KEY` | правка селфи через OpenRouter (`/api/process`) |
| `OPENROUTER_IMAGE_MODEL` | опционально, default `google/gemini-2.5-flash-image` |

Добавить ключ: https://github.com/gosphoto/landing/settings/secrets/actions

## Локально

```bash
python3 -m http.server 5173
```

http://localhost:5173

## Структура

- `index.html` — страница
- `css/styles.css` — стили
- `assets/` — hero и карточки до/после
- `api/` — photo gate (MediaPipe Face Landmarker), Docker → `/opt/gosphoto-api`
- `deploy/` — nginx + install script (`/api/` → `127.0.0.1:8091`)
- `.github/workflows/deploy.yml` — CI/CD (статика + nginx + rebuild gate)

Gate: `POST https://gosphoto.ru/api/validate`  
Process: `POST https://gosphoto.ru/api/process` (gate → OpenRouter edit → local 35×45 crop)
