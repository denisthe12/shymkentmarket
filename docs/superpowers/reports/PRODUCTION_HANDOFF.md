# Production handoff — C2 removal, administrator only

> **Итог на 2026-11-11 (исторический документ, чек-боксы ниже не обновлялись):**
> - G1: Анвар в production с 2026-11-05.
> - G2: PR #93 смёржен, REMOVAL_SHA `eb68773`, CI 9/9; переключение VPS 2026-11-06 07:12Z, ранняя очистка Task 9 в 07:53Z (по решению владельца).
> - G3: ежедневные прогоны 06–07.11 прошли (по записям сессий), недельный 2026-11-08 22:00Z прошёл; все daily 09–11.11 — четыре сети `exit=0` (журнал VPS, 2026-11-11).
> - Сверка VPS 2026-11-09 и 2026-11-11: юнитов, каталогов и drop-in C2/promotion нет; environment `sync-publisher` на GitHub — 404.
> - Открыто: закрыть задачу C2 в Jira; удалить копию `aktau-c2-removal-*` после 2026-12-06 (30 дней).

## Gate register and boundaries

G0: written removal decision in Owner task (2026-11-05); retain Owner attribution.
G1: NOT_VERIFIED — administrator must attest ANVAR_LIVE; ANVAR_ROLLED_BACK stops merge and rollout.
G2: NOT_RUN — PR must be merged by human only after G0/G1, exact resulting main CI9 must pass; record its full SHA as REMOVAL_SHA. PR head is NOT REMOVAL_SHA.
G3: NOT_RUN — three consecutive natural daily successes plus one natural weekly success per Task8. Tasks6–9 NOT_RUN; no SSH/VPS/sudo by this agent.
JIRA_DEFERRED_OWNER. AUTO_DEPLOY remains disabled. No artificial sync/ingest/webhook, no DB/frontend/API changes. Keep Node/Go/user/env/data/timers/API/recovery and egg category unchanged.

Work window02:00–11:00UTC, not Sunday evening. Record UTC, current source, unit configuration and exact mount identities; stop if changed or unexpected. Do not assume historical VPS state current. No force/reset/clean, no automatic rollback of unknown state.

## Safety clarifications before using reference commands

- Backups must be unique, root0700 and no-clobber. Confirm destination does not already exist. Preserve all prior release/ledger/backup resources until G3; do not print secrets. Prefer a filtered copy/tar of /etc/aktau-c2 that EXCLUDES reader.dsn from the outset rather than copying then deleting a credential. Keep the original reader protected and untouched until authorized final cleanup.
- The historical fallback rollback assumes C2 records absent. Task7 removes unit hooks but leaves records: that does NOT establish unarmed legacy launcher behavior. Before rollback, administrator must verify the old launcher's fixed-record admission and separately approve/reconcile reversible record quarantine if necessary. Do not execute an old armed C2 path or claim rollback qualified merely from old SHA. If safe fallback cannot be established, STOP before cutover.
- Capture OLD_SHA and dependency lock before switch. Pin target to full REMOVAL_SHA reachable from fresh main with CI9; frozen install runs as aktau-sync, never root. Validate runtime PATH before stopping anything. Do not delete/overwrite foreign mounts or resources. A busy mount or partial checkout/install requires reconciliation, not retries.
- Preserve existing unit-specific drop-ins unrelated to removal. Do not weaken ownership/modes. Verify namespace and exact mount target before unmounting. No broad cleanup before G3. Review irreversible Task9 path list against actual state and Owner authorization, preserving human SSH keys and unrelated backups.
- Tasks7–9 commands below are REFERENCE HUMAN PROCEDURE, not agent executions. Replace placeholders only after gates. Root approvals/credential contents are not packaged.

# Часть B. Production (вручную, администратор)

Команды вводит человек в своём SSH-сеансе с root-правами. Агент их не выполняет и не подключается к серверу. До Task 9 ничего не удаляется безвозвратно. При любом неожиданном результате остановиться и ничего не исправлять по догадке.

Проверено только по исходникам. Реальное состояние VPS определяет Task 6.

Работать в окне 02:00–11:00 UTC, не в воскресенье вечером: так прогоны sync не пересекутся с работами.

### Task 6: Проверка состояния (только чтение)

Требует G1 и G2.

- [ ] **Step 1: Сервисы и журнал транзакций**

```bash
systemctl list-timers 'aktau-sync*'
systemctl is-active aktau-sync aktau-sync-full aktau-c2-custodian
test ! -e /var/lib/aktau-sync-promotion/interlock.json && echo NO_INTERLOCK
```

Expected: все три сервиса `inactive` или `failed` без активного запуска, есть `NO_INTERLOCK`.

- [ ] **Step 2: Drop-in файлы и монтирования**

