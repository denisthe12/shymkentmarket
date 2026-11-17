# Фронтенд → бэкенд: что нужно знать при слиянии и переезде на Go

> Historical planning or activation record. For current production topology and operator instructions, see [Frontend VPS deployment](../production/FRONTEND_VPS_DEPLOYMENT.md).

> **Исторический документ.** Фиксирует состояние на момент написания; пути (`backend/src`, NestJS), статусы и цифры могли устареть. Что актуально — [карта документации](../README.md).

Дата: 2026-10-05. Ветка фронта: `feat/frontend` (запушена, последний коммит `a8ee3eb`).
Подробности по фронту — `frontend/README.md`, история решений — `docs/context/06_FRONTEND_WORKLOG.md`.

## Коротко

- Фронт переехал с Vite SPA на **Next.js (App Router)** ради SEO. Новый код лежит в `frontend/`, старый Vite-фронт удалён.
- **Контракт API не менялся.** Типы фронта (`frontend/src/api/types.ts`) совпадают с `backend/src/contracts/catalog.ts` в `main`. Go-API должен отдавать то же самое.
- Фронт теперь **Node-сервер**, а не статика: страницы рендерятся на сервере и сами ходят в API.

## 1. Слияние `feat/frontend` с `main`

В `main` в `frontend/` лежит старый Vite-фронт с правками от 26.09. В нашей ветке он удалён и заменён на Next.

- **Все конфликты в `frontend/` решать в пользу `feat/frontend`.** Правки из `main` уже перенесены: корзина в моках сокращена до 3 позиций (milk/sugar/oil), поле `packageManager` добавлено. Тексты Siri не нужны: лендинга больше нет.
- **Удалить `frontend/vercel.json`, который приходит из `main`.** В нём правило, что все пути ведут на `/index.html`. Для SPA это было нужно, а Next с ним сломается.
- Вне `frontend/` и `docs/context/` фронт ничего не трогал.

Пример (из `feat/frontend`):
```bash
git merge origin/main
git checkout --ours -- frontend          # для конфликтов modify/delete: git rm <файл>, если он из старого фронта
git rm -f frontend/vercel.json
pnpm --dir frontend install && pnpm --dir frontend build
```

## 2. API, который использует фронт

Все запросы идут на `${BASE}/api/...`, используется только `GET`:

| Запрос | Ответ |
|---|---|
| `/api/categories` | `CategoryDto[]` |
| `/api/categories/:slug/filters` | `FilterSchemaDto` |
| `/api/products?category=&search=&sort=&limit=&offset=&<фильтры>` | `ProductCardDto[]` |
| `/api/products/:id` | `ProductCardDto` |
| `/api/dashboard` | `DashboardDto` (`baskets` — необязательное поле) |

Что важно сохранить в Go:

- **Мульти-значения фильтров передаются повтором параметра:** `?volumeMl=500&volumeMl=1000`. Фильтры внутри одного ключа объединяются по OR, разные ключи — по AND.
- `sort`: `price_asc` | `price_desc` | `name_asc`.
- **Не ограничивать `limit` значением меньше 100** (в NestJS-версии ограничения нет). Sitemap забирает все товары страницами по 100 через `offset`.
- **Неизвестный товар или категория → статус `404`.** По нему фронт показывает свою страницу 404 и отдаёт поисковикам 404. Любой другой не-2xx статус фронт показывает как ошибку загрузки.
- Тело ошибки необязательно. Если оно есть, фронт читает поле `message` (строку или массив строк), как у NestJS.
- `snapshotAt` — ISO-строка даты.

## 3. CORS

Часть запросов браузер шлёт в API напрямую: фильтры, сортировка, «Показать ещё», поиск при вводе. Поэтому API должен разрешать CORS для домена сайта, нужен только `GET`.

## 4. Деплой фронта

```bash
cd frontend
pnpm install
pnpm build        # API уже должен работать: каталог, дашборд и sitemap собираются из его данных
pnpm start        # Node-сервер, порт — через --port или PORT
```

Переменные окружения. `NEXT_PUBLIC_*` подставляются **при сборке**, поэтому после их смены нужен повторный `pnpm build`:

| Переменная | Значение |
|---|---|
| `NEXT_PUBLIC_API_MODE` | `http` (без неё фронт работает на моках) |
| `NEXT_PUBLIC_API_BASE_URL` | публичный адрес API для браузера, без `/api` и без `/` в конце |
| `API_BASE_URL` | необязательно: внутренний адрес API для сервера Next (например, `http://api:8080`), если они в одной сети |
| `NEXT_PUBLIC_SITE_URL` | публичный адрес сайта, например `https://adilbaga.kz`; без него canonical, hreflang и sitemap будут указывать на localhost |

Данные на страницах кэшируются и обновляются **раз в час** (`revalidate = 3600`). Обновлять кэш сразу после загрузки новых цен (запросом от бэка) пока не умеем — можем добавить, если понадобится.

## 5. Проверка после переезда на Go

Есть e2e-тесты против живого API. Ожидания они берут из того же API, поэтому подходят для любых данных:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 E2E_API=http pnpm test:e2e
# если Playwright не может скачать браузеры: добавить PW_CHANNEL=chrome
```

14 тестов (desktop и iPhone): каталог, категория с фильтром, поиск, товар (HTML с сервера, JSON-LD), 404, дашборд с картой и корзинами. На NestJS-бэке из `main` (`DATA_SOURCE=fixture`) все 14 проходят. Если после переезда что-то упадёт — скорее всего, расходится контракт: напишите фронту.

## 6. Поиск: слова в любом порядке

Сейчас `search` ищет всю фразу одной подстрокой: `p.name ILIKE '%'||$2||'%'` (`backend-go/internal/postgres/products.go`). Поэтому «творог dekmy» находит товар, а «dekmy творог» — нет, хотя пользователь ищет одно и то же.

Предложение: разбить запрос на слова и требовать, чтобы **каждое** слово было в названии **или бренде**, порядок не важен. Пример для SQL (параметр — массив слов, который Go получает через `strings.Fields(q.Search)`):

```sql
AND NOT EXISTS (
  SELECT 1 FROM unnest($8::text[]) w
  WHERE (p.name || ' ' || coalesce(p.brand, '')) NOT ILIKE '%' || w || '%'
)
```

Пустой массив — фильтр не применяется. `%` и `_` внутри слов лучше экранировать. Так же уже работает мок фронта (`frontend/src/api/mockAdapter.ts`, `queryProducts`).
