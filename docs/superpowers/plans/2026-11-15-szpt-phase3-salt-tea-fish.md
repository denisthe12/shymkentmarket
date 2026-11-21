# СЗПТ, фаза 3 (соль, чай чёрный, рыба, баранина, конина) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** опубликовать категории `salt`, `tea-coffee`, `fish`, перенести сырую баранину и конину Dina в `meat` и добавить в раздел СЗПТ группы `lamb`, `horse-meat`, `fish`, `black-tea`, `salt` (30 групп, все 31 позиция приказа 362-нқ).

**Architecture:** два PR. PR A (данные) расширяет список публикуемых категорий, таксономию, скрап Анвара и наборы Dina/Dana и добавляет правило категории для сырой баранины и конины; после выката на VPS snapshot содержит новые товары. PR B (группы) добавляет пять правил в `backend-go/internal/szpt/groups.go`, проверенные на живом snapshot, и казахские строки во фронтенде.

**Tech Stack:** TypeScript pipeline (vitest, tsx, pnpm), Go API (`go test`, PostgreSQL integration через Docker), Next.js frontend (i18n JSON), Prisma-миграции (SQL), VPS: systemd-таймеры sync.

**Spec:** [`docs/superpowers/specs/2026-11-15-szpt-phase3-salt-tea-fish-design.md`](../specs/2026-11-15-szpt-phase3-salt-tea-fish-design.md)

## Global Constraints

- Категории публикуются **целиком** (вариант A): `salt`, `tea-coffee`, `fish`; отдельной категории `tea` нет.
- 25 живых групп: состав и относительный порядок не меняются; `/szpt` ведёт на `rice`. Единственная правка живых правил — `баран|конин` в исключениях `chicken-parts` и `chicken`.
- Порядок групп: `lamb`, `horse-meat`, `fish` между `minced-meat` и `chicken-parts`; `black-tea`, затем `salt` — в конце.
- Шаблоны групп без `\b`, `\m`, `\M`: граница слова пишется как `[^а-яё]` (комментарий в `groups.go`).
- Невесовые группы исключают весовые товары (`weighted` в `Exclude`); `lamb`, `horse-meat`, `fish` — `Weighted: true`, `Unit: Kg`.
- Правило категории мяса меняет только `other`/`frozen` → `meat`; другие категории не трогает.
- Применённые миграции (`20261006000000_catalog_taxonomy`, `20261102000200_anvar_taxonomy`) не редактируются.
- Скрап Анвара: добавляются только `9043 Чай` и `9140 Свежая рыба, морепродукты`; кофе (9039) не добавляется.
- Казахские имена — черновики для носителя языка.
- Перед каждым push: `локальный CI-раннер вне репозитория` (нужен Docker).
- Команды на VPS вводит пользователь (`b2admin`, интерактивный ssh); агент пишет команды и проверяет вывод.
- Откат данных после первой удачной публикации — только вперёд; разовый подъём `INGEST_MAX_STORE_DROP_PERCENT` — только с отдельного согласия пользователя.

## Review Focus

1. Ароматизированный чай с латинским названием аромата («Dance of Roses», «Earl Grey», «Tropical») — не должен попасть в `black-tea`; тесты Task 6 содержат такие имена.
2. Пакетированный чай, у которого фасовка разобрана как общий вес («Ахмад 100*2г» → `weightGrams: 200`) — исключается по `\d+\s*[*xх×]\s*\d`, тест в Task 6.
3. Соль, где «Экстра» написано латиницей или заглавными («СОЛЬ ЭКСТРА 900ГР», «Royal food Extra») — регистронезависимое исключение, тест в Task 6.
4. Слово-омоним вида рыбы внутри другого слова («Карпаччо», «Сазанчик» в снеках, «судака» в соусе) — граница `(^|[^а-яё])` и исключения `карпач`, `чипс`, `снек`, `соус`; тест в Task 6.
5. Весовая рыба Анвара (`KGM`) без фасовки — должна войти в `fish` с ценой за кг из `offer_price_basis`; тест в Task 7 (ANVAR payload).
6. Новая баранина/конина в `meat` с отрубом-омонимом («Баранина ножка», «… тушка») — не должна попасть в `chicken-parts`/`chicken`; тест в Task 6.

---

## PR A — данные

### Task 1: Публикация трёх категорий и скрап Анвара

