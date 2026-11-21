# Данные Шымкента, часть 3: сквозной прогон — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доказать на проверенной одноразовой локальной PostgreSQL путь свежий скрап Magnum → пополнение словаря → sync → ingest → снимок → `/api/szpt`.

**Architecture:** Нового кода нет; только команды существующих частей и исправления найденных дефектов (каждое — тест + коммит).

**Tech Stack:** pnpm-скрипты pipeline, Go `cmd/ingest` и API, Docker PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-21-shymkent-data-design.md` (часть 3). Начинается после слияния частей 1 и 2.

## Global Constraints

- Живой скрап — только после явного «да» Owner в чате, один прогон.
- Запись — только в одноразовую БД; перед записью проверить `current_database()`, `inet_server_addr()`, `current_user` и что это локальный контейнер.
- После ручного `-apply` — `ANALYZE` на `offers, raw_products, canonical_products, product_mappings, categories, snapshots`.
- В логах и отчёте — без токенов, строк подключения, способа получения данных.
- Ветка `chore/shymkent-end-to-end` от `main`.

## Review Focus

- Пустая группа (`fish`) → `/api/szpt/fish` отвечает 200 с пустым списком, не 500.
- Весовая группа (картофель, говядина) → сортировка по цене за кг, `soldByWeight` у офферов.
- Новый товар свежего скрапа без карточки → публикуется как несопоставленный в своей категории, не в `other`.
- `SYNC_STORES` без `MAGNUM` или с неизвестной сетью → sync/ingest отказывают явно.
- Повторный ingest того же бандла → идемпотентен (нет второго снимка с теми же данными или он корректен по правилам ingest).

---

### Task 1: Свежий скрап и пополнение словаря

- [ ] **Step 1:** Получить «да» Owner; `pnpm scrape:magnum` → записать число товаров, `errorCount`, запросы, 429/5xx.
- [ ] **Step 2:** `pnpm dict:prepare MAGNUM` → число новых товаров; субагенты Haiku → `dict:apply-decisions MAGNUM --check` → `dict:apply-decisions MAGNUM`.
- [ ] **Step 3:** Если фильтры изменились — `pnpm taxonomy:sql` (новая миграция), иначе команда сообщает «no taxonomy change».
- [ ] **Step 4:** `pnpm test` → PASS. **Commit** словаря (и миграции, если есть).

### Task 2: БД, sync, ingest, публикация

- [ ] **Step 1:** Поднять одноразовую PostgreSQL как `scripts/ci/run-db-integration.mjs`; проверка идентичности (Global Constraints).
- [ ] **Step 2:** Применить все миграции; роли/гранты из `backend/prisma/security/`.
- [ ] **Step 3:** `SYNC_STORES=MAGNUM pnpm sync` → `quality report`, число `unmapped`.
- [ ] **Step 4:** Go `cmd/ingest` dry run → затем `-apply`; `ANALYZE`; записать id снимка, число офферов, весовых (`offer_price_basis`).

### Task 3: API

- [ ] **Step 1:** Запустить Go API локально на этой БД (без Redis-фолбэков в production-режиме; Voice не проверяется).
- [ ] **Step 2:** `GET /api/szpt` → 200, у `eggs` `count > 0`; для каждой непустой группы `GET /api/szpt/<slug>` → 200; `GET /api/szpt/fish` → 200 и пусто; весовые группы — сортировка по цене за кг.
- [ ] **Step 3:** `GET /api/dashboard`, `GET /api/categories`, каталог одной категории → 200, сеть `MAGNUM` присутствует.

### Task 4: Отчёт

- [ ] **Step 1:** `docs/production/reports/SHYMKENT_END_TO_END_REPORT.md`: команды, числа, ответы API (сокращённо), найденные и исправленные дефекты, PASS/FAIL/SKIP/NOT_RUN, риски.
- [ ] **Step 2: Commit**; push и PR — после «да» Owner.