```bash
ls -la /etc/systemd/system/aktau-sync.service.d /etc/systemd/system/aktau-sync-full.service.d /etc/systemd/system/aktau-c2-custodian.service.d
systemctl cat aktau-sync aktau-sync-full
findmnt -rn -o TARGET,SOURCE,OPTIONS | grep -i aktau
```

Expected: есть `30-c2-custodian.conf` и `40-promotion-lock.conf`. Прочие drop-in (например, для `systemd-cat`) записать: их не трогаем. На `/opt/aktau-sync/pipeline` смонтирован read-only.

- [ ] **Step 3: Checkout**

```bash
sudo -n -u aktau-sync -H git -C /opt/aktau-sync rev-parse HEAD
sudo -n -u aktau-sync -H git -C /opt/aktau-sync status --porcelain=v1
sudo -n -u aktau-sync -H git -C /opt/aktau-sync remote -v
```

Expected: HEAD равен `e50de2532259ab477e8491c4bddc2e6120ef3da0`, статус пуст.

- [ ] **Step 4: Рантайм без C2-обвязки**

```bash
sudo -n -u aktau-sync -H env PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin sh -c 'command -v node pnpm go; node -v; pnpm -v; go version'
```

Expected: Node 24.x, pnpm 10.x, Go 1.27.3.

Если `node` или `pnpm` не найдены либо версии другие, в Task 7 шаг 4 добавить обоим юнитам drop-in `20-runtime-path.conf` с `Environment=PATH=/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin`. Если при таком PATH нет `pnpm`, выполнить от root `/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/corepack enable --install-directory /usr/local/bin pnpm`.

### Task 7: Обратимое отключение

- [ ] **Step 1: Остановить таймеры**

```bash
sudo systemctl stop aktau-sync.timer aktau-sync-full.timer
```

- [ ] **Step 2: Сделать резервную копию**

```bash
B=/var/backups/aktau-c2-removal-$(date -u +%Y%m%d)
sudo install -d -m 0700 "$B"
sudo cp -a /etc/systemd/system/aktau-sync.service.d /etc/systemd/system/aktau-sync-full.service.d /etc/systemd/system/aktau-c2-custodian.service.d /etc/systemd/system/aktau-c2-custodian.service /etc/systemd/system/aktau-sync-dependencies.service /etc/aktau-c2 /etc/aktau-sync-promotion "$B"/
sudo cp -a /var/lib/aktau-sync/c2/ledger/attempts.json "$B"/
sudo rm -f "$B"/aktau-c2/reader.dsn
```

Файл `reader.dsn` содержит учётные данные, поэтому в копию он не попадает.

- [ ] **Step 3: Отключить C2 в юнитах**

```bash
sudo rm /etc/systemd/system/aktau-sync.service.d/30-c2-custodian.conf
sudo rm /etc/systemd/system/aktau-sync.service.d/40-promotion-lock.conf
sudo rm /etc/systemd/system/aktau-sync-full.service.d/40-promotion-lock.conf
sudo systemctl disable aktau-sync-dependencies.service
sudo systemctl stop aktau-sync-dependencies.service
```

- [ ] **Step 4: Перечитать конфигурацию**

При необходимости сначала добавить drop-in из Task 6 шаг 4.

```bash
sudo systemctl daemon-reload
systemctl show aktau-sync aktau-sync-full -p ExecStart -p ExecStartPre -p Requires
```

Expected: `ExecStart` запускает `pipeline/scripts/daily-sync.sh` и `weekly-full-scrape.sh` через bash напрямую. Нет `promotion-runtime-gate`, `aktau-c2-custodian`, `aktau-sync-dependencies`.

- [ ] **Step 5: Размонтировать пайплайн**

```bash
sudo umount /opt/aktau-sync/pipeline
findmnt /opt/aktau-sync/pipeline || echo UNMOUNTED
```

Expected: `UNMOUNTED`. При `target is busy` остановиться и выяснить процесс через `fuser -vm`.

- [ ] **Step 6: Проверить скрытый checkout**

```bash
sudo -n -u aktau-sync -H git -C /opt/aktau-sync status --porcelain=v1
sudo -n -u aktau-sync -H test -w /opt/aktau-sync/pipeline && echo WRITABLE
```

Expected: статус пуст, есть `WRITABLE`.

- [ ] **Step 7: Переключить код**

Выполнить команды из раздела «Обновление кода на VPS» в `ops/sync/README.md` с `<полный SHA>` равным `REMOVAL_SHA`. Если в Task 6 понадобился drop-in, использовать PATH из него здесь и в шаге 8.

- [ ] **Step 8: Проверить сборку без публикации**

```bash
cd /opt/aktau-sync/pipeline && sudo -n -u aktau-sync -H env PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin pnpm exec tsx --version
cd /opt/aktau-sync/backend-go && sudo -n -u aktau-sync -H env GOTOOLCHAIN=local GOCACHE=/var/cache/aktau-sync/go PATH=/usr/local/go/bin:/usr/bin:/bin go build -o /dev/null ./cmd/ingest
```

