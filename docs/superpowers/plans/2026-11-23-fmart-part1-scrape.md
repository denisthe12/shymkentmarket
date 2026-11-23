# F-Mart, часть 1: скрап — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Модуль `FMART` на асинхронном ядре и `pnpm scrape:fmart`, который пишет локальный `data/sources/fmart.json` с верной ценой за кг и отказывается от частичной выдачи.

**Architecture:** Модуль по образцу `stores/gramad/`: чистый разбор страницы (`parse.ts`), разделы и листья (`scope.ts`), покрытие (`coverage.ts`), защита цен свежего раздела (`fresh-prices.ts`), фабрика (`index.ts`). Ядро `scrape/core` не меняется. `accept.ts` получает необязательную проверку против прежнего файла. БД, миграций, `weight.ts`, `SYNC_STORES`, `daily-sync.sh` в этой части нет.

**Tech Stack:** TypeScript, zod, vitest, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-23-fmart-network-design.md` («Правило веса F-Mart», часть 1).

## Global Constraints

- Код `FMART`, `city: 'Shymkent'`, один магазин «Фиркан Сити». `sourceProductId` = `fmart_<учётный код>`; свежий раздел — `fmart_fresh_<название>` (нижний регистр, `ё`→`е`, обрезка, пробелы → `-`).
- Весовой явный: цена = цена за кг источника; свежий раздел, «штучный» + «кг»: цена за кг = цена × 2 (`FMART_FRESH_UNIT_GRAMS = 500`). Свежие «шт», прочие «штучный» + «кг» — пропуск со счётчиком. Неизвестный тип продажи — ошибка.
- `oldPrice` — обычная цена только у действующей акции с датами (Asia/Almaty). Цены — целые тенге (`Math.round`), цена ≤ 0 — ошибка товара. Нет в наличии или не продаётся — пропуск, в `seen` учтён. Неизвестная форма ответа — ошибка.
- `barcode` — ровно 13 цифр, иначе `null`. `brand: null`, `sourceUrl: null`.
- Адрес API и номер магазина — в коде; `FMART_REQUEST_HEADERS` — только в `pipeline/.env`, в `.env.example` имя без значения.
- Точная форма ответов, имена полей и номера разделов — в **локальных заметках источника** (путь в сообщении запуска); исполнителю их передаёт оркестратор в промпте задачи. В документы, отчёт, тексты коммитов и PR не переносить. Фикстуры синтетические.
- Регулярные выражения по кириллице — с lookaround, без `\b`.
- Живые запросы — после «да» Owner, каждый сеанс и прогон отдельно. Без входа и обхода защиты; 401/403/429/CAPTCHA — стоп. `data/sources/`, `data/agent/`, `pipeline/.env` не коммитить.
- Ветка `feat/fmart-scrape` от свежего `origin/main` в своём worktree; спецификацию и три плана перенести cherry-pick из локальной ветки проектирования. Push, PR, merge — после «да».

## Review Focus

- Картошка 158 в свежем разделе → `price` 316, а не 158 (тест в задаче 2).
- Источник отдал страницы без весовых и без свежих → отказ, прежний файл на месте (тест в задаче 3).
- Один товар повторился на второй странице, число штук совпало с `total` → отказ (тест в задаче 3).
- Источник стал отдавать свежие цены сразу за кг (158 → 316) → отказ даже с `--accept-drop` (тест в задаче 4).
- У источника появился новый лист на 12% раздела → отказ; на 2% → предупреждение и счётчик (тест в задаче 3).

---

### Task 1: Техническая разведка (оркестратор, нужен «да» Owner)

**Files:** в репозитории — ничего; дополнить локальные заметки источника.

- [ ] **Step 1:** «Да» Owner на сеанс: не больше 25 одиночных запросов, не чаще одного в секунду, без входа.
- [ ] **Step 2:** Найти стабильную сортировку: две подряд выборки одного большого раздела дают одинаковый порядок, номера товаров по всем страницам уникальны и их число равно `total`. Нет такой — стоп и вопрос Owner.
- [ ] **Step 3:** Листья разделов, не виденных в разведке (кисломолочные, сметана, сливки, сыры весовые и штучные, весовые макароны, хлебобулочные, остальные крупы), с объёмом. Предел страницы и поведение страницы за концом.
- [ ] **Step 4:** Записать в заметки: `FMART_SECTIONS` (раздел → корень), листья со слагом, список исключённых листьев. Лимиты модуля: `concurrency 2`, `rps 4`, `maxConcurrency 4`, `maxRps 8`.

### Task 2: Заголовки из env и разбор товара

**Files:**
- Create: `pipeline/src/scrape/stores/env-headers.ts`, `pipeline/src/scrape/stores/fmart/parse.ts`, `pipeline/test/fixtures/fmart/*.json` (синтетика)
- Modify: `pipeline/src/scrape/stores/gramad/index.ts`
- Test: `pipeline/test/env-headers.test.ts`, `pipeline/test/fmart-parse.test.ts`

**Interfaces:**
- Produces:
  - `requestHeadersFromEnv(env: Record<string, string | undefined>, name: string, label: string): Record<string, string>` — тексты ошибок как сейчас у Gramad (`<label>: <name> is not set` и т. д.);
  - `type FmartLeaf = { id: string; slug: CategorySlug; path: readonly [string, string, string] }`;
  - `type FmartSection = { id: string; fresh: boolean; leaves: ReadonlyMap<string, FmartLeaf>; excluded: ReadonlySet<string> }`;
  - `type FmartSkips = { unavailable: number; excludedLeaf: number; unknownLeaf: number; unitKg: number; freshPiece: number }`;
  - `type FmartPage = { products: SourceProduct[]; itemIds: string[]; seen: number; total: number; nextPage: number | null; skips: FmartSkips; unknownLeaves: string[] }`;
  - `parseFmartPage(body: unknown, section: FmartSection, page: number, today: string): FmartPage` (`today` — `YYYY-MM-DD` в Asia/Almaty);
  - `fmartFreshId(name: string): string`; `FMART_FRESH_UNIT_GRAMS = 500`.
- `rawPayload`: `{ code: string | null, itemId: string, barcode: string | null, isWeighted: boolean, priceUnit: 'kg' | null, weightSource: 'flag' | 'fresh500' | null, unitGrams: number | null, unitPrice: number, regularPrice: number, promoPrice: number | null, leafId: string, categoryId: string, sectionId: string }`; `categoryId` = `leafId`; `unitPrice` — обычная цена за единицу источника; `regularPrice` и `promoPrice` — в единицах поля `price` (у весовых за кг).

- [ ] **Step 1: Failing tests** `fmart-parse.test.ts`:
  - явный весовой: единица 100 г, обычная 256, акция 229 без дат, за кг 2299 → `price` 2299, `oldPrice` null, `{ isWeighted: true, priceUnit: 'kg', weightSource: 'flag', unitGrams: 100 }`; единица 1000 г, 430/362, за кг 362 → `price` 362;
  - то же с действующими датами, единица 100 г, 256/229 → `oldPrice` 2560; даты прошли и за кг 2560 → `price` 2560, `oldPrice` null;
  - цена за кг 2299 при единице 100 г и обычной 100 без акции → ошибка с номером товара; цена за кг 0 → ошибка;
  - свежий «кг» 158 → `price` 316, `weightSource: 'fresh500'`, `unitGrams: 500`, `unitPrice` 158, id `fmart_fresh_картошка`; свежий товар с явным признаком → `'flag'`;
  - свежий «шт» 1200 → пропуск, `skips.freshPiece` 1; не свежий «штучный» + «кг» → `skips.unitKg` 1; неизвестный тип продажи → ошибка;
  - штучный: 1015, акция 825 с датами сегодня → 825 и `oldPrice` 1015; акция без дат 85 от 120 → 85 и null; акция с датами с завтра → 120 и null; акция не дешевле обычной → обычная;
  - нет в наличии и «не продаётся» → пропуск, но в `seen`; цена 0 → ошибка; 51,4 → 51;
  - название: русское поле важнее общего; пустое русское → общее; код из 12 цифр → `barcode` null, 13-значный с «2» → строка (отсев 20–29 делает словарь);
  - товар без учётного кода вне свежего раздела → ошибка;
  - лист из `excluded` → `skips.excludedLeaf`; лист не из `leaves` и не из `excluded` → `skips.unknownLeaf`, имя в `unknownLeaves`;
  - страница не своя, нет `total`, тело не той формы → ошибка с id раздела; `nextPage` = `page + 1`, пока страницы есть, иначе `null`; каждый товар проходит `SourceProductSchema`.
- [ ] **Step 2: Failing tests** `env-headers.test.ts`: нет переменной, не JSON, не объект, не строка в значении → ошибки с меткой и именем; объект → он же.
- [ ] **Step 3:** `pnpm vitest run test/fmart-parse.test.ts test/env-headers.test.ts` → FAIL.
- [ ] **Step 4:** Реализовать; `gramad/index.ts` вызывает общий разбор, тексты ошибок Gramad прежние (`gramad-module.test.ts` не менять).
- [ ] **Step 5:** те же тесты и `test/gramad-module.test.ts` → PASS.
- [ ] **Step 6: Commit** `git commit -m "Parse F-Mart products and price fresh produce per kg"`.

### Task 3: Модуль, скоуп, покрытие, регистрация

**Files:**
- Create: `pipeline/src/scrape/stores/fmart/scope.ts`, `index.ts`, `coverage.ts`, `stats.ts`
- Modify: `pipeline/src/types.ts` (`STORE_CODES`), `pipeline/src/cli/scrape.ts`, `pipeline/src/cli/dict-seed-categories.ts` (`SCOPES`), `pipeline/src/agent/bundle.ts` (`IMAGE_ORDER`), `pipeline/package.json`, `pipeline/.env.example`, `pipeline/test/scrape-core-boundary.test.ts`, `pipeline/test/dict-cli.test.ts` (если проверяет список сетей)
- Test: `pipeline/test/fmart-scope.test.ts`, `fmart-module.test.ts`, `fmart-coverage.test.ts`

**Interfaces:**
- Consumes: `parseFmartPage`, `FmartSection`, `FmartLeaf`, `requestHeadersFromEnv` (задача 2).
- Produces:
  - `FMART_SECTIONS: readonly FmartSection[]` (порядок = приоритет), `FMART_SCOPE: readonly FmartLeaf[]`;
  - `type FmartTask = { category: string; page: number }` (`category` = id раздела);
  - `createFmartModule(env: Record<string, string | undefined>, now?: () => Date): { module: StoreModule<FmartTask>; runStats(): FmartRunStats }`;
  - `type FmartRunStats = { weightedFlag: number; weightedFresh: number; skippedUnavailable: number; skippedUnitKg: number; skippedFreshPiece: number; skippedExcludedLeaf: number; unknownLeafProducts: number; unknownLeaves: string }` (имена листьев через запятую);
  - `assertFmartCoverage(file: SourceFile): void`; `MIN_BY_SECTION`, `MIN_WEIGHTED_FLAG`, `MIN_FRESH_KG` в `coverage.ts`;
  - `STORE_CODES = ['MAGNUM', 'GRAMAD', 'FMART'] as const`; `pnpm scrape:fmart`.

- [ ] **Step 1: Failing tests:**
  - `fmart-scope.test.ts`: номера разделов и листьев уникальны; слаги — из `DEFAULT_PUBLISH_CATEGORIES`, все двенадцать покрыты; лист не может быть и в `leaves`, и в `excluded`; ровно один раздел `fresh`;
  - `fmart-module.test.ts` (фейковый `fetchImpl`, `runStore`): все страницы раздела, стоп на последней; `total` уходит в ядро — при нехватке `errorCount > 0`; повтор `itemId` на второй странице → `errorCount > 0`; два товара с одним `sourceProductId` свежего раздела → `errorCount > 0`; пересчёт раздела ядром не считает товары первого прохода повторами (первая страница сбрасывает память раздела) и не удваивает счётчики пропусков; без переменной env — ошибка с `FMART_REQUEST_HEADERS`, `fetch` не вызван; заголовки уходят в каждом запросе; больше 100 страниц раздела → ошибка;
  - `fmart-coverage.test.ts`: пустой файл; нет слага; раздел ниже минимума; `weightedFlag` ниже `MIN_WEIGHTED_FLAG`; `weightedFresh` ниже `MIN_FRESH_KG`; `unknownLeafProducts` больше 10% от `products + unknownLeafProducts` → throw с понятным именем; ровно 10% и полный файл → ok;
  - `scrape-core-boundary.test.ts`: в `BANNED` добавить `fmart`, `f-mart`, `фмарт`, `ф-март`; пример `'F-Mart'` → `['f-mart']`.
- [ ] **Step 2:** `pnpm vitest run test/fmart-scope.test.ts test/fmart-module.test.ts test/fmart-coverage.test.ts test/scrape-core-boundary.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать. Минимумы до первого прогона — по объёмам из спецификации, примерно половина; `MIN_FRESH_KG = 15`, `MIN_WEIGHTED_FLAG = 25`; у раздела свежей птицы минимума нет. `cli/scrape.ts`: `FMART` — `runStats()` дописывается в `file.sourceStats` до `acceptScrape`, строка лога с весовыми и пропусками, предупреждение при незнакомых листьях. `sync.ts`, `weight.ts`, `daily-sync.sh` не трогать.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` → PASS (`daily-sync-stores.test.ts` без изменений).
- [ ] **Step 5: Commit** `git commit -m "Add the F-Mart store module and scrape command"`.

### Task 4: Защита цен свежего раздела против прежнего файла

**Files:**
- Create: `pipeline/src/scrape/stores/fmart/fresh-prices.ts`
- Modify: `pipeline/src/scrape/accept.ts`, `pipeline/src/cli/scrape.ts`
- Test: `pipeline/test/scrape-accept.test.ts`, `pipeline/test/fmart-fresh-prices.test.ts`

**Interfaces:**
- Consumes: `rawPayload.weightSource`, `rawPayload.unitPrice` (задача 2); `fmartFreshId` (задача 2) как ключ сравнения.
- Produces: `acceptScrape(path, file, assertCoverage, options: { acceptDrop?: boolean; compareWithPrevious?: (previous: SourceFile, file: SourceFile) => void } = {})`; `assertFmartFreshPrices(previous: SourceFile, file: SourceFile): void`; `Scraper.compareWithPrevious?` в `cli/scrape.ts`.

- [ ] **Step 1: Failing tests:**
  - `scrape-accept.test.ts`: `compareWithPrevious` бросает → отказ, прежний файл побайтно на месте, в том числе с `acceptDrop: true`; нет прежнего файла или он битый → не вызывается; без опции поведение прежнее (существующие тесты не менять);
  - `fmart-fresh-prices.test.ts` (товары `weightSource: 'fresh500'`, ключ — `fmartFreshId(name)`): медиана отношения 2,0 → throw; 0,5 → throw; ровно 1,6 и ровно 0,625 → ok; рост 30% → ok; общих 4 при 15 и 15 → throw; общих 4 при 10 и 15 → ok; явные весовые не учитываются.
- [ ] **Step 2:** `pnpm vitest run test/scrape-accept.test.ts test/fmart-fresh-prices.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать; прежний файл читать один раз (и для порога 10%, и для сравнения); порядок: ошибки → покрытие → `compareWithPrevious` → порог 10%.
- [ ] **Step 4:** тесты, `pnpm test`, `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Refuse F-Mart scrapes whose fresh prices changed unit"`.

### Task 5: Живой прогон, сверка, отчёт, CI (оркестратор; «да» Owner на прогон)

**Files:**
- Create: `docs/production/reports/SHYMKENT_FMART_SCRAPE_REPORT.md`
- Modify: `docs/data/SYNC_RUNBOOK.md` (команда и отказы `scrape:fmart`), `pipeline/src/scrape/stores/fmart/coverage.ts` (минимумы) и её тест, при необходимости `scope.ts`

- [ ] **Step 1:** «Да» Owner; заполнить `pipeline/.env` локально; `SOURCES_DIR=<временный каталог вне git> pnpm scrape:fmart`, один прогон.
- [ ] **Step 2:** Записать: товаров, по слагам и разделам, весовых явных и свежих, пропуски всех видов, незнакомые листья, `errorCount`, запросы, повторы, 429/5xx, время.
- [ ] **Step 3: Сверка Owner** с приложением: 2 свежих, 1 явная весовая, 1 штучная с акцией (цены из файла — таблицей). Расхождение — стоп, правило — решение Owner. Совпало — скопировать файл в `data/sources/fmart.json`.
- [ ] **Step 4:** Уточнить минимумы: `floor(объём / 2)` для разделов больше 15 товаров, `MIN_WEIGHTED_FLAG` и `MIN_FRESH_KG` так же; тест с новыми числами; `assertFmartCoverage` на снятом файле проходит. Незнакомые листья — в `leaves` или `excluded` с тестом. Повторный живой прогон — только с новым «да».
- [ ] **Step 5:** `MSYS_NO_PATHCONV=1 node <локальный CI>/run-local.mjs pipeline,security,guard` → PASS.
- [ ] **Step 6:** Отчёт по образцу `SHYMKENT_GRAMAD_SCRAPE_REPORT.md`: база, коммиты, файлы, правило веса и его проверка, статистика, проверки PASS/FAIL/SKIP/NOT_RUN, риски; без доступа, значений env и номеров магазинов. **Commit** `git commit -m "Report the F-Mart scraper"`. Push и PR — после «да».
