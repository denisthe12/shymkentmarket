# Асинхронные парсеры: каркас и модуль Magnum — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Общий асинхронный каркас парсеров магазинов (лимиты, повторы, таймауты, проверка полноты, статистика) и первый модуль на нём — Magnum (API приложения Magnum Go, Шымкент), с выходом в существующий `SourceFile`.

**Architecture:** `pipeline/src/scrape/core/` — независимое от города и магазинов ядро: лимитер (параллельность + темп), HTTP-клиент с повторами поверх встроенного `fetch`, динамическая очередь задач и `runStore`, который собирает `SourceFile` из модуля магазина. `pipeline/src/scrape/stores/magnum/` — модуль Magnum. Регистрация в существующем CLI `pnpm scrape:<store>`.

**Tech Stack:** TypeScript (ESM, `module: NodeNext`, импорты с `.js`), Node 24.10.0, pnpm 10.32.1, vitest, zod. Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-20-async-scrapers-core-design.md`

## Global Constraints

- Новых npm-зависимостей не добавлять; HTTP только через встроенный `fetch`.
- `pipeline/src/scrape/core/` импортирует только `node:*`, `zod`, файлы внутри `core/` и `../../types.js`. Ничего из `stores/`, `scrapers/`, `mapping/`, `cli/`.
- В `core/` нет слов и значений, привязанных к городу или магазину.
- Выход — `SourceFile` из `pipeline/src/types.ts`; `sourceStats` допускает только плоские значения `number | string | boolean`.
- Репозиторий публичный: в коде, тестах, фикстурах, комментариях, коммитах нет токенов, cookie, ID устройств, сырых ответов API и описания способа, которым найден API источника.
- Любой `errorCount > 0` у файла нового парсера — отказ записи, прежний файл остаётся.
- Признак весового товара — только из полей API, никогда из названия.
- Живой запрос к серверу Magnum — только после явного «да» пользователя в чате. Тесты сеть не трогают.
- Перед push: `MSYS_NO_PATHCONV=1 node C:/Development/AdilBaga-local-ci/run-local.mjs pipeline,security,guard` из worktree.
- Команды тестов запускать из `pipeline/`: `pnpm test -- <файл>` и `pnpm typecheck`.

## Review Focus

- `Retry-After: 3600` (или дата через час) — пауза ограничена `maxDelayMs`, прогон не зависает. Тест в Task 4.
- Ответ 200 с телом, которое не JSON (страница-заглушка, HTML капчи) — ошибка задачи с URL, без падения прогона. Тест в Task 4.
- Обрыв соединения при чтении тела ответа — повтор как сетевой ошибки. Тест в Task 4.
- Товар в двух категориях при параллельной загрузке — одна запись, путь категории детерминированно из категории, раньше стоящей в списке seeds, независимо от порядка ответов. Тест в Task 6.
- Пустая категория (итог 0, товаров нет) — не ошибка. Тест в Task 6.

---

### Task 1: Город — параметр, код магазина `MAGNUM`

**Files:**
- Modify: `pipeline/src/types.ts:3,24`
- Test: `pipeline/test/source-file.test.ts`

**Interfaces:**
- Produces: `STORE_CODES` = `['DINA','DANA','FIX_PRICE','ANVAR','MAGNUM']`; `SourceFileSchema.city` — `z.string().trim().min(1)`.

- [ ] **Step 1: Write the failing tests** в `source-file.test.ts`:

```ts
it('accepts any non-empty city and the MAGNUM store', () => {
  expect(SourceFileSchema.parse({ ...valid, storeCode: 'MAGNUM', city: 'Shymkent' }).city).toBe('Shymkent')
})
it('rejects an empty city', () => {
  expect(() => SourceFileSchema.parse({ ...valid, city: ' ' })).toThrow()
})
```
(`valid` — существующий в файле корректный объект; если его нет — собрать из существующей фикстуры теста.)

- [ ] **Step 2:** `pnpm test -- test/source-file.test.ts` — FAIL (MAGNUM / city literal).
- [ ] **Step 3:** изменить `STORE_CODES` и `city` в `types.ts`.
- [ ] **Step 4:** `pnpm test` и `pnpm typecheck` — PASS (существующие тесты с `city: 'Aktau'` остаются валидными).
- [ ] **Step 5: Commit** `git commit -m "Let source files carry any city and the MAGNUM store"`

---

### Task 2: Лимиты из env

**Files:**
- Create: `pipeline/src/scrape/core/limits.ts`
- Test: `pipeline/test/scrape-core-limits.test.ts`

**Interfaces:**
- Produces: `resolveLimit(raw: string | undefined, name: string, def: number, max: number, warn?: (msg: string) => void): number`; `type StoreLimits = { concurrency: number; rps: number; maxConcurrency: number; maxRps: number }`; `resolveStoreLimits(storeCode: string, limits: StoreLimits, env: Record<string, string | undefined>, warn?): { concurrency: number; rps: number }` — читает `<STORE>_CONCURRENCY` и `<STORE>_RPS`.

- [ ] **Step 1: Write the failing tests:**
  - `resolveLimit(undefined,'X',4,8)` → 4; `'  '` → 4 без предупреждения;
  - `'6'` → 6; `'12'` → 8 с предупреждением, где есть `X` и `8`;
  - `'0'`, `'-1'`, `'2.5'`, `'abc'` → 4, каждое с предупреждением, где есть `X`;
  - `resolveStoreLimits('MAGNUM', {concurrency:4,rps:8,maxConcurrency:8,maxRps:20}, { MAGNUM_CONCURRENCY:'6', MAGNUM_RPS:'50' })` → `{ concurrency: 6, rps: 20 }`.
- [ ] **Step 2:** `pnpm test -- test/scrape-core-limits.test.ts` — FAIL (module not found).
- [ ] **Step 3:** реализовать; правило как у `resolveDanaConcurrency` в `src/scrape-policy.ts` (целое ≥ 1, иначе значение по умолчанию; больше максимума — максимум). `warn` по умолчанию `console.warn`.
- [ ] **Step 4:** тест — PASS.
- [ ] **Step 5: Commit** `git commit -m "Add env-driven store limits for the scraper core"`

---

### Task 3: Лимитер параллельности и темпа

**Files:**
- Create: `pipeline/src/scrape/core/limiter.ts`
- Test: `pipeline/test/scrape-core-limiter.test.ts`

**Interfaces:**
- Produces:
```ts
type Clock = { now: () => number; sleep: (ms: number) => Promise<void> }
class Limiter {
  constructor(opts: { concurrency: number; rps: number; clock?: Clock })
  run<T>(fn: () => Promise<T>): Promise<T>
}
const realClock: Clock
```

- [ ] **Step 1: Write the failing tests** (виртуальные часы: `now` возвращает счётчик, `sleep(ms)` двигает его на `ms` и резолвится):
  - `never runs more than concurrency at once`: concurrency 3, rps 1000, 10 задач по `sleep(5)` → пик активных = 3;
  - `spaces starts at 1000/rps`: concurrency 10, rps 4, 5 мгновенных задач → моменты старта `[0, 250, 500, 750, 1000]`;
  - `a rejected fn releases its slot`: concurrency 1; первая задача бросает, вторая выполняется; `run` первой реджектится той же ошибкой.
- [ ] **Step 2:** тест — FAIL.
- [ ] **Step 3:** реализовать: семафор на `concurrency` + резерв времени старта `next = max(now, lastStart + 1000/rps)`; ожидание темпа — до занятия слота не держит слот других. Пауза только когда лимит исчерпан.
- [ ] **Step 4:** тест — PASS.
- [ ] **Step 5: Commit** `git commit -m "Add concurrency and rate limiter for the scraper core"`

---

### Task 4: HTTP-клиент с повторами

**Files:**
- Create: `pipeline/src/scrape/core/http.ts`
- Test: `pipeline/test/scrape-core-http.test.ts`

**Interfaces:**
- Consumes: `Limiter`, `Clock`, `realClock` (Task 3).
- Produces:
```ts
type HttpStats = { requests: number; retries: number; status429: number; status5xx: number; timeouts: number; networkErrors: number; bytes: number }
class HttpError extends Error { readonly url: string; readonly status: number | null; readonly attempts: number }
type HttpClientOptions = {
  limiter: Limiter; headers?: Record<string, string>; timeoutMs?: number /* 20_000 */; retries?: number /* 4 */
  baseDelayMs?: number /* 500 */; maxDelayMs?: number /* 30_000 */
  fetchImpl?: typeof fetch; clock?: Clock; random?: () => number
}
type HttpClient = {
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>
  text(url: string, init?: RequestInit): Promise<string>
  stats(): HttpStats
}
function createHttpClient(opts: HttpClientOptions): HttpClient
```

- [ ] **Step 1: Write the failing tests** (поддельный `fetchImpl` со сценарием ответов; `clock` виртуальный; `random: () => 0.5`):
  - `returns parsed json and counts one request and bytes`;
  - `retries 500 then succeeds`: stats `{ requests: 2, retries: 1, status5xx: 1 }`;
  - `honours Retry-After seconds on 429`: `Retry-After: 2` → пауза перед повтором ровно 2000 мс; `status429: 1`;
  - `honours Retry-After http-date on 503`: дата через 3 с от `clock.now()` → пауза 3000 мс;
  - `caps Retry-After at maxDelayMs`: `Retry-After: 3600`, `maxDelayMs: 30_000` → пауза 30 000 мс;
  - `backs off with jitter without Retry-After`: две 502 подряд → паузы `0.5*min(30000, 500*2**1)` и `0.5*min(30000, 500*2**2)` (500 и 1000);
  - `does not retry 404`: реджект `HttpError` со `status: 404`, `attempts: 1`, URL в сообщении;
  - `retries timeouts`: первая попытка — `AbortError`/`TimeoutError` → `timeouts: 1`, вторая успешна;
  - `retries a body read failure`: ответ 200, у которого `text()` бросает → повтор, `networkErrors: 1`;
  - `rejects non-JSON 200 without retry`: тело `<html>` → `HttpError` с URL, `status: 200`, `attempts: 1`;
  - `gives up after retries`: 5 ответов 500 при `retries: 4` → `HttpError` с `attempts: 5`;
  - `merges default headers with per-request headers`; `passes an AbortSignal to fetch`.
- [ ] **Step 2:** тест — FAIL.
- [ ] **Step 3:** реализовать `createHttpClient`. Каждая попытка (запрос + чтение тела) идёт через `limiter.run`; пауза между попытками — вне слота лимитера. Таймаут — `AbortSignal.timeout(timeoutMs)`, объединённый с `init.signal` через `AbortSignal.any`. Повтор: сетевая ошибка, таймаут, ошибка чтения тела, 429, 5xx. 429/503 с `Retry-After` → `min(Retry-After, maxDelayMs)`; иначе `random() * min(maxDelayMs, baseDelayMs * 2 ** attempt)` (attempt с 1). `bytes` — длина прочитанного тела в байтах UTF-8.
- [ ] **Step 4:** тест — PASS.
- [ ] **Step 5: Commit** `git commit -m "Add retrying HTTP client for the scraper core"`

---

### Task 5: Динамическая очередь задач

**Files:**
- Create: `pipeline/src/scrape/core/queue.ts`
- Test: `pipeline/test/scrape-core-queue.test.ts`

**Interfaces:**
- Produces: `runTasks<T>(seeds: readonly T[], handler: (task: T, enqueue: (next: T) => void) => Promise<void>, opts: { concurrency: number; onError: (task: T, err: unknown) => void }): Promise<{ done: number; failed: number }>`

- [ ] **Step 1: Write the failing tests:**
  - `runs tasks enqueued by tasks`: seed `1`, обработчик для `n < 4` ставит `n+1` и `n+10` → обработаны все 7 (`1,2,3,4,11,12,13`), `done: 7`;
  - `never exceeds concurrency`: 20 задач по 5 мс, concurrency 4 → пик 4;
  - `a failing task is reported and others continue`: задача `2` бросает → `onError(2, err)` один раз, `failed: 1`, остальные выполнены;
  - `resolves for empty seeds` → `{ done: 0, failed: 0 }`.
- [ ] **Step 2:** тест — FAIL.
- [ ] **Step 3:** реализовать: рабочие берут задачи из общей очереди; прогон завершён, когда очередь пуста и активных нет. Синхронный `throw` в обработчике обрабатывается как реджект.
- [ ] **Step 4:** тест — PASS.
- [ ] **Step 5: Commit** `git commit -m "Add dynamic task queue for the scraper core"`

---

### Task 6: Контракт модуля и `runStore`

**Files:**
- Create: `pipeline/src/scrape/core/store.ts` (типы контракта), `pipeline/src/scrape/core/run.ts`, `pipeline/src/scrape/core/index.ts` (реэкспорт публичного API ядра)
- Test: `pipeline/test/scrape-core-run.test.ts`, `pipeline/test/scrape-core-boundary.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
```ts
type StoreTask = { category: string }
type TaskResult<T extends StoreTask> = {
  products?: unknown[]            // проверяются SourceProductSchema в runStore
  next?: T[]
  total?: number                  // итог категории task.category по данным API, если известен
  seen?: number                   // позиций категории в этом ответе ДО фильтра наличия
}
interface StoreModule<T extends StoreTask, C = undefined> {
  storeCode: StoreCode; city: string; limits: StoreLimits; headers?: Record<string, string>
  prepare?(http: HttpClient): Promise<C>
  seeds(ctx: C): T[]              // одна или несколько задач на категорию; порядок = приоритет категорий
  handle(task: T, ctx: C, http: HttpClient): Promise<TaskResult<T>>
  describe(task: T): string       // контекст для ошибок
}
type RunOptions = { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; clock?: Clock; random?: () => number; now?: () => Date; log?: (msg: string) => void }
function runStore<T extends StoreTask, C>(module: StoreModule<T, C>, opts?: RunOptions): Promise<SourceFile>
function assertNoErrors(file: SourceFile): void   // errorCount > 0 → Error с storeCode, числом ошибок и "keeping previous file"
```

