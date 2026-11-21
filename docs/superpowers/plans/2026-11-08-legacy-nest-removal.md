# Вывод legacy NestJS — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** убрать Nest-приложение из репозитория и CI, заменив живой эталон parity-тестов записанными ответами, без изменений продакшена.

**Architecture:** новый пакет `backend-go/internal/testref` даёт адрес эталона в трёх режимах (живой / запись через прокси / проигрывание из файла). Пять CI parity-тестов берут адрес через него. Ephemeral Staging сначала доказывает, что запись совпадает с живым Nest, потом Nest удаляется. Шаг 2 отдельным PR переименовывает джобу `Nest Reference` в `DB Schema`.

**Tech Stack:** Go 1.27 (`net/http/httptest`, `encoding/json`), Node 24 CI-скрипты, pnpm 10.32.1, Prisma 5.22.0, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-08-legacy-nest-removal-design.md`

## Global Constraints

- В шаге 1 под защищёнными путями деплоя (`backend/prisma`, `contracts`, `deploy/compose.production.yml`) не меняется ни один файл: активный релиз 1cbd535 совпадает с `main` в этих путях, и так должно остаться. `backend/prisma/seed.ts` удаляется только в шаге 2. `scripts/ci/postgres.mjs`, `check-source.mjs`, `auto-transport.mjs` в шаге 1 не трогаются.
- База веток: `origin/main` 1cbd535 или новее; перед каждым push — `git fetch && git rebase origin/main`.
- Prisma остаётся 5.22.0.
- В шаге 1 не меняются `.github/workflows/ci.yml`, `scripts/deploy/**`, локальный CI вне репозитория; имя джобы `Nest Reference` и группа `nest` сохраняются.
- В CI 9 джоб в обоих шагах; CI Gate проверяет 8 needs.
- Go-код вне `backend-go/tests/` и `backend-go/internal/testref/` не меняется.
- Файл записи: `backend-go/tests/integration/testdata/reference/<TestName>.json`, JSON-массив, `json.MarshalIndent` с двумя пробелами, `\n` в конце; поля `method,path,contentType,body,status,responseContentType,response`.
- Ключ: `method`+`path`+`contentType`+`body`; повторы ключа проигрываются по порядку; промах — статус 599; сообщения об ошибках без тела запроса.
- Отчёты в `docs/**/reports` и старые планы не редактируются.
- Перед каждым push — `локальный CI-раннер вне репозитория` (все группы), все PASS.

## Review Focus

- Недетерминированный ответ эталона (таймстемп, порядок равных цен) → запись дважды подряд даёт одинаковые файлы; иначе нормализация до коммита (Task 3, шаг 3).
- Запрос из тела которого видно voice-маркер или координаты → сообщения missing/stale содержат только метод и путь (Task 1, `TestMessagesOmitBody`).
- Тест перестал слать один из записанных запросов → stale entry падает, а не молча проходит (Task 1, `TestReplayStale`).
- Режим записи случайно включён в hosted CI → Staging отказывается работать при `CI` и `REFERENCE_RECORD=1` (Task 2, шаг 4).
- Parity-тест молча стал `SKIP` после удаления Nest → проверка `-v` вывода на `--- PASS` для всех пяти (Task 4, шаг 7).

---

## Шаг 1 (PR 1): ветка `claude/legacy-nest-analysis-176153` от `main`

### Task 1: пакет `testref`

**Files:**
- Create: `backend-go/internal/testref/reference.go`
- Test: `backend-go/internal/testref/reference_test.go` (без build tag — идёт в `go test ./...` джобы Go Quality)

**Interfaces:**
- Produces:
  ```go
  package testref
  type Reporter interface {
      Helper()
      Errorf(format string, args ...any)
      Fatalf(format string, args ...any)
      Cleanup(func())
  }
  type Exchange struct {
      Method              string `json:"method"`
      Path                string `json:"path"`
      ContentType         string `json:"contentType"`
      Body                string `json:"body"`
      Status              int    `json:"status"`
      ResponseContentType string `json:"responseContentType"`
      Response            string `json:"response"`
  }
  // Start returns the reference base URL.
  // upstream!="" && !record -> upstream as is (live).
  // upstream!="" && record  -> recording proxy; file rewritten at Cleanup.
  // upstream=="" && !record -> replay server from file.
  // upstream=="" && record  -> Fatalf("reference: record requires REFERENCE_API_BASE_URL").
  func Start(r Reporter, upstream string, record bool, file string) string
  ```
  `*testing.T` удовлетворяет `Reporter`. Сервера закрываются через `r.Cleanup`.
- Сообщения (точный текст): `reference: missing exchange %s %s`, `reference: stale entry %s %s`, `reference: read %s: %v`, `reference: write %s: %v`.

- [ ] **Step 1: написать падающие тесты** в `reference_test.go`. Фейковый `Reporter` (`fakeReporter`) копит `errors []string`, `fatals []string` и `cleanups []func()`; метод `run()` вызывает cleanups в обратном порядке. Upstream — `httptest.Server`, отвечающий `status=201`, `Content-Type: application/json`, телом `{"echo":"<method> <path> <content-type> <body>"}`. Тесты:
  - `TestLiveModeReturnsUpstream`: `Start(r, "http://127.0.0.1:1", false, f) == "http://127.0.0.1:1"`, файл не создан.
  - `TestRecordThenReplay`: в режиме записи `GET /api/a?x=1`, `POST /api/v` c `application/json` и тот же `POST` с `application/x-www-form-urlencoded`; после `run()` файл существует, оканчивается `\n`, содержит 3 обмена в порядке запросов, повторный `json.MarshalIndent(..., "", "  ")` разобранного содержимого байт-в-байт равен файлу. В режиме проигрывания (upstream остановлен) те же три запроса дают те же статус, `Content-Type` и тело; `r.errors` пуст после `run()`.
  - `TestReplaySequence`: файл с двумя обменами одного ключа (ответы `"1"` и `"2"`): первый запрос получает `"1"`, второй `"2"`, третий — 599 и ошибка `reference: missing exchange POST /api/v`.
  - `TestReplayMissing`: запрос, которого нет в файле → 599, одна ошибка с точным текстом.
  - `TestReplayStale`: файл с двумя обменами, запрошен один → после `run()` ошибка `reference: stale entry GET /api/b`.
  - `TestRecordWithoutUpstream`: `Start(r, "", true, f)` → в `fatals` `reference: record requires REFERENCE_API_BASE_URL`.
  - `TestReplayMissingFile`: несуществующий файл → `fatals` начинается с `reference: read `.
  - `TestMessagesOmitBody`: промах с телом `{"text":"privacyprobeqzrvnxtkmwbdjlf"}` → ни одна ошибка не содержит `privacyprobe`.

  `Fatalf` фейка записывает сообщение и вызывает `runtime.Goexit()` (тест вызывает `Start` в отдельной горутине с ожиданием) — так проверяется, что после Fatalf код не продолжает работу.

- [ ] **Step 2: убедиться, что тесты падают**
  Run: `cd backend-go && go test ./internal/testref/ -count=1`
  Expected: FAIL, `undefined: Start`.

- [ ] **Step 3: реализовать `Start`** в `reference.go`. Прокси: читает тело запроса, шлёт `http.Client{Timeout: 20s}` на `upstream+RequestURI` с тем же методом и `Content-Type`, пишет ответ клиенту и добавляет `Exchange` под мьютексом. Проигрывание: `map[key][]Exchange` + счётчик на ключ под мьютексом; ключ — `method+"\x00"+path+"\x00"+contentType+"\x00"+body`; `Errorf` из handler-горутины допустим. Тело запроса и ответа ограничить `io.LimitReader(…, 1<<20)`. Запись файла — `os.MkdirAll` + `os.WriteFile(…, 0o644)`.

- [ ] **Step 4: тесты проходят, без гонок**
  Run: `cd backend-go && go test ./internal/testref/ -count=1 -race && go vet ./internal/testref/ && go tool staticcheck ./internal/testref/`
  Expected: `ok`, vet и staticcheck без вывода.

- [ ] **Step 5: commit**
  ```bash
  git add backend-go/internal/testref
  git commit -m "test(go): add recorded reference helper for parity tests"
  ```

### Task 2: parity-тесты и Staging берут эталон через `testref`

**Files:**
- Create: `backend-go/tests/integration/reference_helpers_test.go`
- Modify: `backend-go/tests/integration/http_parity_test.go`, `security_query_parity_test.go`, `content_type_parity_test.go`, `category_visibility_parity_test.go`, `voice_parity_test.go`
- Modify: `scripts/ci/run-ephemeral-staging.mjs`

**Interfaces:**
- Consumes: `testref.Start` (Task 1).
- Produces: `func referenceBase(t *testing.T) string` (build tag `integration`) = `testref.Start(t, os.Getenv("REFERENCE_API_BASE_URL"), os.Getenv("REFERENCE_RECORD") == "1", filepath.Join("testdata", "reference", t.Name()+".json"))`.

- [ ] **Step 1: подключить `referenceBase`** в `TestHTTPParity`, `TestLocalSecurityQueryParity`, `TestLocalContentTypeParity`, `TestLocalCategoryVisibilityParity`, `TestLocalVoiceParity`: вызывать один раз на верхнем уровне теста вместо `os.Getenv("REFERENCE_API_BASE_URL")`; из условий `t.Skip` убрать проверку пустого эталона (остальные условия — `GO_API_BASE_URL`, `HTTP_PARITY_CONFIRM`, БД — остаются). `TestLocalVoiceParity` передаёт результат в `voiceParity(t, target, reference)`. Проверки loopback не трогать — адрес `httptest` проходит их. Комментарии «Nest» в этих файлах → «reference». `TestLiveVoiceParity` в этом таске не трогать.

- [ ] **Step 2: compile check**
  Run: `cd backend-go && go vet -tags=integration ./tests/integration/ && go tool staticcheck -tags=integration ./tests/integration/`
  Expected: без вывода.

- [ ] **Step 3: Staging гоняет parity в двух режимах.** В `run-ephemeral-staging.mjs` вынести запуск пяти тестов в функцию `parity(label, extra)` (тот же `go test -count=1 -tags=integration ./tests/integration -run '^(TestHTTPParity|TestLocalSecurityQueryParity|TestLocalContentTypeParity|TestLocalCategoryVisibilityParity|TestLocalVoiceParity)$' -v` и те же env). Вызов 1: `parity('live reference parity', { REFERENCE_API_BASE_URL: 'http://127.0.0.1:13000' })`. Вызов 2: `parity('recorded reference parity', {})` — без `REFERENCE_API_BASE_URL`.

- [ ] **Step 4: режим записи в Staging.** Если `process.env.REFERENCE_RECORD === '1'`: при заданном `process.env.CI` — `throw new Error('reference recording is local only')` до создания БД; иначе после старта Go и Nest выполнить только `parity('record reference', { REFERENCE_API_BASE_URL: 'http://127.0.0.1:13000', REFERENCE_RECORD: '1' })` и выйти из колбэка (без replay, контрактов, e2e и Docker), освободив процессы в существующем `finally`.

- [ ] **Step 5: commit** (replay-прогон пока упадёт — файлов записи нет; push только после Task 3)
  ```bash
  git add backend-go/tests/integration scripts/ci/run-ephemeral-staging.mjs
  git commit -m "test(go): parity tests take reference through recorded helper"
  ```

### Task 3: записать эталон с живого Nest и доказать эквивалентность (push 1)

**Files:**
- Create: `backend-go/tests/integration/testdata/reference/TestHTTPParity.json`, `TestLocalSecurityQueryParity.json`, `TestLocalContentTypeParity.json`, `TestLocalCategoryVisibilityParity.json`, `TestLocalVoiceParity.json`

- [ ] **Step 1: первая запись** (Windows-хост, Docker Desktop запущен, из корня worktree)
  Run: `$env:REFERENCE_RECORD='1'; node scripts/ci/run-ephemeral-staging.mjs; Remove-Item Env:REFERENCE_RECORD`
  Expected: exit 0, в `-v` выводе пять `--- PASS`, появились пять файлов.

- [ ] **Step 2: commit** (локальный CI собирает код из коммитов, поэтому коммит до проверок)
  ```bash
  git add backend-go/tests/integration/testdata/reference
  git commit -m "test(go): record frozen v1 reference responses from Nest"
  ```

- [ ] **Step 3: вторая запись и сравнение**
  Run: тот же запуск, затем `git diff --exit-code -- backend-go/tests/integration/testdata/reference`
  Expected: exit 0. Если есть diff — найти плавающее поле, добавить нормализацию в сравнение соответствующего теста (по образцу `equalHTTPProducts`, отдельным коммитом), перезаписать файлы, закоммитить и повторить шаг 3.

- [ ] **Step 4: replay локально**
  Run: `локальный CI-раннер вне репозитория staging`
  Expected: `PASS staging`; в `logs/staging.log` блоки `live reference parity` и `recorded reference parity`, в каждом пять `--- PASS`.

- [ ] **Step 5: негативная проверка (локально, без коммита):** изменить одну цифру `response` в `TestLocalSecurityQueryParity.json` → `run-local.mjs staging` падает на `security query response mismatch`; удалить один обмен → падает с `reference: missing exchange`; вернуть файл `git checkout -- <file>`.

- [ ] **Step 6: полный локальный CI, push 1**
  ```bash
  локальный CI-раннер вне репозитория
  git push -u origin claude/legacy-nest-analysis-176153
  ```
  Expected: локальный CI `ALL PASSED`; открыть draft PR в `main`; hosted CI 9/9 success. Номер run записать в описание PR как доказательство эквивалентности.

### Task 4: удалить Nest-приложение

**Files:**
- Delete: `backend/src/`, `backend/test/`, `backend/scripts/`, `backend/tsconfig.json` (не `backend/prisma/seed.ts` — он в Task 6)
- Modify: `backend/package.json`, `backend/pnpm-lock.yaml`, `backend/.env.example`
- Modify: `scripts/ci/run-checks.mjs:26-29`, `scripts/ci/run-ephemeral-staging.mjs`
- Modify: `backend-go/tests/integration/smoke_test.go`, `rollout_test.go`, `voice_parity_test.go`

- [ ] **Step 1: удалить файлы** из списка Delete (`git rm -r`).

- [ ] **Step 2: `backend/package.json`** — поля `name`, `version`, `private`, `packageManager` как сейчас; `scripts: {"db:migrate": "prisma migrate dev"}`; `devDependencies: {"prisma": "5.22.0"}`; без `dependencies` и `pnpm.overrides`. `.env.example` — только строки `DATABASE_URL=` и `DIRECT_URL=` (значения-примеры как в текущем файле). Перегенерировать lockfile: `cd backend && pnpm install`.
  Run: `cd backend && pnpm install --frozen-lockfile && pnpm exec prisma validate`
  Expected: `The schema at prisma\schema.prisma is valid`.

- [ ] **Step 3: группа `nest`** в `run-checks.mjs`: `install('backend'); console.log(pnpm('backend', ['exec', 'prisma', 'validate']));` — `DATABASE_URL`/`DIRECT_URL` уже фиктивные в `env` из `common.mjs`.

- [ ] **Step 4: Staging без Nest:** убрать `Nest generate`, `Nest build`, запуск `node dist/src/main.js`, ожидание `Nest reference`, вызов `parity('live reference parity', …)` и прогон `contracts test:live` по `http://127.0.0.1:13000` (по Go остаётся). Режим записи (Task 2, шаг 4) теперь пишет с Go: `REFERENCE_API_BASE_URL: 'http://127.0.0.1:18080'`.

