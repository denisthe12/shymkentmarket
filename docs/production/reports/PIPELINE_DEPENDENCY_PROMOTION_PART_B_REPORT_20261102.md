# PR86 offline pipeline promotion — Part B, 2026-11-02

**BLOCKED_IMPLEMENTATION. STOP по обязательному safety condition Owner.** Реализация начата, но real-filesystem CAS qualification провалена. Это неполный локальный source candidate, **не готовый к publication, installation или production**. Commit/push/Draft PR не выполнены; exact-new-head CI9 отсутствует. Pipeline/C2/VPS не изменены.

## 1. Baseline и утверждённый scope

Fresh fetch и `origin/main` подтвердили **49f6823768817b0390f215de42439cce523bf5d3**. Создан отдельный native worktree `/home/denis/tmp/aktau-pr86-offline-pipeline-promotion`, branch `feat/pr86-offline-pipeline-promotion`, HEAD49f6823. Основной checkout и предыдущие worktrees не переключались/reset/rebase.

Прочитаны root AGENTS/RTK, approved Design Contract v2 из предыдущего worktree, root executor/helper fixtures и runtime/build boundaries. Исходный contract и remediation report не редактировались. Source authorization — текущее задание Owner; оно добавляет обязательный read-only post-deploy verifier и требует STOP при непроверенной безопасности/сбое tests.

## 2. Что реализовано локально

В `ops/c2/publisher-promotion.py` добавлены пока **не подключённые к CLI/admission** компоненты:

- фиксированные PR86 package/lock/tree/Node/pnpm identities;
- строгий bounded inventory parser: типы/порядок ключей, paths/parents, file sizes/modes/hashes, relative link resolution с cycle/escape/dangling protection;
- indexed USTAR capsule parser: exact members, per-blob hashes, canonical byte representation, отсутствие transport links/PAX/extra/trailing members;
- pure helper только для exact contracts-lock пары, **не вызванный существующим source admission**;
- read-only sealed-graph verification и начальный PipelineStore с journal registration callback, создание только private stage, links last, fsync, root-seal, no-clobber publication через renameat2.

Текущий default root entry по-прежнему принимает только прежний manifest/policy protocol. V2 artifact не разрешён этой частичной работой. Никакого временного permissive flag, generic dependency bypass или ложного PRODUCTION_SOURCE_RUNTIME_ALIGNED результата нет.

В `ops/c2/test_publisher_promotion.py` добавлены parser и real-filesystem safety regressions.

Исторический root-helper fixture ранее читал **текущий** publisher-promotion.py и требовал его старый digest d69c667…, что несовместимо с любым новым executor source. В `ops/c2/fixtures/pair-upgrade/executor-after.json` сохранены точные старые public source bytes из49f6823; SHA256 восстановленного файла проверен как d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118. `test_root_executor_pair_upgrade.py` читает этот immutable fixture, сохраняя старые hash assertions/reverse-patch semantics. Сам исторический helper/installer и его constants/journal не изменялись. Полный helper suite ещё не запускался после этой адаптации; PASS не объявляется.

## 3. Fail-first и подтверждённый safety failure

### Parser qualification

```sh
python3 -B -m unittest discover -s ops/c2 \
  -p test_publisher_promotion.py -k PipelineCapsuleV2Tests
```

До реализации: exit1,4tests,13errors/subtest errors из-за отсутствующих новых entrypoints/constants. После: exit0,4/4PASS. Проверены malformed/extra/boolean fields, traversal/absolute paths, link escape/cycle/dangling, duplicate paths, indexed blobs/canonicality и exact protected-lock controls.

Дополнительно real87,275,520-byte new design-fixture capsule прошёл новый parser:5058entries/4142regular blobs, около0.962s локально. Это parser test на публичных fixture bytes, не новый authenticated artifact и не installation qualification.

### Real-filesystem store safety matrix

```sh
python3 -B -m unittest discover -s ops/c2 \
  -p test_publisher_promotion.py -k PipelineStoreSafetyTests
```

**Exit1:3PASS/1FAIL.**

| Case | Реальный результат |
| --- | --- |
| Sealed filesystem roundtrip и изменение file hash | PASS, tamper отклонён |
| SIGKILL после mkdir/registered stage | PASS, intent/stage сохранены, reinstall заблокирован, final capsule отсутствует |
| ENOSPC при записи graph | PASS, partial stage сохранён, final capsule отсутствует |
| Foreign staging inode перед publication | **FAIL — нарушена safety boundary** |

Falling assertion:

```text
FAIL: test_foreign_stage_inode_is_never_renamed_into_registered_capsule
AssertionError: False is not true : foreign staging inode was moved before CAS rejection
```

В изолированной owned temporary filesystem тест после `sealed` registration заменяет staging directory другим inode с отдельным foreign marker. `PipelineStore.install()` затем вызывает renameat2 по имени stage без финального сравнения с зарегистрированной identity. Финальная verify правильно отклоняет неправильный slot, **но слишком поздно: foreign directory уже перемещена** в capsule namespace. Требуемое «не перемещать/не изменять чужие ресурсы» нарушено.

Это подтверждённый дефект **нового локального staging code**. Это не доказанный remote exploit или ошибка установленного production executor: source не опубликован и новый путь не подключён. Тест затрагивал только собственный disposable sandbox; реальные чужие файлы не перемещались.

По прямому указанию Owner `STOP при непроверенной безопасности или сбое тестов` дальнейшая реализация/qualification остановлена. Failure не скрыт retries, relaxed assertion, cleanup или заменой теста. Следующее исправление должно pin/open stage inode и сравнить зарегистрированные directory/parent identities непосредственно перед publication, включая after-rename readback; затем пройти весь race/crash domain. Само по себе исправление одного assertion не доказывает coupled transaction safety.

## 4. Остальные выполненные проверки