- [ ] **Step 1: Write the failing tests** (`scrape-core-run.test.ts`, фейковый модуль поверх фейкового `fetchImpl`, без сети):
  - `builds a SourceFile with store, city and products`: `storeCode`, `city: 'Testville'`, `capturedAt` из `now`, `errorCount: 0`;
  - `deduplicates by sourceProductId, path from the earliest seed category`: товар `p1` в категориях `a` (seed 0) и `b` (seed 1), ответ `b` приходит раньше → одна запись, `sourceCategoryPath` из `a`;
  - `counts an invalid product as an error and keeps the rest`: товар с `price: -1` → `errorCount: 1`, остальные в файле;
  - `counts a failed task as an error with its description`: `log` получает строку с `describe(task)`;
  - `accepts an empty category`: `total: 0`, `seen: 0` → без ошибок;
  - `re-runs a category once when seen differs from total`: первый проход `seen 9 / total 10`, второй `10 / 10` → `errorCount: 0`, `sourceStats.recounted === 1`;
  - `fails a category whose recount still differs`: оба прохода `9 / 10` → `errorCount: 1`;
  - `uses limits from env`: `env: { TEST_CONCURRENCY: '2' }` → `sourceStats.concurrency === 2`;
  - `writes flat sourceStats`: есть `durationMs, requests, retries, status429, status5xx, timeouts, networkErrors, bytes, tasks, concurrency, rps, categories, recounted, scoped: true, engine: 'scrape-core-1'`, и `'cat.a.seen'`, `'cat.a.total'`; все значения — number/string/boolean;
  - `assertNoErrors throws on errors and passes on zero`.
