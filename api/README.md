# Gosphoto photo gate

Серверный gate: MediaPipe Face Landmarker + OpenCV blur.

## API

- `GET /health` → `{"status":"ok"}`
- `POST /api/validate` — multipart field `file` (JPEG/PNG/WebP ≤20MB)

Публично: `https://gosphoto.ru/api/validate`

## Deploy (VPS `91.207.75.72`)

```bash
rsync -az --delete ./backend/ root@91.207.75.72:/opt/gosphoto-api/
ssh root@91.207.75.72 'cd /opt/gosphoto-api && docker compose up -d --build'
```

Контейнер: `gosphoto-gate`, порт `127.0.0.1:8091`, mem ≤768MB.
Nginx: `location /api/` → 8091 (см. `gosphoto-landing/deploy/gosphoto.ru.nginx.conf`).

## Env

| Переменная | Default | Смысл |
|------------|---------|--------|
| `GATE_MAX_YAW_DEG` | 25 | max \|yaw\| |
| `GATE_MAX_PITCH_DEG` | 25 | max \|pitch\| |
| `GATE_MAX_ROLL_DEG` | 20 | max \|roll\| |
| `GATE_MIN_BLUR_VARIANCE` | 50 | Laplacian variance |
| `GATE_MAX_UPLOAD_BYTES` | 20971520 | 20MB |
