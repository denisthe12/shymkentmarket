# Регулярный sync цен (systemd)

Два таймера:

- `aktau-sync.timer` запускает `pipeline/scripts/daily-sync.sh` дважды в день: 06:00 и 18:00 по Актау (`01:00` и `13:00` UTC). Три скрапера идут параллельно, затем sync по словарю и ingest с публикацией snapshot. Занимает около 4 минут (замер 2026-10-13): критический путь — HTML-скрапер Dana (~3,7 мин, не менялся; переход на JSON-адаптер — следующая задача, spec §6), Dina и Fix Price — по ~22 с. Лимит юнита `TimeoutStartSec=20min`; каждый скрапер дополнительно ограничен `SCRAPE_TIMEOUT_SEC` (по умолчанию 720 с): зависший скрапер убивается и считается упавшим (сеть берётся из прошлого файла, exit 3), остальные сети публикуются.
- `aktau-sync-full.timer` запускает `pipeline/scripts/weekly-full-scrape.sh` раз в неделю: воскресенье 22:00 UTC (понедельник 03:00 по Актау). Это полный скрап каталога (`SCRAPE_ALL=1`) **без публикации**: ingest не запускается. Лимит `TimeoutStartSec=2h`.

Ingestion не входит в API-релиз (`deploy/`) и ставится отдельно.

## Коды выхода ежедневного прогона

| Код | Значение | Статус юнита |
|---|---|---|
| `0` | все три скрапера удачны, snapshot опубликован | `SUCCESS` |
| `1` | ошибка sync/ingest или упали все три скрапера; snapshot не опубликован, на сайте остаются прошлые цены | `failed` |
| `3` | snapshot опубликован, но хотя бы одна сеть взята из прошлого удачного файла (не старше `SYNC_MAX_SOURCE_AGE_HOURS`, 36 ч); в журнале строка `[sync] stale stores: <список>` | `failed` |
| `4` | snapshot опубликован, но очистка старых snapshot упала; в stderr строка `[sync] retention failed`. Если одновременно есть устаревшая сеть, итоговый код `3` | `failed` |

Код `3` намеренно даёт `failed` (в юните нет `SuccessExitStatus`), чтобы проблема со скрапером была видна, хотя сайт обновился.

Еженедельный прогон: `0` — всё удачно, любой ненулевой код — упал скрапер (тогда `scope` и `sync` не запускаются), `scope:dina`/`scope:dana` или `sync`. Упавший scope-шаг `sync` не пропускает: `unmapped.json` обновляется, а в конце в журнале `[full] failed scope steps: <список>` и код 1.

## Требования на VPS

- checkout репозитория в `/opt/aktau-sync`, Node + pnpm (`pnpm install --frozen-lockfile` в `pipeline/`), Go (ожидается в `/usr/local/go/bin`, иначе поправьте `PATH` в юнитах; `Node` и `pnpm` должны быть в `/usr/local/bin` или `/usr/bin`);
- системный пользователь `aktau-sync` с доступом на чтение/запись в `/opt/aktau-sync/data` (и на чтение репозитория; запись в `.git` нужна для обновления кода, см. ниже);
- без `GEMINI_API_KEY*` — sync не использует LLM;
- каталог `/opt/aktau-sync` отдельный: на production-VPS `/opt/adilbaga` занят `compose.production.yml` боевого Go API, туда sync не кладётся и API не затрагивается;
- у production-VPS нет IPv6, поэтому `INGEST_DATABASE_URL` указывает на Supabase **session pooler** (порт 5432; логин вида `aktau_ingest_runtime.<project_ref>`), а не на прямой хост `db.<project_ref>.supabase.co` (только IPv6). Порт 6543 (transaction pooler) не использовать.

## Установка

```bash
sudo cp ops/sync/aktau-sync.service ops/sync/aktau-sync.timer \
        ops/sync/aktau-sync-full.service ops/sync/aktau-sync-full.timer /etc/systemd/system/
sudo install -m 600 -o aktau-sync ops/sync/aktau-sync.env.example /etc/aktau-sync.env
sudoedit /etc/aktau-sync.env     # заполнить INGEST_DATABASE_URL и REVALIDATE_HMAC_SECRET; FIXPRICE_* уже заданы
sudo systemctl daemon-reload
sudo systemctl enable --now aktau-sync.timer aktau-sync-full.timer
```

Еженедельный юнит читает тот же `/etc/aktau-sync.env`, но ему нужны только `FIXPRICE_*` (скрапер Fix Price); `INGEST_*` и `REVALIDATE_*` он не использует.

