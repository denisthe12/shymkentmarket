# СЗПТ — социально значимые продовольственные товары

Живой документ: как устроен раздел СЗПТ в production и что трогать при изменениях.
Проектирование и история — в исторических документах: spec/plan
[фазы 1](../superpowers/specs/2026-11-12-scrum-25-szpt-design.md) (SCRUM-25) и
[фазы 2, весовые товары](../superpowers/specs/2026-11-14-szpt-weighted-design.md),
[фазы 3, соль, чай, рыба, баранина, конина](../superpowers/specs/2026-11-15-szpt-phase3-salt-tea-fish-design.md)
([план](../superpowers/plans/2026-11-15-szpt-phase3-salt-tea-fish.md)),
отчёты о релизах [SZPT_API_RELEASE_REPORT](reports/SZPT_API_RELEASE_REPORT.md) и
[SZPT_WEIGHTED_RELEASE_REPORT](reports/SZPT_WEIGHTED_RELEASE_REPORT.md).

## Что видит пользователь

Страницы `/{lang}/szpt/<group>` на aktau.market (`/{lang}/szpt` ведёт на первую группу):
товары группы из текущего snapshot с ценой упаковки и ценой за единицу (кг, л или 10 шт.),
фильтр по фасовке и сортировка по цене или цене за единицу. Фронтенд: `frontend/README.md` → «СЗПТ».

## Группы

30 групп покрывают все 31 позицию перечня СЗПТ (приказ МТИ РК от 23.12.2025 № 362-нқ; «Говядина» —
за две позиции), порядок фиксирован. Фаза 3 добавила `lamb`, `horse-meat`, `fish`, `black-tea`, `salt`
(API e9e4543 с 2026-11-16, [отчёт](reports/SZPT_PHASE3_RELEASE_REPORT.md)). Подзаголовок раздела говорит «все 31
позиция» только когда API отдаёт все 30 групп (`SZPT_ALL_GROUPS` в `frontend/src/lib/szpt.ts`).

- упаковочные (16): `rice`, `buckwheat`, `sour-cream`, `cottage-cheese`, `cheese`, `milk`, `kefir`,
  `sunflower-oil`, `eggs`, `butter`, `flour`, `bread`, `pasta-horns`, `sugar`, `black-tea`, `salt`;
- весовые (14, берут и товары на развес, сортировка по умолчанию — цена за кг): `potatoes`,
  `carrots`, `onions`, `cabbage`, `tomatoes`, `cucumbers`, `apples`, `beef`, `minced-meat`,
  `lamb`, `horse-meat`, `fish`, `chicken-parts`, `chicken`.

Источники данных фазы 3: каталог публикует категории `salt`, `tea-coffee` и `fish` целиком (с кофе,
какао и всей рыбой). Сырая баранина и конина у Dina лежат в разделах «Готовая еда» и «Полуфабрикаты»;
в `meat` их переносит правило по названию `pipeline/src/mapping/meat.ts` (`refineMeat`, вызывается
из `refineCategory`). Баранина и конина есть только у Dina, рыба указанных видов — у Dina и Анвара.

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
| Категория сырой баранины и конины Dina | `pipeline/src/mapping/meat.ts`, тесты `pipeline/test/meat.test.ts` |
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