- [ ] **Step 5: ручные режимы на клоне** — у `smoke` удалить параметр `parity` и все ветки `if parity {…}`; `TestProductionClone` вызывает `smoke(t, target)`. Удалить `TestLocalCloneParity` и `TestLiveVoiceParity`. `TestLiveReadOnlyParity` → `TestLiveReadOnlySmoke` без требования `REFERENCE_API_BASE_URL`. `TestOperatorCloneParity` → `TestOperatorCloneRuntime` без разбора `REFERENCE_API_BASE_URL`, вызывает `smoke(t, value)`. Неиспользуемые после этого хелперы (`referenceJSON` и т. п.) удалить.
  Run: `cd backend-go && go vet -tags=integration ./tests/integration/ && go tool staticcheck -tags=integration ./tests/integration/`
  Expected: без вывода.

- [ ] **Step 6: commit**
  ```bash
  git add -A backend scripts/ci backend-go/tests
  git commit -m "chore: remove legacy NestJS app; backend keeps Prisma schema only"
  ```

- [ ] **Step 7: локальный CI**
  Run: `локальный CI-раннер вне репозитория`
  Expected: `ALL PASSED`; в `logs/staging.log` нет строк `Nest`, блок `recorded reference parity` содержит `--- PASS` для всех пяти тестов и ни одного `--- SKIP`.