- [ ] **Step 2: Write the failing boundary test** (`scrape-core-boundary.test.ts`): прочитать все `src/scrape/core/*.ts`, собрать спецификаторы `from '...'`; каждый либо `node:*`, либо `zod`, либо `./*.js`, либо `../../types.js`. Плюс: ни один файл `core/` не содержит (без учёта регистра) `aktau`, `shymkent`, `magnum`, `dina`, `dana`, `anvar`, `fix_price`.
- [ ] **Step 3:** `pnpm test -- test/scrape-core-run.test.ts test/scrape-core-boundary.test.ts` — FAIL.
- [ ] **Step 4:** реализовать `runStore`:
  - лимиты через `resolveStoreLimits(module.storeCode, module.limits, opts.env ?? process.env)`;
  - один `Limiter` и `createHttpClient({ limiter, headers: module.headers, ... })`;
  - `prepare` → `seeds` → `runTasks` (concurrency задач = `concurrency` лимитов);
  - категории учитываются по `task.category`: суммы `seen`, последний `total`;
  - после прохода категории с `total !== undefined && seen !== total` один раз заново: сбросить их счётчики, запустить их seed-задачи; повторное расхождение — ошибка `category <id>: seen N of total M`;
  - товары: `SourceProductSchema.safeParse`; при дубле оставлять запись с меньшим индексом категории в seeds;
  - ошибка `prepare` — ошибка всего прогона (реджект `runStore`).