| Команда/проверка | Exit/result |
| --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` после parser, до добавления store safety class | exit0,40tests PASS (36 прежних +4новых parser); не полный regression matrix |
| Local systemd fixture image build | exit0, systemd/dbus установлены только в новой local Docker image |
| Первый systemd preflight | wrapper exit0, но container exit32/BLOCKED: попытка нового mount поверх уже существующего cgroup2; не считается PASS |
| Исправленный private-cgroup fixture setup | systemd PID1 реально running; `systemctl is-system-running --wait` exit1/`degraded`; подтверждена доступность systemd, **не application/boot integration PASS** |
| External fixture Python syntax setup | начальный local quoting SyntaxError исправлен до container invocation; production не затронут |
| Exact source/provenance/old-byte fixture identity | Git/frozen digest проверены локально |

Systemd sandbox использовал только собственные random containers: network=none, private cgroup namespace, read-only container root, ограниченные tmpfs/memory/PIDs и необходимые namespace capabilities. Remount затрагивал только существующий **container-local bind mount** cgroup2; host cgroup mount/settings не менялись. Оба именованных containers удалены с проверкой отсутствия. Созданная local image `aktau-pr86-systemd-fixture:20261102` сохранена как test prerequisite; Docker prune/удаление сторонних ресурсов не выполнялись.

Не выполнены/не объявляются PASS:

- real systemd activation/boot recovery tests нового production code;
- полный coupled source+dependency+14-target transaction/recovery/rollback matrix;
- EBUSY/stale mount/parent races/child-cleanup/reboot/v1-v2 rollback после новых ledger entries для новой реализации;
- новый builder/workflow/final artifact size admission;
- полный Go/Voice/pipeline/ops/security/C2 sweep после изменений;
- Draft PR и exact-new-head CI9.

Предыдущие baseline CI9 и design runtime old→new→old результаты не подменяют эти отсутствующие проверки.

## 5. Mandatory post-deploy verifier — остаётся обязательным, не реализован

Verifier должен выдавать PRODUCTION_SOURCE_RUNTIME_ALIGNED только после независимой проверки exact-main source, pipeline tree/blob identities, mounted graph и underlying tracked checkout, Node/pnpm, C2 authority/12closure hashes и rollback. Он должен проверять фактическое содержимое hidden checkout, а не только Git HEAD.

Выбранный для дальнейшей реализации безопасный read-only подход: отдельный дочерний private mount namespace, recursive-private propagation, снятие bind только внутри этого namespace и чтение underlying tracked files при сохранении shared source exclusion. В parent/production namespace mount не снимается. Должны быть протестированы namespace/propagation isolation, timeout/child cleanup, stamp/hash recheck и отсутствие writes; до этого никакого alignment SUCCESS entrypoint не добавляется. Нельзя выдавать SOURCE_RUNTIME_ALIGNED за C2 3/3.

## 6. Что осталось перед безопасным продолжением

1. Исправить подтверждённый stage-inode CAS defect и повторить fail-first regression без ослабления контроля foreign resources.
2. Завершить v2 policy/descriptor admission, builder/capsule integration, независимую OLD inventory/attestation, mount/actor/boot gate, versioned journal/coupled rollback и строгий read-only verifier.
3. Пройти все обязательные fault cases на real filesystem/mount/systemd, включая конечное состояние послеSIGKILL, unknown states и v1 history.
4. Только после полной qualification — весь regression matrix, независимый exact scope/privacy review, commit/push Draft PR и exact-head CI9. При новом FAIL снова BLOCKED, никакого merge/production.

Нет SSH, VPS/root upgrade/production mount, package install на VPS, sync/ingest, HMAC POST, artifact promotion, AUTO DEPLOY или SLA changes. Reader/ledger/source authority production не читались и не менялись. Public API/DB/parsers/Go/Frontend не изменены.

**BLOCKED_IMPLEMENTATION. Локальный candidate не выпущен. STOP для независимого Code Review обнаруженного safety failure.**


## 7. Isolated staging-inode CAS review — 2026-11-02

**BLOCKED_CAS_DESIGN. Исправление не заявляется реализованным.** Owner разрешил продолжить только этот дефект и потребовал STOP, если инвариант нельзя гарантировать. Исходный незакоммиченный candidate и предыдущая история сохранены; ни одна другая часть Part B не продолжена.

### 7.1 Fail-first и точный source scope

Повторена без изменения assertion команда:

```bash
python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineStoreSafetyTests
```

Exit **1**, **3 PASS / 1 FAIL**, 4 tests. Падает прежний `test_foreign_stage_inode_is_never_renamed_into_registered_capsule`: `foreign staging inode was moved before CAS rejection`. SIGKILL после mkdir, ENOSPC и seal/tamper controls в этом же запуске прошли. Никакого PASS-AFTER нет.

В этом продолжении изменён **только данный report, append-only**. Четыре ранее изменённых source/test/fixture файла побайтово сохранены. HEAD49f6823768817b0390f215de42439cce523bf5d3, branch feat/pr86-offline-pipeline-promotion; никаких stage/commit/push/PR/reset/rebase.

### 7.2 Подтверждённая граница гарантии

`PipelineStore.install()` сохраняет stamp только через callback, затем заново открывает BASE/capsules и публикует именованный source. `Filesystem.directory()` проверяет владельца и отсутствие group/other write на компонентах, но не связывает их с ранее удерживаемыми parent descriptors; эта проверка не является доказательством отсутствия других privileged writers. Сам Store не требует доказательства удержания ingress/runtime/controller locks и durable transaction interlock. Эти существующие production-примитивы не изменялись; v2 production integration по-прежнему отсутствует.

Linux `renameat2(src_dirfd, stage_name, dst_dirfd, generation, RENAME_NOREPLACE)` не принимает expected source inode. Открытый stage descriptor сохраняет доступ к прежнему inode, но syscall всё равно выбирает источник **по имени**. Destination no-clobber не даёт source CAS. Послеrename сравнение обнаруживает ошибку слишком поздно для требования «чужой inode не перемещать». Rename обратно тоже был бы непредусмотренным изменением чужого ресурса/слепым recovery и не выполнен.

Предварительная проверка pinned stage/parents полезна и отклонит уже произошедшую подмену, но оставляет окно между последней проверкой и syscall. `flock` исключает только cooperating writers, а не файловые операции владельца namespace. Root-only0700 исключает непривилегированных writers, **не произвольный root-процесс**. Не утверждается, что непривилегированный атакующий способен выполнить этот сценарий в корректном root-private namespace. Также не утверждается невозможность безопасной публикации при отдельно доказанной модели единственного доверенного writer; сейчас именно эта предпосылка не реализована/не квалифицирована.

### 7.3 Реальный Linux probe, без production

Вне Git сохранены воспроизводимый `rename_cas_probe.py`, `kernel-proof.json`, `before.json`, исторический report prefix и принадлежащие тесту fixtures:

`/home/denis/tmp/aktau-pr86-cas-design-efhw9ffd/`

Команда:

```bash
python3 -B /home/denis/tmp/aktau-pr86-cas-design-efhw9ffd/rename_cas_probe.py
```

Exit **0**, `KERNEL_LIMITATION_REPRODUCED`, **NOT_A_CAS_FIX**. Реальные файловые операции выполнены UID1000 в собственном0700 sandbox: один sandbox owner моделирует privileged namespace writer. Это не тест с настоящим production root/другими UID и не root-custody qualification.

| Контроль | Наблюдение |
|---|---|
| Stage descriptor и оба parent descriptors pinned; directory flock удерживается; подмена после последнего сравнения | rename exit0 переносит заменённый inode; original остаётся доступен через FD/retained path |
| Destination parent заменён после открытия FD | rename exit0 публикует в retained old parent, а не по ожидаемому абсолютному pathname |
| Занятый destination, RENAME_NOREPLACE | return-1/errno17 EEXIST; оба inode остаются на местах |
| Второй cooperating opener пытается взять flock | EWOULDBLOCK; при этом операцию владельца namespace lock не запрещает |

Чужие production ресурсы не открывались/не перемещались/не удалялись. Все перемещённые marker/inode — специально созданные собственные тестовые fixtures, сохранённые для review. Нет автоматического удаления или rollback неизвестных ресурсов.

### 7.4 Альтернативный минимальный design для решения review

Предпочтительный вариант для дальнейшего согласования: отказаться от перемещения завершённого stage по изменяемому имени. После durable intent создавать fixed content-addressed generation сразу через parent-dirfd + mkdir no-clobber, pin её inode, строить/запечатывать graph внутри **ещё не выбранного** private generation. Runtime selection не получает его до полной проверки seal/inventory/custody. Interrupted/foreign generation остаётся невыбираемой и блокирует reuse; никакого автоматического удаления. Это требует явного уточнения approved capsule/journal publication protocol и crash/recovery tests, поэтому здесь не реализовано. Проверка destination collision должна сохранять существующий неизвестный inode нетронутым.

Если review требует сохранить stage→generation rename, необходима явно доказанная модель writer exclusion: существующие три locks, durable intent/interlock, pinned parent/stage descriptors, полная parent-chain custody/no-ACL проверка, запрет запускать callback/child/writer между финальным CAS и syscall, postrename inode proof и сохранение interlock при неопределённости. Должно быть явно согласовано, что процессы с эквивалентной root authority, игнорирующие locks, находятся вне threat model. Нельзя обещать неизменность чужого inode при инъекции такого writer непосредственно перед syscall. Одних новых stat/assertions для такой гарантии недостаточно.

### 7.5 Итог обязательных проверок и STOP

| Проверка | Реальный результат |
|---|---|
| PipelineStoreSafetyTests fail-first, прежние assertions | exit1,3PASS/1FAIL |
| Изолированный kernel semantics probe | exit0, ограничение воспроизведено; не qualification PASS |
| Полный test_publisher_promotion.py после fix | NOT_RUN: fix отсутствует, mandatory safety suite FAIL, STOP |
| Полный test_root_executor_pair_upgrade.py | NOT_RUN: STOP; старый frozen fixture сохранён, full compatibility PASS не заявляется |
| node scripts/ci/run-checks.mjs ops | NOT_RUN: STOP; общий ops PASS не заявляется |
| Diff check / source preservation / report prefix | выполняются отдельно ниже; результаты фиксируются в local integrity evidence |

Нет PR/commit/push, SSH, production mutation, root upgrade, package installation на VPS, mount/systemd/builder/journal-v2/verifier реализации, sync/ingest/HMAC/AUTO_DEPLOY/C2 authority или SLA changes. Следующее действие — независимый review границы writer exclusion и выбранной capsule publication схемы. **BLOCKED_CAS_DESIGN. STOP.**


## 8. Direct unselected generation correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Работа продолжена только в прежнем worktree/ветке feat/pr86-offline-pipeline-promotion, HEAD49f6823768817b0390f215de42439cce523bf5d3. Owner передал independent approval отказаться от stage→generation rename. Изменения filesystem store начаты, но qualification остановлена на первом after-change test error. Commit/push/PR, SSH или production операций нет.

### 8.1 Threat model и узкий diff

Root/admin доверенные; обычные writers, writable external locations, filesystem corruption и crashes входят в модель. Компрометированный root вне модели. Pinned descriptors/0700/advisory flock не выдаются за абсолютную защиту от root.

В `ops/c2/publisher-promotion.py` заменён только новый локальный PipelineStore: no-follow pinned ancestors, фиксированные private BASE/capsules/state, root ownership и no ACL/xattr, store-local nonblocking directory flock; прямой mkdir content-addressed generation; no-clobber files/symlinks внутри pinned generation; bounded durable resource-intent table, fsync до generation mkdir; no automatic reuse существующего slot. Полная graph validation до seal и после него, seal связывает generation/root identities, graph-stamp digest и intent digest. Runtime selection не открывается/не записывается. Stage→generation rename отсутствует в новом Store.

Это не v2 release journal/selection/transaction: resource intent имеет только filesystem inventory scope. Existing v1 CLI/admission и root helper не менялись; новый store по-прежнему не подключён к production entry. Никаких builder/mount/systemd/boot/verifier изменений.

В `ops/c2/test_publisher_promotion.py` добавлены12focused generation tests, private BASE setup. В `ops/c2/fixtures/pipeline-store-before.json` сохранены точные прежние PipelineStore source и оригинальный failing test с SHA256 для исторического negative evidence. Старый failing test остаётся также в прежней test class без ослабления assertions; адаптация historical harness/остальных старых lifecycle tests под новую модель **не закончена**, их полный PASS не заявляется.

Design Contract скопирован побайтово из предыдущего design worktree в этот worktree и дополнен append-only разделом13, где stage→rename признан superseded. Предыдущий design worktree не изменён. История текущего Part B report сохранена append-only. Ранее изменённые root-helper test и historical executor fixture сохранены без новых правок.

### 8.2 Fail-first / after-change evidence

Команда обоих запусков:

```bash
python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests
```

| Запуск | Exit | Результат |
| --- | --- | --- |
| Fail-first против прежнего Store |1|12tests,4PASS/8FAIL |
| После filesystem изменения |1|12tests,11PASS/1ERROR |

Fail-first показывает отсутствие generation_created/resource intent и generation-in-place semantics, отсутствие запрета reuse и новых fault boundaries. Assertion не ослаблялся ради PASS.

After-change ERROR: `test_graph_symlink_substitution_is_not_followed`. Callback `graph_ready` делает `node_modules.rename(...)`, но pipeline уже имеет0555, а процесс теста — UID1000 без root CAP_DAC_OVERRIDE. Поэтому Python получает `PermissionError: [Errno 13] Permission denied` внутри test fault injector до того, как новый store мог обработать symlink substitution. Этот результат **не считается PASS защиты** и не доказывает production vulnerability. Нужна корректная изолированная privileged fixture либо явно моделирующий доверенную fault-injection permission transition setup с дальнейшим неизменным assertion. Сейчас это не исправлялось: Owner требует STOP на обязательном FAIL.

11прошедших tests покрывают: generation-in-place без os.rename/replace/selection, foreign existing generation preservation, запрет повторного использования sealed generation, intent presence до generation mkdir, реальный SIGKILL после generation mkdir и blocked retry, parent и generation substitution после создания без последующих graph writes, preseal content corruption, corrupted seal/reinstall rejection, unsafe parent mode и parent symlink. Они не подменяют полный crash/symlink/ENOSPC/partial-graph matrix.

Evidence вне Git: `/home/denis/tmp/aktau-generation-safety-fu3twloi/`:

- `fail-first.log` — полный исходный результат;
- `generation-after.log` — полный11PASS/1ERROR и traceback;
- два исходных report prefixes, before.json;
- копия нового store source и final-integrity.json.

### 8.3 STOP и невыполненные проверки

После error остановлены изменения и запуск дальнейшей mandatory matrix. Не выполнены/не заявляются PASS:

- полный filesystem safety/parser/publisher suite на текущем candidate;
- новый ENOSPC/partial graph/intent fsync-failure/последующий metadata-failure matrix;
- исторический root-helper suite после этой correction;
- `node scripts/ci/run-checks.mjs ops` (default local Node20, ops требует Node24; подбор runtime и запуск не выполнялись после STOP);
- новая root/Linux multi-UID qualification или CI.

`git diff --check`, неизменность обоих report prefixes и frozen helper files проверяются как финальная integrity фиксация, не как qualification generation store. Candidate остаётся незавершённым/unpublished, не для установки. Production reader/ledger/authority/API/DB/publisher/sync не открывались и не менялись. Никаких runtime selection, cleanup неизвестных ресурсов, rollback, HMAC, AUTO DEPLOY, C2 SLA или дальнейшего Part B.

**BLOCKED_GENERATION_STORE. STOP для независимого Code Review.**


## 9. Test-only direct-generation qualification correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Исправлена qualification основной generation matrix, но следующий обязательный publisher suite завершился ERROR в historical harness. По условию Owner дальнейшие исправления и проверки остановлены. Остальной Part B не продолжался.

### 9.1 Точный diff этого продолжения

Изменены только `ops/c2/test_publisher_promotion.py` и append-only эти два report/contract. Production source `ops/c2/publisher-promotion.py`, frozen historical CAS fixture, historical root-helper test/fixture побайтово сохранены. Все прежние незакоммиченные изменения сохранены, baseline/HEAD49f6823768817b0390f215de42439cce523bf5d3, прежняя ветка/worktree.

Неправильная symlink fault fixture разделена на два независимых теста:

1. **Unprivileged UID**: требует actual geteuid()!=0, выполняет реальную запрещённую rename под0555, требует именно EACCES и неизменность полного graph snapshot/inode/mode/selection sentinel. После запрещённой попытки Store успешно seal/verify обычный graph. Это Linux permission denial, а не обработка Store успешно выполненной подмены.
2. **Controlled privileged-corruption model**: только внутри собственной TemporaryDirectory fixture владелец временно переводит pipeline0555→0700, реально перемещает node_modules и создаёт внешний symlink. Injector явно проверяет is_symlink/readlink/retained directory и выставляет proof flag; finally восстанавливает0555 и проверяет тот же dev/inode/owner/group/mode/no-xattr до возвращения Store. Store получает Linux ENOTDIR от directory no-follow open; тест требует именно этот errno, successful-injection/restoration flags, неизменность external target, отсутствие seal/selection, verify rejection и blocked reuse без cleanup. Injector PermissionError не мог бы дать PASS.

Это разрешённая test-only permission transition, **не actual root/CAP_DAC_OVERRIDE или multi-UID fixture**. Production contract/permissions/Store не ослаблены; root/admin остаётся trusted, compromised root вне модели.

Старые активные SIGKILL/ENOSPC tests адаптированы с stage на unselected generation: durable intent сохранён, generation остаётся на конечном имени, seal/selection отсутствуют, retry отклоняется без изменения ресурсов. ENOSPC injector проверяет реальный открытый FD через /proc/self/fd и не подменяет неиспользуемый теперь Filesystem.write.

Historical CAS negative evidence сохранено в неизменном `fixtures/pipeline-store-before.json` с исходным Store и исходной assertion. Новый harness проверяет оба digest и должен запускать именно frozen OLD code, ожидая только прежний конкретный AssertionError. **Этот harness пока ошибочен: не добавлен binding m в namespace оригинального теста.** Оригинальный frozen assertion не изменялся; skip/xfail не использованы. Его воспроизведение в текущем полном suite НЕ объявляется PASS.

### 9.2 Реальные команды и exit codes

Evidence: `/home/denis/tmp/aktau-generation-qualification-sjqjg2te/`.

| Команда | Exit | Реальный результат |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k test_graph_symlink_substitution_is_not_followed` до изменения tests |1|1ERROR, исходный PermissionError воспроизведён; fail-first.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` после test correction |0|20/20PASS,0SKIP; generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |1|64tests:63PASS/1ERROR,0SKIP; publisher-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` |NOT_RUN|STOP после publisher ERROR |
| `node --version` / `node scripts/ci/run-checks.mjs ops` для Node24 |NOT_RUN|STOP; установленный Node24 найден по пути ниже, version/profile не запускались |

