# СЗПТ — социально значимые продовольственные товары

Здесь описан код СЗПТ, унаследованный Shymkent Market. Каталог, поставщики и наличие
цен для Шымкента пока **PLANNED**. Исторические сведения о выкатках и товарах Актау
сохранены в отчётах и материалах проектирования
[фазы 1](../superpowers/specs/2026-11-12-scrum-25-szpt-design.md) (SCRUM-25) и
[фазы 2, весовые товары](../superpowers/specs/2026-11-14-szpt-weighted-design.md),
[фазы 3, соль, чай, рыба, баранина, конина](../superpowers/specs/2026-11-15-szpt-phase3-salt-tea-fish-design.md)
([план](../superpowers/plans/2026-11-15-szpt-phase3-salt-tea-fish.md)),
отчёты о релизах [SZPT_API_RELEASE_REPORT](reports/SZPT_API_RELEASE_REPORT.md) и
[SZPT_WEIGHTED_RELEASE_REPORT](reports/SZPT_WEIGHTED_RELEASE_REPORT.md).

## Что видит пользователь

Код страниц `/{lang}/szpt/<group>` выводит товары группы из опубликованного snapshot
с ценой упаковки и ценой за единицу (кг, л или 10 шт.). Доступны фильтр по фасовке
и сортировка. Унаследованный маршрут `/{lang}/szpt` ведёт на первую группу.

## Группы

В Go заданы 30 групп в фиксированном порядке. Их соответствие 31 позиции перечня
по приказу МТИ РК от 23.12.2025 № 362-нқ описано в историческом отчёте фазы 3.
Подзаголовок интерфейса зависит от того, вернул ли API все 30 групп.
[История фазы 3](reports/SZPT_PHASE3_RELEASE_REPORT.md).

- упаковочные (16): `rice`, `buckwheat`, `sour-cream`, `cottage-cheese`, `cheese`, `milk`, `kefir`,
  `sunflower-oil`, `eggs`, `butter`, `flour`, `bread`, `pasta-horns`, `sugar`, `black-tea`, `salt`;
- весовые (14, берут и товары на развес, сортировка по умолчанию — цена за кг): `potatoes`,
  `carrots`, `onions`, `cabbage`, `tomatoes`, `cucumbers`, `apples`, `beef`, `minced-meat`,
  `lamb`, `horse-meat`, `fish`, `chicken-parts`, `chicken`.

Группа без годных товаров в текущем snapshot в ответ API не попадает.

## Где что лежит

| Что | Где |
| --- | --- |
| Правила групп (категория, ключи размера, минимальная фасовка, include/exclude-шаблоны, жирность, весовая ли) | `backend-go/internal/szpt/groups.go`, тесты `szpt_test.go` |
| Цена за единицу и округление | `backend-go/internal/szpt/models.go` |
| SQL выборки участников группы и страниц | `backend-go/internal/postgres/szpt.go` |
| HTTP | `GET /api/szpt`, `GET /api/szpt/{group}/products` — [OpenAPI](../../contracts/openapi.yaml), [API_V1_CONTRACT](API_V1_CONTRACT.md) |
| Признак «продаётся на вес» и база цены (граммы на цену) | представление `public.offer_price_basis`, миграция `backend/prisma/migrations/20261114000000_offer_price_basis` |
| То же правило при импорте | `pipeline/src/mapping/weight.ts` (`isVariableWeight`) |
| Унаследованные правила для сырой баранины и конины | `pipeline/src/mapping/meat.ts`, тесты `pipeline/test/meat.test.ts`. Источники для Шымкента утверждает Backend 2. |
| Операторские SQL-проверки, справка Backend 2 | `ops/postgres/szpt/offer_price_basis_check.sql`, `ops/postgres/szpt/szpt_members_explain.sql`. Любой локальный запуск требует проверенной одноразовой цели. |

Цена за единицу: `price × 1000 / size` для групп в кг и л, `price × 10 / size` для яиц
(10 шт.); у весового товара — по базе из `offer_price_basis`. В ответе значение округлено
до 2 знаков, сортировка идёт по точному значению.

## Как менять

- **Правило группы** (новый шаблон, исключение ложного товара) — изменение Go-кода. Проверяйте
  группы, фильтры и цены за единицу на синтетических данных. Любое изменение контракта или
  production-релиз требуют отдельного решения Owner.
- **Правило «на вес»** записано в трёх местах: `offer_price_basis` (миграция),
  `pipeline/src/mapping/weight.ts` и `ops/postgres/szpt/offer_price_basis_check.sql`.
  Изменения этого правила и представления требуют согласования с Backend 2 и проверки совместимости.
- Новых таблиц и данных СЗПТ в БД нет: группы считаются на лету по текущему snapshot.