- [ ] **Step 5:** тесты — PASS; `pnpm typecheck` — PASS.
- [ ] **Step 6: Commit** `git commit -m "Add store runner and module contract for the scraper core"`

---

## Модуль Magnum

Задачи ниже уточняются после сбора фактов об API. Перед Task M2 дополнить раздел «Модуль Magnum» в спеке фактами об API **без описания способа их получения** и обновить в этих задачах точные поля, URL-шаблоны и фикстуры.

### Task M1: Сбор фактов об API (вне репозитория)

**Files:**
- Create: заметки об API вне репозитория
- Modify: спека, раздел «Модуль Magnum»

- [x] **Step 1:** завести заметки об API вне репозитория.
- [x] **Step 2:** записать в заметки: хосты API, запросы категорий/товаров/поиска, пагинация и итог, параметры города и магазина, авторизация (гостевой токен / постоянный ключ), поля цены, наличия, веса, изображений.
- [x] **Step 3:** дополнить раздел спеки фактами (без токенов и способа получения); постоянный ключ не нужен.
- [x] **Step 4:** показать пользователю собранные факты; подтверждение получено 2026-11-21 (вместе с решением: итога нет, конец листа по короткой странице).
- [x] **Step 5: Commit** спеки: `git commit -m "Record Magnum API shape in the scrapers design"`

