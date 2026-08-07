# Госфото — лендинг

Фото для Госуслуг онлайн. Домен: **gosphoto.ru** (`гос` + фото).

Дизайн в духе PhotoAiD: светлый фон, жёлтый акцент, hero с до/после.

## Прод

https://gosphoto.ru — деплой как у fixaverse.ru (VPS + nginx + Actions).  
Инфра: [deploy/INFRA.md](deploy/INFRA.md).

API (отдельный репо): https://github.com/gosphoto/api

## Локально

```bash
python3 -m http.server 5173
```

http://localhost:5173

## Структура

- `index.html` — страница
- `css/styles.css` — стили
- `assets/` — hero и карточки до/после
- `deploy/` — nginx + install script (`/api/` → `80.87.196.33:8111`)
- `.github/workflows/deploy.yml` — CI/CD статики