### Task 5: документация и остатки названия NestJS (push 2)

**Files:**
- Modify: `README.md`, `backend-go/README.md`, `frontend/README.md`, `scripts/ci/README.md`, `docs/production/STAGING_PLAN.md` (не `contracts/` — защищённый путь деплоя)
- Modify: `frontend/src/api/httpAdapter.ts:26`, `frontend/src/api/httpAdapter.test.ts:44,51`, `pipeline/src/agent/gemini.ts:30`, `pipeline/src/mapping/taxonomy-sql.ts:15,37`

- [ ] **Step 1: README.md** — убрать бейдж NestJS и упоминания Nest как reference; стек Backend: «Go — production API; Prisma — схема и миграции PostgreSQL (`backend/prisma`)»; раздел «База данных»: миграции `cd backend && pnpm install && pnpm exec prisma migrate deploy`, локальная БД с данными — `backend-go/scripts/local-ingest-db.sh`; убрать `db:generate`, `db:seed`, `db:verify`, `backend/.env` с Gemini/Upstash; дерево каталогов — `backend/` = «Prisma schema и миграции».
- [ ] **Step 2: `backend-go/README.md`** — reference = записанные ответы в `tests/integration/testdata/reference`; процедура обновления: запустить `REFERENCE_RECORD=1 node scripts/ci/run-ephemeral-staging.mjs` локально, проверить diff записи в PR как изменение wire-контракта, при изменении формата v1 обновить `contracts/openapi.yaml` и `contracts/examples`.
- [ ] **Step 3: остальные файлы** — `frontend/README.md`, `scripts/ci/README.md`, `STAGING_PLAN.md`: без запуска Nest; комментарии и имена тестов в `httpAdapter*` — «API v1» вместо «NestJS»; `gemini.ts:30` — ссылка на `backend-go/internal/gemini`; `taxonomy-sql.ts` — «Go» без «и Nest».
- [ ] **Step 4: критерий**
  Run: `git grep -n -i nestjs -- ':!docs' ':!contracts'`
  Expected: пустой вывод.
  Run: `git diff --name-only main -- backend/prisma contracts deploy/compose.production.yml`
  Expected: пустой вывод.
  Run: `cd frontend && pnpm test src/api/httpAdapter.test.ts`
  Expected: PASS.