### Task M2: Разбор страницы товаров Magnum

**Files:**
- Create: `pipeline/src/scrape/stores/magnum/parse.ts`
- Fixtures (подготовлены координатором, сокращённые до нужных полей, без сырых ответов): `pipeline/test/fixtures/magnum/full-page.json` (3 из 3: штучный без скидки, весовой со скидкой, весовой без скидки), `last-page.json` (страница 1, 2 из 3, штучные), `unavailable-page.json` (3 из 3: доступный; `availabilityId 0` с `price 0`; заглушка с отрицательным `itemId` без `extId`), `empty-page.json` (страница 2, `content: []`, `size 15`)
- Test: `pipeline/test/magnum-parse.test.ts`

**Interfaces:**
- Consumes: `SourceProduct` (`src/types.ts`).
- Produces:
```ts
export type MagnumPageCategory = { id: string; path: readonly string[] }
export type MagnumPage = { products: SourceProduct[]; seen: number; total: null; nextPage: number | null }
export function parseMagnumPage(body: unknown, category: MagnumPageCategory): MagnumPage
```

**Правила разбора** (факты — раздел «Модуль Magnum» спеки):
- Страница: zod `{ content: unknown[], number: int ≥ 0, size: int > 0 }`, остальные поля игнорируются. Не страница → `Error` с `category.id`.
- `seen = content.length` (до любых фильтров). `total = null` всегда.
- `nextPage = content.length > 0 && content.length >= size ? number + 1 : null`.
- Пропуск без ошибки: `itemId <= 0`, `availabilityId !== 3`, `isActive === false`, `price <= 0`.
- Оставшиеся позиции — строгая zod-схема (`itemId` int, `name` непустая, `price` int > 0, `measureUnit { name, isDividable, divideValue }`, `discount?: { prevPrice: int } | null`, `mainImg?`, `imgList?`, `extId?`, `barcodes?`); не прошла → `Error` с `itemId` и `category.id` (fail-closed: прогон откажет запись).
- Единица: `isDividable === false` → штучный; `isDividable === true && name === 'кг' && divideValue === 1000` → весовой; иное → `Error` «unknown Magnum measure unit» с `itemId`. Название товара не читается.
- Маппинг в `SourceProduct`: `sourceProductId: 'magnum_' + itemId`; `name` (trim); `price: Math.round(price / 100)`; `oldPrice: discount?.prevPrice` → `/100`, только если больше `price`, иначе `null`; `imageUrl: mainImg || imgList[0] || null`; `sourceUrl: null`; `brand: null`; `sourceCategoryPath: [...category.path]`.
- `rawPayload` — только явные поля, без складских: `{ itemId, extId: extId ?? null, barcodes: barcodes ?? [], categoryId: category.id, isWeighted, priceUnit: isWeighted ? 'kg' : null, priceTiyn: price, prevPriceTiyn: discount?.prevPrice ?? null, orderStepGrams: isWeighted ? step ?? null : null }`.