Publisher ERROR: `test_historical_foreign_stage_cas_failure_remains_reproducible`, `NameError: name 'm' is not defined` при вызове frozen original test. Это ошибка нового тестового namespace, не результат security check Store. Известная исправляемая причина зафиксирована; по прямому STOP условию Owner после mandatory ERROR код больше не менялся.

Установленный локальный runtime обнаружен: `/home/denis/.nvm/versions/node/v24.10.0/bin/node`. Версии проекта/зависимости не менялись. Общий ops/root-helper PASS и compatibility не заявляются.

### 9.3 Что покрыли20 targeted tests

Реальные Linux filesystem операции на owned temporary directories UID1000: occupied foreign generation, parent/generation inode replacement, unsafe parent modes/symlink, corrupt graph/seal, partial graph без seal, запрет automatic reuse/cleanup и отсутствие нового selection. Реальный fork/SIGKILL после generation mkdir оставляет intent и unsealed slot.

Fault injection: ENOSPC до первого payload write; реальная partial запись2байт из8 и ENOSPC на следующем вызове; последовательные короткие записи и zero-progress rejection; пять fsync EIO точек — intent file, state directory, graph file, seal file, generation directory после появления seal. Ошибка не подавляется, intent/partial resources сохраняются, повторная установка отклоняется, selection не меняется. Ошибки ENOSPC/EIO моделируются на конкретных FD; реальное исчерпание диска/power loss не проводились. При EIO не заявляется durability; проверены propagation/no-cleanup/no-selection, не готовность generation после failed durability barrier.

Проверена фактическая последовательность успешных fsync intent file→state directory до generation mkdir и конфликт store-directory flock без writes. Advisory lock не заявляется защитой от root, игнорирующего lock. Эти результаты относятся только к store; journal-v2/source+dependencies+14-target rollback, mount/systemd, builder, verifier не реализовывались/не квалифицировались.

### 9.4 Integrity и STOP

Исторические префиксы обоих документов, production source/frozen fixtures/root-helper tests и git diff --check проверяются в final-integrity.json. Это integrity evidence, не замена невыполненным обязательным suites. Никаких commit/push/PR, SSH/VPS, root upgrade, production mutation, sync/HMAC, runtime selection, AUTO DEPLOY или C2 SLA changes.

Следующий узкий шаг после разрешения продолжить — корректно связать namespace frozen historical assertion с m и повторить publisher→historical root-helper→Node24 ops. **BLOCKED_GENERATION_STORE. STOP для независимого review.**


## 10. Historical CAS harness isolation correction — 2026-11-02

**BLOCKED_GENERATION_STORE.** Исправлена текущая CAS harness ошибка; Generation20/20 и Publisher64/64 прошли. Однако следующий обязательный historical root-helper suite завершился30PASS/1ERROR. В соответствии с прямым STOP Owner дальнейшие правки и Node24 ops не выполнялись. Полная qualification НЕ завершена.

### 10.1 Scope и неизменность

Продолжена та же branch feat/pr86-offline-pipeline-promotion/worktree, HEAD49f6823768817b0390f215de42439cce523bf5d3. Изменены только `ops/c2/test_publisher_promotion.py` и append-only данный report/Design Contract. Production publisher/Generation Store, root helper/его tests, historical fixtures сохранены побайтово относительно начала этого продолжения. Существующий untracked `report md files.zip` не открывался для изменения, не удалялся и не включён в scope.

### 10.2 Минимальное корректное связывание historical module

Fail-first воспроизвёл ровно `NameError: name 'm' is not defined` в original frozen assertion. Простая привязка m к текущему publisher была бы неправильным исправлением.

Новый harness создаёт отдельный ModuleType и исполняет **полный исторический OLD publisher**. Чтобы не дублировать72KiB source в ещё одной fixture, текущий файл используется только как compression basis: его PipelineStore заменяется точным frozen class, восстанавливается исходный separator и **до exec проверяется полный SHA256 исходного OLD-модуля** `ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026`. Этот digest совпадает с сохранённым before.json предыдущего generation correction. Если любая общая часть текущего source изменится, reconstruction будет отвергнут; исполнения смеси implementations нет.

Пины неизменны:

- frozen Store SHA256: `253a6f6cb839dffa41f6d39b6e0096bb7dff9f22ba6110d97056ca413420965e`;
- original assertion SHA256: `00fb6557bdafed44120883570272190bbf4080b0fcd8787ada1080bb347a3d5b`.

Проверяются pinned digests, а не только самодекларированные fixture поля. Оба отрицательных subcase меняют source и пересчитывают его metadata digest: это всё равно отвергается до exec. Отдельный negative binding control отвергает текущий m. Ни NameError, ни generic exception не могут удовлетворить positive control.

