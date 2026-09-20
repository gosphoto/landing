# gosphoto.ru — план

> 2026-09-20 · заметки: `Documents/SEO/docs/gosphoto/`

## 0. Техника

| # | Шаг | Статус |
|---|-----|--------|
| 1 | 301 `www` → apex | в nginx, ждёт деплоя |
| 2 | 301 `/index.html` → `/` | в nginx, ждёт деплоя |
| 3 | `canonical` на `/` | ✅ в `index.html` |
| 4 | Метрика ↔ Вебмастер + обход по счётчикам | ⚠️ вручную в Вебмастере |
| 5 | Регион **Россия** | ⚠️ вручную в Вебмастере |
| 6 | Цена **450 ₽** на result | ✅ фолбэк и кнопка |
| 7 | Цель `click_review_ask` | ✅ id `651423439` |

## 1. Посадочные

| Path | Угол |
|------|------|
| `/foto-na-zagranpasport` | загран, 5/10 лет, Госуслуги |
| `/foto-na-pasport` | паспорт РФ, заявление на портале |

Файлы HTML, nginx как у `/contacts`, sitemap, переобход. Ссылки только clean URL. В шапку max 2 ссылки.

## 2. После замера фазы 1

| Path | Угол |
|------|------|
| `/trebovaniya-k-foto-na-zagranpasport` | ГОСТ / образцы |
| `/trebovaniya-k-foto-na-pasport` | требования паспорта |
| `/trebovaniya-k-foto-na-gosuslugi` | лимиты файла портала |
| `/ne-prinimaet-foto-na-gosuslugah` | отказы + блок про `trustedphoto` |
| `/kak-sdelat-foto-na-gosuslugi` | съёмка дома |

По две страницы с замером. На требованиях — ссылка на первоисточник и дата проверки.

## Порядок

0 → 1 → замер 4 недели → 2.