- [ ] **Step 1: Write the failing tests:** на `full-page.json` — 3 товара, цены в целых тенге (`1352`, `5379` при `oldPrice 6328`, …), `nextPage 1`; весовой → `rawPayload.isWeighted === true`, `priceUnit 'kg'`, `orderStepGrams 700`; штучный → `isWeighted false`, `priceUnit null`; `last-page.json` → `nextPage null`, `seen 2`; `unavailable-page.json` → 1 товар, `seen 3`, `nextPage 1`; `empty-page.json` → `products: []`, `seen 0`, `nextPage null`; синтетические случаи в тесте: неизвестная единица → throw; позиция в наличии без `name` → throw с `itemId`; тело не страница → throw; `prevPrice <= price` → `oldPrice null`; ни одна фикстура не содержит ключей `token`, `authorization`, `cookie`, `device`, `wmsItemLocation`, `descr` (рекурсивный обход).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `git commit -m "Parse Magnum catalog pages"`

### Task M3: Таблица категорий и модуль

**Files:**
- Create: `pipeline/src/scrape/stores/magnum/scope.ts`, `pipeline/src/scrape/stores/magnum/index.ts`
- Test: `pipeline/test/magnum-scope.test.ts`, `pipeline/test/magnum-module.test.ts`

**Interfaces:**
- Consumes: `StoreModule`, `runStore` (Task 6), `parseMagnumPage` (M2), `DEFAULT_PUBLISH_CATEGORIES` (`src/mapping/scope.ts`).
- Produces: `type MagnumScopeCategory = MagnumPageCategory & { slug: CategorySlug }` (`path` — от корня к листу, например `['Продукты', 'Молочные продукты, яйцо', 'Молоко']`); `MAGNUM_SCOPE: readonly MagnumScopeCategory[]` (шестизначные листья корня `11`, без корней `51` и `60`); `MAGNUM_PLATFORM_ID = 7001`; `magnumModule: StoreModule<MagnumTask, MagnumContext>` с `storeCode: 'MAGNUM'`, `city: 'Shymkent'`, `limits: { concurrency: 4, rps: 8, maxConcurrency: 8, maxRps: 20 }`; `MagnumTask = { category: string; page: number }`; `MagnumContext = { authorization: string }`.

