# Надёжная доставка тревог монитора и ежедневный отчёт sync — дизайн

Дата: 2026-11-09. Статус: согласован в чате, ждёт проверки спецификации.

## Зачем

2026-10-24 монитор Go API не смог отправить один ALERT в Telegram (сетевой таймаут) и по своей политике
«одна попытка → ручная сверка» перестал проверять API на 16 дней. systemd показывал успех
(`SuccessExitStatus=1`), никто не заметил. Подробности: `docs/superpowers/reports/2026-11-09-outdated-docs-audit.md`, раздел 3.

Цели (со слов пользователя):

1. При падении API в Telegram обязательно приходит ALERT, после восстановления — RECOVERED, именно в таком порядке.
   Неудачная отправка не должна останавливать монитор.
2. Раз в день приходит отчёт: как отработали прогоны sync, какие сети упали или взяты из прошлого файла,
   и жив ли сам монитор.

Решения пользователя:

- повторять отправку до подтверждения; редкие дубли допустимы, проверки API во время повторов продолжаются;
- дубли смягчаются меткой события и пометкой «повтор» (полностью исключить нельзя: у Bot API нет идемпотентности
  и бот не может прочитать свои сообщения);
- отчёт в 18:30 по Актау (13:30 UTC), покрывает оба ежедневных прогона, по понедельникам — и полный скрап;
- в отчёте: результат каждого прогона по сетям + строка о мониторе; время скраперов, цифры каталога, unmapped — нет;
- данные о прогонах sync пишет сам в файлы (не разбор журнала, не встраивание в монитор).

Не входит: изменение логики скрапа/публикации, новые права доступа к журналу, история инцидентов,
внешний watchdog вне VPS, починка сети/IPv6 VPS (вопрос к хостеру).

## Часть 1. Доставка тревог в мониторе

### Состояние v2

`state.json` (тот же каталог `/var/lib/aktau-monitor/state`, те же требования к правам и каноничности):

```json
{"version":2,"phase":"OK","failures":0,"lastUTC":1794235625249,"queue":[]}
```

Элемент очереди: `{"id":"<32 hex>","type":"incident_opened"|"incident_recovered","atUTC":<ms>,"attempts":<0..>}`.

- `phase`/`failures`/`lastUTC` — как в v1.
- `queue` — неподтверждённые события по порядку возникновения, не больше 10.
- Валидация: типы чередуются по порядку (`opened`, `recovered`, `opened`…); последний элемент согласован с `phase`
  (последний `incident_opened` ⇒ `phase` INCIDENT, последний `incident_recovered` ⇒ `phase` ≠ INCIDENT);
  `atUTC` не убывают и не больше `lastUTC`; `attempts` — целое ≥ 0.
- Перевод из v1 при чтении: `pending: null` → `queue: []`; `pending: {...}` → `queue: [{id,type,atUTC,attempts}]`
  (поля `nextAttemptUTC` и `manualReconciliation` отбрасываются). Запись всегда в v2.

### Прогон (раз в 5 минут)

1. Проверка API выполняется всегда (кроме `clock_discontinuity`), независимо от очереди.
2. Фаза обновляется по прежним правилам (OK → DEGRADED → INCIDENT после двух неудач; INCIDENT → OK при успехе).
   Переход в INCIDENT добавляет `incident_opened` в конец очереди, выход из INCIDENT — `incident_recovered`.
3. Переполнение (> 10): если очередь начинается с `incident_recovered` (его ALERT уже доставлен), удаляется он один;
   иначе удаляются первые два элемента — пара `incident_opened` + `incident_recovered`. Повторять, пока длина > 10.
4. Состояние сохраняется.
5. Отправка: до 2 событий за прогон, с головы очереди. Перед каждой отправкой `attempts++` и сохранение
   (при падении процесса событие уйдёт повторно — согласованный риск дубля). Успех → событие удаляется,
   сохранение, следующее. Неудача → остановка, событие остаётся до следующего прогона.