- [ ] **Step 5: commit, локальный CI, push 2**
  ```bash
  git add -A
  git commit -m "docs: describe Go-only API and recorded reference"
  локальный CI-раннер вне репозитория
  git push
  ```
  Expected: `ALL PASSED`; hosted CI 9/9; PR переведён из draft в ready; в описании — run push 1 (эквивалентность), run push 2 и строка: «защищённые пути деплоя не изменены; release из `main` проходит transport от 1cbd535 без нового исключения».

---

## Шаг 2 (PR 2): после merge PR 1, новая ветка от `main`

### Task 6: переименовать джобу в `DB Schema`

**Files:**
- Modify: `.github/workflows/ci.yml` (job `nest`, `needs` у `postgres` и `gate`)
- Modify: `scripts/ci/run-checks.mjs` (группа `nest` → `schema`)
- Modify: `scripts/deploy/auto-gate.mjs:6`, `scripts/deploy/auto-gate.test.mjs`
- Modify: `docs/production/GITHUB_BRANCH_PROTECTION.md:24`
- Modify: `scripts/deploy/auto-transport.mjs` (`approvedExceptions`)
- Delete: `backend/prisma/seed.ts`
- Modify (вне репозитория): `локальный CI-раннер вне репозитория`, `скрипт локального CI-раннера` (`ALL`)

