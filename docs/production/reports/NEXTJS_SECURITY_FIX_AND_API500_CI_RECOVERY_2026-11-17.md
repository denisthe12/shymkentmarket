# Next.js security fix и восстановление CI Go cancellation

Дата: 2026-11-17. Production не изменяется.

## 1. Причина и точный diff

Baseline main: a04bee643470753fd0874bc1b53d740a4593e618, проверен fresh fetch/ls-remote. Новый worktree `/home/denis/tmp/aktau-nextjs-security-20261117`, ветка `fix/nextjs-security-16.4.5`. Owner checkout и migration/Go worktrees сохранены.

PR137 HEAD51a4c732380c6e08a5777dec26d0820ad392d2a5 прошёл Go Quality/Security/PostgreSQL Integration, но CI44097017796 attempt1 завершился6success/2failure/1skipped из-за прежнего Frontend audit. [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h): next16.4.1 попадает в >=16.3.0 <=16.4.4; minimal patched16.4.5. Это dependency advisory, не доказательство эксплуатации сайта.

Минимальный source diff:

- frontend/package.json: только exact next16.4.1 →16.4.5.
- frontend/pnpm-lock.yaml: next, @next/env и platform-specific @next/swc16.4.5, integrity и snapshot references.
- Этот report.

Node24.10.0/pnpm10.32.1, React/ReactDOM19.3.0 locked versions и остальные package scripts/dependencies сохранены. Первоначальная штатная lockfile regeneration дополнительно передвинула postcss→nanoid3.3.19 на уже имеющийся3.3.20. Этот ненужный edge drift убран; lockfile повторно обработан pnpm install --lockfile-only --offline и frozen install PASS. Итоговый diff не содержит nanoid/PostCSS upgrades. Pages/design/API/search/maps/baskets/SEO не менялись.

## 2. Локальные проверки

Evidence: `/home/denis/tmp/aktau-nextjs-recovery-evidence-20261117`.

| Проверка | Результат |
|---|---|
| pnpm audit --prod --json на16.4.1 | exit1, moderate1, advisory воспроизведён |
| pnpm10.32.1 lockfile generation, frozen install | exit0 |
| pnpm audit --prod на16.4.5 | exit0, vulnerabilities0 |
| node scripts/ci/run-checks.mjs frontend | exit0: typecheck, oxlint, unit, audit, production build, Playwright |
| Frontend unit |54files /363tests PASS |
| Playwright mock production-mode desktop/mobile |83PASS /11 existing conditional SKIP |
| git diff --check | exit0 |

Проект использует **oxlint**, а не ESLint: проверена реальная команда pnpm lint. Playwright installer SKIP означает использование установленного Chrome, а не пропуск E2E. Одиннадцать conditional skips в default suite включают opt-in dummy analytics profile и platform-only проверки. Они не называются PASS; отдельный analytics profile выполняется дополнительно с dummy IDs и перехватом provider traffic, результат фиксируется в финальной qualification.

Existing tests проверяют RU/KK catalog/categories/search/filter/sort/product/dashboard/price comparisons/basket/map, navigation/SSR/SEO/images. Unit suite содержит HMAC/revalidation positive/negative tests с test-only secret и mocked cache invalidation; production signed POST не выполнялся. Actual HTTP Go/Frontend parity дополнительно входит в hosted Ephemeral Staging; до реального результата не заявляется PASS.

Команды через rtk proxy, PATH Node24:

```bash
cd frontend
pnpm audit --prod --json
pnpm install --lockfile-only
pnpm install --frozen-lockfile
cd ..
PW_CHANNEL=chrome node scripts/ci/run-checks.mjs frontend
# Explicit dummy analytics profile, providers intercepted locally:
cd frontend
PW_CHANNEL=chrome NEXT_PUBLIC_SITE_URL=https://aktau.market NEXT_PUBLIC_GA_ID=G-TEST123456 NEXT_PUBLIC_YANDEX_METRIKA_ID=12345678 pnpm exec playwright test e2e/analytics.spec.ts
```

## 3. VPS overlay не объединён с main

Прочитан migration report и фактический worktree `/home/denis/tmp/aktau-frontend-vps-20261117`. Dockerfile/.dockerignore/compose/service/build helper не tracked в main; next.config standalone — незакоммиченная правка. Нельзя строить релиз из одного main и предполагать, что Docker files уже там.

Шесть **публичных** файлов сохранены byte-for-byte в evidence/deployment-overlay/frontend и `deployment-overlay-manifest.json`: Dockerfile, .dockerignore, next.config.ts, compose.vps.yaml, cloudflared-frontend.service, scripts/build-vps-image.mjs. Secrets/runtime.env/token не копировались. Старый worktree не менялся.

Для qualification отдельная off-tree frontend copy использует новый exact package/lock и старые Dockerfile/.dockerignore/standalone config. Image tag `aktau-frontend-security-qualification:16.4.5-final` — **тестовый**, не официальный immutable production artifact и не образ будущего merge SHA. Публичные dummy IDs; никаких production HMAC. В исключённый .env помещён test-only canary; проверка image layers/config/JS и runtime smoke фиксируется в финальной annotation.