## Обновление кода на VPS

Обновлять только на SHA из `main` с зелёным CI. Не запускать во время sync: прогоны идут в 01:00 и 13:00 UTC, полный скрап в воскресенье в 22:00 UTC.

```bash
systemctl is-active aktau-sync aktau-sync-full        # оба inactive
sudo -n -u aktau-sync -H git -C /opt/aktau-sync rev-parse HEAD   # записать для отката
sudo -n -u aktau-sync -H git -C /opt/aktau-sync status --porcelain=v1   # пусто
sudo -n -u aktau-sync -H git -C /opt/aktau-sync fetch --no-tags https://github.com/kiratonine/AdilBaga.git main
sudo -n -u aktau-sync -H git -C /opt/aktau-sync checkout --detach <полный SHA>
cd /opt/aktau-sync/pipeline && sudo -n -u aktau-sync -H env PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin pnpm install --frozen-lockfile
```

PATH должен совпадать с PATH юнита. Откат: те же две последние команды с записанным SHA. Миграции БД и API выкатываются отдельно до обновления sync.

## Хранение snapshot

После публикации `daily-sync.sh` вызывает `go run ./cmd/prune -keep N -apply` и удаляет опубликованные snapshot старше последних `N` (по умолчанию 14) вместе с их `source_runs`, `raw_products`, `product_mappings` и `offers`. Переменные в `/etc/aktau-sync.env`:

- `RETENTION_DATABASE_URL` — строка подключения роли `aktau_retention_writer`-группы (отдельный LOGIN `aktau_retention_runtime.<project_ref>`, session pooler, порт 5432). Пусто или не задано — в журнале `[sync] retention skipped`, очистка не идёт, коды выхода не меняются;
- `RETENTION_KEEP_SNAPSHOTS` — сколько последних snapshot хранить (по умолчанию 14);
- `RETENTION_PRODUCTION_APPLY_CONFIRM=1` — обязательно при `APP_ENV=production`, иначе `cmd/prune -apply` откажется работать.

Ошибка очистки не отменяет уже опубликованный snapshot: журнал получает `[sync] retention failed` в stderr, скрипт завершается кодом `4` (если нет устаревших сетей, иначе `3`).

Установка роли — операция владельца базы, не sync. Порядок: сначала `backend/prisma/security/aktau_ingest_writer_role.sql`, затем `ops/postgres/security/aktau_retention_writer_role.sql` (он создаёт группу `aktau_retention_writer` с правами только SELECT и DELETE на пять snapshot-таблиц; порядок важен, потому что ingest-скрипт ожидает ровно 6 политик). Затем владелец вручную создаёт LOGIN-роль `aktau_retention_runtime`, входящую в группу (`GRANT aktau_retention_writer TO aktau_retention_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`), с паролем, который задаёт человек (пароль не хранится в репозитории и в чат не передаётся), и кладёт строку подключения только в `/etc/aktau-sync.env` (chmod 600). Откат доступа: `ops/postgres/security/rollback_aktau_retention_writer_access.sql`.

## Эксплуатация

```bash
systemctl list-timers 'aktau-sync*'      # ближайшие запуски обоих таймеров
sudo systemctl start aktau-sync          # ручной запуск ежедневного прогона
sudo systemctl start aktau-sync-full     # ручной запуск полного скрапа (долгий, без публикации)
journalctl -u aktau-sync -n 200          # логи ежедневного прогона
journalctl -u aktau-sync-full -n 200     # логи полного скрапа
systemctl status aktau-sync              # status=0/SUCCESS или failed
```

В журнале каждая строка скрапера помечена сетью (`[dina]`, `[dana]`, `[fixprice]`), а итог сети — строкой `[sync] <сеть> exit=<код> took=<N>s` (`[full] ...` в еженедельном прогоне).

## Результат полного скрапа

Полный прогон пишет в отдельные каталоги и не затирает узкие ежедневные файлы:

- `data/sources-full/*.json` — полные source-файлы сетей;
- `data/sources-full/dina-scope-categories.candidate.json` — **кандидат** нового набора категорий Dina (его пересчитывает `pnpm scope:dina`);
- `data/sources-full/dana-scope-sections.candidate.json` — **кандидат** набора подразделов Dana (`pnpm scope:dana`; завершается с кодом 1, если у товаров scope нет подраздела, тогда еженедельный прогон падает, а кандидат всё равно записан для разбора);
- `data/sync-full/unmapped.json` — товары вне словаря для еженедельной обработки новых товаров.

Кандидат не применяется автоматически. Набор категорий меняется осознанно, вручную, через обычный PR:

