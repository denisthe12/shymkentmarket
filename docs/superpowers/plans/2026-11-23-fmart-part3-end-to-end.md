# F-Mart, часть 3: сквозной прогон трёх сетей — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доказать на проверенной одноразовой локальной PostgreSQL порядок будущего production: снимок Magnum и Gramad → миграции F-Mart → снимок трёх сетей без конфликтов strict-ingest; сравнить СЗПТ «до/после» на полной выдаче Gramad.

**Architecture:** Нового кода нет; команды существующих частей и исправления найденных дефектов (каждое — тест и коммит).

**Tech Stack:** pnpm-скрипты pipeline, Go `cmd/ingest` и API, Docker PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-11-23-fmart-network-design.md` (часть 3). Начинается после слияния частей 1 и 2.

## Global Constraints

- Живые скрапы (`scrape:magnum`, `scrape:gramad`, `scrape:fmart`) — каждый после отдельного «да» Owner, по одному прогону. Отказ защиты (`drop above 10%`, минимумы, сдвиг цен) не обходить — вопрос Owner.
- Запись — только в одноразовую БД; до первой записи SQL: `current_database()`, `inet_server_addr()`, `current_user`, контейнер этой сессии (только loopback).
- После каждого ручного `-apply` — `ANALYZE offers, raw_products, canonical_products, product_mappings, categories, snapshots`.
- `INGEST_MAX_STORE_DROP_PERCENT=10`. `FRONTEND_REVALIDATE_URL` и `REVALIDATE_HMAC_SECRET` — заглушки loopback.
- Конфликт strict-ingest — пробный `-recluster`, отчёт и вопрос Owner; без молчаливого `-recluster -apply`.
- Правка Go, корзины дашборда, адреса привязки API — не цель; если без неё нельзя — стоп и вопрос.
- В логах и отчёте — без значений env, строк подключения, доступа к источнику. Ветка `feat/fmart-end-to-end` от `origin/main` после слияния части 2; push, PR, merge — после «да».

## Review Focus

- Пробный ingest шага B: `mergedCanonical` 0, `splitCanonical` 0, без `canonical_merge_conflict` и `canonical_split_conflict` (задача 2).
- Карточка с весовым и штучным предложением в одном снимке, карточка с весовым F-Mart и размером упаковки → таких нет (задача 2).
- Десять самых больших `priceSpreads`: ни одной разницы около ×2 у свежих овощей F-Mart и ни одного очевидно разного товара (задача 3).
- `SYNC_STORES=MAGNUM,GRAMAD` после миграции F-Mart → отказ ingest, БД не меняется (задача 2).
- Скрап F-Mart отказан минимумом или сдвигом цен → прогон не продолжается на старом файле молча (задача 1).

---

### Task 1: Свежие скрапы и пополнение словаря

- [ ] **Step 1:** «Да» Owner → `pnpm scrape:magnum`; «да» → `pnpm scrape:gramad`; «да» → `pnpm scrape:fmart`. Записать статистику; Gramad — полная выдача (около 590; заметно меньше — вопрос Owner).
- [ ] **Step 2:** `pnpm dict:prepare` для трёх сетей (с `--force` только после копии `data/agent/<сеть>-match` вне git) → субагенты Haiku → `--check` → применение → `pnpm dict:apply`; ревью всех новых присоединений.
- [ ] **Step 3:** `pnpm taxonomy:sql` → «no taxonomy change» или новая миграция (цепочка `postgres.mjs`, список `auto-gate.test.mjs`).
- [ ] **Step 4:** `pnpm test` → PASS. **Commit** словаря (и миграции, если есть).

### Task 2: БД: шаг A (две сети) и шаг B (три сети)

- [ ] **Step 1:** Одноразовый `postgres:17-alpine` (loopback), проверка личности SQL.
- [ ] **Step 2: Шаг A.** Роль чтения → миграции **без** `*_shymkent_fmart_store` и без более поздних → роль записи и доступ к реестру идентичностей → LOGIN-роли. `SYNC_STORES=MAGNUM,GRAMAD pnpm sync` → `cmd/ingest` пробный → `-apply` → `ANALYZE`. Записать id снимка, офферы по сетям, весовые, `matchedAcrossTwoOrMoreStores`.
- [ ] **Step 3: Базовые числа СЗПТ** шага A через API: `GET /api/szpt` и товары каждой группы (`limit=100`) — сетей в группе, карточек, минимальная цена по сети. Это «до» на полной выдаче Gramad.
- [ ] **Step 4:** Остальные миграции (`prisma migrate deploy`). Бандл `SYNC_STORES=MAGNUM,GRAMAD` → пробный ingest отказывает, снимков не прибавилось.
- [ ] **Step 5: Шаг B.** `SYNC_STORES=MAGNUM,GRAMAD,FMART pnpm sync` (unmapped по сетям) → `cmd/ingest` пробный: `perStoreCounts`, `matchedAcrossTwoOrMoreStores`, `mergedCanonical`, `splitCanonical`, `reusedCanonical` → `-apply` → `ANALYZE`.
- [ ] **Step 6:** SQL по снимку B: карточек и с `soldByWeight` true, и с false → 0; весовых офферов по сетям; карточек с весовым F-Mart и `weightGrams` или `volumeMl` → 0. Повторный `cmd/ingest` того же бандла пробно → без конфликтов.

### Task 3: API

- [ ] **Step 1:** Локальный Go API (`APP_ENV=development`, LOGIN-роль — член роли чтения).
- [ ] **Step 2:** `GET /api/dashboard` → `stores` 3; `matchedAcrossStores` сверить с ingest (разница объяснена); `priceSpreads` — десять самых больших вручную; корзина — как есть, только записать.
- [ ] **Step 3:** `GET /api/szpt` и товары каждой группы (`limit=100`) → 200; цена карточки = минимум по сетям (5 карточек по SQL); весовые группы — `unit_price_asc` не убывает, предложения F-Mart — `soldByWeight: true`; пустая группа → 200 и `[]`. Таблица «до/после»: группа — сетей, карточек, минимальная цена.
- [ ] **Step 4:** `GET /api/products?category=vegetables` и `?category=eggs` → предложения `FMART`; `GET /api/categories` → 200.
- [ ] **Step 5:** Бандл с незарегистрированной сетью → отказ; `SYNC_STORES=MAGNUM,FOO pnpm sync` → `SYNC_STORES invalid`.
- [ ] **Step 6:** Уборка: API остановлен, контейнер удалён с томом.

### Task 4: Отчёт

- [ ] **Step 1:** Локальный CI по затронутым группам (при изменении данных или миграций — с `postgres,staging`) → PASS.
- [ ] **Step 2:** `docs/production/reports/SHYMKENT_FMART_END_TO_END_REPORT.md`: команды, числа шагов A и B, таблица СЗПТ «до/после», ответы API сокращённо, найденные дефекты, PASS/FAIL/SKIP/NOT_RUN, риски. **Commit**; push и PR — после «да».