- [ ] **Step 1: Write the failing tests:**
  - scope: все `slug` ∈ `DEFAULT_PUBLISH_CATEGORIES`; каждая из 12 публикуемых категорий покрыта хотя бы одной записью; `id` уникальны и шестизначные; ни один `id` не начинается с `51` или `60`;
  - module (фейковый `fetchImpl` по URL, фикстуры M2): `prepare` делает `POST …/security/guest/login` и кладёт `token` как есть в `authorization`; `prepare` проверяет склад запросом `…/type/all/attributes` с координатами центра Шымкента и реджектит `runStore`, если `darkStore.id !== 7001`; ответ входа без `token` → реджект; каждый запрос товаров несёт `authorization`, `platformId=7001`, `categoryIds=<лист>`, `pageId=<n>`; `full-page` ставит задачу `page + 1`, `last-page`/`empty-page` — не ставят; `total` не передаётся.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать: база `https://mgo-gw1.e-magnum.kz`, пути и параметры — по спеке; `seeds` — по задаче `page 0` на лист в порядке `MAGNUM_SCOPE`; `handle` → `parseMagnumPage`, `next` из `nextPage`. ID листьев — из дерева категорий в спеке/записях M1 (координатор передаёт таблицу). **Step 4:** PASS.
- [ ] **Step 5: Commit** `git commit -m "Add Magnum store module on the scraper core"`

### Task M4: CLI

**Files:**
- Modify: `pipeline/src/cli/scrape.ts:18-49,62-67`, `pipeline/package.json` (скрипт `scrape:magnum`)
- Test: `pipeline/test/scrape-core-run.test.ts` (уже покрывает `assertNoErrors`)

- [ ] **Step 1:** в `SCRAPERS` добавить `MAGNUM: () => runStore(magnumModule)`; для `MAGNUM` вместо `assertCompleteScrape` вызывать `assertNoErrors`; лог `[MAGNUM] mode: core (N categories, concurrency C, rps R)`.
- [ ] **Step 2:** `"scrape:magnum": "tsx src/cli/scrape.ts MAGNUM"`.
- [ ] **Step 3:** `pnpm test` и `pnpm typecheck` — PASS.
- [ ] **Step 4: Commit** `git commit -m "Run the Magnum scraper from the scrape CLI"`

### Task M5: Живой прогон и подбор лимитов

- [ ] **Step 1:** спросить пользователя «да» на живой скрап Magnum.
- [ ] **Step 2:** `pnpm scrape:magnum` — `errorCount 0`, файл `data/sources/magnum.json` записан (каталог в `.gitignore`, файл не коммитится).
- [ ] **Step 3:** проверить: каждая из 12 категорий сайта содержит товары (по `MAGNUM_SCOPE` и `sourceCategoryPath`); `status429 === 0`; записать `durationMs`, `requests`, `retries`.
- [ ] **Step 4:** если 429 > 0 — снизить лимиты по умолчанию; если 0 и время велико — поднять в пределах максимумов, повторить с «да» пользователя. Итоговые значения закоммитить в `index.ts`.
- [ ] **Step 5:** локальный CI `pipeline,security,guard`; отчёт пользователю с цифрами прогона.
