# Аудит устаревшей документации — 2026-11-09

База: `main` 79e2c64 (после PR #106/#107). Проверено 140 Markdown-файлов в Git.
Сверка шла с кодом в этом коммите и с известным состоянием production на 2026-11-08
(API `1cbd535`, откат на `e50de25`; брокер деплоя 7b8f5320; C2 удалён; Анвар — четвёртая сеть;
sync по таймерам 01:00/13:00 UTC и полный скрап по воскресеньям 22:00 UTC; репозиторий приватный).

Документы делятся на две группы:

- **Живые** — README, runbooks, `ops/*`, `deploy/`, `contracts/`, `docs/production/*.md` (кроме `reports/`).
  По ним работают люди, поэтому устаревшее здесь опасно.
- **Исторические** — `docs/production/reports/`, `docs/superpowers/plans|specs`, `docs/context/`,
  `docs/backend-1|2`, `docs/integration`. Они фиксируют момент времени; устаревание для них нормально,
  проблема только в том, что это нигде не помечено.

## 1. Критично: документ ведёт оператора к неверному действию

| Файл | Что написано | Как на самом деле |
| --- | --- | --- |
| `deploy/README.md` («Current release», «First-release rollback») | Активный релиз `e6ef854`; «There is no earlier Go production image», откат = остановить API целиком | Production на `1cbd535` с 2026-11-08, откат на образ `e50de25`. Совет «zero-application rollback» уронит сайт без нужды |
| `docs/runbooks/api-down.md`, `rollback.md`, `secret-rotation.md` | То же: активный `e6ef854`, первый релиз без предыдущего образа | Как выше |
| `docs/production/NETWORK_PERIMETER.md`, `CLOUDFLARE_ACTIVATION_CHECKLIST.md` | Релиз `e6ef854`, «Part16+ NOT STARTED», «Go API remains absent after rollback» | Как выше |
| ~~`ops/sync/README.md` → «Обновление кода на VPS»~~ | ~~`git fetch https://github.com/kiratonine/AdilBaga.git main`~~ | **Исправлено в PR #109 (2026-11-11):** README описывает доставку через git bundle |
| `contracts/README.md` → «Live read-only profile» | «Start the current NestJS with its private local env» | NestJS удалён (#106/#107). Профиль надо запускать против Go API |
| `docs/production/AUTO_DEPLOY_SETUP.md` | «root-owned fixed broker … is **not installed**» (стр. 119); «Compatibility still blocks the e50de253→ffc0bc44 Prisma delta» | Брокер установлен и 2026-11-08 обновлён до 7b8f5320 (PR #104); релиз поиска прошёл. Разделы противоречат друг другу |
| `docs/production/reports/SEARCH_WORD_ORDER_PRODUCTION_DEPLOY_REPORT.md` | Последний раздел на `main`: статус REVIEW_REQUIRED / BLOCKED | Релиз `1cbd535` выполнен ручным cutover. Финальный раздел лежит в локальной ветке `docs/search-release-backend2-20261108` (66c898f), не запушен |
| `docs/superpowers/reports/PRODUCTION_HANDOFF.md` (удаление C2) | G2/G3 `NOT_RUN`, все шаги не отмечены | PR #93 смёржен (eb68773), очистка VPS сделана 2026-11-06. Открыт только G3 (последний натуральный прогон — weekly 2026-11-08 22:00Z) |

## 2. Важно: статус в документе противоречит реальности

**`README.md` (корень)**
- «Frontend branding/SEO … ещё не merged/deployed» (в двух местах) — брендинг Part17 смёржен в PR #25 (9ca1c69) и работает на aktau.market.
- «Part16 signed production verification ещё открыт; Automatic CI/CD Activation остаётся FROZEN / WAITING_FOR_OWNER» — приёмка C2/Part16 отменена 2026-11-05; деплой идёт через брокер с ручным одобрением.
- «backend не обращается к сайтам магазинов. Каталоги были собраны заранее» и схема «одноразовый import» — данные обновляет sync два раза в день плюс еженедельный полный скрап (`ops/sync/`).
- «**3** торговые сети» в списке «Что уже работает», хотя выше перечислены четыре (с Анваром). Остальные числа помечены как исторические, а это — нет.
- Roadmap: «автоматизировать регулярное обновление snapshot» не отмечено, хотя сделано. «Добавить историю изменения цен»: месячная история цен собирается с 2026-11-07 (`price_history`), отметить частично.
- Дерево репозитория не показывает `pipeline/`, `ops/`, `contracts/`, `deploy/`.

**`backend-go/README.md`**
- Заголовок «local-only production candidate» — это production API.
- «Go 1.27.1» в двух местах (стр. 78, 224) — `go.mod` требует 1.27.4 (PR #108); на VPS стоит go1.27.4.
- «Scheduler and external alert delivery **NOT CONFIGURED**» — scheduler sync работает (systemd timers). Про alert delivery см. ниже.
- «Phase A is live audit-only … Production apply and live parity await separate Phase B approval» — Phase B давно применена.

**`docs/production/STAGING_PLAN.md`**: «VPS/domain/Cloudflare not provisioned», «CD is deferred … not auto-deploy main». Всё это существует; «persistent staging not provisioned» по-прежнему верно.

**`docs/production/GITHUB_BRANCH_PROTECTION.md`**: «VPS, domain, Cloudflare … not provisioned», «GitHub execution NOT RUN», поток через `integrate/full-stack`. CI на GitHub работает с сентября, PR идут прямо в `main`. Проверено 2026-11-11 через API GitHub: у `main` **нет защиты ветки вообще** (`branches/main/protection` → 404), а rulesets недоступны (403: приватный репозиторий на бесплатном тарифе). Документ описывает защиту, которой нет: merge в `main` возможен без зелёного CI и без ревью.

**`docs/runbooks/ingestion-failed.md`, `db-down.md`, `redis-down.md`**: разделы «LOCAL NOW / FUTURE VPS», «One-shot ingestion», «no … ingestion scheduler», «ingestion cadence deferred». Ingestion работает по расписанию на VPS; runbook не описывает реальный сбой sync (коды выхода 3/4 из `docs/data/SYNC_RUNBOOK.md`, `journalctl -u aktau-sync`).

**`ops/postgres/README.md`**: «no automatic pruning/deletion now», «Scheduling/pruning … future» — prune идёт после каждого daily (`cmd/prune -keep 14`). Про бэкапы («Scheduler NOT CONFIGURED») всё ещё верно.

**`docs/production/POSTGRES_LAYER.md`**: «Status: **BLOCKED**. NestJS remains the reference/traffic owner» и далее parity Go↔Nest на 849 товарах. NestJS удалён, трафик на Go с октября.

**`ops/cloudflare/README.md`**: «VPS/domain/zone/tunnel absent» — tunnel работает.

**`docs/production/API_V1_CONTRACT.md`**: «NestJS↔Go 200 parity». Теперь эталон — записанные ответы `backend-go/tests/integration/testdata/reference`.

## 3. Сверка с VPS — 2026-11-09 14:30Z (read-only, вывод прислал пользователь)

Подтверждено:

- API: `release.env` и контейнер на `1cbd535`, healthy, 0 рестартов, запущен 2026-11-08 15:24Z; live/ready 200. Образ `e50de25` для отката на месте; всего хранится 9 образов (от `695f7e3` до `1cbd535`).
- Брокер деплоя: `auto_broker.py` = 7b8f5320…; файла RUNNING нет; evidence релиза поиска в `/var/lib/adilbaga/evidence/2026-11-08-search-release`.
- Sync: checkout `/opt/aktau-sync` на `4d8e3c0`, чистый; remote — **https GitHub** (при приватном репозитории `fetch` не сработает, подтверждает пункт про `ops/sync/README.md`). Отличие от `main` в `pipeline/` — только комментарии.
- Расписание: daily 06:00/18:00 +05 (01:00/13:00 UTC), weekly Пн 03:00 +05 (Вс 22:00 UTC) — совпадает с `ops/sync/README.md`. Все прогоны за 36 ч: четыре сети `exit=0`; weekly 2026-11-08 22:00Z завершился успешно. Строк `retention failed/skipped` нет — retention работает.
- C2: каталоги и юниты C2/promotion отсутствуют, drop-in у sync-юнитов пусты. `PRODUCTION_HANDOFF.md` можно закрывать (G3: weekly прошёл; дневные прогоны 06–07.11 по памяти сессий).
- Бэкапы БД по расписанию не настроены (из таймеров только системный `dpkg-db-backup`) — фраза в `ops/postgres/README.md` про бэкапы верна.

Опровергнуто — документы устарели:

- **Монитор включён, а не «ACTIVATION_PENDING».** `aktau-go-monitor.timer` active и enabled, каждые 5 минут; `/etc/aktau-monitor/telegram.env` есть с 2026-10-20. Значит `ops/monitor/README.md` («source candidate», «monitor INACTIVE») и `OBSERVABILITY_ALERT_POLICY.md` («External alert delivery NOT CONFIGURED») неверны.

**Операционная проблема (не документация):** каждый запуск монитора выдаёт
`{"outcome":"PENDING","reason":"delivery_reconciliation_required"}`. По `ops/monitor/README.md`
(стр. 90–94) это значит: одно событие не удалось доставить в Telegram, три автоматические попытки
исчерпаны, и **пока событие не сверено вручную, монитор не проверяет API вообще**. systemd при этом
пишет «Deactivated successfully», так что со стороны всё выглядит зелёным. Нужно выяснить, с какого
момента это длится и какое событие висит, затем провести сверку по разделу Recovery в `ops/monitor/README.md`.

Уточнение по журналу за 30 дней: последний настоящий прогон — 2026-10-24 19:10Z (`DEGRADED probe_unavailable`),
с 2026-10-24 19:16Z подряд идёт только `PENDING` (4537 запусков, ~15,8 суток). До этого: 1363 OK, 43 DEGRADED,
1 INCIDENT, 1 RECOVERED. То есть **API не мониторится с 25 октября**; релизы `49f6823`, `e50de25` и `1cbd535`
выкатывались без работающего монитора. Состояние монитора — `/var/lib/aktau-monitor/state` (из `ReadWritePaths` юнита).

Зависшее событие: `incident_opened` от 2026-10-24T19:15:47.441Z, `attempts: 1`, `manualReconciliation: true`,
фаза INCIDENT. Файла `monitor.lock` и `.pending-*` нет (не крэш, а штатная блокировка после неудачной отправки).
Предыдущая пара INCIDENT/RECOVERED (2026-10-20 06:00/06:05Z) доставлена. `api.telegram.org` с VPS сейчас
доступен (HTTP 302 за 0,5 с). Код монитора на VPS (`00c2bd6`) совпадает с `main` по трём модулям.

Сверка с чатом (пользователь, 2026-11-09): последнее сообщение бота — RECOVERED от 2026-10-20T06:05:51.814Z.
ALERT от 2026-10-24 19:15Z **не доставлен**; неоднозначности нет, повторная отправка устаревшего ALERT не нужна.
Решение: снять блокировку (оригинал `state.json` сохраняется в `/var/lib/aktau-monitor/quarantine/`), следующий
прогон отправит RECOVERED.

Выполнено 2026-11-09 ~14:36Z: блокировка снята через `openState().save()` (pending=null, фаза INCIDENT), копия
оригинала sha256 `4a5e1920…d104`. Ручной прогон дал `INCIDENT / probe_unavailable`, таймер остановлен.

Причина ложных срабатываний (диагностика 14:39–14:45Z): на VPS нет IPv6-маршрута, а DNS отдаёт для
`api.aktau.market` (и `api.telegram.org`) и AAAA. Node 24 перебирает адреса с лимитом 250 мс на попытку
(`autoSelectFamily`). TCP-соединение с Cloudflare по IPv4 обычно 78 мс, но в 2 из 10 замеров 1,08–1,37 с
(повтор SYN). Если обе IPv4-попытки попадают на повтор, запрос падает с `transport` за ~0,5 с. Отсюда 43
DEGRADED, оба INCIDENT и, вероятно, и неудачная отправка в Telegram 24.10. API при этом был доступен.
Исправление: `--network-family-autoselection-attempt-timeout=2000` для node монитора; отдельно — потери SYN
на сети VPS и отсутствие IPv6.

Вторая причина (14:50Z): после drop-in с флагом сеть проходит, но `dashboard` падает по `schema`. Релиз
монитора на VPS — `00c2bd6` (2026-10-20); его `verify-go-production.mjs` знает только `DINA/DANA/FIX_PRICE`.
С выходом Анвара (2026-11-05) в dashboard есть `ANVAR`, и проверка падает всегда. Исправлено в `main` коммитом
1b02acd (2026-11-05), но на VPS не выкатили. Тот же скрипт с `main` из Windows даёт PASS. Значит, даже без
блокировки монитор с 05.11 сообщал бы о ложном инциденте. Обновление: новый релиз монитора из `4d8e3c0`
(уже в checkout sync; все 4 модуля совпадают с `main`).

Выполнено 14:46–14:47Z: релиз `/opt/aktau-monitor/releases/4d8e3c0…` (4 файла, хеши = `main`), drop-in
`/etc/systemd/system/aktau-go-monitor.service.d/10-connect-timeout.conf` (WorkingDirectory + ExecStart с флагом
2000 мс). Проверка API: PASS по всем 5 эндпоинтам. Прогон 14:47:05Z: монитор зафиксировал восстановление, но
отправка RECOVERED заняла ~6 с и упала по таймауту 5 с → снова `PENDING`. Бот и чат исправны (`getMe`/`sendChatAction`
200). Та же отправка тем же кодом вручную: `accepted:true` за 560 мс. Вывод: Telegram-доставка рвётся из-за тех же
сетевых задержек VPS, а политика «одна попытка → ручная сверка» превращает любой такой сбой в полную остановку монитора.

Итог 2026-11-09 ~14:55Z: RECOVERED получен в чате (UTC 14:47:05.249Z), блокировка снята, ручной прогон
`OK / probe_complete`, таймер `aktau-go-monitor.timer` снова active. Монитор работает на релизе `4d8e3c0` с drop-in.

Открыто:
- drop-in существует только на VPS: флаг `--network-family-autoselection-attempt-timeout=2000` и переход на новый
  релиз надо отразить в `scripts/ops/render-monitor-units.mjs` / `ops/monitor/README.md`;
- любая следующая неудачная отправка в Telegram снова молча остановит монитор (`SuccessExitStatus=1`, PENDING без
  проверок API). Нужна либо повторная попытка/увеличенный таймаут для Telegram, либо видимый сигнал о PENDING;
- потери SYN (~2 из 10 соединений с повтором через 1 с) и отсутствие IPv6 на VPS — вопрос к хостеру.

### 3a. Повторная сверка с VPS — 2026-11-11 ~11:22Z (read-only, после выкатки PR #109)

Без изменений с 09.11 (пункты разделов 1–2 про релиз и брокер в силе):

- API на `1cbd535`, healthy, 0 рестартов, запущен 2026-11-08 15:24Z; live/ready 200; `cloudflared` active.
  Образ `e50de25` для отката на месте, всего 9 образов (`695f7e3` … `1cbd535`).
- Брокер `auto_broker.py` = 7b8f5320 (и в `/usr/local/lib/adilbaga-deploy/`, и в checkout sync); RUNNING нет;
  последний evidence — `2026-11-08-search-release`.
- Расписание: daily 01:00/13:00 UTC, weekly Вс 22:00 UTC. Бэкапов БД по расписанию нет (только `dpkg-db-backup`).
- C2 нет (совпадение `/etc/rc2.d` в выводе — ложное, это каталог runlevel).

Изменилось — выкатка PR #109 выполнена 2026-11-11 ~11:15Z:

- Checkout sync `/opt/aktau-sync` на `ae69e01` (merge #109). Go на VPS — 1.27.4.
- Sync-юниты получили `RUN_STATUS_DIR=/var/lib/aktau-sync/runs`. Каталога `runs` пока нет — это ожидаемо: после
  выкатки sync ещё не запускался; каталог создаст первый прогон (13:00Z) через `StateDirectory=aktau-sync`.
- Монитор: юнит указывает на релиз `ae69e01` с флагом 2000 мс и `TimeoutStartSec=90s`; временный drop-in снят
  (копия в `quarantine/10-connect-timeout.conf.20261111`). Состояние v2: `phase OK, failures 0, queue []`.
  Резервная копия v1 перед выкаткой — `quarantine/state.v1-20261111.json`.
- Таймер `aktau-sync-report.timer` enabled, первый запуск 13:30Z сегодня.
- На VPS оставалась временная ссылка `refs/tmp/release` → `4d8e3c0` (от прошлой выкатки) — удалена, см. ниже.

Закрыто этим релизом: пункты «Открыто» из раздела 3 про drop-in и про остановку монитора после неудачной
отправки; устаревшие формулировки в `ops/monitor/README.md`, `OBSERVABILITY_ALERT_POLICY.md` и `ops/sync/README.md`.
Остаётся: потери SYN и отсутствие IPv6 на VPS — вопрос к хостеру.

Журналы (`sudo journalctl`, тот же день):

- Sync: все пять daily-прогонов с 2026-11-09 01:00Z по 2026-11-11 01:00Z — четыре сети `exit=0` (dina 28–54 с,
  fixprice 42–51 с, dana 94–125 с, anvar 142–148 с); после каждого `retention_complete success`, `kept 14, deleted 1`.
- Монитор за 2 суток: 523 `OK`, 2 `INCIDENT` и 40 `PENDING`. 40 PENDING × 5 мин ≈ 3,3 ч — это хвост блокировки
  09.11 до ручной разблокировки в 14:36Z; 2 INCIDENT — ручные прогоны 09.11 до установки флага. После 14:55Z 09.11
  только `OK`: ложных срабатываний с флагом 2000 мс не было.
- Отчёт: ручной запуск при выкатке 2026-11-11 11:17Z → `SENT`, 4 строки.
- `refs/tmp/release` удалена пользователем после сверки.

Не проверено: аналитика во `frontend/README.md` («source candidate») — код есть, включена ли в Vercel Production, видно только в настройках Vercel.

## 4. Исторические документы со ссылками на удалённый код

Ожидаемо устарели, но нигде не помечены как исторические. Автоматическая сверка путей нашла ссылки на несуществующие файлы:

- `docs/00_TECHNICAL_SPEC.md`, `docs/01_RISKS_AND_DECISIONS.md` — модули NestJS `backend/src/modules/*`. **README ссылается на них как на основную документацию.**
- `docs/05_BACKEND_2_IMPLEMENTATION_PLAN.md`, `docs/BACKEND_2_AGENT_AUDIT_INSTRUCTION.md`, `docs/backend-2/*`, `docs/integration/*` — `backend/scripts/*`, `backend/prisma/seed.ts`, скраперы в `backend/src`.
- `docs/data/SCRUM-7_HANDOFF_AGENT.md` — «ветка не запушена», PR в `integrate/full-stack`, `scripts/daily-sync.sh` (теперь `pipeline/scripts/`), `backend/src/dashboard/basket-config.ts`.
- `docs/data/DEMO_BASKET_PLAN.md` — `backend/src/dashboard/basket-calculator.ts` (Nest).
- `docs/context/09_FRONTEND_HANDOFF_FOR_BACKEND.md` — «удалить `frontend/vercel.json`», уже сделано.
- `docs/production/PART_17_FRONTEND_HANDOFF.md` — `scripts/revalidation/*` нет в репозитории.
- `docs/PRODUCTION_ROADMAP_AKTAU_MARKET.md` — «финальное название бренда фиксируется до …» (зафиксировано), 17 упоминаний NestJS.
- `docs/production/PERFORMANCE_BASELINE.md` — 3 сети / 849 товаров; замеры до Анвара и до роста каталога до ~4200 товаров.

## 5. Рекомендации

1. **Одно место для текущего релиза.** Держать SHA активного API и цель отката только в `deploy/README.md`; runbooks, NETWORK_PERIMETER и checklist должны ссылаться туда, а не копировать SHA. Сейчас одна и та же устаревшая строка размножена в шести файлах.
2. Довести до `main` финальный раздел отчёта о релизе поиска (ветка `docs/search-release-backend2-20261108`).
3. ~~Переписать процедуру обновления VPS в `ops/sync/README.md` под приватный репозиторий.~~ Сделано в PR #109.
   Вместо этого: переписать `docs/production/GITHUB_BRANCH_PROTECTION.md` под фактическое состояние (защиты нет) или
   решить, как защищать `main` (GitHub Pro / публичный репозиторий / договорённость «merge только при зелёном CI»).
4. Убрать NestJS из `contracts/README.md`, `POSTGRES_LAYER.md`, `API_V1_CONTRACT.md`.
5. Почистить статусы в корневом README и `backend-go/README.md` (брендинг, CI/CD, sync, 4 сети, roadmap, версия Go).
6. Добавить `docs/README.md` с картой документации: что живое, что исторический отчёт. В шапку исторических файлов — одну строку «Исторический документ, состояние на <дата>».
7. Закрыть C2 в `PRODUCTION_HANDOFF.md` после итогов G3.

## 6. Исправлено 2026-11-11 (ветка `claude/docs-refresh-20261111`)

- Текущий релиз и откат: `deploy/README.md` — единственное место с SHA (`1cbd535`, откат `e50de25`, список образов,
  брокер); откат на прежний образ вместо «zero-application», который остался как крайняя мера («Emergency stop»).
  Runbooks `api-down`, `rollback`, `secret-rotation` ссылаются туда и больше не копируют SHA.
- `NETWORK_PERIMETER.md`, `CLOUDFLARE_ACTIVATION_CHECKLIST.md`, `ops/cloudflare/README.md`: статусная пометка в шапке.
  Строки «Go API: NOT DEPLOYED» оставлены: их требует `scripts/network/verify-part14.mjs`.
- `AUTO_DEPLOY_SETUP.md`: брокер 7b8f5320 установлен, `AUTO_DEPLOY_ENABLED=false` (деплой-джоба не запускается).
- Финальный раздел отчёта о релизе поиска перенесён из ветки `docs/search-release-backend2-20261108` (два коммита).
- `PRODUCTION_HANDOFF.md` (C2): итог G1–G3 и что осталось (Jira, удаление копии после 2026-12-06).
- NestJS убран из `contracts/README.md`, `API_V1_CONTRACT.md`; `POSTGRES_LAYER.md` помечен историческим.
- `GITHUB_BRANCH_PROTECTION.md` переписан под факт: защиты `main` нет; `STAGING_PLAN.md` обновлён.
- Корневой README: брендинг в production, sync 2×/день, цифры каталога с API (4 184 товара, 4 сети, 9 категорий),
  дерево репозитория, roadmap, раздел «Документация». `backend-go/README.md`: production API, Go 1.27.4, scheduler,
  монитор, Phase B.
- Runbooks `ingestion-failed`, `db-down`, `redis-down`: разделы «FUTURE VPS» заменены реальной эксплуатацией
  (коды выхода sync, журнал, отчёт).
- `ops/postgres/README.md`: разведены очистка бэкапов (нет) и retention snapshot в БД (есть).
- `ops/sync/README.md`, `docs/data/SYNC_RUNBOOK.md`: четыре сети в ежедневном прогоне, `SYNC_STORES` по умолчанию с Анваром.
- `docs/README.md`: карта живых и исторических документов; в 23 исторических файла добавлена пометка в шапке.

Не исправлялось: `frontend/README.md` (аналитика — нужен доступ к Vercel); `PERFORMANCE_BASELINE.md` только помечен
историческим, новых замеров нет.