Original assertion получает `m=old_module`, отдельный unittest receiver с old.Filesystem/old.PipelineStore и observer journal на old.canonical/old.Filesystem. У этих классов и Blocked иная object identity, чем у текущего publisher; проверены __globals__ Store/Filesystem именно OLD module. Оригинальный negative test source не менялся. Ожидается только точный AssertionError `False is not true : foreign staging inode was moved before CAS rejection`; независимо проверяются foreign marker в перемещённом capsule и retained original staging directory. Это historical negative evidence старого Store, не ослабление новых invariants и не xfail/skip.

### 10.3 Реальные команды / результаты

Evidence: `/home/denis/tmp/aktau-generation-historical-1tfj58gm/`.

| Команда | Exit | Реальный результат |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k test_historical_foreign_stage_cas_failure_remains_reproducible` до правки |1|1ERROR/NameError, fail-first.log |
| Та же historical команда после исправления |0|1PASS с отрицательными binding/fixture subcases, historical-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` |0|20/20PASS,0SKIP, generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |0|64/64PASS,0SKIP, publisher-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` |1|31tests:30PASS/1ERROR,0SKIP, root-helper-final.log |
| `export PATH="/home/denis/.nvm/versions/node/v24.10.0/bin:$PATH"; node --version; node scripts/ci/run-checks.mjs ops` |NOT_RUN|STOP после обязательного root-helper ERROR |
| `git diff --check` |0|PASS, финальная integrity проверка |

Duplicate promotion.tar warning в publisher log — deliberate malformed ZIP negative fixture; suite exit0. Результаты других ранее выполненных matrices не подменяют отсутствующий общий ops PASS.

### 10.4 Точный новый blocker: historical source factory fixture

Ошибка: `test_root_executor_pair_upgrade.SourceTests.test_real_reviewed_bytes_through_fixed_factory`, `pair_upgrade.Blocked: reviewed_source_metadata`.

Read-only inspection показала: SourceTests.api() всё ещё читает mutable рабочий `publisher-promotion.py`, маркируя эти bytes как содержимое исторического reviewed SOURCE. Root helper source_verified() правильно требует фиксированный размер59455 и digestd69c667…; текущий файл имеет **82236bytes**, digest **4dd848631a6f0f8104840adaaa2eb589dae1d69c07d743cf433a5c5db6d028de**. Он не является историческим59455-byte artifact, поэтому root helper корректно fail-closed отклоняет metadata до проверки bytes.

В immutable `fixtures/pair-upgrade/executor-after.json` уже сохранены нужные59455bytes с точным SHA256d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118. Транзакционные helper tests используют эту fixture и прошли; SourceTests factory mock/positive assertion остались привязаны к текущему source. Это ограничение test fixture, не доказанный production дефект helper; helper/pins/trust checks ослаблять нельзя.

По указанию STOP после любого обязательного FAIL/ERROR исправление этого отдельного root-helper test здесь не выполнялось. Следующий узкий шаг — отдельно разрешённая test-only адаптация исторического SourceTests API mock и expected bytes на точные frozen reviewed bytes, затем повтор полного helper и Node24 ops. Production helper и approved pins менять не требуется/не разрешается.

### 10.5 Integrity и оставшиеся границы

До/после digests production source/frozen fixtures/root-helper test и префиксы обоих reports проверены в final-integrity.json. Full Stage B transaction/builder/mount/systemd/journal-v2/verifier не продолжались. Actual root/multi-UID qualification и physical power-loss/ENOSPC tests не заявляются сверх ранее описанных fixture fault injections. Generation Store не подключён к CLI/admission/selection;64tests PASS не является production или C2 acceptance.

Никаких commit/push/PR, SSH/VPS, root upgrade, production mutations, sync/HMAC, C2 SLA/authority/AUTO DEPLOY изменений. **BLOCKED_GENERATION_STORE. STOP для независимого review.**


## 11. Historical SourceTests factory correction — 2026-11-02

**GENERATION_STORE_SAFETY_READY_FOR_REVIEW.** Все обязательные проверки этого ограниченного test-only продолжения прошли. Это readiness **Generation Store filesystem qualification**, не завершение Part B, не release authorization, не production alignment и не C2 PASS. Предыдущие BLOCKED entries сохранены как историческое evidence, а не переписаны.

### 11.1 Scope и RCA

Та же branch feat/pr86-offline-pipeline-promotion, HEAD49f6823768817b0390f215de42439cce523bf5d3, прежний worktree. SourceTests.api() ошибочно обслуживал GitHub `contents?ref=8cff133…` bytes из mutable рабочего дерева. Root helper корректно требовал59455-byte reviewed executor d69c667… и fail-closed возвращал reviewed_source_metadata. Source/helper/security policy не нуждались в ослаблении.

Только этот incremental diff:

1. `ops/c2/test_root_executor_pair_upgrade.py`: fixed historical fixture loader, independent size/SHA256 checks до mock metadata, положительный expected result — frozen bytes, два negative tests. Старые CI/source/path/size/digest/encoding/unavailable-authority checks сохранены.
2. Новые `ops/c2/fixtures/pair-upgrade/workflow-reviewed.json` и `builder-reviewed.json`: точные public reviewed bytes из Git object SOURCE8cff133be30a8c31f4d5e06d297dcf9af5e97847, line arrays с сохранёнными line endings. Tests больше не читают рабочие workflow/builder для historical responses.
3. Append-only этот report и тот же Design Contract.

Existing executor-after.json, executor-before.json/policy fixtures, historical CAS fixture/assertion, publisher/Generation Store, root helper, test_publisher_promotion.py не изменены в этом продолжении. Approved pins и security policy не менялись. Все предыдущие незакоммиченные изменения сохранены. Owner-added untracked report ZIP не изменялся/не удалялся и не входит в qualification scope.

### 11.2 Immutable fixture identities

| Historical path | Decoded bytes | SHA256 |
| --- | --- | --- |
| ops/c2/publisher-promotion.py |59455|d69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118 |
| .github/workflows/sync-publisher-build.yml |3929|1d7764798c1c78ac616e4615ef46ba7fd810b1f192692318cdf1a3aa66da6312 |
| scripts/ops/build-sync-promotion.py |5211|308504c27ee7ceed871b1044d88a20a1f45a9525c9e4f3cca9d9b8382240b9b4 |

Loader проверяет list-of-strings shape, decoded length и закреплённый полный digest **до** создания base64/size metadata. Эти constants независимы от ответа mock и от вызова production source_verified. Сам production verifier дополнительно применяет неизменённые approved constants. Только executor fixture существовала ранее; новые workflow/builder arrays извлечены read-only `git show <SOURCE>:<fixed-path>` и сверены с approved hashes, без checkout/build/network.

Новые negative tests: каждый из3 frozen sources повреждается без изменения длины на уровне fixture read; independent digest guard должен отклонить ответ до формирования successful metadata. Отдельный mock подменяет historical executor текущими рабочими bytes с согласованными base64/size — неизменный production verifier отвергает reviewed_source_metadata. Это не successful-response подмена и не ослабление audit/authority checks. Положительный тест по-прежнему требует ровно5authority calls и сравнивает source_verified с independently validated frozen executor bytes.

### 11.3 Fail-first / pass-after и обязательные команды

Evidence: `/home/denis/tmp/aktau-historical-source-factory-f9vvf9rr/`.

| Команда | Exit | Результат / log |
| --- | --- | --- |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py -k test_real_reviewed_bytes_through_fixed_factory` до изменения assertions/mock |1|исходный reviewed_source_metadata ERROR воспроизведён; fail-first.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` после correction |0|33/33PASS,0SKIP; root-helper-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py -k PipelineGenerationSafetyTests` |0|20/20PASS,0SKIP; generation-final.log |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` |0|64/64PASS,0SKIP; publisher-final.log |
| `export PATH="/home/denis/.nvm/versions/node/v24.10.0/bin:$PATH"; node --version` |0|v24.10.0; node-version.log |
| `node scripts/ci/run-checks.mjs ops` с тем же PATH |0|полный profile:220Python tests PASS +185Node tests PASS,0SKIP; ops-final.log |
| `git diff --check` |0|PASS |

Числа перекрываются между focused/full/profile runs и не суммируются как уникальные tests. Ops реально выполнил полный installer/custodian/helper Python discovery и существующие Node ops/local HTTPS lifecycle regressions, не только отдельный новый тест. Duplicate promotion.tar warning сохранён как deliberate malformed ZIP negative fixture; suite PASS по exit0/summary, warning не скрыт. Ни SKIP, ни pending CI не объявляются PASS. Зависимости/версии проекта не менялись, production endpoints не использовались.

### 11.4 Integrity и remaining gaps

Сохранены префиксы обоих reports, точные hashes production publisher/root-helper/test_publisher и ранее frozen fixtures. Новые fixture decoded hashes проверены выше. Финальные source-preservation/diff/scope hashes — final-integrity.json вне Git.

Уже прошедшая20-test Generation matrix сохраняет оговорённые границы: реальные owned Linux filesystem operations/SIGKILL, разрешённый test-only privileged-corruption permission transition, syscall fault injection ENOSPC/EIO; не physical power-loss/full-disk, не actual compromised-root protection. Historical CAS negative evidence воспроизводится на отдельно pinned OLD module и не подменяет positive generation safety. Store остаётся unselected и не подключён к v1 CLI/admission.

Остальной Part B **не продолжался и не готов**: builder/artifact integration, runtime/mount selection, systemd/boot integration, journal-v2/source+dependency+14-target coupled rollback, baseline enrollment/authority и post-deploy verifier не реализованы/не квалифицированы. Общая Part B crash/rollback/production readiness не следует из текущего ops PASS. Полный Go/Voice/pipeline/PG17/C2 sweep и hosted CI9 для этой test-only correction не требовались и заново не выполнялись.

Никаких commit/push/PR, SSH/VPS, root upgrade, production mutation, sync/ingest/HMAC, AUTO DEPLOY, C2 SLA/authority changes. **GENERATION_STORE_SAFETY_READY_FOR_REVIEW. STOP для независимого Code Review; не переходить к остальному Part B автоматически.**


## 12. Part B2 — offline Artifact v2/source admission candidate, 2026-11-03

**BLOCKED_ARTIFACT_V2.** Реализация B2 начата, но обязательный real builder integration завершился exit1/BLOCKED_BUILD. По Owner STOP после обязательного FAIL дальнейшие исправления и suites не выполнялись. Candidate неполный, не готов к publication/production. Ранее принятая Generation Store qualification остаётся исторически принятой и не переименовывается в завершение B2.

### 12.1 Preflight, сохранность и scope

Fresh `git fetch origin`: HEAD и origin/main остались49f6823768817b0390f215de42439cce523bf5d3. Та же branch feat/pr86-offline-pipeline-promotion/native worktree. Предыдущие uncommitted changes/reports сохранены, нет checkout/reset/rebase/stash/commit/push/PR. Owner-added `report md files v3.zip` оставлен нетронутым.

Generation Store class сохранён **побайтово** (AST source segment сравнен с сохранённым generation_store.py прежнего evidence). Frozen CAS class/assertion и historical helper fixtures не редактировались. Root-helper/policy/authority,14 C2 paths, reader/ledger/production не менялись.

Incremental source candidate:

- `ops/c2/test_publisher_promotion.py`: historical CAS loader теперь читает независимо сохранённый **полный** OLD module из `ops/c2/fixtures/pipeline-store-old-module.json`; полный SHA256ef30e25b620633895d8778654b860942afb02e65e3a54fa1e1865efacaffc026 сохраняется как pre-exec guard. Текущий mutable publisher больше не используется даже как reconstruction basis. Новый полный fixture восстановлен до B2 edits и сверён с прежним independently pinned digest; source/assertion negative checks не ослаблялись. Этот изменённый harness после B2 ещё не запускался.
- `ops/c2/publisher-promotion.py`: bounded version-dispatched outer16-member v2 TAR/parser с descriptor/capsule hashes, точными Node/pnpm/platform/tree/package/lock/version/count identities и runtime-package versions; legacy14-member v1 inventory сохранён. Добавлена isolated object-store `source_admission_v2`: Git objects/bundle inspection без checkout, exact baseline ancestry/tree/lock/protected checks и tracked pipeline/closure bytes. **Source admission ещё не квалифицирован.**
- Production admission и direct Transaction.promote явно отвергают v2 (`artifact_v2_activation_disabled`) до transaction/authority/source switching. V1 source/protected/dependency gates не разрешают новый runtime transition. Существующий network producer/CI/ZIP policy flow не ослаблялся.
- `scripts/ops/build-sync-promotion.py`: unprivileged Linuxamd64-only dependency preparation, pinned pnpm distribution digest, frozen install с ignore-scripts/ignore-pnpmfile, полный graph с pinned CLI, runtime/native probes, indexed capsule, v2 descriptor и bounded TAR/qualification-ZIP checks до output publication. **Builder integration FAIL; эти части не считаются проверенными/завершёнными.**
- `.github/workflows/sync-publisher-build.yml`: явные unprivileged Linuxamd64 и final256MiB TAR checks. Новые producer bytes не включены в root policy; installed production authority не менялась. Workflow не запускался.
- Новый `ops/c2/test_pipeline_artifact.py`: fixtures/tests v1-v2 dispatch/descriptor/source IDs/hashes/version types/TAR extras/malformed/links/traversal/runtime version/activation barrier. Часть focused tests прошла; последние добавленные tests ещё NOT_RUN после STOP.
- Append-only этот report и существующий Design Contract.

### 12.2 Реальные команды и результаты

Evidence: `/home/denis/tmp/aktau-b2-artifact-d1crwufq/`.

| Команда/проверка | Exit | Реальный результат |
| --- | --- | --- |
| `git fetch origin` / HEAD+origin/main |0|49f6823768817b0390f215de42439cce523bf5d3 без drift |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` fail-first |1|5tests,16errors/subtest errors; v2 parser/descriptor/activation barrier отсутствовали; fail-first.log |
| Та же focused команда после первоначального parser implementation |0|5/5PASS; focused-after.log |
| Та же focused команда после builder integration edits, до добавления последних3tests |0|5/5PASS; focused-final.log |
| Real builder command через run-build.py ниже |1|BLOCKED_BUILD; builder-integration.log, builder-result.json |
| Полный текущий8-test artifact suite, Publisher/Root-helper/Ops/Pipeline regressions |NOT_RUN|STOP после обязательного integration FAIL |
| `git diff --check` |0|финальная integrity проверка |