**Files:**
- Modify: `pipeline/src/mapping/scope.ts:8` (`DEFAULT_PUBLISH_CATEGORIES`)
- Modify: `pipeline/src/scrapers/anvar.ts:34-54` (`ANVAR_SCOPE`)
- Modify: `pipeline/src/mapping/taxonomy-sql.ts:7` (`TAXONOMY_MIGRATION`)
- Create: `backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy/migration.sql` (генерируется)
- Test: `pipeline/test/salt.test.ts`, `pipeline/test/taxonomy.test.ts`, `pipeline/test/anvar.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PUBLISH_CATEGORIES` = 12 slug (старые 9 + `'salt'`, `'tea-coffee'`, `'fish'`); `ANVAR_SCOPE` длиной 21; `TAXONOMY_MIGRATION = 'backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy/migration.sql'`.

- [ ] **Step 1: Обновить тесты под новое ожидание**
  - `salt.test.ts`: тест «salt is a category but is not published» → «salt is a published category»: `expect(DEFAULT_PUBLISH_CATEGORIES).toContain('salt')`.
  - `taxonomy.test.ts`: тест «exactly the 9 published categories…» → «exactly the 12 published categories, no legacy other»: убрать `not.toContain("'salt'")`, добавить `expect(rows).toHaveLength(12)` и `for (const s of ['salt', 'tea-coffee', 'fish']) expect(rows.map((r) => r.slug)).toContain(s)`.
  - `taxonomy.test.ts`, тест «only milk and dairy rows differ in shape…»: строки без пары в SCRUM-7 (`salt`, `tea-coffee`, `fish`) пропускать (`if (!prev) continue`), иначе `prev!` падает.
  - Новый тест в `taxonomy.test.ts`: «phase 3 migration keeps the 9 old rows of the applied anvar migration» — парсит `20261102000200_anvar_taxonomy/migration.sql` и проверяет `expect(rows.find(r => r.slug === s)).toEqual(anvarRows.find(r => r.slug === s))` для каждого старого slug.
  - Новый тест «new categories have servable filters»: у `salt` фильтр `weightGrams`, у `tea-coffee` и `fish` — `brand`, все options непустые.
  - `anvar.test.ts:101`: `toHaveLength(21)`; добавить `expect(ANVAR_SCOPE).toContainEqual({ id: '9043', name: 'Чай' })` и `{ id: '9140', name: 'Свежая рыба, морепродукты' }`.

- [ ] **Step 2: Запустить — тесты падают**

Run: `cd pipeline && pnpm test -- salt taxonomy anvar`
Expected: FAIL (salt not published, 9 rows, ANVAR_SCOPE length 19).

- [ ] **Step 3: Реализация**
  - `scope.ts`: добавить `'salt', 'tea-coffee', 'fish'` в конец `DEFAULT_PUBLISH_CATEGORIES`; комментарий над `publishCategories` не менять.
  - `anvar.ts`: в конец `ANVAR_SCOPE` — `{ id: '9043', name: 'Чай' }, // tea-coffee` и `{ id: '9140', name: 'Свежая рыба, морепродукты' }, // fish`; комментарий «9 публикуемым категориям» → «публикуемым категориям».
  - `taxonomy-sql.ts`: `TAXONOMY_MIGRATION` на новый путь, комментарий: применённые `20261006000000_catalog_taxonomy` и `20261102000200_anvar_taxonomy` не трогаем.
  - Сгенерировать миграцию: `cd pipeline && pnpm taxonomy:sql`.

- [ ] **Step 4: Тесты проходят**

