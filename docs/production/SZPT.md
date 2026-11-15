# СЗПТ — социально значимые продовольственные товары

Живой документ: как устроен раздел СЗПТ в production и что трогать при изменениях.
Проектирование и история — в исторических документах: spec/plan
[фазы 1](../superpowers/specs/2026-11-12-scrum-25-szpt-design.md) (SCRUM-25) и
[фазы 2, весовые товары](../superpowers/specs/2026-11-14-szpt-weighted-design.md),
отчёты о релизах [SZPT_API_RELEASE_REPORT](reports/SZPT_API_RELEASE_REPORT.md) и
[SZPT_WEIGHTED_RELEASE_REPORT](reports/SZPT_WEIGHTED_RELEASE_REPORT.md).

## Что видит пользователь

Страницы `/{lang}/szpt/<group>` на aktau.market (`/{lang}/szpt` ведёт на первую группу):
товары группы из текущего snapshot с ценой упаковки и ценой за единицу (кг, л или 10 шт.),
фильтр по фасовке и сортировка по цене или цене за единицу. Фронтенд: `frontend/README.md` → «СЗПТ».

## Группы

25 групп из перечня СЗПТ (подмножество официального списка, приказ 362-нқ), порядок фиксирован.
На 2026-11-15 в API все 25:

- упаковочные (14): `rice`, `buckwheat`, `sour-cream`, `cottage-cheese`, `cheese`, `milk`, `kefir`,
  `sunflower-oil`, `eggs`, `butter`, `flour`, `bread`, `pasta-horns`, `sugar`;
- весовые (11, берут и товары на развес, сортировка по умолчанию — цена за кг): `potatoes`,
  `carrots`, `onions`, `cabbage`, `tomatoes`, `cucumbers`, `apples`, `beef`, `minced-meat`,
  `chicken-parts`, `chicken`.

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
| Проверки на production (только чтение) | `ops/postgres/szpt/offer_price_basis_check.sql` (роль владельца), `ops/postgres/szpt/szpt_members_explain.sql` (роль API, сгенерирован тестом) |

Цена за единицу: `price × 1000 / size` для групп в кг и л, `price × 10 / size` для яиц
(10 шт.); у весового товара — по базе из `offer_price_basis`. В ответе значение округлено
до 2 знаков, сортировка идёт по точному значению.

## Как менять

- **Правило группы** (новый шаблон, исключение ложного товара) — изменение Go-кода. Попадает
  в production только с релизом API (`deploy/README.md`). После cutover обязательно сбросить
  кэш фронтенда (`deploy/README.md` → «Frontend cache flush»), иначе страницы до часа
  показывают старые группы.
- **Правило «на вес»** записано в трёх местах: `offer_price_basis` (миграция),
  `pipeline/src/mapping/weight.ts` и `ops/postgres/szpt/offer_price_basis_check.sql`.
  Менять вместе; изменение представления — новая миграция, применяется вручную до релиза API.
- **Откат API** на релиз до `c7ba31f` оставляет `offer_price_basis` безвредным: старые релизы
  его не читают. Удалять представление — только после такого отката и отдельным решением.
- Новых таблиц и данных СЗПТ в БД нет: группы считаются на лету по текущему snapshot.