Вывод: `{"outcome":"OK"|"DEGRADED"|"INCIDENT"|"RECOVERED","reason":"probe_complete"|"probe_unavailable","queued":<n>}`
или `BLOCKED` с прежними причинами. Исходы `PENDING`/`DELIVERED` и причина `delivery_reconciliation_required`
удаляются. Коды выхода: 0 — OK/RECOVERED, 1 — DEGRADED/INCIDENT, 2 — BLOCKED (как сейчас).
`RECOVERED` выводится в прогоне, где зафиксировано восстановление, независимо от доставки.

### Сообщения Telegram

```
ALERT — Aktau Market Go API
Сервис недоступен
UTC 2026-11-09T14:47:05Z · событие #3f2a
```

- Время — `atUTC` события (секунды, без миллисекунд); метка — первые 4 hex `id`.
- При `attempts > 1` к первой строке добавляется ` (повтор, попытка N)`.
- RECOVERED — то же с `RECOVERED — Aktau Market Go API` / `Работа восстановлена`.
- Таймаут одной отправки 10 с (было 5). Проверка ответа Telegram прежняя (200, JSON, `ok:true`,
  `message_id`, личный чат с `ADMIN_ID`).

Резервная HTTPS-доставка (`AKTAU_MONITOR_DELIVERY=https`) живёт по тем же правилам очереди, `Idempotency-Key`
= `id` события, таймаут 10 с.

### Юнит монитора

В шаблоне `ops/monitor/systemd/aktau-go-monitor.service`:

- `ExecStart=@NODE24@ --network-family-autoselection-attempt-timeout=2000 @SOURCE_DIR@/scripts/ops/monitor-go-production.mjs --run`
  (на VPS нет IPv6, а ~20% IPv4-соединений с Cloudflare идут с повтором SYN через 1 с; лимит Node 250 мс давал ложные сбои);
- `TimeoutStartSec=90s` (проверка ≤ 50 с + 2 отправки × 10 с).

Остальная песочница без изменений.

## Часть 2. Файлы прогонов sync

- Каталог `RUN_STATUS_DIR`; если переменная пуста или не задана — файлы не пишутся (локальные запуски, тесты по умолчанию).
  В `ops/sync/aktau-sync.service` и `aktau-sync-full.service`: `Environment=RUN_STATUS_DIR=/var/lib/aktau-sync/runs`.
  Скрипт создаёт каталог (`mkdir -p`, 0755), если его нет.
- Имя: `<kind>-<startUTC YYYYMMDDTHHMMSSZ>.json`, `kind` = `daily` | `weekly`. Права 0644.
- Запись атомарная: временный файл в том же каталоге + `mv`.
- Старт: файл со `status:"running"`, `finishedAt:null`, `exitCode:null`.
- `trap EXIT`: перезапись итогом. Убитый прогон остаётся `running`.
- Чистка: после записи итога удаляются файлы сверх 60 самых новых.

Daily:

```json
{"version":1,"kind":"daily","startedAt":"2026-11-09T13:00:01Z","finishedAt":"2026-11-09T13:03:27Z",
 "status":"finished","exitCode":3,"published":true,
 "stores":{"dina":0,"dana":1,"fixprice":0,"anvar":0},"stale":["dana"],"retention":"ok"}
```

- `stores` — код выхода каждого скрапера (`null`, если скрапер не завершился до выхода скрипта).
- `published` — `true`, если `cmd/ingest -apply` завершился успешно.
- `retention` — `ok` | `skipped` | `failed` | `null` (не дошли).

Weekly: `kind:"weekly"`, `stores` с `dina`/`dana`/`fixprice`, `scopeFailed` (список `scope:dina`/`scope:dana`),
`published:false`, без `stale`/`retention`.

Коды выхода и поведение скриптов не меняются; код каждой сети, который сейчас только печатается, сохраняется во
временный файл подоболочки и собирается в JSON.

## Часть 3. Ежедневный отчёт

- Скрипт `scripts/ops/sync-report.mjs` в релизе монитора. Юнит `aktau-sync-report.service` (oneshot, `User` монитора,
  `EnvironmentFile=/etc/aktau-monitor/telegram.env`, та же песочница, но без `ReadWritePaths`, флаг Node 2000 мс,
  `TimeoutStartSec=150s`) и таймер `aktau-sync-report.timer` (`OnCalendar=*-*-* 13:30:00 UTC`, `Persistent=true`).
  Шаблоны в `ops/monitor/systemd/`, рендер через `render-monitor-units.mjs` (4 файла вместо 2).