Последние3 test methods (unapproved graph version/self-consistent hashes, malformed outer types/extra/capacity, v1 payload smuggling) добавлены перед builder run, но не запускались после него. Их нельзя засчитывать PASS. Producer/CI negative regression coverage старого suite сохранён, но полный suite на новом candidate не запускался.

Фактический real builder invocation:

```text
python3 -B scripts/ops/build-sync-promotion.py
  49f6823768817b0390f215de42439cce523bf5d3
  /home/denis/tmp/aktau-b2-artifact-d1crwufq/promotion.tar
  1 1 2 1 build-only
```

Это local integration с **явно синтетическими producer IDs**, не authenticated GitHub artifact и не release approval. Runner использовал non-root UID1000, PATH с существующим cached Go1.27.3 toolchain и pinned public Node24.18.0 из design evidence, GOTOOLCHAIN=local. Runtime secrets/env не передавались. Никаких pnpm/root install на VPS или source checkout. Предварительное обнаружение system Go1.27.1 не скрывалось; для integration выбран существующий cached1.27.3.

### 12.3 Builder failure: доказанное и неизвестное

Builder CLI вернул только `BLOCKED_BUILD`, exit1. Его старый catch-all handler не сохраняет stage/error enum, subprocess stderr тоже подавлен. **Точное место первого FAIL этого invocation не доказано**, поэтому ни Go build, ни pnpm install/runtime/capsule/source-admission steps отдельно не объявляются PASS. Повторный builder/installer для диагностики после STOP не запускался.

Отдельно read-only inspection реального `git archive ... pipeline` доказал ошибку нового guard: первый member имеет name **`pipeline`**, isdir=True, тогда как prepare_pipeline требует `member.name.startswith('pipeline/')` для всех members. Поэтому такой guard детерминированно отклонит валидный root directory при достижении этой стадии. Это подтверждённый local source defect, но без stage trace нельзя утверждать, что именно он был первым fail в текущем builder run. После обязательного FAIL не исправлялся.

Следующий узкий fix должен: разрешить только точный root member pipeline/isdir наряду с безопасными descendants; добавить safe closed-enum builder stage/reason diagnostics без stdout raw payload/credentials; воспроизвести/устранить фактическую причину до повторения mandatory integration. Это не основание увеличивать archive caps или bypass source/producer checks.

### 12.4 Artifact size, activation и remaining gates

`promotion.tar` не создан. Реального final artifact/ZIP размера или SHA256 нет; старые260.5MB estimates не подменяют требуемое измерение. Limits256MiB outer ZIP/TAR,96MiB capsule,90MiB logical не менялись. Qualification ZIP builder — только локальная size check, никогда не GitHub original ZIP/provenance.

Source admission function остаётся offline candidate; она не даёт root approval и не подключена к activation. Никаких source checkout, mount/runtime selection, authority writes, journal-v2/source+dependency+14-target transaction, root upgrade или OLD baseline enrollment. Отдельная activation barrier требуется до будущей полной source/dependency/C2 rollback qualification.

После устранения builder blocker нужны: полный8-test focused и source-bundle negative cases, actual complete artifact/capsule/runtime/native/package graph и size measurements; полные Publisher/Root-helper/Ops/Pipeline regressions; workflow/builder integration и повторная safety/provenance review. Никаких CI/PR/production PASS для этой части пока нет. Historical Stage B1 accepted tests не выданы за B2 results.

Нет SSH/VPS, merge/production changes, manual sync/ingest/HMAC/AUTO DEPLOY/C2 SLA/authority changes. **BLOCKED_ARTIFACT_V2. STOP для независимого Code Review.**


## 13. One-shot Part B completion and local qualification — 2026-11-03

Status: **PART_B_SOURCE_READY_FOR_INDEPENDENT_REVIEW**. This is an uncommitted,
source-only candidate, not an installed release or production acceptance.
Branch `feat/pr86-offline-pipeline-promotion`; HEAD / fetched origin/main:
`49f6823768817b0390f215de42439cce523bf5d3`. Previous failed qualification and
historical report sections are retained. Active internal schemas and the precise
systemd namespace handoff are specified in Design Contract §18.

### B2 — bounded builder and independently authenticated admission

The real Git archive begins with directory `pipeline`; the former guard rejected
that legitimate member. The replacement accepts precisely that directory and
bounded descendants, rejects duplicates, alternate roots, traversal, PAX and
unexpected types, and reports closed build-stage/reason enums. Further real
builder qualification exposed official pnpm's inactive cross-platform native
reflink files: the exception is restricted to four independently indexed inactive
files, with active Linux ELF checks retained. No install hooks or pnpmfile run;
no raw subprocess payload is emitted. Bounded subprocess groups are reaped.

The new version-2 outer TAR has exactly 16 regular members. A strict descriptor
binds exact source, PR86 tree/package/lock, Node/pnpm/Linux identities, inventory
and capsule. Version 1 retains its 14-member format. Source admission checks the
actual Git bundle and precisely the approved contracts-lock pair; other protected
changes remain blocked. The private root proof is constructed only following
independent GitHub original archive, producer, main and CI verification. An
uploader cannot supply that proof. Policy v1 cannot admit dependency switching.

Real Linux/amd64 non-root local builds (synthetic build-only CI identifiers):

| Build | TAR bytes | SHA256 | qualification ZIP bytes |
| --- | ---: | --- | ---: |
| OLD v1 | 172400640 | `4e504d0a65d3bea0da90202919db2914e07ce1f5f2b0bd17504f615f3884b971` | 72296613 |
| Current v2 | 261130240 | `a0725cc1ae7a783da17bf62d29bff20e8372cc98370355d7c2ec8a3844295f7a` | 93475038 |