Expected: версия tsx напечатана, сборка завершилась с кодом 0.

- [ ] **Step 9: Включить таймеры**

```bash
sudo systemctl start aktau-sync.timer aktau-sync-full.timer
systemctl list-timers 'aktau-sync*'
```

**Откат Task 7.** Использовать обычный откат кода: команды из `ops/sync/README.md` с SHA `e50de2532259ab477e8491c4bddc2e6120ef3da0`. На этом SHA `daily-sync.sh` вызывает `c2-ingest-launch.py`, который без C2-записей выбирает обычный `go run`. Возврат монтирования и drop-in файлов не проверялся, поэтому основным откатом он не считается.

### Task 8: Приёмка на естественных запусках

- [ ] **Step 1: Три ежедневных запуска подряд**

```bash
journalctl -u aktau-sync --since "<время запуска>" --no-pager | grep -E 'exit=|applied|frontend_revalidation|c2_|BLOCKED'
```

Expected для каждого запуска: код юнита 0, все четыре сети `exit=0`, `applied:true`, `merged 0`, `split 0`, `frontend_revalidation` с `outcome_class=success`, нет строк `c2_` и `BLOCKED`. Код 3 разобрать как устаревшую сеть, а не как проблему удаления C2.

- [ ] **Step 2: Публичные данные**

Проверить, что `snapshotAt` в `https://api.aktau.market/api/dashboard` обновляется после каждого запуска, а главная страница сайта показывает новые цены.

- [ ] **Step 3: Один недельный запуск**

Expected: `aktau-sync-full` завершился с кодом 0 в понедельник 03:00 +05.

- [ ] **Step 4: Зафиксировать G3**

Записать SHA, даты запусков и результат в отчёт `docs/superpowers/reports/2026-11-XX-c2-removal-report.md`.

### Task 9: Окончательная очистка

Требует G3. Действия этой задачи необратимы.

- [ ] **Step 1: Снять оставшиеся монтирования**

```bash
findmnt -rn -o TARGET | grep -E '^/var/lib/aktau-sync-promotion' | sort -r | xargs -r -n1 sudo umount
findmnt -rn -o TARGET | grep -i aktau || echo NO_MOUNTS
```

Expected: `NO_MOUNTS`.

- [ ] **Step 2: Удалить права на промоушен**

```bash
sudo grep -rlE 'aktau-sync-promote|aktau-c2' /etc/sudoers /etc/sudoers.d
sudo sh -c "grep -lE 'aktau-sync-promote' /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys"
```

Найденные правила убрать через `sudo visudo -f <файл>`, строку ключа CI удалить из `authorized_keys`. Правила и ключи людей не трогать.

```bash
sudo visudo -c && sudo sshd -t && echo ACCESS_OK
```

Expected: `ACCESS_OK`. Проверить вход новым сеансом, не закрывая текущий.

- [ ] **Step 3: Удалить юниты и файлы**

```bash
sudo rm -rf /etc/systemd/system/aktau-c2-custodian.service.d
sudo rm -f /etc/systemd/system/aktau-c2-custodian.service /etc/systemd/system/aktau-sync-dependencies.service
sudo systemctl daemon-reload
sudo rm -f /usr/local/sbin/aktau-sync-promote /usr/local/libexec/aktau-c2-operator.mjs /usr/local/libexec/aktau-c2-custodian.py /usr/local/libexec/aktau-c2-ingest
sudo rm -rf /usr/local/libexec/aktau-c2 /usr/local/libexec/aktau-sync-promotion
sudo rm -rf /etc/aktau-c2 /etc/aktau-c2-install /etc/aktau-sync-promotion
sudo rm -rf /var/lib/aktau-sync/c2 /var/lib/aktau-c2-custodian /var/lib/aktau-c2-install /var/lib/aktau-sync-promotion /var/lib/aktau-sync-promotion-archive /run/aktau-sync-promotion
```

- [ ] **Step 4: Убрать старые резервные копии**

```bash
ls -d /var/backups/aktau-*
```

Удалить `aktau-promotion-pre-*`, `aktau-c2-executor-upgrade-*`, `aktau-c2-helper-install-*`, `aktau-anvar-root-step-*`. Копию `aktau-c2-removal-*` хранить 30 дней, затем удалить.

- [ ] **Step 5: Настройки GitHub и Jira (нужны права admin)**

Удалить environment `sync-publisher` вместе с его секретами и переменными `PROMOTE_*`. Закрыть задачу C2 в Jira со ссылкой на решение.

- [ ] **Step 6: Контрольный запуск**

Expected: следующий естественный запуск проходит по критериям Task 8 шаг 1.