Run: `cd pipeline && pnpm test && pnpm typecheck`
Expected: PASS. Новый тест «keeps the 9 old rows» зелёный — словарь ещё не менялся.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/mapping/scope.ts pipeline/src/scrapers/anvar.ts pipeline/src/mapping/taxonomy-sql.ts pipeline/test backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy
git commit -m "feat(pipeline): publish salt, tea-coffee and fish; scrape Anvar tea and fresh fish"
```

### Task 2: Товары Анвара в словаре

**Files:**
- Modify: `data/mapping/dictionary.json` (через `anvar-apply`)
- Modify: `backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy/migration.sql` (перегенерация)
- Temp (не коммитить): `data/sources/anvar.json`, `data/agent/anvar-match/*`

**Interfaces:**
- Consumes: `ANVAR_SCOPE` из Task 1.
- Produces: в `dictionary.storeCategories` ключи `ANVAR|…/ Чай` → `tea-coffee` и `ANVAR|…/ Свежая рыба, морепродукты` → `fish` (любой путь, заканчивающийся этими разделами).

- [ ] **Step 1: Скрап Анвара** — `cd pipeline && pnpm scrape:anvar`. Expected: в логе товары разделов «Чай» (~166) и «Свежая рыба, морепродукты» (~16), файл `data/sources/anvar.json`.
- [ ] **Step 2: Задания** — `pnpm exec tsx src/cli/anvar-prepare.ts`. Expected: `data/agent/anvar-match/batch-NNN.json` + `prompt.md` только для товаров, которых нет в словаре.
- [ ] **Step 3: Решения** — для каждого batch субагент (модель haiku) по `prompt.md` пишет `batch-NNN.decisions.json`, как при подключении Анвара (`docs/data/ANVAR_SOURCE.md`)  (удалён).
- [ ] **Step 4: Проверка и применение** — `pnpm exec tsx src/cli/anvar-apply.ts --check`, затем без `--check`. Expected: ошибок нет, словарь обновлён.
- [ ] **Step 5: Проверить `storeCategories`** — `node -e` по `data/mapping/dictionary.json`: все ключи `ANVAR|…` с «/ Чай» дают `tea-coffee`, с «/ Свежая рыба, морепродукты» — `fish`; у «Сазан потрошенный вес» категория `fish`. Неверные — правка через `data/mapping/overrides.json` (`moveCategory`) и повтор Step 4.
- [ ] **Step 6: Перегенерировать таксономию** — `pnpm taxonomy:sql`; `git diff` миграции: меняются только options новых категорий и, возможно, бренды старых. Если тест «keeps the 9 old rows» падает — разобрать: изменение опций старой категории от новых товаров Анвара принимается только если оно ожидаемо (новый бренд в `groats`/`sugar`), и тогда тест сравнивает форму без options, как соседний тест; иначе исправить решения.
- [ ] **Step 7: Тесты** — `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add data/mapping/dictionary.json data/mapping/overrides.json backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy pipeline/test
git commit -m "data(mapping): match Anvar tea and fresh fish into the dictionary"
```

### Task 3: Наборы скрапа Dina и Dana

**Files:**
- Modify: `data/mapping/dina-scope-categories.json`, `data/mapping/dana-scope-sections.json`
- Temp (не коммитить): `data/sources-full/dina.json`, `data/sources-full/dana.json`

**Interfaces:**
- Consumes: `DEFAULT_PUBLISH_CATEGORIES` из Task 1, словарь из Task 2.
- Produces: оба файла с `scope` из 12 slug.

- [ ] **Step 1: Полный скрап локально** — `cd pipeline && SCRAPE_ALL=1 SOURCES_DIR=data/sources-full pnpm scrape:dina` и то же для `scrape:dana` (Dina ~13 мин, Dana ~3 мин; в PowerShell env задаётся через `$env:`).
- [ ] **Step 2: Пересчёт** — `pnpm scope:dina` и `pnpm scope:dana`. Expected: `scope:dana` печатает `unsectionedProducts 0`; в `dina-scope-categories.json` появились id категорий Dina «Чай», «Соль», «Замороженная рыба» (новые `categoryIds`).
- [ ] **Step 3: Проверить, что старые категории не потеряны** — `git diff`: из `categoryIds`/`sections` ничего не удалено (только добавлено); `coveredProducts` = `scopeProducts`.
- [ ] **Step 4: Узкий прогон sync локально** — `pnpm scrape:dina && pnpm scrape:dana && pnpm sync` (по умолчанию `data/sources`, `data/sync`). Expected: в `data/sync/bundle.json` есть товары категорий `salt`, `tea-coffee`, `fish` от Dina и Dana; число товаров старых 9 категорий не меньше, чем до изменения (сравнить с `pnpm sync:compare` или подсчётом по категориям до/после).
- [ ] **Step 5: Тесты** — `pnpm test`. Expected: PASS (`dina-scope.test.ts`, `dana-scope.test.ts`).
- [ ] **Step 6: Commit**

```bash
git add data/mapping/dina-scope-categories.json data/mapping/dana-scope-sections.json
git commit -m "data(scope): Dina and Dana scrape sets for salt, tea and fish"
```

### Task 3b: Сырая баранина и конина Dina → `meat`

**Files:**
- Create: `pipeline/src/mapping/meat.ts`
- Modify: `pipeline/src/mapping/milk.ts:18` (`refineCategory` сначала вызывает `refineMeat`)
- Modify: `backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy/migration.sql` (перегенерация, если поменялись опции `meat`/`frozen`)
- Test: `pipeline/test/meat.test.ts`

**Interfaces:**
- Produces: `refineMeat(category: CategorySlug, name: string): CategorySlug` — возвращает `'meat'`, если `category` ∈ {`'other'`, `'frozen'`}, название совпадает с `^(п\/ф\s+)?(баранина|конина)\s` (без учёта регистра) и не содержит `тушен|консерв|казы|кебаб|люля|пельмен|манты|палочк|шашлык|сосиск|колбас|куырдак|котлет|чипс|гренк|сухар`; иначе `category` без изменений.

- [ ] **Step 1: Тесты** — `meat.test.ts`, таблица `[category, name, expected]`:
  - `other`, «Баранина Задок» → `meat`; `other`, «Баранина Шейная часть» → `meat`; `frozen`, «п/ф конина жая охл» → `meat`; `frozen`, «п/ф конина тибон на кости охл» → `meat`; `frozen`, «п/ф конина соленая охл» → `meat` (категория мясная, из группы её исключит Go-правило);
  - `other`, «Баранина тушеная Кублей 325 г» → `other`; `frozen`, «П/ф Конина Кублей Казы вес» → `frozen`; `frozen`, «Полуфабрикат люля-кебаб Кублей баранины 0,45кг» → `frozen`; `canned`, «Конина тушеная Кублей 325 г» → `canned`; `sausages`, «Колбаса Рамай Гриль с Бараниной 600г» → `sausages`;
  - через `refineCategory`: `refineCategory('other', 'Баранина Ребро')` → `'meat'`; поведение для `milk` не изменилось (существующий `milk.test.ts` зелёный).
- [ ] **Step 2: Запустить — падают** — `cd pipeline && pnpm test -- meat`. Expected: FAIL (модуля нет).
- [ ] **Step 3: Реализация** — `meat.ts` с `refineMeat`; в `refineCategory` первой строкой `category = refineMeat(category, name)`, дальше как было.
- [ ] **Step 4: Таксономия** — `pnpm taxonomy:sql`; `git diff` миграции: допустимы только новые опции бренда у `meat`. Тесты `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Проверка на живых данных** — `pnpm scrape:dina && pnpm sync`; в `data/sync/bundle.json` товары «Баранина Задок/Тибон/Ребро/Грудинка/Шейная часть» и «п/ф конина жая/тибон на кости охл» имеют категорию `meat`; в `meat` не появилось готовых блюд (просмотреть все товары, которые перешли из `other`/`frozen`: сравнить bundle до и после изменения).
- [ ] **Step 6: Commit**

```bash
git add pipeline/src/mapping/meat.ts pipeline/src/mapping/milk.ts pipeline/test/meat.test.ts backend/prisma/migrations/20261116000000_szpt_phase3_taxonomy
git commit -m "feat(pipeline): raw lamb and horse meat from Dina into meat"
```

### Task 4: PR A

- [ ] **Step 1: Локальный CI** — `локальный CI-раннер вне репозитория`. Expected: все джобы зелёные.
- [ ] **Step 2: Push и PR** (с согласия пользователя) — ветка в `main`, в описании: спека, план, что PR не меняет API и группы, порядок выката (Task 5).
- [ ] **Step 3: CI GitHub зелёный → merge** (с согласия пользователя).

### Task 5: Выкат данных на прод

Команды пишет агент, вводит пользователь. Не в окна sync 01:00 и 13:00 UTC.

- [ ] **Step 1: Дамп базы и базовая выборка** — дамп по `docs/production` (процедура последнего дампа 2026-11-14), проверить размер файла; снять состав 25 живых групп `ops/postgres/szpt/szpt_members_explain.sql` из `main` (база для сравнения в Task 8).
- [ ] **Step 2: Миграция таксономии** — `prisma migrate deploy` ролью владельца, как миграции фазы 2. Проверка read-only SQL: `SELECT slug, "filterSchema" FROM categories ORDER BY slug` — 12 строк + `other`; 9 старых совпадают с ожиданием из PR.
- [ ] **Step 3: Пайплайн на VPS** — обновить `/opt/aktau-sync` git bundle по `ops/sync/README.md` до merge-коммита PR A; `pnpm install --frozen-lockfile` в `pipeline/`.
- [ ] **Step 4: Ручной прогон sync** — `systemctl start aktau-sync.service`, журнал `journalctl -u aktau-sync -n 100`. Expected: exit 0 (или 3 только из-за упавшей сети, не связанной с изменениями), snapshot опубликован. Стоп: sync упал до публикации → вернуть прошлый bundle (snapshot не менялся).
- [ ] **Step 5: Проверка snapshot** — через API: `GET /api/categories` содержит `salt`, `tea-coffee`, `fish`; `GET /api/products?category=fish&limit=100` и `search=Судак`/`Сазан` находят рыбу Dina и Анвара; `category=salt` — соль Dina, Dana, Анвара; `category=meat&search=Баранина` и `search=конина` находят отрубы Dina; число товаров старых категорий не просело (сравнить `adilbaga-status` до/после).
- [ ] **Step 6: Запись в память** — состояние выката (миграция, коммит bundle, время snapshot).

## PR B — группы

### Task 6: Правила пяти групп (Go unit)

**Files:**
- Modify: `backend-go/internal/szpt/groups.go:131-143` (вставка `lamb`, `horse-meat`, `fish`; `баран|конин` в `Exclude` у `chicken-parts` и `chicken`), конец `Groups` (`black-tea`, `salt`)
- Test: `backend-go/internal/szpt/szpt_test.go`

**Interfaces:**
- Produces: `szpt.Lookup("lamb" | "horse-meat" | "fish" | "black-tea" | "salt")`; `Rule` поля:
  - `lamb`: `Name "Баранина"`, `Category "meat"`, `Unit Kg`, `SizeKeys {"weightGrams"}`, `MinSize 500`, `Weighted true`;
  - `horse-meat`: `Name "Конина"`, `Category "meat"`, `Unit Kg`, `SizeKeys {"weightGrams"}`, `MinSize 500`, `Weighted true`;
  - `fish`: `Name "Рыба (лещ, карась, судак, карп, сазан)"`, `Category "fish"`, `Unit Kg`, `SizeKeys {"weightGrams"}`, `MinSize 300`, `Weighted true`;
  - `black-tea`: `Name "Чай чёрный"`, `Category "tea-coffee"`, `Unit Kg`, `SizeKeys {"weightGrams"}`, `MinSize 40`;
  - `salt`: `Name "Соль поваренная пищевая"`, `Category "salt"`, `Unit Kg`, `SizeKeys {"weightGrams"}`, `MinSize 200`.

- [ ] **Step 1: Тесты**
  - `wantSlugs`: `…, "minced-meat", "lamb", "horse-meat", "fish", "chicken-parts", "chicken", "black-tea", "salt"` (30).
  - `TestWeightedRules`: `weightedSlugs` += `"lamb"`, `"horse-meat"`, `"fish"`.
  - Новый `TestPhase3Patterns`: компилирует `Include`/`Exclude` правил как Go-regexp с флагом `(?i)` (так же, как `TestGroupPatternsCompile`) и проверяет имя → член/не член (все Include совпали и Exclude не совпал):

| Группа | Входит | Не входит |
|---|---|---|
| lamb | «Баранина Задок», «Баранина Тибон», «Баранина Шейная часть», «Мясо баранины на кости» | «Баранина тушеная Кублей 325 г», «Колбаса Рамай Гриль с Бараниной 600г», «П/ф Шашлык из баранины вес», «Полуфабрикат люля-кебаб Кублей баранины 0,45кг», «Приправа Приправыч д/баранины 15г» |
| horse-meat | «п/ф конина жая охл», «п/ф конина тибон на кости охл», «Конина мякоть охл» | «п/ф конина соленая охл», «П/ф Конина Кублей Казы вес», «Тушеная конина Кублей 325 г», «Арахис Big Bob в оболочке вяленая конина 50 г», «Сухарики гренки ржаные Вяленая конина 100г» |
| chicken-parts / chicken (живые, Review Focus 6) | — | «Баранина ножка», «Баранина тушка», «Конина голень» |
| fish | «Рыба Судак охл», «Рыба Сазан большой охл», «Сазан потрошенный вес», «Филе судака с/м», «Карп живой» | «Лещ вяленый», «Лещ холодного копчения», «Сазан жареный», «Карпаччо из говядины», «Чипсы рыбные Сазанчик», «Соус для судака», «Икра сазана» |
| black-tea | «Чай Ассам черный листовой 250 г», «Чай Champion Keniya Sunset черный гранул 1000г/12», «Чай Bayce кенийский гранулированный 500г Казахстан 1/20», «ЧАЙ ЖАМБО КЕНИЙСКИЙ ГРАНУЛ. 250ГР», «Чай черный АЗЕРЧАЙ байховый 100 г» | «Чай Ахмад Классический черный 40 пак», «Чай Ахмад Английский завтрак 100*2г/8», «Чай Beta Tea Earl Grey черный гранул 250 г», «Чай Beta Tea Dance of Roses черный 100 г», «Чай Ассам зеленый 100г», «Чай Lipton черный персик манго пирамидка 36г», «Чай Beta Magic Assam с бергамотам черный 100г», «Кофе Jacobs Monarch 95 г» |
| salt | «Соль Ассоль йодированная 1 кг», «Соль Илецкая йодированная 1 кг», «СОЛЬ ЛОТОС 400ГР», «Соль Royal food Морская крупного помола дойпак 500 г», «Тұз йодталған 1 кг» | «СОЛЬ ЭКСТРА 900ГР», «Соль Royal food Extra 200г», «Соль для ванн Аромика Череда, 1000 г», «Соль для посудомоечных машин "Finish" 1.5 кг», «Соль с травами Приправыч 300 г», «Соль черная четверговая 200 г» |

  Для «Tropical»/«Dance of Roses» добавить в исключение чая латинские `rose|tropic|berry|fruit|lemon|mint|peach|mango|vanil|caramel` (Review Focus 1).

- [ ] **Step 2: Запустить — падают** — `cd backend-go && go test ./internal/szpt/...`. Expected: FAIL (order, unknown groups).
- [ ] **Step 3: Реализация** — пять `Rule` в `groups.go` по таблице «Часть 3» спеки (включения, исключения, фасовка), с дополнениями из Step 1. Невесовые — `exclude(..., weighted)`. Шаблон рыбы: `(^|[^а-яё])(лещ|карас|судак|карп|сазан)`, к исключениям спеки добавить `соус` (Review Focus 4); соли: `^соль|^тұз`; чая: два Include — `^чай` и `ч[её]рн|гранул|байхов|кени|ассам|цейлон|индийск`; баранины: `баранин|ягнят|ягн[её]н`, к исключениям спеки добавить `д/баран|для баран` (приправы); конины: `конин|(^|[^а-яё])жая([^а-яё]|$)`. В `chicken-parts` и `chicken` дописать в `exclude(...)` шаблон `баран|конин`.
- [ ] **Step 4: Проходят** — `go test ./internal/szpt/... ./internal/httpapi/...`. Expected: PASS; старые тесты без изменения ожиданий.
- [ ] **Step 5: Commit** — `git commit -m "feat(szpt): lamb, horse meat, fish, black tea and salt groups"` (файлы `groups.go`, `szpt_test.go`).

### Task 7: Интеграционные тесты и explain SQL

**Files:**
- Modify: `backend-go/tests/fixtures/szpt.sql` (категории + строки фазы 3)
- Modify: `backend-go/tests/integration/szpt_test.go` (`new_groups_membership`)
- Modify: `ops/postgres/szpt/szpt_members_explain.sql` (регенерация)

**Interfaces:**
- Consumes: правила из Task 6.
- Produces: строки фикстуры `n-<group>-in|out<N>` с N от 72 и далее.

- [ ] **Step 1: Фикстура** — в `INSERT INTO categories` добавить `('salt','salt','Соль',NULL),('tea-coffee','tea-coffee','Чай и кофе',NULL),('fish','fish','Рыба и морепродукты',NULL)`. Новый блок «-- SZPT phase 3 …» по образцу блока hotfix (raw_products/canonical_products/offers): по 2 «in» и 3 «out» на группу из таблицы Task 6; баранина, конина и рыба Dina с payload `{"price_type":"weight","priceUnit":"kg","pricePerUnitMultiplier":1000}` (баранина и конина — категория `meat`), «Сазан потрошенный вес» — ANVAR с payload `{"priceUnit":"kg","pricePerUnitMultiplier":1000}`; чай и соль с `weightGrams`.
- [ ] **Step 2: Тест** — добавить кейсы в `new_groups_membership`; отдельный подтест `phase3_fish_per_kg`: у `n-fish-in…` (ANVAR, 2 990 ₸ за кг) цена за кг 2 990, у группы `fish` `DefaultSort = unit_price_asc`.
- [ ] **Step 3: Запустить** — `локальный CI-раннер вне репозитория` (джоб Go integration) или `go test ./tests/integration -run TestDeterministicSzpt` с поднятой БД, как в CI. Expected: PASS.
- [ ] **Step 4: Регенерация explain SQL** — `cd backend-go && UPDATE_SZPT_EXPLAIN=1 go test ./internal/postgres -run Explain`, затем без env — PASS.
- [ ] **Step 5: Commit** — `git commit -m "test(szpt): phase 3 membership fixture and explain SQL"`.

### Task 8: Проверка правил на живом snapshot

Выполняется после Task 5, до merge PR B.

- [ ] **Step 1: Выборка** — пользователь запускает `ops/postgres/szpt/szpt_members_explain.sql` из ветки PR B на VPS (одноразовый контейнер `postgres:17-alpine` с `--env-file /etc/adilbaga/api.env`, роль API, только чтение), вывод — члены пяти новых групп и состав 25 живых групп (сравнить с выборкой до PR A: не изменился).
- [ ] **Step 2: Разбор** — каждый член: подходит ли по формулировке приказа; ожидаемо `lamb` ~5, `horse-meat` ~2 (только Dina), `fish` 3–4, `black-tea` десятки, `salt` 5–15. Пустая группа → разобрать причину (нет данных или правило) до релиза.
- [ ] **Step 3: Правки** — ложные вхождения и пропуски → правка шаблонов в Task 6 + новые строки в фикстуре Task 7 (имена с прода), повтор Step 1.
- [ ] **Step 4: Commit** — `git commit -m "fix(szpt): phase 3 rules after production check"` (если были правки).

### Task 9: Фронтенд

**Files:**
- Modify: `frontend/src/i18n/kk.json` (`szpt.groups`, `data.category`)
- Test: существующие `frontend/src/lib/szpt.test.ts`, `SzptPage.test.tsx`, `sitemap.test.ts`

- [ ] **Step 1: Строки** — `szpt.groups`: `"lamb": "Қой еті"`, `"horse-meat": "Жылқы еті"`, `"fish": "Балық (тыран, мөңке, көксерке, тұқы, сазан)"`, `"black-tea": "Қара шай"`, `"salt": "Ас тұзы"`; `data.category`: `"salt": "Тұз"`, `"tea-coffee": "Шай және кофе"`, `"fish": "Балық және теңіз өнімдері"`. Иконки не добавляются (новые категории получают корзинку по умолчанию).
- [ ] **Step 2: Тесты** — `cd frontend && pnpm test`. Expected: PASS; если есть тест паритета ключей i18n — он зелёный.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): kk names for phase 3 SZPT groups and categories"`.

### Task 10: PR B, релиз, документы

- [ ] **Step 1: Документы** — `docs/production/SZPT.md`: 30 групп (16 упаковочных, 14 весовых), правило категории `meat.ts`, категории фазы 3, ссылка на спеку и план; `frontend/README.md` «СЗПТ» — если перечисляет группы.
- [ ] **Step 2: Локальный CI** → push → PR B (с согласия пользователя) → CI зелёный → merge.
- [ ] **Step 3: Релиз API** — ручной cutover по `deploy/README.md`, точка отката — активный релиз. Smoke: `GET /api/szpt` → группы `lamb`, `horse-meat`, `fish`, `black-tea`, `salt` есть (или известная причина отсутствия из Task 8); `GET /api/szpt/fish/products` → 200, `defaultSort = unit_price_asc`; `GET /api/szpt/rice/products` → как до релиза.
- [ ] **Step 4: Сброс кэша фронтенда** — `/usr/local/sbin/adilbaga-revalidate-frontend`; проверить `/ru/szpt/lamb`, `/ru/szpt/fish`, `/kk/szpt/salt`, `/ru/catalog` (новые разделы), подзаголовок «30 групп…».
- [ ] **Step 5: Закрытие** — «Current release» в `deploy/README.md`, отчёт `docs/production/reports/SZPT_PHASE3_RELEASE_REPORT.md`, память (`szpt-state`, релиз API; заметка: проверка `price_history` 2026-12-01 — строк больше ~4 800 из-за новых категорий).