The v2 TAR is below 268435456 bytes, with 7305216 bytes remaining. Caps were not
raised. Node v24.18.0, pnpm 10.32.1 and Go 1.27.3 are pinned. These local build-only
artifacts contain committed baseline source, not the uncommitted producer changes;
they are qualification inputs, **not a future production authorization**. A new
reviewed source SHA, hosted CI and authenticated artifact are mandatory later.

### B3 — direct generation and coupled rollback

The previous stage-to-generation rename design remains superseded. Direct
root-private content-addressed generations use durable registration before mkdir,
pinned descriptors, no-clobber, full graph verification before and after seal,
and no automatic cleanup/reuse of unknown generations. Frozen historical CAS
source/assertion bytes remain independent of current code.

The real 740-directory graph exposed a descriptor-lifetime error: construction
and verification descriptors overlapped and exhausted the process FD budget.
Construction descriptors now close after chmod/fsync while pinned anchors remain;
independent post-seal verification then succeeds without increasing OS limits.

Version-2 journal couples actual Git source, selected dependency mount and all
original 14 C2 targets. Fixed resources retain the authenticated bundle, manifest,
descriptor, capsule, twelve payloads and rollback backups. Child PID/start/boot
identity is durable before exec. Unknown cleanup, torn pending files, inode/CAS
mismatch or live-child uncertainty retain interlock and resources. Fail-first
fsync-EIO testing found that pending metadata could previously permit another
promotion; unknown-pending admission now rejects it before writes. Rollback
receipt replay is allowed only for identical already-committed bytes, never an
overwrite. Restored mount identity is retained across interrupted recovery.

Historical v1 `last.json` has only `identity`, without a version field. Its exact
shape is preserved. Independently completed enrollment additionally binds the
specific legacy terminal receipt name and SHA256. Legacy dependency-unbound
rollback fails closed. Reader and latest ledger entries survive rollback.

Real OLD→NEW→OLD qualification used actual Git, root-private bundle FD, distinct
UID1999, both public dependency graphs, actual ELF binaries and all 14 targets.
Enrollment/CI authorization were explicitly synthetic isolated test fixtures.
No production trust record was created.

### B4 — immutable runtime and real systemd qualification

Fixed `pipeline-pnpm` accepts only the six approved script argv families,
checks actor/source/mount/authority, rejects environment injection, and invokes
the pinned pnpm graph without NODE_PATH. Actual Node/ESM imports and execution
verified Zod4.6.7, tsx4.23.15, esbuild0.28.2, undici7.30.1, one Linux native addon
and 25 Dina/Dana/Fix Price fixture products. All six shim argv passed the real
boundary using a test execution sink; business sync was not run.

A real mount fail-first reproduced following an operator-owned target symlink.
Mount source/target now use pinned no-follow descriptors and exact ownership,
mode and identity checks. ENOSPC, EBUSY, foreign parents/inodes, graph tamper,
SIGKILL boundaries, partial writes, stale seals and unknown resources are tested.
The root integration includes 23 individual v2 crash boundaries, including all
14 target replacements. These are actual disposable filesystem/mount operations.

Real systemd PID1 testing found `/proc/1/ns/mnt` access unavailable under the
bounded service capabilities. No CAP_SYS_PTRACE was granted. Systemd OpenFile
passes only `/proc/1/ns/mnt:host-mount:read-only`; the service validates manager
PID, FD count/name/type/access and current namespace inode, consumes fd3, and
retains a CLOEXEC duplicate. This requires systemd >=253. Both actor units waited
at the dependency barrier, then the root oneshot restored the committed mount
and both read-only actor gates exited 0. Actor capabilities after UID drop were
zero. Custodian isolation and timer schedules are unchanged.

Container setup failures (missing fixture FOWNER/SETPCAP, private cache path,
then namespace FD permission) are retained in evidence, separately from source
fixes. Only owned container namespaces/cgroups were used. **Actual kernel reboot
was NOT_RUN**; service startup/mount reconstruction is not reboot evidence.

### B5 — read-only verifier and OLD baseline boundary

Fixed root read-only verifier checks source/tree, mounted inventory and seal,
Node/pnpm, 12/12 closure, C2 authority, retained release and reader/ledger custody.
Underlying checkout is inspected only in a bounded private child mount namespace;
parent runtime mount remains intact. Unknown hidden files, timeout/cleanup and
tamper fail closed. The actual-artifact sandbox returned
`PRODUCTION_SOURCE_RUNTIME_ALIGNED`, `c2Acceptance=NOT_MEASURED`.
This is a **sandbox result, not VPS evidence**.

Read-only OLD input capture uses pinned no-follow descriptors and bounded hash,
link, mode, owner and inode inventory. It always reports
`LEGACY_DEPENDENCY_INPUT_NOT_AUTHORIZED`; an installed node_modules tree is not
self-authenticating. A synthetic public fixture captured 4813 entries, rejected
unknown private paths without reading them, and detected altered Zod. Real VPS
OLD baseline and independent authorization remain unavailable and unmodified.

### Executed qualification and limits

Commands ran from this worktree. Full logs, failed iterations, scripts and exit
records are in `/home/denis/tmp/aktau-part-b-one-shot-6wst5sq4`.
Node ops used v24.10.0; artifact runtime remained v24.18.0. Go used 1.27.3.
Counts below overlap; they must not be summed as unique tests.

| Actual command / qualification | Result / exit |
| --- | --- |
| `node scripts/ci/run-checks.mjs ops` | 259 Python + 186 Node PASS; 0 SKIP; exit0 (`ops-current-qualified.log`) |
| Python publisher suite / generation subset | 64/64 and 20/20 PASS, included in current ops |
| Python historical root-helper suite | 33/33 PASS, included in current ops; helper implementation untouched |
| `node scripts/ci/run-root-bundle-integration.mjs` | 71 real root/helper/installer + 10 Linux mount tests PASS; 0 SKIP; see final exit record |
| `python3 -B .../run-full-artifact.py` | actual OLD→NEW→OLD, graph runtime, v1 enrollment baseline, read-only verifier PASS; exit0 |
| `python3 -B .../run-systemd.py` | real systemd root oneshot and both waiting actor gates SUCCESS/exit0 |
| C2 full Node tests with local Go1.27.3 relayprobe | 377/377 PASS, 0 SKIP; `c2-final-2.log`, exit0 |
| `node scripts/ci/run-checks.mjs pipeline` | frozen install, pipeline tests, typecheck PASS; exit0 |
| `go test -count=1 ./...` (backend-go) | PASS; exit0 |
| `go test -race -count=1 ./...` (backend-go) | PASS; exit0 |
| `go vet ./...` (backend-go) | PASS; exit0 |
| `node scripts/ci/run-checks.mjs security` | policy/secret guards and synthetic backup guards PASS; exit0 |
| `node scripts/revalidation/verify-part16.mjs` | PASS; exit0, not production evidence |
| contracts profile | lint + 12 PASS, **10 fixture HTTP SKIP**; exit0, not 22 executed PASS |
| Nest profile | generate/build/audit + 28/28 PASS; exit0 |
| frontend profile | lint/typecheck/build/audit + 278 unit PASS; E2E 57 PASS, **11 SKIP**; exit0 |
| `node scripts/ci/run-db-integration.mjs` | disposable PG17 migrations/integration/C2 real CLI/FIFO/READY/COMMIT/AFTER PASS and cleanup; exit0 |
| `node scripts/ci/run-ephemeral-staging.mjs` | API healthy/non-root/read-only, DB outage/recovery without API restart and cleanup PASS; E2E 14 PASS, **6 SKIP**; exit0 |
| Python AST / JS syntax; `git diff --check` | PASS; exit0, integrity record in review archive |
| Hosted CI9 for changed source | **EXTERNAL_GATE_NOT_RUN**, no publication authorized |
| Actual kernel reboot; production inventory/promotion/C2 | **NOT_RUN** |

First C2 sweep used a nonexistent relayprobe path and failed; the correct existing
`backend-go/internal/revalidation/testdata/relayprobe` was built and the full
377-test rerun passed. Optional contract/frontend/staging skips are retained and
are not presented as production, physical Siri or zero-skip qualification.

### Exact scope, preservation and next gates

The review archive contains `review/manifest.json`: each reviewed source path,
changed/new status, purpose, applicable checks and SHA256; `review/diff.patch`
contains the full tracked binary diff. The manifest is the exact file list,
including required new tests and frozen fixtures. No Go, frontend, parser,
contracts, DB, API or dependency lock source was modified. Historical frozen
fixtures and the Owner's unrelated ZIP remain byte-identical. Both report
prefixes and existing README/handoff history are preserved append-only.

Archive path:
`/home/denis/tmp/aktau-part-b-source-review-20261103-6wst5sq4.tar.gz`.
Archive SHA256 and safe-member/byte-match checks are recorded alongside it and
returned to Owner; the digest is not embedded recursively inside the archive.
Large generated build TARs, node_modules, private environment, TODO, .git and
Owner's ZIP are excluded. Evidence retains initial failures as well as final PASS.

Remaining release gates, in order: independent source review → authorized commit
and PR → exact-new-main CI9 → real kernel boot qualification where available →
separate authorized bounded VPS OLD inventory → independent actual OLD enrollment
and exact-purpose new root bootstrap/pins review → authenticated new immutable
artifact → separately authorized production transaction/readback. Historical
consumed helpers cannot be reused. Artifact size headroom is only about 6.97 MiB;
future source changes must pass the same cap. Root/admin is trusted; this does not
claim resistance to a compromised root. No SSH, production mutation, source
publication, approval, AUTO DEPLOY or artificial C2 events were performed.


## 14. Independent-review P1 capacity corrections — 2026-11-03