```bash
# 1. На машине разработчика, в checkout репозитория на свежем main: забрать кандидат с VPS
git switch -c data/refresh-dina-scope
scp <vps>:/opt/aktau-sync/data/sources-full/dina-scope-categories.candidate.json data/mapping/dina-scope-categories.json
git diff data/mapping/dina-scope-categories.json          # просмотреть изменения набора
git add data/mapping/dina-scope-categories.json && git commit -m "data(mapping): refresh dina scope categories"
git push -u origin HEAD                                    # дальше — PR и мерж в main

# 2. После мержа — выполнить раздел «Обновление кода на VPS» ниже.
```

Кандидат Dana обновляется так же: `scp <vps>:/opt/aktau-sync/data/sources-full/dana-scope-sections.candidate.json data/mapping/dana-scope-sections.json`, ветка `data/refresh-dana-scope`, коммит `data(mapping): refresh dana scope sections`, PR и мерж в `main`, затем отдельный exact-source rollout после readback, не слепой pull на VPS.

Режимы Dana в журнале: `[DANA] mode: sections` (штатный, ~70 с), `legacy root` (нет или устарел scope-файл, ~80 с), `full` (еженедельный). `DANA_CONCURRENCY` по умолчанию 3, максимум 4; при 429/5xx от Dana поставить `1` в `/etc/aktau-sync.env`. Если подраздел пропал с сайта или упал, скрап Dana завершается с ошибкой, прежний файл остаётся, юнит получает exit 3 (stale `dana`).

Не коммитьте прямо в `/opt/aktau-sync`: локальный коммит создаёт неутверждённый source drift, а у пользователя `aktau-sync` нет прав на push.

Разбор ошибок — `docs/data/SYNC_RUNBOOK.md §4`, еженедельный прогон — `§5`.

## История цен по месяцам

Перед удалением старых snapshot `cmd/prune` дописывает в постоянную таблицу `public.price_history` месячные цены; в логе `retention_complete` поле `history_count` — сколько строк добавлено за прогон.

- Цена месяца — первый успешный захват магазина в этом месяце по `capturedAt`; границы месяца считаются в `Asia/Aqtau`.
- Месяц магазина пишется один раз и не меняется. Товар, появившийся позже, попадает в историю со следующего месяца.
- Если запись истории упала, прогон ничего не удаляет, `sync` завершается кодом `4` со строкой `[sync] retention failed`; snapshot при этом опубликован. Снапшоты копятся, пока ошибку не починят.
- Статус сопоставления хранится в `reviewStatus` (`pending` и другие); для аналитики фильтровать по нему.
- Доступ: после миграции `20261107000000_price_history` и после `aktau_retention_writer_role.sql` владелец применяет `ops/postgres/security/aktau_retention_price_history_access.sql` (SELECT и INSERT, без UPDATE/DELETE). Откат в обратном порядке: сначала `rollback_aktau_retention_price_history_access.sql`, затем `rollback_aktau_retention_writer_access.sql`, потому что откат роли ждёт ровно свои 10 прав.
- Разовый импорт из CSV (владелец, одна транзакция, ничего не удаляет и не меняет, повторный запуск строк не добавляет): `psql -X -v ON_ERROR_STOP=1 -f ops/postgres/import-price-history.sql "$DATABASE_URL" < history.csv` (запускать из Git Bash: в PowerShell `< file` не работает).

## Реестр UUID товаров

Таблица `public.product_identities` хранит последний `canonicalProductId` каждого товара магазина. По ней товар, пропавший из снимков на любой срок, при возвращении получает прежний UUID. `cmd/ingest` обновляет реестр в транзакции публикации, `cmd/prune` её не трогает.

- Порядок установки: миграция `20261107000100_product_identities`, затем `ops/postgres/security/aktau_ingest_product_identities_access.sql` (SELECT, INSERT, UPDATE), затем заполнение реестра, и только потом новый код. Новый код без таблицы падает на чтении реестра, старый код её не замечает.
- Откат доступа: сначала `rollback_aktau_ingest_product_identities_access.sql`, затем `rollback_aktau_ingest_writer_access.sql`, потому что откат роли ждёт ровно свои 17 политик.
- Заполнение реестра (владелец, одна транзакция, ничего не удаляет, повторный запуск безопасен): `psql -X -v ON_ERROR_STOP=1 -f ops/postgres/backfill-product-identities.sql "$DATABASE_URL"`. Сначала берутся месячные цены, затем хранимые снимки, потому что они свежее. После отката кода запустить снова перед повторной выкладкой.
