# Обновление цен Шымкента (`pnpm sync`)

Локальный поток для разработки. Регулярное обновление не использует LLM. Боевое расписание,
серверы и учётные данные Шымкента не активированы и здесь не описываются.

## 1. Поток

```text
pnpm scrape:magnum  →  data/sources/magnum.json
SYNC_STORES=MAGNUM pnpm sync  →  data/sync/bundle.json + data/sync/unmapped.json
go run ./cmd/ingest -bundle data/sync/bundle.json [-apply]  →  новый snapshot
проверка: /api/szpt
```

1. Живой скрап (`pnpm scrape:magnum`, из `pipeline/`) запускается только по явному «да» Owner.
   Для проверок без сети используйте синтетический или уже имеющийся локальный `magnum.json`.
2. `SYNC_STORES=MAGNUM pnpm sync` собирает бандл по словарю `data/mapping/dictionary.json`.
   `sync` отказывается работать с отсутствующим файлом источника или файлом старше
   `SYNC_MAX_SOURCE_AGE_HOURS` (по умолчанию 36 ч); для локальной проверки на старом файле
   задайте это значение с запасом, значение по умолчанию в коде не меняется.
3. `cmd/ingest` (каталог `backend-go`) принимает бандл. Сначала dry-run, затем `-apply`, и только
   на **проверенной одноразовой** PostgreSQL: сверьте фактический сервер, базу и роль, а не только
   строку подключения. Строки подключения и пароли нигде не печатать.
4. Проверка результата: `/api/szpt` отдаёт опубликованный snapshot.

Словарь: `data/mapping/dictionary.json`; пополнение — отдельная процедура (часть 2).

`sync` и всё, что он импортирует, не вызывают LLM и не требуют `GEMINI_API_KEY*` (проверяется тестом).

## 2. Если упало

`failureCode` есть в JSON-выводе `cmd/ingest` только при успехе. При ошибке `cmd/ingest` печатает
строку `ingestion_complete` с `error_code` фазы без причины. Повторите dry-run на том же бандле
(read-only), например с `-recluster`: если он проходит и показывает `mergedCanonicalCount` или
`splitCanonicalCount` больше 0, причина — конфликт карточек.

После любого ручного `cmd/ingest -apply` выполните `ANALYZE` по таблицам snapshot, офферов,
карточек, сопоставлений и категорий: ручной apply не запускает retention, а autoanalyze может не
сработать (запросы СЗПТ упираются в `statement_timeout`).

| Код / симптом | Что значит и что делать |
|---|---|
| `required_source_missing` | в бандле нет ни одного товара обязательной сети: проверить `SYNC_STORES` и source-файл |
| `store_count_drop` | товаров сети стало заметно меньше (порог `INGEST_MAX_STORE_DROP_PERCENT`) — проверить источник, не публиковать |
| `canonical_merge_conflict` | словарь менялся (карточки объединены) — разово `cmd/ingest -recluster -apply`, затем `ANALYZE` |
| `canonical_split_conflict` | карточка разделена, две группы претендуют на один прежний ID — разово `cmd/ingest -recluster -apply` |
| `... source file missing` / `... source file is stale` | файла источника нет или он старше лимита — перезапустить скрап (по разрешению Owner) или поднять лимит локально |
| ошибка `sync` или ingest (exit 1) | snapshot не публикуется |
| exit 3 — stale stores | snapshot опубликован, но часть сетей взята из прошлого удачного файла (строка `[sync] stale stores: <список>`) |
| exit 4 — retention failed | snapshot опубликован, очистка старых snapshot или запись месячной истории цен (`public.price_history`) упала: строка `[sync] retention failed`; чаще всего причина в правах роли на `price_history` |

Месячная история цен: `cmd/prune` перед очисткой дописывает цены месяца в `public.price_history`
(`history_count` в логе `retention_complete`); если запись истории упала, ничего не удаляется.
Доступ роли и импорт из CSV — в `ops/sync/README.md`.