**SOURCE_CAPACITY_GATES_READY_FOR_INDEPENDENT_REVIEW**. The independent review
remains CHANGES_REQUESTED until a new external decision. Nothing is installed,
committed or published. Branch and HEAD remain
`feat/pr86-offline-pipeline-promotion` /
`49f6823768817b0390f215de42439cce523bf5d3`; fetched origin/main is the same SHA.
Execution scope is §6 of `PART_B_INDEPENDENT_CODE_REVIEW_20261103.md`.
Historical report/contract prefixes, frozen fixtures and unrelated Owner ZIP are
preserved byte-for-byte. Prior source-only gates have not become production PASS.

### Reproduction and minimal correction

Two new tests first failed against the reviewed code with **Blocked not raised**:
(1) host MemAvailable large but cgroup headroom insufficient, (2) target-parent
filesystem has no free space while BASE is healthy. Command:
`python3 -B -m unittest discover -s ops/c2 -p test_pipeline_release.py -k CapacityAdmissionTests`.
Fail-first exit1 and complete output are retained as `capacity-fail-first.log`.
The original assertions were retained; final expanded capacity matrix is12/12,
exit0 (`capacity-final-root.log`).

Only these implementation/test files changed since the reviewed archive:

- `ops/c2/publisher-promotion.py`: cgroup-aware memory admission, explicit peak
  buffers, fixed per-device disk plan and bounded source pack/tree accounting;
- `ops/c2/test_pipeline_release.py`: twelve focused capacity regressions;
- `ops/c2/pipeline_runtime_integration.py`: actual separate tmpfs capacity test.

The same Part B Report and Design Contract are appended, with active capacity
rules in Contract §19. No journal fields, artifact version, authority, root pin,
rollback semantics or runtime selection mechanism was changed by this correction.
No source outside these five paths changed since this review cycle began.

Memory headroom is the minimum of kernel MemAvailable and all finite visible
cgroup-v2 ancestor `memory.max - memory.current` values, with an additional64MiB
reserve. Missing child data, unsupported hierarchy and malformed budgets fail
closed. The real kernel hierarchy root without both limit interfaces is handled
only after controller/interface validation, not as a child fallback. No swap is
counted. Combined ingress peak covers input/read copies, TAR buffers, capsule
parsing/materialization and interpreter/inventory overhead. No cap was raised.
The production operator must verify visibility of the controlling hierarchy;
this check is not a kernel memory reservation against later unrelated pressure.

Disk admission runs before release intent/mkdir. A pinned-descriptor plan covers
BASE, releases, capsules, state, mounts, each real target parent, selection and
mount-record parents, publisher checkout and Git object storage. Each real
st_dev accumulates file/block/inode high water: retained payload + materialized
generation + old backups + new staged copies + possible rollback restore +
metadata/pending copies. Distinct filesystems get their own64MiB and256inode
reserves; same-device observations use minimum available values, including
quotas. Unknown/subordinate mounts or invalid resource metadata fail closed.
No legacy data is deleted/reclaimed to pass admission. Both source checkout trees
are bounded, pack object count bounds index allocation, and fixed
`fetch.unpackLimit=0` prevents loose-object expansion from defeating that budget.
Temporary source inspection checks its own filesystem before pack import.

### Real Linux evidence and executed regression matrix

A new owned container with **128MiB memory and128MiB memory+swap** limit,
readonly root/no network/no capabilities, rejected a128MiB request with
`insufficient_memory_capacity` (exit0 for the negative qualification). Its host
MemAvailable was not used to bypass its cgroup. No controller setting was changed.

A new native test mounted a **1MiB tmpfs** on the target parent inside the owned
root sandbox, proved st_dev differs from BASE, and got
`insufficient_disk_capacity` before intent. Marker bytes/old tuple remained;
normal unmount succeeded. It did not touch host/production mounts.

All commands ran in this worktree; Node ops24.10.0, artifact Node24.18.0,
pnpm10.32.1, Go1.27.3. Logs and command scripts are in
`/home/denis/tmp/aktau-capacity-review-vacg14fz` and the review archive. Counts
below overlap and must not be summed as unique tests.

