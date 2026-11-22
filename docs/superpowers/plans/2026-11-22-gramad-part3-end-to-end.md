# Gramad, часть 3: сквозной прогон двух сетей — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доказать на проверенной одноразовой локальной PostgreSQL порядок будущего production: снимок только с Magnum → миграция Gramad → снимок двух сетей без конфликтов strict-ingest → `/api/szpt` и `/api/dashboard` сравнивают цены двух сетей.

**Architecture:** Нового кода нет; команды существующих частей и исправления найденных дефектов (каждое — тест и коммит).

**Tech Stack:** pnpm-скрипты pipeline, Go `cmd/ingest` и API, Docker PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-11-22-gramad-network-design.md` (часть 3). Начинается после слияния частей 1 и 2.

## Global Constraints

- Живые скрапы — каждый после отдельного «да» Owner (`scrape:magnum`, `scrape:gramad`).
- Запись — только в одноразовую БД; до первой записи проверить SQL `current_database()`, `inet_server_addr()`, `current_user` и что это контейнер этой сессии (только loopback).
- После каждого ручного `-apply` — `ANALYZE offers, raw_products, canonical_products, product_mappings, categories, snapshots`.
- Конфликт strict-ingest — диагностика пробным `-recluster`, запись в отчёт и вопрос Owner; без молчаливого `-recluster -apply`.
- Правка `groups.go` и `dashboard.go` — не цель; если без неё нельзя — стоп и вопрос Owner.
- В логах и отчёте — без значений env, строк подключения, описания доступа к источнику.
- Ветка от `origin/main` после слияния части 2, отдельный worktree; push, PR, merge — после «да» Owner.

## Review Focus

- Шаг B: пробный ingest бандла двух сетей → `mergedCanonical` 0, `splitCanonical` 0, без `canonical_merge_conflict`.
- Карточка с весовым и штучным предложением в одном снимке → таких нет (SQL-проверка в задаче 2).
- Десять самых больших `priceSpreads` → ни одного очевидно разного товара (ручной просмотр в задаче 3).
- `matchedAcrossStores` дашборда расходится с отчётом ingest → разница объяснена товарами не в наличии или с ценой 0 (задача 3).
- `SYNC_STORES=MAGNUM` после миграции Gramad → явный отказ ingest (`required_source_missing` или `ingestion stores mismatch`), БД не меняется (задача 2).

---

### Task 1: Свежие скрапы и пополнение словаря

- [ ] **Step 1:** «Да» Owner → `pnpm scrape:magnum`; «да» Owner → `pnpm scrape:gramad`. Записать статистику обоих (у Gramad — `weighted`, `weightAmbiguous`).
- [ ] **Step 2:** `pnpm dict:prepare MAGNUM` и `pnpm dict:prepare GRAMAD` (с `--force`, только если остались старые решения) → субагенты Haiku → `--check` → применение → `pnpm dict:apply`.
- [ ] **Step 3:** `pnpm taxonomy:sql` → «no taxonomy change» или новая миграция (цепочка `postgres.mjs`, список `auto-gate.test.mjs`).
- [ ] **Step 4:** `pnpm test` → PASS. **Commit** словаря (и миграции, если есть).

### Task 2: БД: шаг A (только Magnum) и шаг B (две сети)

- [ ] **Step 1:** Одноразовый `postgres:17-alpine` (loopback), проверка личности SQL.
- [ ] **Step 2: Шаг A.** Роль чтения → миграции **без** `*_shymkent_gramad_store` и без более поздних → роль записи и доступ к реестру идентичностей → LOGIN-роли. `SYNC_STORES=MAGNUM pnpm sync` → `cmd/ingest` пробный → `-apply` → `ANALYZE`. Записать id снимка, офферов, весовых.
- [ ] **Step 3:** Остальные миграции (`prisma migrate deploy`). Проверка: `SYNC_STORES=MAGNUM` бандл → пробный ingest отказывает (`required_source_missing` или `ingestion stores mismatch`), снимков не прибавилось.
- [ ] **Step 4: Шаг B.** `SYNC_STORES=MAGNUM,GRAMAD pnpm sync` (unmapped по сетям) → `cmd/ingest` пробный: записать `perStoreCounts`, `matchedAcrossTwoOrMoreStores`, `mergedCanonical`, `splitCanonical`, `reusedCanonical` → `-apply` → `ANALYZE`.
- [ ] **Step 5:** SQL по последнему снимку: число карточек, у которых в `offer_price_basis` есть и `soldByWeight` true, и false → ожидается 0; весовых офферов по сетям.

### Task 3: API

- [ ] **Step 1:** Локальный Go API (`APP_ENV=development`, loopback, LOGIN-роль — член роли чтения).
- [ ] **Step 2:** `GET /api/dashboard` → `stores` 2, `matchedAcrossStores` > 0 (сверить с ingest), `priceSpreads` не пуст — просмотреть десять самых больших; корзина — две сети, что в слотах (замена слотов — не цель).
- [ ] **Step 3:** `GET /api/szpt` → число групп; для каждой группы `GET /api/szpt/{group}/products` → 200, сколько групп с предложениями обеих сетей; цена карточки = минимальная по сетям (выборочно 5 карточек по SQL); весовые группы — `unit_price_asc` не убывает, предложения Gramad — `soldByWeight: true`; пустая группа → 200 и `[]`.
- [ ] **Step 4:** `GET /api/products?category=vegetables`, `?category=eggs` → предложения `GRAMAD`; `GET /api/categories` → 200.
- [ ] **Step 5:** Бандл с незарегистрированной сетью → пробный ingest отказывает; `SYNC_STORES=MAGNUM,FOO pnpm sync` → `SYNC_STORES invalid`.
- [ ] **Step 6:** Уборка: API остановлен, контейнер удалён с томом.

### Task 4: Отчёт

- [ ] **Step 1:** Локальный CI по затронутым группам (при изменении данных или миграций — с `postgres,staging`) → PASS.
- [ ] **Step 2:** `docs/production/reports/SHYMKENT_GRAMAD_END_TO_END_REPORT.md`: команды, числа шагов A и B, ответы API сокращённо, найденные дефекты и исправления, PASS/FAIL/SKIP/NOT_RUN, риски. **Commit**; push и PR — после «да» Owner.