**Interfaces:**
- Consumes: SHA активного релиза `ACTIVE` — пользователь присылает вывод `sudo grep -E '^API_IMAGE=' /etc/adilbaga/release.env` с VPS (формат проверен 2026-11-08: `API_IMAGE=adilbaga-api:<40-символьный SHA>`, других SHA-строк в файле нет); `ACTIVE` — тег после `:`, должен совпадать с `^[a-f0-9]{40}$`; blob `SEED` = `git rev-parse ACTIVE:backend/prisma/seed.ts` (на 1cbd535 — `5a9debc5abe9ba91367e935dfe22662f849847e7`).

- [ ] **Step 0: защищённые отличия до правок**
  Run: `git diff --name-only ACTIVE origin/main -- backend/prisma contracts deploy/compose.production.yml`
  Expected: пусто. Иначе остановиться: эти отличия не входят в этот PR и оформляются отдельно.

- [ ] **Step 1: падающий тест** — в `auto-gate.test.mjs` добавить проверку `assert.ok(mandatory.includes('DB Schema') && !mandatory.includes('Nest Reference'))`.
  В том же файле — тест `seed removal delta requires exact protected inventory and blob` по образцу `searchBlobs` (PR #105): `seedBlobs={'backend/prisma/seed.ts':[SEED,null]}`; полный набор проходит `verifyCompatibility(ACTIVE, reviewed)`; без пути, с чужим blob в любом из деревьев, с лишним `contracts/openapi.yaml`, с mode `120000` и при `fail:true` — `assert.throws`.
  Run: `node --test scripts/deploy/auto-gate.test.mjs`
  Expected: FAIL на обеих новых проверках.
- [ ] **Step 2: исключение и удаление seed** — в `approvedExceptions` первой записью `{active: ACTIVE, blobs: [['backend/prisma/seed.ts', SEED, null]]}` с комментарием «legacy Nest seed removal; no DB/schema change»; `git rm backend/prisma/seed.ts`.
- [ ] **Step 3: переименование** — `mandatory`: `'Nest Reference'` → `'DB Schema'`; `ci.yml`: job id `schema`, `name: DB Schema`, шаг `node scripts/ci/run-checks.mjs schema`, `needs: [go, schema, contracts, security]` у `postgres`, `schema` вместо `nest` у `gate`; `run-checks.mjs`: `group === 'schema'`; branch-protection doc; локальный CI: `nest` → `schema` в `known`, `expected`, примере использования и `ALL`.
- [ ] **Step 3a: хвосты из ревью PR #106** — метка `Nest frozen install` в `scripts/ci/postgres.mjs` → `Prisma frozen install`; в README фраза «в `backend/` больше ничего нет» → «кроме Prisma-пакета (`package.json`, lockfile, `.env.example`)»; в `backend-go/README.md` у команды перезаписи — «из корня репозитория, нужен Docker». `contracts/README.md:30` (`node dist/src/main.js`) правится только в PR, который и так меняет `contracts/` (защищённый путь).
- [ ] **Step 4: проверки**
  Run: `node --test scripts/deploy/auto-gate.test.mjs && node scripts/deploy/verify-auto-deploy.mjs && node scripts/ci/check-source.mjs`
  Expected: все PASS (эти же тесты гоняет группа `security` в CI). `git grep -n "Nest Reference\|run-checks.mjs nest" -- ':!docs/**/reports' ':!docs/superpowers'` пуст. `git diff --name-only ACTIVE -- backend/prisma contracts deploy/compose.production.yml` — ровно `backend/prisma/seed.ts`.
- [ ] **Step 5: commit, локальный CI, PR**
  ```bash
  git add -A .github/workflows/ci.yml scripts backend/prisma docs/production/GITHUB_BRANCH_PROTECTION.md
  git commit -m "ci: rename Nest Reference job to DB Schema; drop legacy seed"
  локальный CI-раннер вне репозитория
  git push -u origin <branch>
  ```
  Expected: `ALL PASSED`; hosted CI 9 джоб, среди них `DB Schema`, все success. В описании PR: `build` для SHA до этого PR больше не проходит `verifyCI`; откат — через образы на VPS (e50de25 и старше); transport-исключение покрывает только удаление `seed.ts` от `ACTIVE`.