| Command / actual evidence | Result | Exit |
| --- | --- | ---: |
| CapacityAdmissionTests | 12/12 PASS | 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` | 12/12 PASS | 0 |
| Publisher suite; PipelineGenerationSafetyTests subset | 64/64;20/20 PASS | 0 |
| Historical root-helper suite | 33/33 PASS; frozen source unchanged | 0 |
| `node scripts/ci/run-checks.mjs ops` | **271 Python +186 Node PASS;0 SKIP** (`ops-final-reviewed.log`) | 0 |
| `node scripts/ci/run-root-bundle-integration.mjs` | 71 root/helper/installer +11 native Linux tests PASS;0 SKIP | 0 |
| Real low-cgroup container (`real-cgroup.log`) | bounded rejection PASS | 0 |
| Actual non-root v2 builder (`run-build-final.py`) | complete16-member bounded artifact PASS | 0 |
| Actual OLD→NEW→OLD (`run-full-artifact.py`) | source/deps/14 targets +runtime imports +private underlying check PASS | 0 |
| Real systemd PID1 (`run-systemd.py`) | both actors wait; root mount reconstruction; three SUCCESS statuses | 0 |
| `node --test scripts/revalidation/*.test.mjs scripts/ci/guard.test.mjs`, C2_LOCAL_PROBE set to local1.27.3 ELF | 377/377 PASS;0 SKIP | 0 |
| `go test -count=1 ./...` in backend-go | PASS, including Voice | 0 |
| `go test -race -count=1 ./...` in backend-go | PASS | 0 |
| `go vet ./...` in backend-go | PASS | 0 |
| `node scripts/ci/run-checks.mjs pipeline` | frozen install/tests/typecheck PASS | 0 |
| `node scripts/ci/run-checks.mjs security` | policy +synthetic backup guards PASS | 0 |
| `node scripts/revalidation/verify-part16.mjs` | static boundaries PASS | 0 |
| `node scripts/ci/run-db-integration.mjs` | disposable PG17 migrations, Go/C2 real CLI/FIFO/publication fixtures, cleanup PASS | 0 |
| contracts profile |12 PASS,10 SKIP (fixture HTTP not executed there) | 0 |
| Nest profile |generate/build/audit +28/28 PASS | 0 |
| frontend profile |278 unit PASS; E2E57 PASS,11 SKIP; build/lint/types/audit PASS | 0 |
| Ephemeral Staging | Docker health/DB outage/recovery/cleanup PASS; fixture contract18 PASS,4 SKIP; E2E14 PASS,6 SKIP | 0 |
| AST/syntax, `git diff --check`, exact scope/history/fixture preservation | PASS | 0 |
| New hosted exact-head CI9 | EXTERNAL_GATE_NOT_RUN: Git publication forbidden | — |
| Actual kernel reboot; VPS inventory/promotion/acceptance | NOT_RUN | — |

The first copied real-artifact/systemd harness omitted its public
`capsule-probe.mts` input and failed with FileNotFoundError. Those failures and
exit1 are preserved; the missing local test input was copied byte-identically,
then full runs passed. This was not a production failure or Store protection PASS.
One intermediate concurrent ops run had Python270 PASS but Node185/186: the
23-boundary SIGKILL test reached its unchanged60s subprocess deadline under
parallel build/regression load. Failure/timeout is retained. No assertion or
limit was relaxed; the final current-source profile passed271+186. Differences
in count reflect the final added cgroup-root compatibility regression.

### Rebuilt size/source comparison

Both builds use source `49f6823768817b0390f215de42439cce523bf5d3` and synthetic
build-only producer IDs, not independent GitHub release authorization.

| Artifact | TAR bytes | qualification ZIP bytes | TAR SHA256 |
| --- | ---: | ---: | --- |
| Previous review build |261130240|93475038|`a0725cc1ae7a783da17bf62d29bff20e8372cc98370355d7c2ec8a3844295f7a`|
| Final rebuilt candidate input |261130240|93474995|`ec59e0b3a52e75da6cefdb2fe574bc1a9d023f635faec858b01055c6d9288f39`|

TAR margin remains7305216 bytes under256MiB. Graph hashes are independently
indexed per build; byte-reproducibility across preparation times is not claimed.
The local artifact binds the committed baseline source, not a future uncommitted
root-executor commit. New reviewed producer source/pins/CI/authenticated artifact
remain mandatory before any installation. Large build TARs are retained outside
the compact review source archive.

### Fresh-main acceptance and remaining gates

The local verifier's `PRODUCTION_SOURCE_RUNTIME_ALIGNED` means installed approved
tuple consistency, not equality to the current remote main. Future authorized
acceptance must separately timestamp a fresh GitHub main observation and compare
it with measured deployed SHA plus reviewed artifact SHA. Missing/drifted proof
is `MAIN_PARITY_NOT_VERIFIED/BLOCKED`; local tuple PASS cannot replace it. No
network dependency was introduced into the verifier and no live DB/Git parity
claim is made. Source/runtime parity is separate from future natural C2 3/3.

The new single review archive is
`/home/denis/tmp/aktau-part-b-capacity-review-20261103-vacg14fz.tar.gz`.
Unlike the previous diff-only package, it includes clean baseline source needed
to reproduce tests, current changed/new paths, exact binary diff, capacity-only
diff, manifest, sanitized logs and original FAIL evidence. It excludes .git,
TODO, dependency/build directories, Owner ZIP, DB data, env/secrets and large
build artifacts. Its SHA256/safe-member/byte-match verification is external to
avoid a recursive digest. Existing review archive and old evidence are retained.

Remaining gates: independent source review; separately authorized publication
and exact-new-head CI9; real root/bootstrap/pins review; authorized real OLD VPS
inventory and baseline enrollment; systemd>=253/OpenFile capability check;
real reboot qualification; authenticated artifact and approved promotion; fresh
main/deployed/artifact comparison; natural C2 acceptance. No SSH, production
writes, root upgrade, sync/HMAC, AUTO DEPLOY, Git publication or physical Siri
retesting occurred. Root/admin remains trusted; admission checks do not defeat
compromised root or reserve all resources against later external pressure.


## 15. PR87 native mount qualification: diagnostics candidate, hosted environment blocker (2026-11-03)

**Status: BLOCKED_WITH_EVIDENCE. Production remains NO-GO.** This uncommitted
candidate improves prerequisite failure diagnostics and bounded failure capture;
it does **not** establish that the mandatory hosted mount blocker is fixed.
No new hosted run, commit, push, PR edit, SSH or production operation occurred.
PR87 remains Draft at `fc50dc392fc5a70d87ce7c20cc512e0c6f83265d`, parent/main
`49f6823768817b0390f215de42439cce523bf5d3`. Previous hosted run `41642315453`,
attempt 1, still has Go Quality/CI Gate FAILURE and PostgreSQL/Staging SKIPPED;
five other jobs succeeded. Skipped jobs are not qualified.

### 15.1 Evidence and limits of the diagnosis

Canonical prior source archive SHA256 remains
`bec51754fa2aa4feae213df7d82c01799f8135d1da022637da3fa7d56a0487fa`.
Original full available sanitized hosted failure transcript and prior CI matrix
are retained in the new evidence directory. That run did not record first mount
errno, effective LSM profile or capability metadata; its `pipeline_mount_syscall`
exception alone cannot distinguish AppArmor, seccomp, capability, kernel or
filesystem denial. Tail-only capture discarded useful early output.

Local environment: UID1000 host, Node24.10.0, Go1.27.3, Linux/amd64 WSL2
`6.18.54.1-microsoft-standard-WSL2`; owned Docker fixture runs UID0 with exact
CapEff/Prm/Bnd `00000000002000e3`, seccomp mode2, cgroup2, no network,
no-new-privileges, readonly root/source, /tmp bounded1GiB, memory2GiB,
CPU2, pids128. Docker security options list built-in seccomp and cgroup namespace.
AppArmor kernel parameter is N; current LSM label is the kernel label (a NUL
terminator was accounted for). **LOCAL_LSM_PARITY_NOT_VERIFIED**: this is not an
AppArmor-confined hosted runner. No unconfined/privileged flags, extra
capabilities, host namespace, host mount or host security policy changes were used.

Actual local tmpfs, bind, read-only remount, move, unmount and private namespace
operations return errno0. Root/tmp propagation is private, source is readonly,
manager/user namespace checks pass, and parent mount namespace is unchanged.
These facts qualify the local fixture only, not hosted AppArmor compatibility.
Docker documents that its default AppArmor profile denies mount; that supports
an LSM hypothesis, not proof of the original runner's actual denial:
https://docs.docker.com/engine/security/apparmor/ and
https://github.com/moby/profiles/blob/main/apparmor/template.go .

### 15.2 Minimal scoped candidate and preserved invariants

Seven paths differ from published HEAD (including this append):

- `ops/c2/pipeline_runtime_integration.py`: module prerequisite gate before the
  existing native class. All existing classes/methods/assertions are AST-identical
  to published HEAD, including 11 methods and the 23 SIGKILL phases.
- `scripts/ci/run-root-bundle-integration.mjs`: invokes scoped prerequisite/capture
  unit tests and uses bounded capture for only the native Docker command.
  Existing Docker arguments, capabilities, deadlines and owned cleanup stay intact.
- `scripts/ci/native-mount-preflight.py`: fixed test-only metadata and real syscall
  prerequisite probe; no production authorization, public path override or policy
  installation. Rejects absent SYS_ADMIN, extra capabilities, unknown LSM,
  unconfined/unknown seccomp, writable source, bad namespace/propagation.
  A forked child records first errno, creates only bounded owned scratch mounts,
  unshares a private namespace and verifies readonly/move semantics. Child timeout,
  cancellation and unverified cleanup fail closed; original parent namespace is checked.
- `scripts/ci/test_native_mount_preflight.py`: 13 metadata/lifecycle tests,
  including timeout, cancellation and child cleanup failure; these unit tests
  are explicitly distinct from real kernel qualification.
- `scripts/ci/native-mount-capture.mjs`: fixed Docker caller, 180s existing
  deadline and 2MiB total bounded sanitized capture; reports truncation/timeout/
  startup failure and never converts incomplete output to success.
- `scripts/ci/native-mount-capture.test.mjs`: six bounded output, sanitization,
  first-failure retention, timeout, overflow and startup regressions.
- This cumulative Part B report: append-only section15; all earlier bytes retained.

Production publisher/parser, generation store, capacity gates, runtime selection,
rollback, authority, workflow, Design Contract, frozen historical fixtures,
Go/pipeline/frontend and the executable shim bytes/mode are unchanged.
No existing safety assertion, skip policy, mount fallback or CI gate is relaxed.
Root/admin remains trusted; this candidate does not defend compromised root.

### 15.3 Fail-first and negative qualification

Inside an owned disposable Docker container, an additional restrictive seccomp
filter denies the mount syscall with EPERM. It adds a denial; it does not relax
Docker's existing filter or modify host policy. The exact frozen HEAD native
fixture (SHA256 `958b3b8849eb66faef29efa0d95c3be37be7c5a79d2d507d79d0766d4c57f4a8`)
then reproduces 1 failure/31 errors over11 methods, exit1. This is controlled
failure-family reproduction, **not actual hosted RCA**. The first off-tree replay
used a misleading Python linecache filename; both transcripts are retained.
The corrected replay compiles the actual frozen path, retains ROOT resolution,
and independently verifies frozen bytes against `git show HEAD`.

With the same real syscall denial, the new prerequisite gate returns BLOCKED,
`kernel_prerequisite_denied`, first operation `tmpfs_before_unshare`, errno1
`EPERM`, cleanup KNOWN, parent namespace unchanged. Negative wrapper exit0 means
expected rejection, not mount/native PASS. A separate real container without
SYS_ADMIN rejects before probing (`missing_sys_admin`, empty operations).
Latest negatives were repeated after final metadata changes; both wrappers exit0
and owned containers are absent afterward. Unknown LSM, seccomp and namespace
failures have unit coverage. Native ENOSPC/EBUSY/crash assertions remain active.
Comparable hosted LSM successful qualification and actual hosted first errno are
NOT_VERIFIED; no new CI run was authorized.

### 15.4 Actual commands and results

All commands use `rtk proxy`; project commands run non-root unless inside the
owned Docker root fixture. Node executable is
`/home/denis/.nvm/versions/node/v24.10.0/bin/node`; Go SDK is
`/home/denis/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin`
with `GOTOOLCHAIN=local`. No dependency/project version was changed.

| Command | Actual result / exit |
| --- | --- |
| `python3 -B -m unittest discover -s scripts/ci -p test_native_mount_preflight.py` | 13/13 PASS, 0 |
| `node --test scripts/ci/native-mount-capture.test.mjs` | 6/6 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_release.py -k CapacityAdmissionTests` | 12/12 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_pipeline_artifact.py` | 12/12 PASS, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_publisher_promotion.py` | 64/64 PASS locally, 0 |
| `python3 -B -m unittest discover -s ops/c2 -p test_root_executor_pair_upgrade.py` | 33/33 PASS, 0 |
| `node scripts/ci/run-checks.mjs ops` | 271 Python +186 Node PASS, 0 SKIP, exit0 |
| `node scripts/ci/run-checks.mjs security` | PASS, 0 |
| `node scripts/revalidation/verify-part16.mjs` | PASS, 0 |
| C2 Node regression suite (full scripts/revalidation tests + CI guard tests) | 377/377 PASS, 0 SKIP, exit0; transcript retained |
| In backend-go: `go test -count=1 ./...` | PASS, 0 |
| In backend-go: `go test -race -count=1 ./...` | PASS, 0 |
| In backend-go: `go vet ./...` | PASS, 0 |
| `node scripts/ci/run-root-bundle-integration.mjs` | Final candidate: 71 real root/helper/installer +11 real native tests PASS locally, 0 SKIP, exit0; 13+6 prerequisite/capture units PASS |
| `node --check` for three affected JS files; Python AST for three affected Python files | PASS, 0 |
| Existing native class AST equality to HEAD; `git diff --check` | PASS, 0 |
| Comparable hosted AppArmor/seccomp native qualification | NOT_VERIFIED |
| New exact-head hosted CI9 / PG17 / ephemeral staging | NOT_RUN in this source-only task |

The Python3.13 publisher63 PASS/1 ERROR timing risk remains historical evidence;
local64 PASS does not resolve or hide that independent risk. No timing assertion
was changed. Earlier failed hosted run and all local replay logs remain retained.

### 15.5 Review packet and precise next gate

Evidence directory:
`/home/denis/tmp/aktau-pr87-native-mount-fix-20261103-ncesbh7j`.
The off-tree clean archive includes full tracked source plus the four new CI
files, this report, exact HEAD-relative diff including new files, source inventory,
changed file SHA256/size/mode/status, original28-path freeze comparison, sanitized
logs, failure reproduction inputs and executable `review/REPRODUCE.md`.
External archive validation records safe regular members, uniqueness, byte-match,
report prefix and original frozen/production source preservation; archive digest
is external to avoid recursive hashing. Owner ZIP is unchanged and excluded.

Remaining essential gate: independent review of this diagnostic candidate,
followed by separately authorized Git publication/diagnostic CI on the real
runner to obtain its first errno and LSM/capability/namespace metadata; or an
approved comparable confined disposable host. Neither was available/authorized
here. A proven solution requiring host LSM policy changes or broad privilege
exceptions must STOP for security design review; it is not silently applied.
Therefore this task cannot honestly claim the hosted blocker removed or CI9
qualified. Existing PR source bytes were changed locally in disclosed paths and
have no new commit SHA or hosted qualification. No Git publication or production
mutation occurred. STOP pending independent review.

Packet verification note: an initial off-tree verification command used the
wrong shim path `ops/sync/pipeline-pnpm` and exited1 (FileNotFoundError).
Repository discovery confirmed `ops/c2/pipeline-pnpm`; the verifier was corrected,
without changing source, modes or assertions. This tooling failure is retained.
