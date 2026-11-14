# СЗПТ, фаза 2: весовые товары и 15 новых групп — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Раздел СЗПТ получает 15 новых групп (итого 25), весовые товары с ценой за кг по пометке сети и сортировку «Выгоднее за кг» по умолчанию в весовых группах.

**Architecture:** Миграция создаёт view `offer_price_basis` (весовое ли предложение и за сколько грамм его цена) поверх `offers ⨝ raw_products ⨝ stores`, API-роль читает только view. Go-правила групп получают флаг `Weighted`; только для таких групп SQL раздела учитывает view, 10 живых групп работают ровно как в фазе 1. Фронт выкатывается первым и совместим со старым API.

**Tech Stack:** PostgreSQL + Prisma migrations, Go (`backend-go`, pgx, chi), OpenAPI (`contracts/`), Next.js + TanStack Query + i18next (`frontend/`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-szpt-weighted-design.md` (читать вместе с планом; фаза 1 — `docs/superpowers/specs/2026-11-12-scrum-25-szpt-design.md`).

## Global Constraints

- 10 живых групп (`rice … butter`) не меняют состав, цену за единицу, порядок по умолчанию (`price_asc`) и URL; view для них не используется.
- Весовой товар входит только в группу с `Weighted: true`; товар без фасовки и без пометки сети не входит никуда.
- Цена за кг весового предложения = `price × 1000 / basisGrams`; округление до 2 знаков half-up только в ответе, сортировка по точному `numeric`.
- `price_asc`: штучные по `min_price`, затем весовые по точной цене за кг, затем `min_price`, затем `id COLLATE "ru-x-icu"`.
- Новые поля API только аддитивные: `Group.defaultSort`, `Product.soldByWeight`, `Offer.soldByWeight`.
- Регулярки `~*` без `\b`, `\m`, `\M`; граница слова — класс `[^а-яё]` (урок SCRUM-19).
- `aktau_api_reader` не получает доступ к `raw_products`; только `SELECT` на `offer_price_basis`.
- Перед каждым push: `node C:/Development/AdilBaga-local-ci/run-local.mjs` (кроме docs-only).
- Команды на VPS вводит пользователь; агент их пишет и проверяет вывод. Не во время sync (01:00 и 13:00 UTC).
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR — строкой `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

- Группа только из весовых товаров: `sizes` в JSON — `[]`, не `null` (сейчас `array_agg` на пустом наборе даёт `NULL`) — тест в Task 3.
- Предложение без строки во view (`LEFT JOIN` дал `NULL`) считается штучным, а не роняет `bool_and` в `NULL` и не выкидывает товар — тест в Task 3.
- Явный `?sort=price_asc` в весовой группе (закладка, переключение в UI) даёт порядок «штучные, затем весовые», а не сортировку группы по умолчанию — тест в Task 5 и Task 7.
- `?size=` в группе с пустым `sizes` → 400; фронт в такой группе не рисует блок фасовки и не шлёт `size` — тест в Task 3 и Task 8.
- Стабильная пагинация смешанной группы при равных ценах (`limit=1` по очереди даёт тот же порядок, что `limit=100`) — тест в Task 3.

## Файлы

PR 1 (API):
- Create `backend/prisma/migrations/20261114000000_offer_price_basis/migration.sql` — view, guard, GRANT/REVOKE.
- Modify `backend/prisma/security/rollback_aktau_api_reader_access.sql` — снять GRANT на view до снятия остального.
- Modify `scripts/ci/postgres.mjs:50`, `backend-go/scripts/local-ingest-db.sh:42` — цепочка миграций.
- Modify `backend-go/internal/szpt/models.go`, `groups.go`, `szpt_test.go` — флаг, новые поля, 15 групп.
- Modify `backend-go/internal/postgres/szpt.go` — членство, цена, сортировка, признак у предложений.
- Modify `backend-go/tests/fixtures/szpt.sql`, `backend-go/tests/integration/szpt_test.go` — фикстура и проверки.
- Modify `backend-go/internal/httpapi/szpt.go`, `szpt_test.go` — сортировка по умолчанию из группы.
- Modify `contracts/openapi.yaml`, `contracts/examples/szpt-groups.json`, `contracts/examples/szpt-products.json`.
- Create `ops/postgres/szpt/offer_price_basis_check.sql` — read-only проверка перед и после миграции.

PR 2 (фронт):
- Modify `frontend/src/api/types.ts`, `api/httpAdapter.ts`, `api/mockAdapter.ts`, `mocks/szpt.json`.
- Modify `frontend/src/lib/szpt.ts`, `components/product/ProductCard.tsx`, `components/product/ProductGrid.tsx`, `views/SzptPage.tsx`.
- Modify `frontend/src/i18n/ru.json`, `i18n/kk.json`; тесты рядом; `frontend/e2e/szpt.spec.ts`.

---

### Task 1: Миграция `offer_price_basis`

Ветка PR 1: `feat/szpt-weighted-api` от `main`.

**Files:**
- Create: `backend/prisma/migrations/20261114000000_offer_price_basis/migration.sql`
- Modify: `backend/prisma/security/rollback_aktau_api_reader_access.sql`
- Modify: `scripts/ci/postgres.mjs:50`, `backend-go/scripts/local-ingest-db.sh:42`
- Modify: `backend-go/tests/fixtures/szpt.sql`
- Test: `backend-go/tests/integration/szpt_test.go`

**Interfaces:**
- Produces: view `public.offer_price_basis("offerId" text, "soldByWeight" boolean, "basisGrams" numeric NULL, "snapshotId" text)` — одна строка на каждую строку `offers`; `"snapshotId"` = снимок предложения (по нему API фильтрует view); `"basisGrams"` не `NULL` тогда и только тогда, когда `"soldByWeight"`.

- [ ] **Step 1: Расширить фикстуру `szpt.sql`**

Добавить: магазин `('fix','FIX_PRICE','Fix Price')`; категории `bread, meat, vegetables, sugar` (slug = id, имена как в проде: «Хлеб и выпечка», «Мясо и птица», «Овощи, фрукты, зелень», «Сахар»); у новых `raw_products` — столбец `"rawPayload"` (у старых строк остаётся `NULL`). Весовые строки для view (id товара → сеть, payload, цена):

| id | Название | Сеть | rawPayload | price | Ожидание view |
|---|---|---|---|---:|---|
| `w-pot1` | Картофель | DANA | `{"priceUnit":"kg"}` | 217 | весовой, 1000 |
| `w-pot2` | Картофель молодой | DINA | `{"price_type":"weight","priceUnit":"kg","pricePerUnitMultiplier":1000}` | 300 | весовой, 1000 |
| `w-cuc1` | ОГУРЦЫ PLU:1231 | DANA | `{}` | 539 | весовой по названию, 1000 |
| `w-cuc2` | Огурцы весовые | DANA | `{}` | 605 | весовой по названию, 1000 |
| `w-chk1` | Цыпленок бройлера KOKO 1.8 кг | DINA | `{"isWeightProduct":true,"priceUnit":"g","pricePerUnitMultiplier":1800}` (+ `attributes {"weightGrams":2}`) | 1480 | весовой, 1800 |
| `w-beef1` | П/ф Мясо говядины н/к СП Анвар (Соц.) | ANVAR | `{"priceUnit":"kg","pricePerUnitMultiplier":1000}` | 2780 | весовой, 1000 |
| `w-mince-w` | Фарш говяжий замороженный | DINA | `{"price_type":"weight","priceUnit":"kg","pricePerUnitMultiplier":1000}` | 4420 | весовой, 1000 |
| `w-mince-p1` | Фарш говяжий GEBA 450 г (`weightGrams` 450) | DANA | `{"priceUnit":null}` | 1098 | штучный |
| `w-mince-p2` | Фарш говядина Мясная лавка 500 г (`weightGrams` 500) | DANA | `{}` | 1964 | штучный |
| `w-mince-p3` | Фарш GEBA говяжий 1 кг (`weightGrams` 1000) | DANA | `{}` | 4600 | штучный |
| `w-mince-x` | Фарш говяжий №1 (без атрибутов) | DINA | `{}` | 4420 | штучный (не входит: нет фасовки) |
| `w-sug-fix` | Сахар-песок Fix 1 кг (`weightGrams` 1000) | FIX_PRICE | `{"priceUnit":"kg"}` | 450 | штучный (FIX_PRICE всегда штучный) |
| `h14` | Сыр Российский Анвар 50% 300 г (`weightGrams` 300, `fatPercent` 50) | ANVAR | `{"priceUnit":"kg","pricePerUnitMultiplier":300}` | 900 | весовой, 300 — но в «Сыре» остаётся штучным |

Также одна весовая строка без предложения в наличии (`inStock=false`) для `potatoes` — `w-pot-out`, Картофель Нет в наличии, DINA weight, 250.

- [ ] **Step 2: Написать падающий подтест `TestDeterministicSzpt/price_basis`**

```go
t.Run("price_basis", func(t *testing.T) {
	// через API-пул (aktau_api_reader): view читается, raw_products — нет
	rows := map[string]struct{ w bool; basis *float64 }{} // offerId → значения из
	// SELECT "offerId","soldByWeight","basisGrams"::float8 FROM offer_price_basis
	// ожидания — таблица Step 1 по offerId этих товаров; у всех штучных basis == nil
	// count(*) FROM offer_price_basis == count(*) FROM offers (админ-соединение)
	// _, err := pool.Exec(ctx, `SELECT 1 FROM raw_products LIMIT 1`) → err != nil (permission denied)
})
```

- [ ] **Step 3: Запустить, убедиться, что падает**

Run: `node C:/Development/AdilBaga-local-ci/run-local.mjs` (группа DB integration).
Expected: FAIL — `relation "offer_price_basis" does not exist`.

- [ ] **Step 4: Написать миграцию**

SQL view — дословно из спеки, часть 1 (регулярка DANA уже с `[а-яa-z]` и `(^|[^a-z0-9_])PLU`). Перед ним — guard-блок `DO $guard$`:
`RAISE EXCEPTION`, если `relforcerowsecurity` у `public.raw_products`, или если `current_user` не имеет `pg_has_role(current_user, relowner, 'USAGE')` на владельца `raw_products` и при этом не `rolsuper`/`rolbypassrls`. После view: `REVOKE ALL ON public.offer_price_basis FROM PUBLIC`; `anon`/`authenticated` — в `DO`-блоке с `to_regrole`, как в `20261107000000_price_history`; `GRANT SELECT ... TO aktau_api_reader` — в `DO`-блоке с `to_regrole('aktau_api_reader') IS NOT NULL`. Комментарий над CASE: «Правило = pipeline/src/mapping/weight.ts isVariableWeight; менять вместе». Такой же комментарий-ссылка добавить в `weight.ts` над функцией.

- [ ] **Step 5: Цепочка миграций и откат доступа**

`scripts/ci/postgres.mjs:50` — добавить `\n20261114000000_offer_price_basis` в конец ожидаемой строки; `backend-go/scripts/local-ingest-db.sh` — строку `run $M/20261114000000_offer_price_basis/migration.sql` после `product_identities`. В `rollback_aktau_api_reader_access.sql` перед `DROP POLICY …` добавить `REVOKE ALL ON public.offer_price_basis FROM aktau_api_reader`, обёрнутый в `IF to_regclass('public.offer_price_basis') IS NOT NULL`.

- [ ] **Step 6: Запустить, убедиться, что проходит**

Run: `node C:/Development/AdilBaga-local-ci/run-local.mjs`
Expected: `TestDeterministicSzpt/price_basis` PASS; остальные подтесты фазы 1 PASS (новые товары не попадают в старые группы, кроме `h14` в Task 3); security-тесты отката PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend-go/tests scripts/ci/postgres.mjs backend-go/scripts/local-ingest-db.sh pipeline/src/mapping/weight.ts
git commit -m "feat(db): offer_price_basis view for weighted SZPT prices"
```

### Task 2: Модель и правила групп

**Files:**
- Modify: `backend-go/internal/szpt/models.go`, `backend-go/internal/szpt/groups.go`
- Test: `backend-go/internal/szpt/szpt_test.go`

**Interfaces:**
- Produces:
  - `Rule.Weighted bool` (`json:"weighted"` — уходит в SQL recordset), `func (r Rule) DefaultSort() Sort` (`UnitPriceAsc` если `Weighted`, иначе `PriceAsc`);
  - `Group.DefaultSort Sort` (`json:"defaultSort"`);
  - `Product.SoldByWeight bool` (`json:"soldByWeight"`), `Offer.SoldByWeight bool` (`json:"soldByWeight"`);
  - `func RoundUnit(exact float64, u Unit) UnitPrice` — half-up до 2 знаков; `PriceOf` выражается через неё;
  - `func PriceOfWeighted(price int, basisGrams float64) UnitPrice` — `RoundUnit(price*1000/basisGrams, Kg)`.

- [ ] **Step 1: Падающие тесты в `szpt_test.go`**

```go
func TestGroupOrder(t *testing.T) // slugs == {"rice","buckwheat","sour-cream","cottage-cheese","cheese","milk","kefir",
	// "sunflower-oil","eggs","butter","flour","bread","pasta-horns","potatoes","carrots","onions","cabbage",
	// "tomatoes","cucumbers","apples","sugar","beef","minced-meat","chicken-parts","chicken"}
func TestWeightedRules(t *testing.T) // Weighted ⇔ slug ∈ {potatoes,carrots,onions,cabbage,tomatoes,cucumbers,apples,
	// beef,minced-meat,chicken-parts,chicken}; у всех Weighted: Unit==Kg, DefaultSort()==UnitPriceAsc,
	// Exclude не содержит константу weighted; у остальных DefaultSort()==PriceAsc
func TestPriceOfWeighted(t *testing.T) // PriceOfWeighted(1480,1800) == {822.22,"kg"}; PriceOfWeighted(539,1000) == {539,"kg"}
```

- [ ] **Step 2: Run** `go test ./internal/szpt/` из `backend-go` → FAIL (нет полей/групп).

- [ ] **Step 3: Реализовать поля и функции** из Interfaces в `models.go`.

- [ ] **Step 4: Добавить 15 правил в `groups.go`** — после `butter`, порядок как в `TestGroupOrder`; slug, имя, категория, `Weighted`, шаблон, исключения и `MinSize` — из таблицы спеки, часть 3 (`SizeKeys: []string{"weightGrams"}`, `Unit: Kg` у всех). Невесовым новым группам добавить `weighted` в `exclude(...)`, как у старых; весовым — нет. Шаблоны — намерение спеки; точные строки подбираются в Task 4 по фикстуре.

- [ ] **Step 5: Run** `go test ./internal/szpt/` → PASS.

- [ ] **Step 6: Commit** `feat(szpt): weighted flag, default sort and 15 new group rules`

### Task 3: SQL раздела — весовые товары

**Files:**
- Modify: `backend-go/internal/postgres/szpt.go`
- Test: `backend-go/tests/integration/szpt_test.go`

**Interfaces:**
- Consumes: Task 1 view; Task 2 `Rule.Weighted`, `Rule.DefaultSort`, `RoundUnit`, `PriceOfWeighted`, новые поля.
- Produces: `ListGroups` заполняет `DefaultSort`, `Sizes` никогда не `nil`; `ListSzptProducts` с `q.Sort == ""` сортирует по `rule.DefaultSort()`; у товаров и предложений заполнен `SoldByWeight`.

- [ ] **Step 1: Падающие подтесты**

```go
t.Run("weighted_membership", ...) // potatoes == {w-pot1,w-pot2} (w-pot-out нет в наличии);
	// cucumbers == {w-cuc1,w-cuc2}; chicken ⊇ {w-chk1}; beef ⊇ {w-beef1};
	// minced-meat == {w-mince-p1,w-mince-p2,w-mince-p3,w-mince-w} (w-mince-x нет: без фасовки и без пометки);
	// cheese ⊇ {h14} и у h14 SoldByWeight=false, UnitPrice={3000,"kg"} (900×1000/300 по фасовке — как в фазе 1)
t.Run("weighted_prices", ...) // w-chk1: UnitPrice {822.22,kg}, Offers[0].UnitPrice {822.22,kg}, SoldByWeight true;
	// w-cuc1: {539,kg}; w-mince-p1: {2440,kg}, SoldByWeight false; MinPrice у весовых — сырой минимум (1480, 539)
t.Run("weighted_sorts", ...) // minced-meat, Sort "" и Sort UnitPriceAsc: p1(2440), p2(3928), w(4420), p3(4600);
	// Sort PriceAsc: p1(1098), p2(1964), p3(4600), w — весовой последним;
	// постранично limit=1 offset=0..3 — тот же порядок
t.Run("weighted_groups", ...) // ListGroups: potatoes {DefaultSort:unit_price_asc, Sizes: []float64{} (не nil), Count:2};
	// minced-meat {Sizes:[450,500,1000], Count:4}; rice.DefaultSort == price_asc; cheese.Count включает h14
t.Run("weighted_sizes", ...) // minced-meat Sizes {450} → только p1; potatoes Sizes {1000} → ErrInvalidQuery
```

- [ ] **Step 2: Run** local CI (DB integration) → FAIL.

- [ ] **Step 3: Переписать `szptMembersSQL`**

Recordset получает колонку `weighted boolean`. В `usable` — `LEFT JOIN public.offer_price_basis b ON b."offerId"=o.id AND b."snapshotId"=$2` и агрегаты `bool_and(coalesce(b."soldByWeight",false)) AS all_weighted`, `min(o.price::numeric*1000/b."basisGrams") FILTER (WHERE b."soldByWeight") AS unit_weight_exact`. В `sized` — `(g.weighted AND u.all_weighted) AS by_weight` (для 10 старых групп всегда `false` → view на них не влияет). Условие `members`: `((NOT by_weight AND size>=min_size) OR by_weight)`; остальные условия — без изменений.

- [ ] **Step 4: Запросы групп, фасовок и товаров**

- groups: `count(*)`, `coalesce(array_agg(DISTINCT size::float8 ORDER BY size::float8) FILTER (WHERE NOT by_weight),'{}')`; в Go `g.DefaultSort = rule.DefaultSort()`.
- sizes: `… WHERE group_slug=$3 AND NOT by_weight`.
- products: фильтр `cardinality($4)=0 OR (NOT by_weight AND size=ANY($4))`; выбрать `by_weight`, `size` как nullable, `unit_exact = CASE WHEN by_weight THEN unit_weight_exact ELSE min_price::numeric*$7::numeric/size END`.
- `szptOrder(s Sort)`: `PriceAsc` → `ORDER BY by_weight ASC, CASE WHEN by_weight THEN unit_exact ELSE min_price END ASC, min_price ASC, id COLLATE "ru-x-icu" ASC`; `UnitPriceAsc` — как в фазе 1.
- `ListSzptProducts`: `if q.Sort == "" { q.Sort = rule.DefaultSort() }`.

- [ ] **Step 5: Признак у предложений**

Каталожный `attachOffers` и его DTO не трогать. Для `rule.Weighted` и страницы с хотя бы одним `by_weight` — отдельный запрос `szptOfferBasisSQL`: `canonicalProductId, store code, "soldByWeight", "basisGrams"` для `snapshotId=$1 AND canonicalProductId = ANY($2)` (view соединяется по `b."offerId"=o.id AND b."snapshotId"=$1`) (тот же `snapshotReader`); сопоставление с `card.Offers` по `(product id, storeCode)`. Цена предложения: весовое → `PriceOfWeighted(o.Price, basis)`, иначе `PriceOf(o.Price, size, rule.Unit)`. `UnitPrice` товара = `RoundUnit(unit_exact, rule.Unit)`. `SoldByWeight` товара = `by_weight`.

- [ ] **Step 6: Run** local CI → PASS, включая подтесты фазы 1 без изменения их ожиданий, кроме `cheese` (+`h14`).

- [ ] **Step 7: Commit** `feat(szpt): weighted members, per-kg prices and sorts`

### Task 4: Регулярки 15 групп на реальных названиях

**Files:**
- Modify: `backend-go/internal/szpt/groups.go`, `backend-go/tests/fixtures/szpt.sql`
- Test: `backend-go/tests/integration/szpt_test.go`

**Interfaces:**
- Consumes: Task 2 правила, Task 3 SQL.

- [ ] **Step 1: Добавить в фикстуру товары (все штучные с фасовкой, если не помечено «вес.» — тогда payload DINA weight)**

| Группа | Входит | Не входит |
|---|---|---|
| flour | Мука Рамазан пшеничная 1/с 2кг Казахстан 1/3; Мука Цесна 1с 1 кг; Мука Granum Первый сорт 2 кг; Мука Каспий 1 сорт 25 кг | Мука Белес Классик в/с 1кг; Мука Белес Домашняя 1 кг; Мука Увелка кукурузная 0.5 кг; Мука Granum экстра 1 кг |
| bread | Хлеб формовой Магаш 400 г; Хлеб Дина городской 400 г; Хлеб Таба 400 г; Хлеб Магаш Столичный 550 г | Хлеб Дина ржаной домашний 400 г; Хлеб Бородинский 400 г; Хлеб Тостовый 840г; Хлеб Сайка (без веса); Хлебцы Здорово цельнозерновые пшеничные 150 г |
| pasta-horns | Макароны Анвар Рожки 400г; Макароны Белес Рожок рифленый 900 г; Макароны Granum Рожки №6 5 кг | Макароны Диетика рисовые рожки 250 г; Макароны Мукатай Перья №1 400 г |
| sugar | Сахар песок 1кг 1/25; Сахар Анвар 1 кг; Сахар-песок Promo 700 г; Сахар Достык 5 кг | Сахар-рафинад Чайкофский 250 г; Сахарная пудра ASYL 200 г; Сахар тростниковый Брауни лайт 500 г; Сахар Азер кусковой 600 г; Сахар ванильный Bakers 8 г |
| carrots / onions / cabbage / tomatoes / apples (вес.) | Морковь столовая; Лук фасованный; Капуста; Помидоры розовые; Яблоки Голден | Морковь по-корейски (вес.); Лук зеленый (вес.); Капуста цветная (вес.); Помидоры черри (вес.); Яблоки сушеные 100 г |
| cucumbers | (Task 3) | Огурцы маринованные 720 г; Огурцы корнишоны (вес.) |
| beef (вес.) | Говядина лопатка без кости охлажденная; Говядина голяшка на кости | Говядина стейк на кости; Язык говяжий АКТАУ ДАРИЯ; П/ф шашлык из говядины; Говядина суповой набор |
| minced-meat | (Task 3) | Фарш куриный Geba 450 г; Фарш на манты (вес.) |
| chicken-parts (вес.) | Голень куриная; Бедро Koko; Окорочка; Четвертина цыпленка-бройлера вес | Голень куриная в маринаде; Окорочка утиные Rikkaus; П/ф Окорочка филе; Крылья куриные |
| chicken (вес.) | Куры Алель; Тушка цыпленка бройлера Коко вес пакет; Цыпленок-бройлер Алель (`weightGrams` 2000, штучный) | Цыплята табака; Куры-гриль; Курица для бульона Жас канат; Филе цыпленка бройлера Коко |

- [ ] **Step 2: Подтест `new_groups_membership`** — для каждой строки таблицы: «входит» ∈ группе, «не входит» ∉ ей (по id). Run → FAIL там, где шаблоны спеки не совпали.

- [ ] **Step 3: Подогнать шаблоны в `groups.go`** до зелёного; при конфликте с намерением спеки (часть 3) — правит тест только если название реально не того вида, иначе шаблон. «Говядина» не должна захватывать «Фарш говяжий» и «люля-кебаб … говяжий»; исключение спеки `кост` сужается до `^кост` — иначе выпадает «Говядина голяшка на кости».

- [ ] **Step 4: Run** local CI → PASS.

- [ ] **Step 5: Commit** `feat(szpt): patterns for flour, bread, horns, sugar, vegetables and meat`

### Task 5: HTTP и контракт

**Files:**
- Modify: `backend-go/internal/httpapi/szpt.go`, `backend-go/internal/httpapi/szpt_test.go`
- Modify: `contracts/openapi.yaml`, `contracts/examples/szpt-groups.json`, `contracts/examples/szpt-products.json`
- Test: `contracts/tests/contract.test.mjs` (существующий прогон примеров)

**Interfaces:**
- Consumes: Task 2 поля, Task 3 `ListSzptProducts` с пустой сортировкой.

- [ ] **Step 1: Падающие тесты `httpapi`**

```go
// parseSzptQuery без sort → q.Sort == "" (раньше PriceAsc); sort=price_asc → PriceAsc; sort=unit_price_asc → UnitPriceAsc
// GET /api/szpt: JSON группы содержит "defaultSort"; у фейкового репо с Sizes []float64{} → "sizes":[]
// GET /api/szpt/potatoes/products: у товара и предложений есть "soldByWeight"
```

- [ ] **Step 2: Run** `go test ./internal/httpapi/` → FAIL.

- [ ] **Step 3: `parseSzptQuery`** — начальное `Sort` пустое; остальное без изменений.

- [ ] **Step 4: Контракт** — `SzptGroup.defaultSort` (`$ref SzptSort`, required), `SzptProduct.soldByWeight` и `SzptOffer.soldByWeight` (boolean, required); описание `sort` у `/api/szpt/{group}/products`: «без параметра — `defaultSort` группы». Примеры: в groups — `potatoes` (`sizes: []`, `defaultSort: unit_price_asc`); в products — один весовой товар (`soldByWeight: true`, `unitPrice {kg}`).

- [ ] **Step 5: Run** `go test ./internal/httpapi/` и local CI (Contracts) → PASS.

- [ ] **Step 6: Commit** `feat(api,contracts): SZPT defaultSort and soldByWeight`

### Task 6: Read-only проверка для релиза, PR 1

**Files:**
- Create: `ops/postgres/szpt/offer_price_basis_check.sql`

- [ ] **Step 1: Написать скрипт** (только `SELECT`, `BEGIN READ ONLY` … `ROLLBACK`), последний опубликованный снимок:
  1. по каждой сети: всего предложений, весовых по правилу view (до миграции правило — inline-выражение из миграции; после — сам view), распределение `pricePerUnitMultiplier`, DANA весовые только по названию;
  2. товары 10 живых групп, у которых все предложения весовые по правилу (slug, имя, цена) — для сведения;
  3. после миграции: `count(*) FROM offer_price_basis` vs `count(*) FROM offers` по снимку;
  4. итоговая строка `STOP` если у DINA, ANVAR или DANA 0 весовых, иначе `GO`.
- [ ] **Step 2: Прогнать на локальной копии дампа** (`C:\Users\ADMIN\aktau-backups\…`, если есть свежая; иначе на CI-фикстуре) и приложить вывод в описание PR.
- [ ] **Step 3: Commit** `chore(ops): read-only check for offer_price_basis`
- [ ] **Step 4: PR 1** — local CI зелёный → push → PR в `main` (описание: спека, план, что на прод не выкатывается до Task 10). После CI → merge по решению пользователя.

### Task 7: Фронт — типы, состояние URL, запросы

Ветка PR 2: `feat/szpt-weighted-frontend` от `main` (после merge PR 1).

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/lib/szpt.ts`, `frontend/src/api/httpAdapter.ts`
- Test: `frontend/src/lib/szpt.test.ts`, `frontend/src/api/httpAdapter.test.ts`

**Interfaces:**
- Produces:
  - `SzptGroupDto.defaultSort?: SzptSort`; `SzptProductDto.soldByWeight?: boolean`; `offers[].soldByWeight?: boolean`;
  - `defaultSortOf(group: SzptGroupDto): SzptSort` — `group.defaultSort ?? 'price_asc'`;
  - `readSzptState(params, group)` — `sort` из `?sort=` если это `price_asc | unit_price_asc`, иначе `defaultSortOf(group)`;
  - `szptParams(state: Pick<SzptState,'sizes'|'sort'>, group: SzptGroupDto)` — `sort` не пишется, только если равен `defaultSortOf(group)`;
  - `toSzptSearchParams(query)` — пишет `sort` всегда, когда он задан.

- [ ] **Step 1: Падающие тесты**

```ts
// readSzptState(new URLSearchParams(''), {..., defaultSort: 'unit_price_asc'}).sort === 'unit_price_asc'
// readSzptState(new URLSearchParams('sort=price_asc'), weightedGroup).sort === 'price_asc'
// readSzptState(new URLSearchParams(''), groupWithoutDefaultSort).sort === 'price_asc'   // старый API
// szptParams({sizes:[], sort:'price_asc'}, weightedGroup).toString() === 'sort=price_asc'
// szptParams({sizes:[], sort:'unit_price_asc'}, weightedGroup).toString() === ''
// toSzptSearchParams({group:'rice', sort:'price_asc'}).get('sort') === 'price_asc'
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/szpt.test.ts src/api/httpAdapter.test.ts` (из `frontend`) → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; `SzptPage` передаёт `group` в `szptParams`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(szpt-ui): group default sort in URL state`

### Task 8: Фронт — карточка весового товара, подзаголовок, i18n, моки

**Files:**
- Modify: `frontend/src/lib/szpt.ts`, `components/product/ProductCard.tsx`, `components/product/ProductGrid.tsx`, `views/SzptPage.tsx`, `i18n/ru.json`, `i18n/kk.json`, `mocks/szpt.json`, `api/mockAdapter.ts`
- Test: `components/product/ProductCard.test.tsx`, `views/SzptPage.test.tsx`, `api/mockAdapter.test.ts`, `lib/szpt.test.ts`

**Interfaces:**
- Consumes: Task 7 типы.
- Produces:
  - `toPerKgCard(product: SzptProductDto): ProductCardDto` — у каждого предложения `price = round(offer.unitPrice.value)`, `oldPrice = oldPrice != null ? round(oldPrice × unitPrice.value / price) : null`; `minPrice` = минимум новых `price`;
  - `ProductCard` prop `soldByWeight?: boolean` — главная цифра и цены сетей с суффиксом `/кг` (`szpt.per.kg`), рядом пометка `szpt.byWeight`, строки `unit-price` и `SavingLine` нет;
  - `ProductGrid`: для `soldByWeight` передаёт `toPerKgCard(product)` и `soldByWeight`.

- [ ] **Step 1: Падающие тесты**

```ts
// toPerKgCard: offers [{price:1480, oldPrice:1600, unitPrice:{value:822.22,unit:'kg'}}] → price 822, oldPrice 889, minPrice 822
// ProductCard soldByWeight: getByTestId('min-price') text '822 ₸/кг'; есть текст 'на развес'; нет 'unit-price'
// ProductCard без soldByWeight — снапшот фазы 1 не меняется
// SzptPage на моках: подзаголовок '5 групп продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).' (5 = групп в моке);
//   группа potatoes: блока «Фасовка» нет, сортировка показывает 'Выгоднее за кг'
// querySzpt(mock minced-meat, 'kg', {sort:'price_asc'}) → весовой последним
```

- [ ] **Step 2: Run** `pnpm vitest run` по этим файлам → FAIL.
- [ ] **Step 3: i18n**
  - ru: `szpt.byWeight` «на развес»; `szpt.subtitle_one/few/many/other` — «{{count}} группа / группы / групп / группы продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).»;
  - kk: `szpt.byWeight` «салмақпен»; `szpt.subtitle` — «ӘМАТ тізімінен {{count}} өнім тобы (ҚР СИМ № 362-нқ бұйрығы).»; `szpt.groups.*` — 15 казахских названий из таблицы спеки, часть 3 (черновик, помечается в PR для носителя).
- [ ] **Step 4: Моки** — в `mocks/szpt.json` группы `potatoes` (`sizes: []`, `defaultSort: unit_price_asc`, 2 весовых товара) и `minced-meat` (2 штучных + 1 весовой, `defaultSort: unit_price_asc`); `querySzpt` ставит `soldByWeight` в конец при `price_asc`, а `size` их отсекает.
- [ ] **Step 5: Реализовать** `toPerKgCard`, проп карточки, сетку, подзаголовок `t('szpt.subtitle', { count: groups.data.length })`.
- [ ] **Step 6: Run** `pnpm vitest run` → PASS; `pnpm lint`, `pnpm typecheck` → без ошибок.
- [ ] **Step 7: Commit** `feat(szpt-ui): weighted product card, group count subtitle, kk names`

### Task 9: e2e и PR 2

**Files:**
- Modify: `frontend/e2e/szpt.spec.ts`

- [ ] **Step 1: Тест** `weighted group shows price per kg`: `/ru/szpt/potatoes` → селект сортировки «Выгоднее за кг», первая карточка содержит «₸/кг» и «на развес», блока «Фасовка» нет; переключение на «Дешевле за упаковку» → URL `?sort=price_asc`.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/szpt.spec.ts` → PASS (старые сценарии тоже).
- [ ] **Step 3: Commit** `test(szpt-ui): e2e for weighted group`
- [ ] **Step 4: PR 2** — local CI → push → PR (описание: совместим со старым API; kk-названия на проверку носителю). Merge → Vercel; проверка `/ru/szpt/rice`, `/kk/szpt/rice`: 10 групп, подзаголовок «10 групп продуктов…», сортировки как раньше, ширина 375 px.

### Task 10: Релиз миграции и API (пользователь на VPS)

- [ ] **Step 1: Дамп** базы прода (тем же способом, что дамп 2026-11-07); путь и sha256 — в отчёт.
- [ ] **Step 2: Проверка до миграции** — `offer_price_basis_check.sql` (до-миграционные блоки). `STOP` → не продолжать, разбирать признаки сетей.
- [ ] **Step 3: Миграция** `prisma migrate deploy` (как `20261107000100_product_identities`): `migrate status` показывает ровно одну неприменённую — `20261114000000_offer_price_basis`. Затем скрипт проверки целиком ещё раз: POST 1 `offers = view_rows`, `view_mismatch = 0`, `post_stop = f`, последняя строка `GO`; `aktau_api_reader` читает view и получает `permission denied` на `raw_products`. `STOP` или расхождение → откат view (API ещё старый, view не читает): `DROP VIEW public.offer_price_basis;`, затем тем же способом и с тем же окружением, что `migrate deploy`, — `pnpm exec prisma migrate resolve --rolled-back 20261114000000_offer_price_basis` (иначе `_prisma_migrations` считает миграцию применённой и следующий `migrate deploy` view не создаст); `migrate status` снова показывает её неприменённой; стоп. После релиза API (Step 5) этот откат — только после отката API на `98427c3`.
- [ ] **Step 4: Гейт латентности (до релиза API).** Новый API соединяет каждый запрос СЗПТ, включая 10 живых групп, с view. Скрипт `ops/postgres/szpt/szpt_members_explain.sql` генерируется тестом `TestSzptExplainScript` из `szptProductsSQL`, `szptOrder` и `szpt.Groups` (тест падает, если файл устарел), то есть это запрос релизного SHA: `EXPLAIN (ANALYZE, BUFFERS)` первой страницы `rice` (живая, `price_asc`) и `potatoes` (весовая, `unit_price_asc`) ровно тем SQL и с теми параметрами, что шлёт API (все правила групп `$1`, последний опубликованный снимок `$2`, `LIMIT 24`), каждый дважды, в транзакции `REPEATABLE READ READ ONLY` с `statement_timeout = 60s` и `ROLLBACK`. Не во время sync (01:00 и 13:00 UTC). Агент кладёт файл и `szpt_members_explain.sql.sha256` из релизного SHA в `~/szpt-release` на VPS (как скрипт проверки в Step 2); `psql` — тот же клиент, что в Step 2. Пользователь вводит на VPS (`b2admin`):

  ```bash
  cd ~/szpt-release && sha256sum -c szpt_members_explain.sql.sha256
  # 1) Базовая линия: текущий API (98427c3), /api/szpt, 5 замеров; медиана time_total — третья строка после sort.
  for i in 1 2 3 4 5; do curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' http://127.0.0.1:8080/api/szpt; done | tee szpt-gate-curl.txt
  sort -k2 -n szpt-gate-curl.txt | sed -n 3p
  # 2) EXPLAIN ролью API: DATABASE_URL из /etc/adilbaga/api.env (на экран не печатается).
  API_DB_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/adilbaga/api.env | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
  psql -X -v ON_ERROR_STOP=1 -f szpt_members_explain.sql "$API_DB_URL" > szpt-gate-explain.txt 2>&1; echo "exit $?"
  unset API_DB_URL
  grep -A2 '^=== Role' szpt-gate-explain.txt
  grep -E '^latest published snapshot|^=== (rice|potatoes)|Execution Time' szpt-gate-explain.txt
  ```

  Ожидаемо: `exit 0`; строка роли — `api_reader = t`, `reads_raw_products = f` (иначе подключились не ролью API — стоп, разобрать); снимок — тот же, что в Step 2; по каждой группе две строки `Execution Time`. **Стоп**, если второе (тёплое) `Execution Time` у `rice` или `potatoes` больше 300 мс **или** больше 3 × медианы `time_total` из шага 1 (секунды × 1000 = мс). При стопе API не выкатывается; view остаётся (старый API её не читает); агент разбирает `szpt-gate-explain.txt` (нет ли прохода `offers`/`raw_products` без фильтра `"snapshotId"`), решение об откате view — у пользователя. Медиана и оба тёплых времени — в отчёт о релизе.
- [ ] **Step 5: Релиз API** ручным путём, как `98427c3`: build-only workflow → артефакт → `scp` → `sha256sum -c` → `docker load` → cutover-скрипт (копия `/root/adilbaga-szpt-hotfix-cutover.sh` с новыми NEW/OLD/binary/backup) в transient unit, авто-откат на `98427c3`. Ручной путь не запускает `PROTECTED_DELTA`; если релиз пойдёт через workflow/broker — сначала отдельный PR с blob-pinned `approvedExceptions` для активного SHA на все изменённые файлы `contracts/` и `backend/prisma/`. Доп. smoke: `/api/szpt` → 200, групп > 10, у `potatoes` (или первой весовой в ответе) `defaultSort = unit_price_asc`; `/api/szpt/rice/products` → 200 и первая страница совпадает с ответом до релиза.
- [ ] **Step 6: Проверка на проде** — число товаров по группам против оценки спеки (±30%), выборка товаров каждой новой группы на ложные вхождения, 3–5 цен за кг против сайтов сетей. Ложные вхождения → hotfix регулярок отдельным PR.
- [ ] **Step 7: Закрытие** — «Current release» в `deploy/README.md`, отчёт `docs/production/reports/SZPT_WEIGHTED_RELEASE_REPORT.md`, память (`search-release-state`, `scrum25-szpt-state`). Комментарий в Jira — по решению пользователя.
