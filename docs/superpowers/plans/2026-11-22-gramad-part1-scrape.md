# Gramad, часть 1: скрап — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Модуль `GRAMAD` на асинхронном ядре и `pnpm scrape:gramad`, который пишет локальный `data/sources/gramad.json` с ценами одной точки Gramad в Glovo и весовым признаком по правилу «слово КГ + код».

**Architecture:** Модуль по образцу `pipeline/src/scrape/stores/magnum/`: чистый разбор ответа (`parse.ts`), список категорий (`scope.ts`), проверка покрытия (`coverage.ts`), фабрика модуля (`index.ts`), которая читает чувствительные заголовки только из env. Ядро `scrape/core` не меняется. БД, миграций, `stores` и `SYNC_STORES` в этой части нет.

**Tech Stack:** TypeScript, zod, vitest, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-gramad-network-design.md` (часть 1).

## Global Constraints

- Код сети `GRAMAD`, `city: 'Shymkent'`, `sourceProductId` = `gramad_<код магазина>`.
- Весовой: последнее слово названия — «кг» (без учёта регистра), отделено пробелом, перед ним не число; **и** код — не из 11–13 цифр (11–13 цифр — упакованный товар). Одно условие из двух → штучный и `weightAmbiguous: true`. Цена весового — за 1 кг, без умножения.
- Регулярные выражения по кириллице — с явными lookaround, без `\b`.
- `price` — цена акции, если она есть и меньше обычной; `oldPrice` — обычная при акции, иначе `null`; целые тенге (`Math.round`); цена ≤ 0 — ошибка товара. Товар «нет в наличии» пропускается. Неизвестная форма ответа — ошибка.
- Адрес API и идентификатор точки — в коде, как у Magnum. Заголовки запросов и всё, похожее на токены, — только из `pipeline/.env` (в git не входит); в `pipeline/.env.example` — только имена переменных без значений.
- В репозитории (код, тесты, отчёт, коммиты) — ни описания того, как найден или устроен доступ к источнику, ни значений заголовков, ни локальных путей. Фикстуры — синтетические, не дампы.
- Живые запросы к источнику — только после «да» Owner, каждый прогон отдельно. `data/sources/` не коммитить.
- `SYNC_STORES` по умолчанию остаётся `MAGNUM`; `weight.ts`, миграции, `ops/` не меняются.
- Ветка от свежего `origin/main` в отдельном worktree; push, PR, merge — после «да» Owner.

## Review Focus

- «Сахар 1 КГ», «Мука 2 кг», «Рис 0,5кг» с EAN-13 → штучные, без `weightAmbiguous` (тест в задаче 2).
- «ТОМАТЫ КГ» с кодом из 13 цифр → штучный, `weightAmbiguous: true`; короткий код без «КГ» → штучный, `weightAmbiguous: true` (тест в задаче 2).
- Цена весового «КАРТОФЕЛЬ КГ» 210 → `price` 210, а не 210000 или 0,21 (тест в задаче 2).
- Нет переменной заголовков в env (если разведка показала, что они нужны) → ошибка до первого запроса, `fetch` не вызван (тест в задаче 3).
- Один товар в двух категориях скоупа → один товар в файле, категория — первая по приоритету (тест в задаче 3, через `runStore`).

---

### Task 1: Техническая разведка (выполняет оркестратор, нужен «да» Owner)

**Files:** в репозитории — ничего. Заметки — только локально (scratchpad сессии и личная память агента).

- [ ] **Step 1:** Получить «да» Owner на сеанс разведки (та же точка, без входа в аккаунты, ограниченное число запросов).
- [ ] **Step 2:** Выяснить и записать локально: как получить все товары листа категории (постраничность, пределы), дерево категорий точки, поля товара (код, название, цена, цена акции, «нет в наличии», картинка), что нужно запросу и есть ли признаки ограничения частоты.
- [ ] **Step 3:** По дереву составить черновик `GRAMAD_SCOPE`: листья → слаги из Global Constraints спецификации (`milk`, `dairy`, `eggs`, `bread`, `meat`, `vegetables`, `groats`, `sugar`, `oil`, `salt`, `tea-coffee`, `fish`). Решить лимиты модуля (не выше Magnum: `concurrency 4`, `rps 8`).
- [ ] **Step 4:** Передать исполнителям задач 2–3 **локальные** заметки (формы ответов, имена полей) — в промпте задачи, не в репозитории.

### Task 2: Разбор товара и правило веса

**Files:**
- Create: `pipeline/src/scrape/stores/gramad/parse.ts`
- Create: `pipeline/test/fixtures/gramad/*.json` (синтетические страницы по форме из задачи 1)
- Test: `pipeline/test/gramad-parse.test.ts`

**Interfaces:**
- Produces: `gramadWeight(name: string, code: string): { isWeighted: boolean; weightAmbiguous: boolean }`;
  `type GramadPageCategory = { id: string; path: readonly string[] }`;
  `parseGramadPage(body: unknown, category: GramadPageCategory, page: number): GramadPage`, где
  `GramadPage = { products: SourceProduct[]; seen: number; total: number | null; nextPage: number | null }` (форма `nextPage`/`total` — по разведке; если постраничность не числовая, тип курсора меняется здесь и в задаче 3 согласованно).
- `rawPayload` товара: `{ code, barcode: string | null, isWeighted, priceUnit: 'kg' | null, weightAmbiguous, regularPrice, promoPrice: number | null, categoryId }`; `barcode` — код, если он ровно 13 цифр.

- [ ] **Step 1: Failing tests** (`gramad-parse.test.ts`):
  - `gramadWeight('КАРТОФЕЛЬ КГ', '2701372')` → `{ isWeighted: true, weightAmbiguous: false }`; то же для `'томаты розовые кг'` (нижний регистр);
  - `'Сахар 1 КГ'`, `'Мука 2 кг'`, `'Рис 0,5кг'` с `'4870000000017'` → `{ false, false }`;
  - `'ТОМАТЫ КГ'` с `'4870000000017'` → `{ false, true }`; `'Груша Конференция'` с `'2700084'` → `{ false, true }`; `'КГ'` (одно слово) с `'2700084'` → `{ false, true }`;
  - `parseGramadPage` на фикстуре: весовой товар — `price` 210, `oldPrice` null, `rawPayload` `{ isWeighted: true, priceUnit: 'kg', barcode: null }`; товар с акцией (обычная 1273, акция 855) — `price` 855, `oldPrice` 1273; акция не дешевле обычной — `price` обычная, `oldPrice` null; цена 51.4 → 51; «нет в наличии» — пропущен, но учтён в `seen`; каждый товар проходит `SourceProductSchema`;
  - цена 0 или отрицательная → `throw` с кодом товара в сообщении; тело не той формы → `throw` с id категории.
- [ ] **Step 2:** `pnpm vitest run test/gramad-parse.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** Реализовать `parse.ts` (zod-схема ответа по разведке; `gramadWeight` — разбор последнего слова и предыдущего токена без `\b`).
- [ ] **Step 4:** `pnpm vitest run test/gramad-parse.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Parse Gramad products and mark loose goods by name and code"`.

### Task 3: Модуль, скоуп, покрытие, регистрация

**Files:**
- Create: `pipeline/src/scrape/stores/gramad/scope.ts`, `index.ts`, `coverage.ts`
- Modify: `pipeline/src/types.ts` (`STORE_CODES`), `pipeline/src/cli/scrape.ts`, `pipeline/package.json`, `pipeline/src/agent/bundle.ts` (`IMAGE_ORDER`), `pipeline/.env.example`, `pipeline/test/scrape-core-boundary.test.ts`
- Test: `pipeline/test/gramad-module.test.ts`, `gramad-scope.test.ts`, `gramad-coverage.test.ts`

**Interfaces:**
- Consumes: `parseGramadPage`, `GramadPageCategory` (задача 2).
- Produces: `GRAMAD_SCOPE: readonly (GramadPageCategory & { slug: CategorySlug })[]` (порядок = приоритет);
  `createGramadModule(env: Record<string, string | undefined>): StoreModule<GramadTask, GramadContext>`;
  `assertGramadCoverage(file: SourceFile): void`;
  `STORE_CODES = ['MAGNUM', 'GRAMAD'] as const`; `pnpm scrape:gramad`;
  в `sourceStats` файла — `weighted` и `weightAmbiguous` (числа товаров).

- [ ] **Step 1: Failing tests:**
  - `gramad-scope.test.ts`: id уникальны; каждый `slug` входит в `DEFAULT_PUBLISH_CATEGORIES`; все двенадцать публикуемых слагов покрыты хотя бы одним листом (кроме тех, которых у точки нет по разведке — список таких слагов зафиксировать в тесте явно);
  - `gramad-coverage.test.ts`: пустой файл → throw; нет товаров слага из скоупа → throw с именем слага; полный → ok;
  - `gramad-module.test.ts` (фейковый `fetchImpl`, как `magnum-module.test.ts`): `runStore(createGramadModule(env))` собирает все страницы листа и останавливается на последней; товар в двух листах — один раз, категория первого листа; если разведка показала обязательные заголовки — без переменной env фабрика бросает ошибку с именем переменной и `fetch` не вызывался, с переменной — заголовки уходят в каждом запросе; ошибка страницы → `errorCount > 0`;
  - `scrape-core-boundary.test.ts`: в список запрещённых слов ядра добавить `gramad`, `glovo`, `грамад`.
- [ ] **Step 2:** `pnpm vitest run test/gramad-*.test.ts test/scrape-core-boundary.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать: `scope.ts` из черновика задачи 1; `index.ts` — фабрика (лимиты из задачи 1, жёсткий предел страниц на лист с ошибкой, как `MAGNUM_MAX_PAGES`); `coverage.ts` по образцу Magnum. `cli/scrape.ts`: таблица сеть → `{ run, assertCoverage }`, для `GRAMAD` — `createGramadModule(process.env)`; после прогона дописать в `sourceStats` счётчики `weighted` и `weightAmbiguous` и вывести их в лог. `package.json`: `"scrape:gramad": "tsx src/cli/scrape.ts GRAMAD"`. `IMAGE_ORDER = ['MAGNUM', 'GRAMAD']`. `.env.example`: имена переменных заголовков без значений (если нужны). `sync.ts` не трогать.
- [ ] **Step 4:** `pnpm test` и `pnpm typecheck` → PASS (включая `daily-sync-stores.test.ts`: `SYNC_STORES` по умолчанию всё ещё `MAGNUM`).
- [ ] **Step 5: Commit** `git commit -m "Add the Gramad store module and scrape command"`.

### Task 4: Живой прогон, отчёт, CI (живой прогон — оркестратор, нужен «да» Owner)

**Files:**
- Create: `docs/production/reports/SHYMKENT_GRAMAD_SCRAPE_REPORT.md`
- Modify (если прогон покажет): `pipeline/src/scrape/stores/gramad/scope.ts` и его тест

- [ ] **Step 1:** Получить «да» Owner; заполнить `pipeline/.env` (если нужно) локально; `pnpm scrape:gramad` один раз.
- [ ] **Step 2:** Записать: товаров, весовых, спорных (`weightAmbiguous`), по слагам, `errorCount`, запросов, повторов, 429/5xx, время. Просмотреть все спорные товары и 20 случайных весовых: правило работает? Если нет — стоп и вопрос Owner (правило — его решение).
- [ ] **Step 3:** Если покрытие отказало из-за пустого листа — поправить скоуп (тест + коммит), повторный прогон — только с новым «да».
- [ ] **Step 4:** Локальный CI `MSYS_NO_PATHCONV=1 node <локальный CI>/run-local.mjs pipeline,security,guard` → PASS.
- [ ] **Step 5:** Отчёт по образцу `SHYMKENT_MAGNUM_ASYNC_SCRAPERS_REPORT.md`: база и коммиты, файлы, правило веса и его статистика, проверки PASS/FAIL/SKIP/NOT_RUN, риски; без описания доступа к источнику и без значений env. **Commit** `git commit -m "Report the Gramad scraper"`. Push и PR — после «да» Owner.