Будущая production сборка: fresh **финальный main SHA**, deployment overlay с зафиксированным SHA256, только добавление output:standalone к актуальному next.config (не слепое overwrite, если main изменился). Existing helper требует HEAD==fresh origin/main и clean src/public/package/lock; public build vars берутся по allowlist из локального env без печати secrets. Runtime HMAC остаётся host root0600; его не передавать ARG/ENV сборки. NEXT_PUBLIC_* baked, поэтому смена значений требует rebuild. Сохранить старый VPS image/compose для rollback; не менять существующий Tunnel/token. Данный task VPS image не меняет.

## 4. Next PR и review gate

Новый обычный PR предназначен для main ← fix/nextjs-security-16.4.5. Exact HEAD/run/jobs публикуются после фактической hosted qualification; локальные PASS не заменяют CI9.

Owner сообщил независимый PASS **Go source PR137**, но это не approval нового Next dependency diff. По этапу3 задания merge Next разрешён после необходимого Code Review. Самопроверка агента не обозначается независимым approval. При отсутствии такого review оставить Next PR готовым и предоставить один конкретный пакет/действие Owner. Не смешивать Next security diff с Go PR.

## 5. PR137 после принятия Next fix

До merge Next main остаётся a04bee…; PR137 остаётся Draft с reviewed Go HEAD51a4c… и прежним красным CI. Нельзя заявлять обновлённый137 либо merged main заранее.

После независимого review и обычного merge Next:

1. Fresh fetch; проверить exact main CI9.
2. В существующем Go worktree сохранить локальную CI annotation report (не stash/reset), обычным merge origin/main обновить feature branch, без rebase/force.
3. Сверить SHA256 всех reviewed Go source/test/CI files с ранее сохранённым source-freeze; Next package/lock должны приходить из main. Любой Go source delta требует анализа/review, а не автоматической перезаписи.
4. Повторить node scripts/ci/run-checks.mjs go, go vet -tags=integration ./..., node scripts/ci/run-db-integration.mjs, Security. Actual canceled pgx test должен выполняться, не SKIP.
5. Non-force push и exact-head CI9. User-reported независимый Go review не распространяется на неожиданные новые source bytes. При approved unchanged diff и всех gates normal merge, без admin bypass.

Предыдущие Go local tests и hosted Go/PG/Security PASS остаются evidence старого HEAD, не нового main. Фактические будущие результаты добавляются отдельно, не выдумываются.

## 6. Два независимых production release

**Frontend:** qualification новой Next со standalone overlay не означает deployed. После final main/build проверить public vars, hash/portable layers/image user/cache writes, HMAC absence from client/image/build, previous Frontend image retention, health и separate release authorization. Существующий Frontend VPS image по migration readback193c85…80b4 сохранён; свежая production inventory в этом source-only этапе не выполнялась. Runtime secret и Cloudflare routes не менялись.

**Go:** deploy/README.md → Current release указывает APIe9e4543…; docs/runbooks/rollback.md связывает prior-image rollback без DB rewind. Требуются fresh exact-main CI9, официальный workflow deploy-production.yml mode=build с exact sha/ci_run, immutable artifact provenance/hash, compatibility с active SHA/schema и проверка актуального broker/independent approval/window/locks/health по runbook. Не использовать старый artifact для нового SHA; пока final main не получен, official build NOT_RUN. No source DB/migration diff в этих фикcах не заменяет runtime schema/reader verification перед релизом. AUTO_DEPLOY не включать. Никаких HMAC/sync/ingest ради проверки.

Старые source snapshots не служат новым production readback. Production cutover обоих компонентов требует отдельного финального release этапа и проверенных артефактов.

## 7. Итоговая qualification

Финальные PR URLs/SHAs/CI9, standalone test и review gate будут добавлены локальной documentation annotation после завершения. До этого hosted CI/merge/deployment — NOT_VERIFIED/NOT_RUN. Report/source-only изменения не являются независимым Code Review.

### Завершённые standalone и analytics проверки до PR

- Explicit dummy analytics Playwright profile: exit0, **8/8 PASS**; external GA/Yandex traffic intercepted, production delivery не заявляется. Остальные3 default-suite skips — existing desktop/mobile-only conditions, не failures и не выдуманный PASS.
- Final Docker build из минимизированного package/lock + preserved overlay: exit0. Image **`sha256:4c27d27e0a5b4be7065ee988eff7e8d7cf666e02aab6547fc3715ffbeae2c162`**, 346158818 bytes, Linux/amd64, USER node. Не маркируется future main image.
- Manifest-indexed audit: 9 decompressed layers / 8214 files; test canary отсутствует во всех файлах, production env paths отсутствуют, image config не содержит HMAC. Canary передавался только локальному runtime; настоящий production HMAC не читался. Source Dockerfile имеет только public build ARG allowlist.
- Local container с closed-loopback API override: RU/KK blog200 с canonical/hreflang, robots200, optimized PNG200/16172B, unsigned revalidate401. Healthcheck отключён **только в disposable test container**, поскольку API target намеренно закрыт; это не production health qualification. Test container штатно остановлен, VPS не затронут.
- Initial readiness GET поймал ConnectionResetError до готовности Node; corrected bounded startup harness повторён с PASS. Initial flat docker-save scan дал0 layer.tar из-за OCI blob names Docker29; не принят как layer proof. Повтор выполнен по manifest Layers с decompression и реальной проверкой файлов. Исходные ограничения сохранены в evidence, приложение/overlay не изменялись.
- Local Security: exit0.