- Входы (только чтение): `/var/lib/aktau-sync/runs/*.json`; `/var/lib/aktau-monitor/state/state.json`
  (читается напрямую и валидируется, без `monitor.lock`; принимает v1 и v2).
- Ожидаемые прогоны за сутки отчёта (окно `[now − 24 h, now]`): daily, стартовавшие около 01:00 и 13:00 UTC
  (допуск: старт в пределах часа после слота). По понедельникам (UTC-дата отчёта) — weekly от воскресенья 22:00 UTC.
- Статусы строк:
  - ✅ daily: `finished`, `exitCode` 0;
  - ⚠️ daily: код 3 (перечислить сети из прошлого файла) или 4 (сбой retention);
  - ❌ daily: код 1 или иной ненулевой; `running` старше 25 минут («не завершился»); файл не найден («прогон не найден»);
  - weekly: ✅ код 0; ❌ иначе, с упавшими сетями и scope-шагами; не найден → ❌;
  - монитор (проверки по порядку): ❌ если `state.json` нет или он не читается; ⚠️ `не запускался с HH:MM`, если `lastUTC`
    старше 15 минут, плюс ` (D <месяц>)`, если дата Актау у `lastUTC` не совпадает с датой отчёта, плюс `, N неотправленных тревог`,
    если очередь не пуста (остановленный монитор не скрывается очередью); свежий `lastUTC` и очередь не пуста →
    ⚠️ `N неотправленных тревог, проверка в HH:MM`; фаза DEGRADED/INCIDENT → ⚠️; иначе ✅ с фазой и временем проверки (по Актау, UTC+5).
- Формат: заголовок `Отчёт Aktau Market · <день> <месяц>` (дата по Актау), затем по строке на прогон и строка монитора;
  время прогонов по Актау. Пример — в разделе «Примеры» ниже.
- Сборка текста — чистая функция `buildReport({ now, runs, monitorState })` без I/O.
- Отправка: функция отправки произвольного текста из `telegram-notifier.mjs` (общая проверка ответа, таймаут 10 с);
  до 3 попыток с паузой 30 с. Все неудачны → выход 1, в журнал фиксированный класс. Без очереди и меток.
- Вывод в журнал: `{"outcome":"SENT"|"FAILED"|"BLOCKED","reason":...,"lines":<n>}`; без текста отчёта и токена.

### Примеры

Вторник (без полного скрапа):

```
Отчёт Aktau Market · 10 ноября
✅ 06:00 — опубликовано, 4/4 сети
✅ 18:00 — опубликовано, 4/4 сети
✅ Монитор API: OK, проверка в 18:27
```

Понедельник (с полным скрапом от воскресенья 22:00 UTC):

```
Отчёт Aktau Market · 16 ноября
⚠️ 06:00 — опубликовано, dana из прошлого файла (скрапер упал)
❌ 18:00 — не опубликовано: сбой публикации (код 1)
✅ Полный скрап (вс 22:00 UTC): 3/3 сети
⚠️ Монитор API: 2 неотправленные тревоги, проверка в 18:27
```

## Код и тесты

| Файл | Изменение |
| --- | --- |
| `scripts/ops/monitor-state.mjs` | v2, перевод из v1, валидация очереди |
| `scripts/ops/monitor-go-production.mjs` | очередь, повторы, вывод `queued`, таймаут HTTPS 10 с |
| `scripts/ops/telegram-notifier.mjs` | метка/пометка повтора, таймаут 10 с, экспорт отправки текста |
| `scripts/ops/sync-report.mjs` (новый) | сборка и отправка отчёта |
| `scripts/ops/render-monitor-units.mjs` | рендер четырёх юнитов |
| `ops/monitor/systemd/*` | флаг Node, 90 с; новые `aktau-sync-report.service/.timer` |
| `pipeline/scripts/daily-sync.sh`, `weekly-full-scrape.sh` | файлы прогонов |
| `ops/sync/aktau-sync.service`, `aktau-sync-full.service` | `RUN_STATUS_DIR` |
| `ops/monitor/README.md`, `ops/sync/README.md`, `docs/production/OBSERVABILITY_ALERT_POLICY.md` | актуальное поведение |
| `scripts/ci/run-checks.mjs` | новый тест в группе `ops` (новых CI-джобов нет) |

Тесты (node:test, без сети и без реального Telegram):

- состояние: перевод v1 (null, pending, pending с `manualReconciliation`), отказ на неверной очереди, каноничность;
- монитор: ALERT → RECOVERED при недоступном Telegram доходят по порядку после восстановления доставки;
  проверки идут, пока очередь не пуста; ≤ 2 отправки за прогон; переполнение выбрасывает старую пару;
  `attempts` сохраняется до отправки; пометка повтора с `attempts > 1`;
- notifier: текст с меткой и пометкой, таймаут 10 с, отправка произвольного текста;
- daily/weekly: файл для каждого исхода из существующей матрицы `daily-sync.test.mjs` + без `RUN_STATUS_DIR` файлов нет
  + чистка до 60;
- отчёт: всё хорошо, сеть из прошлого файла, сбой публикации, прогон не найден, `running` завис, понедельник,
  монитор отстал / с очередью / без состояния; 3 попытки отправки;
- рендер: 4 юнита, `systemd-analyze verify` в существующем lifecycle-тесте.

Перед push — локальный CI (`run-local.mjs`), группы `ops`, `pipeline`.

## Выкатка на VPS (команды вводит пользователь)

Порядок важен: сначала sync начинает писать файлы, потом ставится отчёт.

1. Merge в `main`, зелёный CI. Bundle `main` → VPS (репозиторий приватный).
2. Sync: вне окон прогонов обновить checkout `/opt/aktau-sync` на новый SHA; заменить два юнита из `ops/sync/`,
   `daemon-reload`. Первый прогон после этого создаёт `/var/lib/aktau-sync/runs/`.
3. Монитор: новый релиз `/opt/aktau-monitor/releases/<SHA>` (модули из git-объектов checkout sync, хеши сверить);
   отрендерить 4 юнита; `stop aktau-go-monitor.timer`; скопировать `state.json` в
   `/var/lib/aktau-monitor/quarantine/state.v1-<дата>.json` и проверить `"pending":null` (без `manualReconciliation`);
   поставить 4 юнита; удалить drop-in `aktau-go-monitor.service.d/10-connect-timeout.conf`; `daemon-reload`;
   `systemctl cat aktau-go-monitor.service` — один `ExecStart`, drop-in не осталось.
   Состояние v1 переводится в v2 на первом прогоне. Ручной прогон → ожидается `OK`, `queued:0`; затем `start` таймера.
4. Отчёт: ручной запуск `aktau-sync-report.service` → сообщение в Telegram (до первого прогона обновлённого sync
   слоты покажут ❌ «прогон не найден» — ожидаемо); затем `enable --now` таймера. После первого прогона sync:
   `stat -c '%a %U' /var/lib/aktau-sync /var/lib/aktau-sync/runs` и `sudo -u <пользователь монитора> ls /var/lib/aktau-sync/runs`.
5. Откат: монитор — `stop` таймера, юнит на релиз `4d8e3c0` с прежним drop-in; state v2 старый код не прочитает:
   вернуть именно копию шага 3 (`state.v1-<дата>.json`) или удалить `state.json` (чистый OK); копию с
   `manualReconciliation` или непустым `pending` не возвращать — старый latch вернётся. Проверить `monitor.lock`
   (README, «Recovery / reset», п. 1): старый код после чтения v2 падает, создав lock, и lock остаётся — убрать вручную,
   убедившись, что прогона нет; sync — checkout на прежний SHA и прежние юниты; отчёт — `disable --now` таймера.

## Риски

- Дубль сообщения при потере ответа Telegram — согласован, смягчён меткой.
- Отчёт и монитор на одном VPS: при полном отказе VPS не придёт ни тревога, ни отчёт. Отсутствие отчёта в 18:30 —
  сигнал для человека; внешний watchdog вне рамок.
- Откат монитора на старый код требует ручной работы с состоянием (v2 → v1).
