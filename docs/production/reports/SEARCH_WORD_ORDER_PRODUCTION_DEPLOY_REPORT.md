# Search word order — production release preflight

**Result: BLOCKED before merge/deploy.** Fresh observation 2026-11-07T19:49:51.275443+00:00. This is a new release report; historical SEARCH_WORD_ORDER_FIX_REPORT.md unchanged.

## Immutable source and review

PR https://github.com/kiratonine/AdilBaga/pull/103 remainsOPEN/notmerged, mergeable=true/clean. Actual HEAD **0605eb6495787290739aff560cfa6ae2131b164b**, matching independently reviewed archive. Owner supplies CODE_REVIEW_PASS_WITH_RELEASE_GATE; GitHub reviews API currently returns an empty list (not impersonated as a GitHub approval). Current main **766a0ab69afb38248cf21128ef32121953ddd21c**, advanced since originalbase4d8e3c0c36819dd4f277935a4ef541fbe5ac081a by CI Windows compatibility changes only. Current PR diff is the expected six search implementation/test/report files; no frontend/pipeline/migration/deploy change. No source modification in this release preflight.

Exact-head PR CI https://github.com/kiratonine/AdilBaga/actions/runs/42403919826 attempt1 completedSUCCESS,9/9jobs independently verified:

| Job | ID | Result |
|---|---:|---|
| Contracts | 128497443162 | SUCCESS |
| Security | 128497443352 | SUCCESS |
| Frontend | 128497443400 | SUCCESS |
| Pipeline Quality | 128497443414 | SUCCESS |
| Nest Reference | 128497443532 | SUCCESS |
| Go Quality | 128497443536 | SUCCESS |
| PostgreSQL Integration | 128498138984 | SUCCESS |
| Ephemeral Staging | 128498463570 | SUCCESS |
| CI Gate | 128499380758 | SUCCESS |

## Mandatory protected-merge gate — FAIL

Fresh `gh api repos/kiratonine/AdilBaga/branches/main` exit0 explicitly reports **protected:false**, protection.enabled:false, no enforced status contexts. `.../branches/main/protection` exit1/HTTP404. `.../rulesets` exit1/HTTP403 with GitHub plan/visibility restriction message. Thus this is not merely an absent reviewer or missing UI screenshot: the requested protected-merge gate is not active according to successful branch metadata. A normal merge API command might technically succeed, but would not satisfy Owner's protected merge requirement. No merge attempted, no --admin/force/directmainpush, no settings changed.

**One Owner/admin handoff:** restore/enable enforceable protection for main (including the required CI Gate and intended review policy) under a repository plan/visibility supporting it, then supply readiness for a fresh read-only verification. Do not weaken CI/reviews or use a bypass to make this release proceed. CI9green and external source review do not establish branch protection.

## Runbook and production read-only observations

Read AGENTS/RTK, PR103report, current-source deploy/README.md, docs/runbooks/rollback.md, AUTO_DEPLOY_SETUP.md and deployment workflow; historical direct-SSH task2026-10-22 reviewed only as history. It is a **single-release exception for a different exact SHA/artifact**, not a reusable bypass of current authenticated approval/broker gates. Current deploy docs also contain stale first-release image identifiers; they are not used as live state.

Current repository supports clean exact-SHA external build, immutable image identity and prior-image rollback; workflow supports build-only/plan/deploy with provenance/root authority. No workflow dispatch or build performed before resolving the explicit pre-merge blocker. No deployment path invented, no old root approval/one-time exception reused. Main CI/build/artifact and current authority admission must be qualified after an allowed merge; these are **NOT_RUN**, not PASS.

Trusted read-only SSH (BatchMode=yes,StrictHostKeyChecking=yes,ForwardAgent=no,ConnectTimeout10) succeeded. VPS UTC **2026-11-07T19:48:22Z**. Existing API is `adilbaga-api:e50de2532259ab477e8491c4bddc2e6120ef3da0`, healthy/up2days. Separate /opt/adilbaga API deployment and /opt/aktau-sync publisher directories exist; no publisher checkout/timer/G3/backups modification. Global deployment lock path exists; no exclusive deployment transaction or mutation started. Follow-up scoped image/health metadata recorded in final readback appendix below.

This task requires a permitted maintenance window. No new API window is inferred from the prior C2-removal window or old single-release exceptions; actual approved current API window must be established before any future mutation. No deploy decision needed while the protected-merge gate is already blocked.

## Actual commands and results

- git fetch origin --prune: exit0; origin/main766a0ab..., reviewedfeatureHEAD unchanged.
- GitHub PR/head/diff/reviews/branch/run/jobs GETs: exit0; exact6files,9success.
- Branch protection GET: exit1/HTTP404; rulesets GET: exit1/HTTP403; retained as real blocker evidence.
- Trusted SSH initial metadata observation: exit0, oldhealthy API/separate directories/deployment lock present; no secrets read.
- Current runbook/source reads: exit0; no source, config or release mutation.

Evidence: artifacts/search-production-preflight/GITHUB_RELEASE_PREFLIGHT.json (sanitized statuses/IDs, no credentials). New report is intentionally uncommitted; PR103diff and reviewedHEAD untouched.

| Release stage | Actual result |
|---|---|
| Exact PR source/reviewed HEAD | PASS |
| Exact PR CI9 | PASS |
| Protected main merge gate | **FAIL/BLOCKED** |
| Merge/MERGE_SHA | NOT_RUN/absent |
| Exact merge-main CI | NOT_RUN |
| New immutable artifact | NOT_RUN |
| Full release rollback qualification | NOT_RUN (existing old image metadata is not full qualification) |
| Docker load/cutover/rollback | NOT_RUN |
| New search production E2E/Frontend | NOT_RUN |

No public search PASS/deployment claimed. Production application, DB/schema/data, frontend, sync publisher/timers/G3, C2 recovery backups, credentials, SSH/sudo, environments and AUTO_DEPLOY unchanged. Stop before merge; resume same release only after real gate readiness.

## Final scoped VPS readback

Second read-only SSH invocation exit0: running image ID and retained exact tag both **sha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7**, OCI revision **e50de2532259ab477e8491c4bddc2e6120ef3da0**. Existing-loopback /health/live200 and /health/ready200; readiness is application DB availability evidence, not direct SQL access. Broker executable exists; its current authority/provenance and rollback journal are NOT yet qualified for a new release. New image absent/notbuilt, no container switch. No api.env, release.env or Docker Config.Env was output.

Final result remains **BLOCKED — MAIN_PROTECTION_NOT_ENABLED**. Restore enforceable protection before merge, then fresh exact-main CI/artifact/authority/window/rollback gates. No production E2E against a nonexistent new release is claimed.


## Owner decision: private repository without branch protection

2026-11-07T19:52:04.501258+00:00 — Owner explicitly instructs continuation given unavailable main protection on current private repository plan. This supersedes MAIN_PROTECTION_NOT_ENABLED as a merge blocker for PR103 only. It is an Owner policy exception, not a claim that GitHub protection is enabled. Use normal merge with exact reviewed-head matching, no admin/force/direct push. Exact PR HEAD and9/9CI refreshed unchanged. Artifact provenance, genuine independent root authority where required, rollback, maintenance window and production readback remain separate gates.

## Normal merge completed after Owner exception

2026-11-07T19:52:07Z — `gh pr merge 103 --merge --match-head-commit 0605eb6495787290739aff560cfa6ae2131b164b` exit0, no --admin/force/directpush. MERGE_SHA **ffc0bc44dfef3e11399a01cb509a1268cf87c683**. Exact push-main CI **42408276613**, currently in progress; no production mutation while pending. Backend-go/deploy/scripts-deploy bytes on merge agree with reviewed feature head (main-side changes were CI tooling only). The branch-protection blocker above is historical and superseded by explicit Owner decision, not falsely declared enabled.

Fresh VPS19:53:11UTC: oldimage/revision e50de253... healthy, UID10001:10001/read-only/allcapsdropped/no-new-privileges, only127.0.0.1:8080, productionnetworkunchanged. Root paths regular/no symlinks, compose0644, privateenv0600/parent0700, deploymentlock free, cloudflaredactive, syncinactive/weeklyhistoricalfailed, root top-level deploymentjournal list empty. No config/backup/image/service changes. AUTO_DEPLOY_ENABLED read-only confirmedfalse. Evidence VPS_RELEASE_PREFLIGHT.json and PUBLIC_SEARCH_BEFORE.json remain ignored artifacts.

## Exact-main CI PASS; build-only dispatch

MERGE_SHA ffc0bc44dfef3e11399a01cb509a1268cf87c683; push-main CI42408276613 attempt1 completed9/9SUCCESS, exactSHA verified before dispatch.

- Nest Reference: 128510623338 SUCCESS.
- Security: 128510623511 SUCCESS.
- Go Quality: 128510623565 SUCCESS.
- Pipeline Quality: 128510623594 SUCCESS.
- Frontend: 128510623648 SUCCESS.
- Contracts: 128510623669 SUCCESS.
- PostgreSQL Integration: 128511285856 SUCCESS.
- Ephemeral Staging: 128511619525 SUCCESS.
- CI Gate: 128512430430 SUCCESS.

`gh workflow run deploy-production.yml --ref main -f mode=build -f sha=ffc0bc44dfef3e11399a01cb509a1268cf87c683 -f ci_run=42408276613`: exit0. Authenticated workflow_dispatch build run42408917107 (in progress); no mode=deploy/flag mutation. Automatic workflow_run42408873685 only disabled release/offline path; no cutover. Production image remains unchanged.

## Latest checkpoint — merge and authenticated build ready, API window unresolved

2026-11-07T20:04:52.820117+00:00. **BLOCKED_API_MAINTENANCE_WINDOW_NOT_SPECIFIED**. Historical branch-protection blocker is resolved by Owner's explicit private-repository policy exception; it is not the remaining blocker. Merge/mainCI/build stages are complete; production deployment is NOT_RUN.

- MERGE_SHA ffc0bc44dfef3e11399a01cb509a1268cf87c683; exact push-main CI42408276613 attempt1 all9SUCCESS.
- Official build-only workflow_dispatch **42408917107**, attempt1, completedSUCCESS. Deployment offline checks/gate/build_onlySUCCESS; plan_only/rolloutSKIPPED by build-only design, not a deploymentPASS.
- Immutable artifact **13588533054**, adilbaga-api-ffc0bc44dfef3e11399a01cb509a1268cf87c683-42408917107-1, notexpired.
- Original ZIP SHA256 **92e24c28b47165c557ac21909a4f4ddafe5a87a791e13ad224bc82637045d00a**, independently matched GitHub artifact.digest. Exactly2safeZIP members image.tar/manifest.json.
- image.tar **21981184bytes**, SHA256 **7a1ee6dfb5961b9cd8655163b2a09414507a1280b7b8ffb4c641bbbede07fc2e**, matched producer manifest;14safeTARmembers/no traversal/links. OCI config revision/platform/User/entrypoint verified.
- Independently hashed every decoded layer: all3diffIDs match rootfs; extracted APIbinary SHA256 **3c9be87e4165c43813b4bb2710bdc5fe6297da2ca394435e3b5d95ec432508b2** matches producer. No image rebuilt or relabeled.
- New image config digest **sha256:aabe15ab49c6e482d58e91b961f467add3ecb1f5ba08f3325497bb4d31e9890a** is an archive-derived configuration identity, NOT a claimed loaded/running VPS imageID.
- Downloaded immutable original files remain under /home/denis/tmp/aktau-go-search-word-order/artifacts/search-production-preflight/artifact-13588533054. Artifact metadata, CI and byte proofs are ignored local evidence. No secret copied.

Runbook supports clean external build + docker save/verified trusted SSH transport/docker load + guarded Compose recreate, with retained old image/config and application-level health/Voice before Tunnel reopen. The current Owner task authorizes a new GoAPIrelease; historical one-time artifact IDs/approvals are not reused. Any route invoking broker must separately satisfy its real root authorization; no self-issued record or flag bypass was created here.

**Remaining authority detail from Owner TASK §3:** execute production deployment only inside an allowed maintenance window. Actual VPS19:48/19:53UTC, current localUTC above. Numeric current GoAPIwindow is not specified by the reviewed general APIrunbook or current Owner message. The historical02:00–11:00UTC C2removal window is not automatically relabeled as new APIauthorization. Therefore no remote upload/load/backup/config replacement/Tunnel stop/recreate is attempted on an assumed window. This is a narrow time/scheduling clarification, not a request to reapprove source or to restore impossible branch protection.

**One exact handoff:** Owner specifies UTC interval for one APIcutover (or explicitly authorizes a current15-minute window). Then refresh main/artifact/idle/global lock/oldhealthy rollback identity, preserve no-clobber root-private release.env/compose metadata without api.env copy, verify transferred archive hash, perform one official runbook switch with confirmed prior-image rollback, localhealth/catalog/Voice + public HTTP/search/Frontend checks and bounded observation. Do not rebuild the artifact unless main/artifact freshness demands it; any drift is reconciled, not hidden. No source/sync/timer/C2/G3/DB/Frontend mutation.

| Stage | Current actual status |
|---|---|
| Source review + PR exact CI | PASS |
| Owner private-main exception + normal merge | COMPLETE |
| Exact-main CI | PASS9/9 |
| Authenticated build/artifact/layer/binary checks | PASS |
| VPS old runtime metadata/health/retained image/global lock | READ_ONLY_PASS_CURRENT_SNAPSHOT |
| Root-private pre-cutover backup | NOT_RUN |
| New image delivery/load/cutover | NOT_RUN |
| New search/Frontend production E2E | NOT_RUN |
| Final production release | **BLOCKED pending APIwindow**, not DEPLOYED |

Observed old API public baseline: search 'творог dekmy' HTTP200/4IDs/2.233s; reversedHTTP200/0IDs/1.217s. These are BEFOREfix evidence, not the acceptance result. No artificial ingest, parsing, snapshot or HMAC POST. No publication of raw application/secret payloads. Historical reports untouched.

## Owner-authorized window preflight — 2026-11-07T21:22:30.250349+00:00

Owner explicitly permits one cutover2026-11-07T21:00–22:00UTC (Nov8 02:00–03:00Aktau), exactMERGE_SHAffc0bc44dfef3e11399a01cb509a1268cf87c683, existingbuild42408917107/artifact13588533054. This resolves the scheduling blocker above, not independent root authority. Actual serverUTC21:19:34/21:19:54/21:20:21 was insidewindow. **No cutover attempted.**

Fresh read-only checks: GitHubmain still exactMERGE_SHA; exact-mainCI42408276613 successfulattempt1 (previously verified9/9); artifact notexpired, originalZIPdigest92e24c28b47165c557ac21909a4f4ddafe5a87a791e13ad224bc82637045d00a unchanged, producerbuild/source match. Localimage.tar hash independently rechecked7a1ee6dfb5961b9cd8655163b2a09414507a1280b7b8ffb4c641bbbede07fc2e. No rebuild. Deploymentlockexists/free; probe released. OldAPI e50de253... runninghealthy2days, cloudflaredactive; retained oldimageIDsha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7 available.

### Mandatory root/broker gates actually fail

1. **Exact independent approval absent:** /var/lib/adilbaga/deploy/authorizations/ffc0bc44dfef3e11399a01cb509a1268cf87c683.json doesnotexist. The directory isroot0700, but old records are not an authorization for this artifact. Owner's message is cutover/window permission; it is not a root-protected record under the active broker contract. Agent did not create approved=true/authorizer/nonce or consume/reuse any historical record.
2. **Installed broker cannot establish freshmain:** actual wrapper /usr/local/sbin/adilbaga-deploy is fixedroot wrapper, hashf7bcc5a0dbc0dd15bc74a50134dc9941cc242a94b6acfb96a69f53d50b927441, invoking /usr/local/lib/adilbaga-deploy/auto_broker.py. Installed moduleSHA256 **2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c**, sourcecandidate **5b2f0021b6a60e0128539a043273311131b544941d57ab5ee9d56562a14b1b21**; installedmodulehasauthorizationfunction. One fixed read-only installedHost.fresh_main(exactSHA) returned **Blocked/http_status**, mutatingmethodscalledfalse. No submit/load/cutover/rollback/helperupgrade. Current private-repository metadata lookup must be admitted through a genuine authenticated mechanism; a sourceHSTSfix alone is not proven to fix private-repoaccess. Do not overwrite broker or inject a token as a release workaround.

Initialsha probe used guessed /usr/local/libexec/adilbaga-deploy/auto_broker.py and exited1 because path absent; publicwrapperread established correct /usr/local/lib/... path. Corrected read-only hash inspection exit0. This tooling correction is not a broker mutation.

### One administrative handoff, before another release attempt

Owner/admin must independently establish an approved **working root release path for the current private repository** and a genuine unused exactartifact authorization. Required steps are coupled: (a) review/fix/authorize broker private-repo fresh-main admission and any exact-byte installed update under its proper procedure; (b) independently verify existingartifact and install the root approval per AUTO_DEPLOY_SETUP.md strictschema1 via trusted adminchannel, root0600 inroot0700authorizations, atomic/fsynced/no-clobber. Do not use old one-time manual exceptions to route around these gates. Do not simply install source5b2... assuming that private404/HSTS are equivalent.

Public exact inputs are in ADMIN_ARTIFACT_INPUTS_NOT_AUTHORIZATION.json: repo/environment/source/CI/buildattempt/artifactID+name/archivehash+size. This is deliberately **not** a valid approval record (no approved/approvedBy/approvedAt/expiresAt/authorizationId); genuine admin supplies those only after independent review. Currentimage.tar21981184bytes; rootauthorization validitymax86400seconds and currentexpiry/unusedmarker check mandatory. Artifact13588533054/build42408917107 remains usable only while exactmain/CI/artifact freshness stays valid. No secret/token/password should be pasted into chat or Git.

Existing21:00–22:00UTC window remains the only approved window; after its expiry request a new concrete window, not an automatic retry. Cutover count remains0. No delivery/load/configbackup/Tunnelstop/Compose recreation occurred. Full rollback operational qualification is **NOT_RUN/PRELIMINARY_ONLY** (oldimagehealthy/available/configmetadata recorded), not falselyPASS. New-image IDs and postdeployment search/Frontend/Voice/latency checks are **NOT_RUN** because candidate was never activated. No claim of release success or falsely passed E2E.

**Latest actual result: BLOCKED_ROOT_AUTHORITY_AND_BROKER_PRIVATE_REPO.** Source merged, exact-mainCI9PASS, artifactverified; production oldAPI retained. No PostgreSQL/schema/data, /opt/aktau-sync, timers, parsers, C2backups/G3, Frontend, SSH/sudoers, GitHubsettings/AUTO_DEPLOY changes. Historical source/release evidence preserved append-only.

### Fixed metadata status clarification

A separate single credential-free GET from VPS to the same exact GitHub main-ref URL returned **HTTP404**; response body not saved. This corroborates the installed broker http_status failure for the now-private repository; it is not a production API/DB outage. No retry, credentials injection or source update. MainCIjobs were freshly re-read: all9SUCCESS at the same attempt.


## Read-only remediation diagnosis of release blockers — 2026-11-07T21:28:59.418110+00:00

**REMEDIATION_PLAN_READY for independent Code Review. Production remains BLOCKED; no source fix or production mutation performed.** This section supplements historical results, not a retrospective deployment PASS. Read actual applicable root AGENTS/RTK (native feature worktree has no tracked AGENTS.md; initial lookup there returned missing, corrected to Owner checkout), current report, deploy/README.md, rollback runbook, AUTO_DEPLOY_SETUP.md, actual installed module AST/hash and source transport/workflow.

### 1. Exact endpoint, identity and proven cause

Endpoint is **GET https://api.github.com/repos/kiratonine/AdilBaga/git/ref/heads/main**. It is the correct Git reference endpoint (`git/ref`, singular), not a guessed web URL. refs/heads/main exists.

- Fresh authenticated localWSL `gh api repos/kiratonine/AdilBaga/git/ref/heads/main` exit0 returns ffc0bc44dfef3e11399a01cb509a1268cf87c683; authenticated repo metadata says private=true/full_name kiratonine/AdilBaga. No token or Authorization header output. Evidence DIAGNOSTIC_WSL_GITHUB.json UTC21:26:51Z.
- Installed /usr/local/lib/adilbaga-deploy/auto_broker.py SHA256 **2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c** unchanged. Actual AST fresh_main calls `http(fixedURL)` with exactly1positional arg/0keywordargs; **no authentication supplied**. The wrapper clears inherited env with `env -i`, isolatedPython. It never executes localWSLgh or forwards its login.
- Fresh credential-free request from VPS to this exactURL returnsHTTP404 (UTC21:26:53Z), matching earlier installedHost.fresh_main Blocked/http_status. No request body, response body, authheader or token recorded. CorrectURL/authenticated200 vs unauthenticated404 and private=true prove private-resource access/authentication is the immediate rejection. Not API/DB outage, not nonexistentmain, not SHA mismatch. There is no broker credential whose exact permissions can be blamed: this call supplies none.
- Existing root module also lacks the separately reviewed GitHub-only HSTS exception present in sourceSHA256 **5b2f0021b6a60e0128539a043273311131b544941d57ab5ee9d56562a14b1b21**. This is a distinct downstream compatibility issue. Do not describe the measured404 as HSTS. Installing5b2... alone does not authenticate the private request.

All current diagnostic commands were read-only, finite SSH/HTTP timeouts, StrictHostKeyChecking=yes/ForwardAgent=no. Earlier proof and fresh AST support exact cause without copying credentials. No new token minted/read/copied, no approval installed.

### 2. Minimum permissions and what project actually supports

GitHub's **Get a reference** requires repository **Contents:read** for fine-grained credentials, with repository selection restricted to **kiratonine/AdilBaga**. Metadata:read alone is insufficient for this endpoint. No Contents:write, administration, environments write, workflows write or broad classic repo token is needed by this broker GET. Actions:read belongs to existing runner CI/artifact verification; do not gratuitously grant it to the broker if it only performs this reference GET.

Official source: https://docs.github.com/en/rest/git/refs#get-a-reference . Fine-grained PAT and GitHub App installation tokens are supported by GitHub, but platform support is NOT evidence that our VPS has such a provisioned integration.

Existing project short-lived credential mechanism is **job-scoped GITHUB_TOKEN on GitHub Actions**, configured contents:read/actions:read. scripts/deploy/auto-gate.mjs uses it for authenticated API calls. It remains on the runner. Existing SSH transport submits bounded release metadata/image, NOT a GitHub credential. Root wrapper deliberately discards caller environment; there is no reviewed VPS GitHubApp issuer, fixed root credential file/provisioner, token forwarding protocol or approved personal-gh credential reuse in the inspected release implementation/docs.

GitHub documents that installation access tokens expire after1hour and jobGITHUB_TOKEN expires at job completion/effective max lifetime: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app and https://docs.github.com/en/actions/concepts/security/github_token . This describes available platform options, **not a deployed project contract**.

Therefore **no supported ready-to-use short-lived VPS credential delivery path was established**. Do not copy localgh hosts.yml/token, forward agent/environment/GITHUB_TOKEN, enableSETENV or add a long-livedPAT as an ad-hoc fix. Reusing root approval's protected custody helpers does not automatically authorize storing a new secret type. Root approval and GitHub read capability are separate authorities.

### 3. Minimal candidate change, conditional on infrastructure approval

No implementation diff created: choosing an issuer/delivery/expiry contract is an unresolved trust-boundary decision, not a safe URL-only patch. A speculative implementation would invent a new secret channel forbidden by this task. Preserve current reviewed source bytes; source-fix conditional permission is not interpreted as authorization for a new unreviewed credential protocol.

Minimal reviewable **proposal**, not installed design:
1. Owner/infrastructure admin first identifies an existing approved short-lived credential issuer, if any exists outside the repo. If none, approves a narrow issuance/delivery/expiry/revocation contract before coding. A GitHub App installation token limited to thisrepo/Contents:read is a platform-supported option, not an assumed existing integration. Never put a new App private key on broker merely for convenience.
2. Only after that decision, change **scripts/deploy/auto_broker.py**, its tests and **docs/production/AUTO_DEPLOY_SETUP.md**. Keep root-owned broker, exact URL, TLS/no redirects, response bounds, main equality checks, readonly scopes, no retries/fallback, finite enum diagnostics. Auth material may be attached **only** to exact HTTPS GitHub host/path and must never reach application/Voice endpoints, uploaded manifest, logs, argv, report or request-controlled paths.
3. If approved admin-provisioned secret-file delivery is selected, fixed root-private path, no-follow descriptor-pinned bounded reading, rootownership/mode/link/parent-custody checks, explicit expiry/lifetime/refresh responsibility and cleanup must be specified/reviewed. Broker cannot mint its own approval/credential or accept uploader-supplied token/TTL. Do not implement generic URL/token/path/env overrides. This is a proposal requiring adminapproval, not a newly claimed project mechanism.
4. Retain GitHub-only HSTS compatibility as already reviewed, preserve API HSTS policy. Install only independently reviewed exact root broker bytes by authorizedadmin with backup/CAS/readback. No broker upgrade in this diagnostic task.

Qualification before source review: privateendpoint authsuccess; missing/expired/revoked/insufficient-scope token; malformed/refmissing404 vs401/403; wrongrepo/ref/SHA; redirect/lookalike/API target credential-leak canaries; TLS/timeout/bodybounds; changed credential inode/custody; sanitization; cancellation/child cleanup; rootapproval absent/expired/used/mismatched; no Docker/action/flag on failedadmission. Synthetic credentials only; never claim these new testsPASS before implemented/executed. Current new-source-test status **NOT_RUN**.

### 4. Independent exact-artifact root approval (separate blocker)

Fresh exactpath **/var/lib/adilbaga/deploy/authorizations/ffc0bc44dfef3e11399a01cb509a1268cf87c683.json remainsabsent**. Parent rootUID0/GID0/mode0700. No record read from anotherSHA or reused. Owner/admin with trusted administrative access separate from restricted deployment principal must independently verify producer/source/CI/bytes, then install record per existing strictschema1, root0600/no writable or symlinkparents, bounded16KiB/strictJSON, atomic/fsynced installation. A chat grant/window is not the broker's root-custody record; agent cannot sign as Owner.

Exact current candidate inputs for independent verification (not authority themselves):

| Input | Value |
|---|---|
| repository/environment | kiratonine/AdilBaga / production |
| source | ffc0bc44dfef3e11399a01cb509a1268cf87c683 |
| CI | .github/workflows/ci.yml,42408276613,attempt1,9SUCCESS |
| build | .github/workflows/deploy-production.yml,42408917107,attempt1 |
| artifact |13588533054,adilbaga-api-ffc0bc44dfef3e11399a01cb509a1268cf87c683-42408917107-1 |
| original ZIP SHA256 |92e24c28b47165c557ac21909a4f4ddafe5a87a791e13ad224bc82637045d00a |
| image.tar SHA256 / size |7a1ee6dfb5961b9cd8655163b2a09414507a1280b7b8ffb4c641bbbede07fc2e /21981184bytes |
| APIbinarySHA256 |3c9be87e4165c43813b4bb2710bdc5fe6297da2ca394435e3b5d95ec432508b2 |

Existing strictschema includes schemaVersion1, allidentity fields/table bindings, archiveSha256/archiveSize, artifactIdentity(id/name), and genuine approved/approvedBy/approvedAt/expiresAt/authorizationId supplied by independentadmin. approvedBy is owner:<non-sensitivehandle>, not identity proof by itself. Validity≤86400seconds, currentexpiry and same-recordbytes rechecked beforecutover. Newrandom32hexauthorizationId, unused durable `<id>.used`; one attemptedload consumes it. No generation of these authority fields here. OriginalZIPdigest != image.tardigest. Root custody/independentreview is essential, not a self-authored JSONboolean.

**Do not install this current candidate approval prematurely:** if remediation source changes merge, current-main guard changes targetSHA. Then new exact-mainCI/build/artifact and freshapproval are required by existing contract; do not relabel/reuse artifact13588533054 for newsource. Finalsource/CI/producer must settle first. This task dispatches no newbuild/plan/deploy.

### 5. Additional release-compatibility finding and coordination

Proactive read-only local check of existing **verifyCompatibility(e50de2532259ab477e8491c4bddc2e6120ef3da0, ffc0bc44dfef3e11399a01cb509a1268cf87c683)** returned **incompatible active release** (Nodeexit2). Realprotected diff:
- added backend/prisma/migrations/20261107000000_price_history/migration.sql;
- added backend/prisma/migrations/20261107000100_product_identities/migration.sql;
- modified backend/prisma/schema.prisma.

Current approvedExceptions has no entry for activee50de253; no protected-path check bypassed. The shell combined diagnostic returned0 because subsequent gitdiff succeeded; the actual Node process exit2 is preserved explicitly, not reportedPASS. This is a **next local transport admission blocker**, independent of the confirmed broker404/missingapproval. Raw source delta is not proof migrations were applied to production. No DBconnection/query/migration performed to guess that fact.

**Coordination is necessary:** Owner/infrastructure administrator owns credential channel/root broker installation/independentapproval/window. Backend2 or authorized DB/releaseoperator must supply attributable read-only evidence of actual schema/migration compatibility for those exact two migrations and Prisma blob pair before any narrowly pinned protected-delta exception is reviewed. This is coordination about release/schema safety, not a change/request to sync/parser logic. No messages sent to Backend2/admin by tools, no repeated team credential request. No general exception for backend/prisma/contracts, no claim CI fixture migration == production applied. If DB state is incompatible, stayBLOCKED and handle separate approvedDBworkflow; this diagnostic cannot migrate production.

### 6. Ordered recovery plan and repeat-preflight acceptance

1. Review this diagnosis and approve the minimal credential contract plus infrastructure owners. Do not mutate root or provision secret during diagnosis.
2. In a separate source-only branch implement/review narrow GitHub-auth/HSTS fixes and any **exact, independently justified** compatibility entry; full security/Go/ops/transport/ephemeral tests and hosted exactheadCI9. Do not weakenprovenance, authorization, protectedpaths or oldrollback. No code for speculative provenance of DBstate.
3. Authorizedadmin installs reviewed broker bytes under existing rootcustody with safe backup/hash/readback. Admin provisions short-lived GitHub read capability through the specifically approved channel, never through manifest/chat/argv or generic CIrootrights. No App/token presumed provisioned now.
4. Settle finalmainSHA, exactmainCI9 and freshimmutable producer/artifact ifsourcechanged. Independently verify bytes and only then admin issues exact rootapproval near the realrelease window. Existing build-only13588533054 is historical candidate until unchanged-sourcefreshness is proven; never reuse it for a changedSHA.
5. Repeat **nonmutating** preflight: correctrepo/privateauth canGETexactmain200 andSHA; token valid/scoped; testedbrokerhash correct; installedrootapproval bound to finalsource/CI/build/id/digests,size/schema/rootcustody/expiry/unusedmarker; verifyCompatibilityPASS with realblobidentities; originalZIP/image/layers/binary; oldimageconfigretained/composeandprivateenvcustodyunchanged; noRUNNINGjournal, globaldeploymentlockfree, APIhealthy/syncidle and approvedtimewindow. Rootrecord check alone is not a releasePASS.
6. Only after separate releaseinstruction permits execution: oneadmittedcutover with qualifiedrollback and application/publicHTTP/Voice/Frontend checks. No AUTO_DEPLOY flag change under currentdiagnostic task. Existing workflow rollout itself requires its activationflag; an unchanged falseflag is not silently called a passed dispatch gate. If Owner selects another path it must be separately reviewed/authorized, not an ad-hoc broker bypass.

Acceptance of this **plan**: evidence supports exactcause, rightsandmissingchannel identified; authority issuer/procedure/exactinputs stated; nextprotected-deltagate exposed; boundaries/testmatrix/order documented. **REMEDIATION_PLAN_READY**, implementation/runtimegatePASS not claimed. No deployment/rollback/approval/credential/GitHubsettings/DB/Frontend/sync/C2/timer mutations. Original approved21:00–22:00UTCwindow is not extended by this document; laterrelease needs a validwindow and freshchecks.

Documentation sources checked: GitHub Getareference (Contents:read), GitHubAppinstallationtoken lifetime1hour, Actions jobtoken lifetime; primaryURLs above. No authheader/token/privatepayload printed or stored. Report updated append-only; no new sourcebranch/diff/commit/push/PR because no credential trustcontract has yet been approved for implementation.


## EMERGENCY_RELEASE_ELIGIBILITY_REVIEW

Timestamp 2026-11-07T21:44:32.078740+00:00. **Result: BLOCKED**, no emergency release eligibility declared. Source merged/artifactverified does not override protected-delta/authentication/independentrootapproval gates. All historical results above preserved.

### Protected changes: exact scope and relation to API

Compared actual production source **e50de2532259ab477e8491c4bddc2e6120ef3da0** with **ffc0bc44dfef3e11399a01cb509a1268cf87c683**. Existing verifyCompatibility returned incompatible active release; no approvedException exists for activee50de253. No checker disabled/edited.

| Path | Old Git blob | Candidate Git blob | Candidate file SHA256 |
|---|---|---|---|
| backend/prisma/migrations/20261107000000_price_history/migration.sql | ABSENT | 2863a1d1d060d9f62e14d51187d7bb21a3e8c580 | 2361297abb69957611e221d469990a7121e08650d68241f15f9d54eca645ac2a |
| backend/prisma/migrations/20261107000100_product_identities/migration.sql | ABSENT | d8f8e9c551c68b6a901d17f56db16523ad35344e | 5244f9eb92fc7ee2af2c95af6cbaef0488bbc8709739070adefb7c933d0827ec |
| backend/prisma/schema.prisma | 2f270ddd9e1aa24683fc15766d67c1b88d1251fe | 00315ade499cc561f0731ae0875b1b46643dac11 | 27e4f7edbcd682162785eb5cf59394119f7461e946d1683090b02365aa584daf |

- price_history migration creates a new monthly price table, primarykey(month,storeId,canonicalProductId), foreignkeysRESTRICT to stores/canonical_products, RLS and PUBLIC/anon/authenticated revoke. It is archival/retention functionality, not the search fix. Existing GoAPI PriceHistory SQL in **backend-go/internal/postgres/snapshots.go:priceHistorySQL** reads **offers JOIN snapshots/stores**, not this newtable.
- product_identities migration creates identity mapping(storeId,sourceProductId→canonicalProductId,lastSeenAt), foreignkeysRESTRICT/RLS/revokes. Used by ingestion restore/load and identity persistence, not catalog search or cmd/api.
- schema.prisma adds corresponding PriceHistory/ProductIdentity models and relations. GoAPI is pgx-based, not Prisma-client based; Prisma schema file is not executed by GoAPI.
- Exact source diff for cmd/api, internal/httpapi, pool.go and snapshots.go between active/candidate is empty. Within internal/postgres, runtime changes are products.go and removal of obsolete c2projection.go; remaining differences are tests. cmd/api does not run cmd/ingest or cmd/prune. New ingestion/retention code is outside APIentrypoint dependency path, not a reason to run those tools during release.
- Dockerfile and go.sum unchanged across active/candidate; go.mod only direct→indirect dependency classification from C2removal in the inspected diff. Search is parameterized SELECT on existing canonical_products/categories/offers fields. No newcolumn/table required by search.

**Application-level conclusion:** source evidence strongly supports that this GoAPI search change does not require either new migration. **Formal release conclusion:** current full-source artifact still carries the candidateSHA whose protected tree differs; static non-dependency is not a passed compatibility checker or evidence of production migrations. Existing artifact13588533054 cannot be called READY_FOR_AUTHORIZED_RELEASE under current rules.

### Actual production migration state: NOT_VERIFIED

Read-only SSH at2026-11-07T21:42:17UTC confirmed oldAPIe50de253healthy/up2days; exactrootapproval stillabsent. Tool inventory: psql notinstalled, /var/run/postgresql absent; noSQLconnections opened, no credential file read. These tool observations are **not proof** that PostgreSQL is absent or migrations unapplied; production DB is remote Supabase.

The approved operator runbook ops/postgres/README.md requires one explicitly approved dedicated readonly operator context, separate from APIruntime credentials. No such context/opaquehandle was supplied or established for this task. RootSSHaccess is not evidence of authority to extract api.env/DSN or repurpose an ingest credential. Existing public health proves runningAPIavailability, not _prisma_migrations/checksums/newtableconstraints. No migration-status endpoint exists in reviewed API route contract. Therefore production applied/rolledback state for both migrations remainsUNKNOWN, not PASS or FAIL. No attempt to infer database state from checkout files or the local CIbootstrap.

Authorized independent DBoperator can run the following **metadata-only** query in an existing approved read-only session, not by pasting credentials into this report/chat:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name IN (
 '20261107000000_price_history',
 '20261107000100_product_identities'
)
ORDER BY migration_name;
SELECT to_regclass('public.price_history') IS NOT NULL AS price_history_exists,
       to_regclass('public.product_identities') IS NOT NULL AS product_identities_exists;
SELECT relname, relrowsecurity
FROM pg_class
WHERE oid IN (to_regclass('public.price_history'),to_regclass('public.product_identities'));
COMMIT;
```

Expected migration-file SHA256 values are in the table above; finished_atnonnull/rolled_back_atnull and exact checksums must be corroborated. Admin also checks exacttablecolumns/types/keys/foreignkeyactions/RLS and relevant restricted-role grants using catalogmetadata. Tableexistence alone insufficient. Export only sanitized migration/security summaries, not productdata/DSN/sessioncredentials. Permissiondenied/missingledger is NOT_VERIFIED, not permission to changegrants/schema. If absent/incompatible: no migrations in this task; use separately reviewed DBchange procedure if Owner chooses that broader route.

### Minimal isolated hotfix feasibility (no artifact built)

Created a disposable **non-Git** source copy at **/home/denis/tmp/aktau-search-hotfix-eligibility-58lrcpzl** from frozenproduction e50de253, then replaced only backend-go/internal/postgres/products.go with exact reviewed PR103 runtime bytes and added the reviewed search unit test. No currentmain or production checkout changed, no gitcommit/branch/push/image build, no production artifact issued. Existing C2 files in the frozenoldsource were not modified or installed.

- Old products.go SHA256 e5fb04564cff68ec73537e936ac45ab83b7db6cd46643ef5b76dba889d4c7688.
- Reviewed replacement SHA256 a6b580b7f76d1166ea103ac4fb33973583158350e36f0ba01af905c2f4f0bea6.
- Go1.27.3/GOTOOLCHAINlocal/GOPROXYoff/GOSUMDBoff: `go test -count=1 ./internal/postgres` exit0; race variant exit0; `go vet ./internal/postgres` exit0.
- This proves source-level portability/unit feasibility only. No fresh PostgreSQL/HTTP/Voice/fullGo/CI9 qualification for that counterfactual candidate, no release commit/artifact/authority. Main PR103 test evidence belongs to its own tested source, not automatically transferred to this oldbase.
- A realhotfix would preserve all protected files and runtime dependencies from activeSHA, change only the reviewed products.go and necessary test/report files; legacy plan tests also need typed-array argument adaptation. Retain negative/wildcard/HTTPcases, fresh fullGo/race/vet/SQL/security/Voice/E2E and hostedCI9.

**Crucial policy constraint:** broker currently requires exact **currentmain** source. A production-base hotfix on a separate branch will fail fresh_main. Merging that branch into currentmain does not remove intervening protected changes; labeling an old-base binary with ffc0bc44... would falsify provenance. Do not build/deploy this alternative unless Owner first separately approves a reviewed release-branch/eligibility contract with equivalent authenticatedsource/CI/artifact/rootapproval safeguards. This task does not introduce that newcontract or disablemain checks. Reusing artifact13588533054 for an alternate source is forbidden.

| Route | Advantages | Unresolved risks/gates | Eligibility now |
|---|---|---|---|
| Existing full-main artifact13588533054 | Already immutable/CI9/SQL+HTTPqualified; sourceAPIneedsnonewtable | ProductionmigrationstateUNKNOWN; protecteddiffBLOCKED; brokerprivateGET404; independentapprovalabsent | BLOCKED |
| Production-base search-only hotfix | Smallest runtime delta; protectedsource unchanged by construction; basicunit/race/vet pass | Needs newreview/CI9/SQL/Voice/artifact; currentmain-only policyrejects; oldbaseline vulnerabilities/dependencies need fullsecurityregression | FEASIBLE_SOURCE_ONLY, NOT_AUTHORIZED |
| Old one-time directSSHexception | Historical runbook procedure exists | DifferentSHA/artifact/scope; cannot satisfy currentmandatorybroker/rootauthority | NOT_ELIGIBLE |

Preferred nextdecision is evidence-driven: if operator proves existingDBstate and independently reviews an exact protected-delta admission, retain currentmain release path after narrowbrokerfix. If DBstate cannot be proved, do not migrate just to clear a searchrelease gate or invent a bypass; submit minimalhotfix release-policy proposal for independent review instead. Neither route is pre-approved by this analysis.

### Emergency authority and administrator action

Project has **no established unconditional emergency process** waiving broker/protecteddelta/independentapproval. deploy/README.md documents manual transport/Compose and rollback.md documents application rollback; old single-release Ownerexceptions are historical, not blanket authority. Current AUTO_DEPLOY_SETUP strictschema1 remains required for broker. Urgency/chat permission or existingrootSSH cannot replace independentrootapproval.

One consolidated independentadmin action packet:
1. Authorized DBoperator provides actual two-migration/checksum/schema/RLS evidence through approved existing readonly context; no newtoken/DSN in chat. Backend2/DBowner coordinates this evidence, not a newingest/sync.
2. Owner/release-security reviewer selects **one** route: narrowly justified full-main admission or reviewed production-base hotfix policy. No generic backend/prisma/contracts exception; exactactive/candidate/blob binding only.
3. Infrastructureadmin establishes reviewed privateGitHubauth for broker and installs approved exactbrokerbytes; credentialcontract/permissions remain separate from artifactapproval. No credential change in this task.
4. Once finalsource/CI/build/artifact stable, independentOwner/admin verifies exactoriginalZIP/image.tar/binary/provenance and installs genuine root0600 unusedapproval under root0700authorizations. If sourcechanges, obtain fresh CI/build/artifact and newapproval; do not use existingcandidate13588533054 under anotherSHA. No approval issued by agent.
5. Finalpreflight must pass real authenticatedfresh-main(or separately reviewedreleasepolicy), verifyCompatibility, schema evidence, rootapprovalexpiry/unused/CAS, immutablehashes, oldimage+configrollback, idle/global lock/journal, ready/API/Voice health, flag/protectedworkflow policy and explicitmaintenancewindow. Only subsequent separately authorized deployment can follow.

Current oldAPI image/tag retained: e50de253..., imageIDsha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7. No cutover/rollback/remoteconfigwrite/buildworkflowdispatch or providercredential mutation. No productionDBqueries in this task. Search latency/new-image productionE2E remainsNOT_RUN. No effect on C2/G3/backups/sync/timers/Frontend.

**Final: BLOCKED.** Runtime source compatibility is plausible and narrowly evidenced; formal deployment eligibility and productionmigrationstate not established. Counterfactualhotfix basiclocaltestsPASS, not a new approvedrelease. Stop for independent CodeReview of this assessment.


## Read-only SSH Deploy Key and Backend2 evidence review — 2026-11-08T11:47:24.433342+00:00

**BLOCKED — administrator credential contract and independent compatibility approval required before source implementation.** No source fix/PR/artifact/deploy made in this task; report append-only.

### New evidence and freshness

Owner relays Backend2 production confirmation: both price_history/product_identities migrations applied, checksum/schema/constraints/RLSPASS, newsearchSQL succeeds on realschema, APISELECTgrants confirmed. **This is Backend2-reported evidence, not this agent's DBmeasurement.** Direct execution as aktau_api_runtime remainsNOT_VERIFIED (noSETROLE). No credentials requested/read, no DBconnection/migration performed. This supersedes previous 'no DBstate evidence supplied' only; it does not fabricate a missing restricted-role execution or independently approve a transport exception.

Fresh authenticated GitHubGETs: main remains ffc0bc44dfef3e11399a01cb509a1268cf87c683; CI42408276613 sameSHA/success/attempt1; artifact13588533054 notexpired, producerSHAunchanged, originalZIPdigest92e24c28b47165c557ac21909a4f4ddafe5a87a791e13ad224bc82637045d00a. Existingbuild42408917107/verifiedimage21981184bytes/archive7a1ee6dfb5961b9cd8655163b2a09414507a1280b7b8ffb4c641bbbede07fc2e remains historicalcandidate, not authorization.

SSHread-only2026-11-08T11:46:03UTC: login **deploy**. Exact `timeout 15s env GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ForwardAgent=no -o ConnectTimeout=8" git ls-remote --exit-code git@github.com:kiratonine/AdilBaga.git refs/heads/main` produced **Permission denied(publickey)**/fatalGitaccess. Shell later hash/ps commands succeeded, so overallSSHexit0 is NOT GitaccessPASS. No privatekey/configbody/authheader/token printed; no hostverification bypass. Owner's statement that a read-only deploykey was added is not contradicted: its provisioned account/identity is not established for deploy. No root/aktau-sync key tried, no agentforwarding, no key copy, no keyscan/trustchange. Existing APIe50de253healthy/up2days; installedbrokerhash2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c unchanged.

### Smallest source proposal: fixed SSH reference lookup, not implemented

Using an already approved read-only repository deploykey can avoid adding an HTTPS token issuer, **but only after admin explicitly authorizes its service identity for broker use**. Current broker fresh_main still calls unauthenticatedHTTPS fixedGitHubmainendpoint; adding a key somewhere onVPS does not change this or confer root authority. Rootwrapper env-i intentionally does not inherit caller's sshagent/config/login.

Minimal **proposed credential contract for admin review**:
1. Admin identifies the actual repository-scoped read-only deploykey installation and exact dedicated serviceaccount/UID/GID, approved publicfingerprint and exact keyfile/known_hosts paths/custody. Do not disclose privatekey/passphrase. Explicitly state whether this identity may perform the broker's readonlymain lookup; no generalrootshell/Gitwrite/docker/sudo grant. A key for syncmust not silently be repurposed, and no syncconfiguration changes are authorized.
2. Broker invokes only a fixed argv, conceptually `git ls-remote --exit-code git@github.com:kiratonine/AdilBaga.git refs/heads/main` under that approved least-privileged identity. Exact servicewrapper/paths must be fixed by reviewed code/installation, not request/env overrides. No shell=True, arbitrary GitURL/ref, fallbackaccount, inherited SSHagent or personal GitHub credentials.
3. Clear Git/SSH/config overrides and credentials helpers; fixedSSH executable/config contract, BatchModeyes, StrictHostKeyCheckingyes, approvedknown_hosts, IdentitiesOnlyyes, ForwardAgentno, no prompt/TOFU/keyscan. Disable Gitexternalprotocol/replacement/lazyfetch surprises; no dynamic shell fragments. Dedicated wrapper rather than caller-built GIT_SSH_COMMAND is preferable if argv binding needs it. Never auto-grant root access to an operator-owned writable sshconfig/identity.
4. Bounded processgroup deadline/TERM+KILL/reap and small bounded stdout/stderr; require exit0 and **exactly one** ASCII `<40hexSHA> TAB refs/heads/main` record. Reject wrongref/SHA, duplicates, empty/malformed/oversized/nonzero/timeout/authfailure/hostkeyfailure. Compare against the independently admitted releaseSHA unchanged. No stdout/rawSSHstderr/keys in production logs: finite sanitized reasons only. All failures block beforeload/cutover.
5. Preserve actual independentrootapproval/provenance/immutableartifact/memfd/single-use/rollback/mainfreshness gates. This replaces only the readonlyfresh-main transport after review, not evidence/authority semantics. Do not run this proposal through a historicalmanualdeploy exception.

**Decision required before coding:** exactserviceidentity+keycustody+known_hoststrust+brokerpermission. None has been approved sufficiently to bind a fixed implementation. Therefore no speculative source branch/diff created; stage4 implementation is explicitly conditional on adminagreement in this OwnerTASK. Existing repo already has GitHubAPIauth on runner, not an approved VPS credentialchannel. AlternativeAPIauth still needs its previously identified separate credentialcontract; no newtokenprovisioning presumed.

After admin approval source scope can be limited to scripts/deploy/auto_broker.py, auto_broker_test.py and AUTO_DEPLOY_SETUP.md plus report. Tests: real disposable SSHservice identity with synthetickey/repo, success/wrongSHA/missingkey/deniedauth/wronghostkey/timeout/oversizedoutput/wrongref/duplicate line; injection/environment/config canaries; nonroot childcleanup; existing approval absent/expired/used/mismatch and no Docker beforeadmission; fullPython/Nodeops/security/Go/transportregressions and exactheadCI9. **All newfix testsNOT_RUN**, not fictitiousPASS. Separate sourcePR only after contract acceptance; no merge/rootinstall/deploy withoutreview.

### Exact compatibility exception: admissible evidence, not approval

Backend2's confirmation materially supports reviewing an exception, but **does not itself modify verifyCompatibility or provide independent approval of exact Gitblobs**. Current checker still rejects activee50de253→candidateffc0bc44. Exact knownpair for review:
- active **e50de2532259ab477e8491c4bddc2e6120ef3da0** / candidate **ffc0bc44dfef3e11399a01cb509a1268cf87c683**;
- price_history migration: ABSENT→Gitblob2863a1d1d060d9f62e14d51187d7bb21a3e8c580, fileSHA2562361297abb69957611e221d469990a7121e08650d68241f15f9d54eca645ac2a;
- product_identities migration: ABSENT→Gitblobd8f8e9c551c68b6a901d17f56db16523ad35344e, fileSHA2565244f9eb92fc7ee2af2c95af6cbaef0488bbc8709739070adefb7c933d0827ec;
- schema.prisma: Gitblob2f270ddd9e1aa24683fc15766d67c1b88d1251fe→00315ade499cc561f0731ae0875b1b46643dac11.

Independent Owner/release-security reviewer must bind Backend2's attributable dated/checksummedDBevidence to **this exactpair** and approve only these threepaths/blobchanges. Until then no exception coded. If brokerfixPRmerges, finalcandidateSHAchanges: review must bind that actualcandidate and blobs again, not silently reuse approval forffc0bc44. No blanketPrisma/migrations allowance, no migrationexecution or inferred SETROLEPASS.

### Remaining release authority and next gate

One consolidated admin decision: identify/authorize exactreadonlyGitserviceidentity and hosttrust for broker; independently approve exactcompatibility delta against Backend2 evidence. These permit source-onlyimplementation/review, **not** productionrelease. No requests for DBsecrets, no contact/messages sent to Backend2.

After acceptedsourcePR: exactmainCI9/newbuild/newimmutableartifact ifSHAchanges; admin independently verifies rootbroker updatebytes and installs genuine exactartifactrootapproval per strictschema1/root0600/parent0700/expiry/unusedmarker. Current approval missing remains unresolved; no fakeapproved/nonce/authorizer created. Do not label artifact13588533054 as a newSHA. Fresh runtime/rollback/global lock/health/provenance/compatibility and a **newUTCcutoverwindow** required: Nov7 21–22UTCexpired and is not renewed here. AUTO_DEPLOYflag/settings unchanged.

Final **BLOCKED** at explicit credential/compatibility authorization gate, not READY_FOR_DEPLOY or an implemented REMEDIATION_READY_FOR_REVIEW. Main/production unchanged. No Dockerload/cutover/rollback, credentials/permissions, Frontend/DB/sync/C2/G3/backups/timers mutation. Only read-only remote/GitHub queries and this append-only localreport.


## ONE_PASS_PR103_RELEASE_RECOVERY_2026_11_08

**Status: source remediation ready for independent review; production BLOCKED.**
UTC source qualification: 2026-11-08. Historical sections above remain unchanged.

### Corrected SSH evidence and Owner source credential decision

The earlier no-`-i` failure was incomplete diagnostic evidence, not proof that
Owner's read-only Deploy Key failed. Fresh `ssh my-vps` read-only check as deploy:

```bash
timeout 15s env -i PATH=/usr/bin:/bin HOME=/home/deploy LANG=C \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
  GIT_SSH_COMMAND='ssh -F /dev/null -i /home/deploy/.ssh/adilbaga_github_readonly -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes -o ForwardAgent=no -o IdentityAgent=none -o UserKnownHostsFile=/home/deploy/.ssh/known_hosts -o ConnectTimeout=8' \
  git ls-remote --exit-code git@github.com:kiratonine/AdilBaga.git refs/heads/main
```

**Actual SSH/exec exit0**, stdout exactly
`ffc0bc44dfef3e11399a01cb509a1268cf87c683<TAB>refs/heads/main`, empty stderr.
UID/GID1000/1000, key regular0600/single-link; existing user known_hosts0600.
No key/config/known_hosts bodies read or printed. No key copied/agent forwarded.

Owner explicitly confirmed source use of this fixed deploy identity/key. Initial
proposed host-trust path was `/etc/adilbaga/github_known_hosts`. Qualification
proved the private parent prevents UID1000 path access; an inherited-fd trial also
failed real Git/OpenSSH host admission. Preserved failed run:8 tests,1FAIL/2ERROR,
exit1; synthetic diagnostic Gitexit128/strict host-key failure. No protection was
weakened. Owner then explicitly authorized **only the public root-controlled path
change to `/etc/ssh/adilbaga-github-known-hosts`**, root:root0644. `/etc/adilbaga`
permissions stay unchanged. Final real Git/OpenSSH fixture8/8 PASS, exit0.
This is source-contract consent, not permission to install root bytes or issue
artifact authorization. Trusted root/admin/system executables and the approved
credential-owning operator remain the declared trust boundary.

### Fresh source/artifact/production evidence

2026-11-08T12:07:17Z authenticated GitHub checks: main still
`ffc0bc44dfef3e11399a01cb509a1268cf87c683`; pushCI42408276613 attempt1 sameSHA,
all9jobsSUCCESS. Build42408917107 attempt1 SUCCESS. Artifact13588533054 notexpired;
original ZIP SHA25692e24c28b47165c557ac21909a4f4ddafe5a87a791e13ad224bc82637045d00a
matches API digest and local rehash (21982251bytes). image.tar21981184bytes SHA256
7a1ee6dfb5961b9cd8655163b2a09414507a1280b7b8ffb4c641bbbede07fc2e unchanged.
AUTO_DEPLOY_ENABLED remainsfalse. No new application image/artifact built.

VPS2026-11-08T12:11:57Z read-only exit0:

- Active API image/tag `adilbaga-api:e50de2532259ab477e8491c4bddc2e6120ef3da0`,
  imageID `sha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7`;
  running/healthy, restartCount0, old exact image retained.
- Wrapper SHA256 f7bcc5a0dbc0dd15bc74a50134dc9941cc242a94b6acfb96a69f53d50b927441;
  installed broker SHA2562dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c.
  **Neither changed.** New fixed root-known-hosts absent. Exactffc0bc44rootapproval absent.
- Global lock free probe/released, no top-level journals/RUNNING transaction.
  This is a snapshot, not permission to skip fresh pre-cutover admission/rollback.

### Minimal reviewed-source candidate

Branch `fix/broker-private-main-ssh`, clean baseline `ffc0bc44dfef3e11399a01cb509a1268cf87c683`.
No compatibility-policy, Go business code, DB, frontend, sync/C2/G3 or workflow change.
Files:

1. scripts/deploy/auto_broker.py: replace only fresh-main transport; fixed repo/ref,
   fixed Git/SSH argv, no shell=True, config/agent/proxy/env injection excluded.
   O_PATH/no-follow parent traversal verifies key metadata without reading key.
   Root-controlled host trust regular0644/single-link, protected root ancestors.
   Drop child to UID/GID1000, clear supplementary groups, clean env/cwd, closefds;
   streamed bounds stdout1024/stderr4096, total15s deadline, process-group
   TERM/KILL/reap/pipes cleanup. Strict one-line40hex/main parse; stale candidate
   false; failures finite reasons before Docker/approval consumption. Existing
   root approval/sealed memfd/provenance/rollback/main freshness logic unchanged.
2. scripts/deploy/auto_broker_test.py: strict parser/candidate/account tests,
   credential failures before side effects, real child bounds/timeout/cleanup,
   argv/environment canaries. Existing HSTS test exercises HTTP helper directly;
   no HSTS protection removed.
3. scripts/deploy/private-main-integration.py: explicit disposable-root-only
   loopback SSH fixture, synthetic users/keys/private repo;8 real Linux tests.
4. scripts/ci/run-checks.mjs: Security job also executes existing broker/smoke and
   transport suites. No jobs added or removed, no CI gates disabled.
5. docs/production/AUTO_DEPLOY_SETUP.md: exact contract, trust boundary,
   separate root installation and compatibility/authorization gates, reproduction.
6. This report: full preserved history and actual recovery evidence.

### Fail-first, tests and exact commands

Logs retained off-tree/ignored at
`/home/denis/tmp/aktau-go-search-word-order/artifacts/search-production-preflight/one-pass-recovery`.
No production raw logs/credentials saved.

| Command/check | Exit | Actual result |
|---|---:|---|
| Python broker+smoke baseline before source fix |0|50 tests PASS |
| New private-main transport test before implementation |1|ERROR missing private_main; fail-first preserved |
| Inherited public-host-trust FD design trial in disposable root container |1|8tests/1FAIL/2ERROR; rejected design, not production |
| python3 -B -m unittest discover -s scripts/deploy -p 'auto_*_test.py' |0|56tests PASS,0skip |
| node --test scripts/deploy/auto-gate.test.mjs |0|104PASS,0skip; compatibility remains fail closed |
| node scripts/ci/run-checks.mjs ops |0|176PASS,0skip |
| node scripts/ci/run-checks.mjs security |0|broker/transport/guard/source/backup checks PASS; rerun on final bytes before publication |
| node scripts/ci/run-checks.mjs go (initial PATH) |1|Go1.27.1 rejected pinned1.27.3; tooling failure preserved |
| same Go command with installedGo1.27.3+Node24.10.0 PATH |0|unit/race/vet/staticcheck(including integration tags)/govulncheck/build3 PASS |
| node scripts/ci/run-db-integration.mjs (same pinned PATH) |0|disposable PG17 suites/cleanup PASS; no production DB access |
| disposable real Git/OpenSSH final fixture |0|8PASS,0skip; key missing/auth/host mismatch/timeout/custody/symlink/hardlink/permissions/FD leakage/environment/drop identity |
| verifyCompatibility(activee50de253,candidateffc0bc44) |2|BLOCKED_PROTECTED_DELTA, expected retained release gate |
| git diff --check |0|PASS before publication |
| New exact-PR-head hostedCI9 |NOT_RUN at source report freeze|qualification follows source commit; never substitute old CI for new head |
| Root broker install/newartifact/cutover/newsearch productionE2E |NOT_RUN|requires independent gates below |

Linux fixture build recipe (only disposable image; not a production build):

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 git openssh-server openssh-client passwd && rm -rf /var/lib/apt/lists/* && userdel -r ubuntu
COPY auto_broker.py private-main-integration.py /fixture/
ENV DISPOSABLE_PRIVATE_MAIN_TEST=1
CMD ["python3", "-B", "/fixture/private-main-integration.py", "-v"]
```

Copy the two exact reviewed source files to a disposable build context; then
`docker build -t aktau-broker-private-main-fixture:20261108 <context>` and
`docker run --rm --network none aktau-broker-private-main-fixture:20261108`.
No host mounts/network, synthetic keys stay inside discarded container. Recipe
uses distro package versions as resolved for this run, not a reproducible image
identity guarantee; actual build log retained. This proves runtime behavior, not
production key scope/host trust/root installation.

### Backend2 evidence and deliberately unimplemented compatibility exception

Backend2 confirmation is Owner-relayed: production migrations/checksums/schema/
constraints/RLSPASS, real search SQLPASS, APISELECTgrantsPASS. Direct execution
as aktau_api_runtime remainsNOT_VERIFIED; no SETROLE/DBconnection attempted here.
The new search does not need the new tables. These statements support review;
they do not approve policy or constitute our independent production SQL test.

Exact exception packet still requires independent release-security acceptance:
activee50de2532259ab477e8491c4bddc2e6120ef3da0, historicalcandidateffc0bc44dfef3e11399a01cb509a1268cf87c683;
price_history absent→2863a1d1d060d9f62e14d51187d7bb21a3e8c580,
product_identities absent→d8f8e9c551c68b6a901d17f56db16523ad35344e,
schema2f270ddd9e1aa24683fc15766d67c1b88d1251fe→00315ade499cc561f0731ae0875b1b46643dac11.
SHA256migrationchecksums remain the exact values in earlier table. After this
source PR merges, finalmain changes: independently bind the **new actual finalSHA**
and these exact blobs, not an unknown future SHA or inherited approval. No broad
Prisma/migration exception is implemented, no checker disabled.

### One consolidated administrator/reviewer action packet

1. Review source PR credential/host-trust contract and exact bytes; independently
   confirm repo Deploy Key read-only scope and authentic GitHub host keys. Admin
   then installs the public fixed known_hosts and approved root broker with
   root-private no-clobber backup, CAS/atomic/fsync/readback under idle/lock gates.
   This source task did not perform that installation or change privileges.
2. Independently accept/reject the exact final candidate/active/three-blob
   compatibility delta against attributable dated Backend2 DB checksum evidence.
   Until accepted, transport remains BLOCKED; no blanket exception or DB mutation.
3. After reviewed merge/exact-mainCI9, produce NEW authenticated build-only
   artifact, verify ZIP/image/layers/binary/provenance. Artifact13588533054 belongs
   only toffc0bc44, cannot be relabeled. Admin independently installs genuine
   exact-final-artifact root approval (strictschema1/expiry/unused), never agent-
   generated approval or old one-shot record.
4. Owner supplies a NEW absolute UTC cutover window; Nov7 21–22UTC expired.
   Only then fresh global-lock/journal/main/CI/artifact/approval/compatibility/
   healthy runtime and qualified old-image/config rollback preflight, one official
   broker attempt, full HTTP/Voice/search/public E2E and observation. No alternative
   direct SSH cutover, no flag/settings change in this task.

**Final source checkpoint: REMEDIATION_READY_FOR_REVIEW; overall release BLOCKED.**
No merge/root install/approval/newapplicationartifact/deploy/rollback attempted.
Production stays olde50de253healthy. PostgreSQL, Frontend, sync/timers, C2/G3 and
recovery backups unchanged. Stop for independent review/administrative gates.


### ONE_PASS recovery — publication and exact-head hosted qualification

UTC 2026-11-08T12:32:02.166178+00:00. **Final release status: BLOCKED; source remediation ready for independent Code Review.**

Draft PR https://github.com/kiratonine/AdilBaga/pull/104; branch fix/broker-private-main-ssh; exactHEAD **0b492bc1b0f88c0bb805736dd24df258c48a8748**. One ordinary scoped commit/push, no force/merge/root install. Final currentmain ffc0bc44dfef3e11399a01cb509a1268cf87c683.

Exact-head hostedCI https://github.com/kiratonine/AdilBaga/actions/runs/42479860177 attempt1, pull_request, **9/9SUCCESS**:

| Job | ID | Result |
|---|---:|---|
| Contracts | 128729243335 | SUCCESS |
| Go Quality | 128729243409 | SUCCESS |
| Pipeline Quality | 128729243420 | SUCCESS |
| Frontend | 128729243444 | SUCCESS |
| Nest Reference | 128729243473 | SUCCESS |
| Security | 128729243486 | SUCCESS |
| PostgreSQL Integration | 128729853081 | SUCCESS |
| Ephemeral Staging | 128730211608 | SUCCESS |
| CI Gate | 128730905430 | SUCCESS |

All nine job conclusions are real SUCCESS; this does not claim every optional test case ran. Existing conditional/optional skips in full suites remain as logged. New focused Python56/56, transport104/104, real SSH8/8 and ops176/176 have no skips. PG17 and Ephemeral Staging succeeded in hosted CI; local Go full quality and PG17 also passed.

Full sanitized hosted log: `/home/denis/tmp/aktau-go-search-word-order/artifacts/search-production-preflight/one-pass-recovery/hosted-ci-sanitized.log`; bytes480707, SHA25682e1916c4d3a1b5634937f924db20bf15b1ecf5b985bdd6cc3dbaa8845579df9. Download/sanitization exit0. No raw production log/credential output.

Public BEFORE (old API) HTTP checks: live200/2.209624s, ready200/0.529155s, categories200/0.750954s, dashboard200/0.913370s; all curl exit0. Search-summary probe used the wrong DTO shape and remains NOT_VERIFIED, not a search failure or PASS. No new-release E2E/Voice/observation/rollback attempted; historical search asymmetry remains BEFORE evidence.

Public Deploy Key fingerprint from existing .pub only: SHA256:pdAiduPfCeqEfnCxxt4aBLpgeN0ZbyFuDFIYvXyfwq4. Read-only scope remains Owner-reported: repository Deploy Keys API unavailable to current tooling (exit1), so independent scope verification NOT_VERIFIED. Admin can verify this exact fingerprint and read-only scope in repository Settings→Deploy Keys; no new credential or permission request made.

Candidate broker SHA256 **7b8f532015506e90fd1ce34d7f4b6df181bec17774d142ff69cdbc8406be0a6f**. Installed remains **2dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c** at last read-only VPS snapshot; new fixed host trust absent. Approval/compatibility gates not changed. Production image remains observedold e50de253..., retainedIDsha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7; no image loaded/started, no newapplicationartifact. Build42408917107/artifact13588533054 remain tied only toffc0bc44.

Clean source archive: `/home/denis/tmp/aktau-pr103-private-main-review-20261108/PR103_PRIVATE_MAIN_BROKER_CHANGED_FILES.tar.gz`; 58182bytes,6regular0644members; SHA256 **d43700af6d503e84c909bf20825699055bb29a44dd5e955e35e9c59f1fc8b905**. .sha256 and ARCHIVE_VERIFICATION.json sidecars provided. Independent GitHEAD+working-tree byte-match, exact6paths, unique safe relative paths/no links and privacy/source audit PASS.

Archive contains the **immutable committed report freeze** (including historical sections and source qualification), where new hosted CI correctly read NOT_RUN at that time. This later CI-execution follow-up is append-only in the original local release report, not silently substituted into the frozen commit/archive. Source worktree remains CLEAN; PR body carries actual CI result. No archive/evidence/Owner TODO files committed.

Remaining single administrator/reviewer packet is unchanged: review PR104; verify public fingerprint/read-only key and host trust; independently approve exact final candidate/active/three migration-schema blobs against attributed Backend2 evidence; authorize exact root broker+known_hosts installation/backup/CAS/readback. After reviewed merge obtain new exact-main CI/new immutable build/artifact and genuine independent exact-artifact root approval, then a NEW absolute UTC window and fresh rollback/global-lock/admission preflight. Until all pass **BLOCKED**, no cutover retry or historical exception reuse. No PostgreSQL/Frontend/sync/C2/G3/timer/credential/flag/settings changes.

Tooling correction: old gh pr edit GraphQL projectCards endpoint failed (deprecation); REST PATCH of the same PR body exit0, independently rechecked exactHEAD/draft/CI9 text. No extra commit/push/source modification. Final diff/status clean; archive independently rechecked6/6 against commit and SHA sidecar.


## PR104_CODE_REVIEW_AND_CONDITIONAL_RELEASE_20261108

UTC 2026-11-08T13:39:31.613984+00:00. Status **BLOCKED_ADMIN_ACTION_REQUIRED**. Read Owner TASK completely. Independent supplied review SOURCE_REVIEW_PASS_WITH_RELEASE_GATES applies to exact0b492bc1b0f88c0bb805736dd24df258c48a8748, not a root approval. Fresh authenticated GitHub PR/head checks and run42479860177 attempt1 verified all9SUCCESS; unchanged reviewed commit. `gh pr ready104` exit0; ordinary `gh pr merge104 --merge --match-head-commit 0b492bc1b0f88c0bb805736dd24df258c48a8748` exit0, no admin/force. Actual merge/current candidate **32b8a3556296039b49d88d161c06fbec3a14d20e**.

Exact-main push CI **42485936039**, current status in_progress, conclusion None. This is **not CI9 PASS**; new official build-only/artifact NOT_RUN pending successful exact-main qualification. Old artifact13588533054 remains bound only toffc0bc44; no relabeling.

### Consolidated independent administrative/review packet

1. Administrator independently verifies repository read-only deploy-key fingerprint SHA256:pdAiduPfCeqEfnCxxt4aBLpgeN0ZbyFuDFIYvXyfwq4 and authentic GitHub host keys; installs only `/etc/ssh/adilbaga-github-known-hosts` root:root0644 through existing administrative channel. No ssh-keyscan/TOFU, no copied private key or changed sudoers. Agent does not perform this installation.
2. Administrator qualifies old installed broker SHA2562dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c, no-clobber root-private backup and idle/global lock, atomically installs reviewed source broker SHA2567b8f532015506e90fd1ce34d7f4b6df181bec17774d142ff69cdbc8406be0a6f with custody/CAS/fsync/readback. Fixed wrapper unchanged. Independent root-component installation is mandatory; agent is not that independent administrator.
3. Independent compatibility review must bind activee50de2532259ab477e8491c4bddc2e6120ef3da0 and actual candidate32b8a3556296039b49d88d161c06fbec3a14d20e, only these blobs: price_history absent→2863a1d1d060d9f62e14d51187d7bb21a3e8c580; product_identities absent→d8f8e9c551c68b6a901d17f56db16523ad35344e; schema2f270ddd9e1aa24683fc15766d67c1b88d1251fe→00315ade499cc561f0731ae0875b1b46643dac11. Backend2 DB/SQL/grants confirmation is Owner-relayed supporting evidence; execution under aktau_api_runtime remainsNOT_VERIFIED. No exception is installed or broad policy bypass introduced. A subsequent policy-source merge changes candidateSHA again and needs exact final identity review; do not silently inherit this binding.
4. After final reviewed policy/main and actual CI9SUCCESS, official build-only produces NEW artifact. Administrator independently verifies final source/CI/build/run-attempt/artifact/name/original ZIP/image.tar/layers/binary and installs genuine unused schema1 exact-artifact root authorization. None is generated by this agent.
5. Owner supplies NEW absolute UTC maintenance interval. Old Nov7window expired. Only after installed lookup, compatibility, root approval and rollback/global-lock/health gates pass may one official broker cutover proceed. No direct SSH Docker bypass.

No VPS mutation, root installation, DB/schema/Frontend/sync/C2/G3/scheduler/backup/credential changes, flag modification, Docker load, cutover or rollback in this continuation. Production last independently observede50de253healthy; no new production E2E or current Voice claim. Prior source tests remain valid for unchanged source; exact-main CI is separately pending, not substituted with PR CI. Stop at genuine independent administrative gates.


## Administrator source preparation — 2026-11-08T13:51:59.973680+00:00

# PR104 administrative preparation — review gate

Status: BLOCKED_ADMIN_ACTION_REQUIRED. No production mutation.

Current qualified main:32b8a3556296039b49d88d161c06fbec3a14d20e.
Main CI42485936039 attempt1 SUCCESS (fresh run metadata); preceding exact PR CI9 already verified. Root broker expected old SHA2562dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c; reviewed replacement SHA2567b8f532015506e90fd1ce34d7f4b6df181bec17774d142ff69cdbc8406be0a6f.

Administrator confirms fixed /etc/ssh/adilbaga-github-known-hosts and deploy read-only identity. No agent installation performed. Installer implementation/qualification NOT_RUN; no untested root script offered for execution.

## Compatibility design issue requiring independent decision

A candidate mirroring existing approvedExceptions was locally tested:105 Node tests PASS, exit0. It limits active e50de253 and the complete three-path blob inventory but accepts any candidate carrying those blobs. That is NOT the requested explicit final-candidate restriction. Candidate diff preserved as UNAPPROVED_POLICY_CANDIDATE.diff, not committed/pushed/applied; working source restored to exact HEAD without reset or deleting Owner work.

Hardcoding a future merge commit SHA into the same commit's own source is self-referential: adding that SHA changes the commit. Do not claim this can pin its own final merge SHA. Independent review must choose a non-self-referential binding. Proposed existing-contract composition: exact active + three blob pins in reviewed transport; final candidate separately bound to exact-main CI/artifact and independently installed schema1 root authorization, with administrator explicitly reviewing this exact compatibility delta for that final release. This is a proposal, not approval or implemented policy. Alternatively a separately reviewed external exact-pair policy would be a new trust contract; do not invent it silently.

## Root installer requirements before execution

Fixed target /usr/local/lib/adilbaga-deploy/auto_broker.py only; reviewed source bytes from qualified Git commit, never execute uploaded Python as installer trust. Root trusted installer must pin parent descriptors/custody, acquire existing global deployment lock and require idle/no RUNNING journal, CAS exact old hash/device/inode/mode/owner, root-private exclusive/fsynced backup plus durable intent, stage exclusive0600 then approved0644 and fsync, recheck target identity before atomic replacement, fsync parent, exact new hash/owner/mode readback. Unknown/crash state blocks rerun; no automatic rollback or deletion of foreign files. Known_hosts is separately authenticated admin input, never copied automatically from writable user known_hosts or ssh-keyscan. Root upgrade itself requires independently reviewed installer and actual disposable filesystem/crash qualification; NOT claimed complete here.

## Next one review packet

Independent reviewer decides exact final-SHA compatibility binding above and reviews forthcoming root installer before root execution. Then source implementation/tests/PR/CI, final merge/exact-main CI/new official build-only and immutable artifact verification. Only after final artifact exists can administrator independently issue exact-artifact schema1 approval. New absolute UTC window and rollback preflight remain mandatory. Old artifact13588533054 cannot be relabeled. No database/frontend/sync/C2/G3/timer changes.



## FINAL_PR104_RELEASE_EXECUTION — compatibility source review gate

UTC 2026-11-08T14:06:39.952535+00:00. Status REVIEW_REQUIRED / BLOCKED before merge or production mutation.
Main32b8a3556296039b49d88d161c06fbec3a14d20e; run42485936039 attempt1 independently verified9/9SUCCESS. All three old/new Prisma blobs independently re-read from actual Git objects and match TASK. Owner accepts gate composition as proposal; independent policy review still REQUIRED.

Source candidate uses the existing approvedExceptions mechanism: exact activee50de2532259ab477e8491c4bddc2e6120ef3da0 and ONLY the complete three-path/old-new-blob inventory. Unknown protected path/missing delta/wrong mode/changed blob/Git failure rejects. No DB or broad Prisma bypass. Final candidate is bound by authenticated exact-main CI, immutable producer/download validation and independent schema1 authorization, not embedded future self SHA. Transport calls compatibility only after CI/artifact/status admission; broker performs fresh-main check then exact independent approval+archive validation before load, consumes single-use marker before load, rechecks approval and fresh main before cutover. No order change introduced.

Tests: transport105/105PASS exit0; ops176PASS exit0; security including Python57PASS and transport105PASS exit0; Go full quality/race/vet/staticcheck/govulncheck/build exit0; disposable PG17 integration/cleanup exit0. Additional precise test constructs another self-consistent candidate manifest and requires authorization_unavailable BEFORE any Docker command; candidate artifact name is updated to exclude unrelated invalid-manifest rejection. Existing expired/used/provenance/stale tests preserved. Logs /tmp/pr103-final-policy-*.log and /tmp/pr103-policy-approved-design.log. Focused strengthened test exit0. No production SQL tests; Backend2 role execution remainsNOT_VERIFIED.

Read-only SSH metadata: /etc/ssh/adilbaga-github-known-hosts root:root0644 regular/single-link confirmed, exit0. Installed broker stillSHA2562dd252eed4e0c634e908acd33135d61dd02b8d9595911708f459e50efa62406c. No root installation or known_hosts modification. Owner independently reports host authentication; metadata alone is not an independent fingerprint proof.

Phase A independent policy Code Review is the next mandatory gate. Do not self-approve, merge policy, install root code or create new final artifact before that review. Phase B installer implementation/qualification and exact executable admin commands NOT_RUN; no untested installer offered. Continue the SAME task from this policy review checkpoint after reviewerPASS, then exact-mainCI, disposable installer qualification/admin install, new official artifact/admin approval and new UTCwindow. Existing broker source bytes7b8f... unchanged. No PostgreSQL, Frontend, publisher, C2/G3, timer, backup, credential or flag changes. No deployment/E2E/rollback success claimed.

## BACKEND2_RESUMED_SEARCH_RELEASE_20261108

**Final status: `EMERGENCY_MANUAL_DEPLOY_PASS`.** This is a manual release, not a broker `DEPLOY_PASS`.

Operator: Backend 2 (VPS commands typed by the operator as `b2admin`; Claude Code wrote and reviewed scripts and never connected to the VPS). Authority: on 2026-11-08 the Backend 2 operator is the team decision-maker and explicitly approved one manual cutover to `1cbd535` per `deploy/README.md`, after artifact verification, with no new `docker load`. Window used: 2026-11-08T15:23:34Z–15:31:04Z (outside the 01:00Z/13:00Z syncs and the 22:00Z weekly run).

### Source, CI, artifact

- main `1cbd535562cca1852942683a3c0f0f717db181b3` = merge of PR #105 (PR #104 is in `32b8a35`).
- Exact-main CI run `42489370499`, attempt 1: 9/9 jobs `success`.
- Build-only run `42490016333`, attempt 1; artifact `13620564744` `adilbaga-api-1cbd535562cca1852942683a3c0f0f717db181b3-42490016333-1`.
- ZIP SHA-256 `01bf683401a4d09e315bcd270cbb66c0ecba213a81ccc15d795db023e0569b93` (matches the GitHub artifact digest); `image.tar` `8e852257e8ef57b6cf765d82bb85e05a5ed38cbce446543be12e6a54ea9f598f` (21 981 184 bytes); API binary `3c9be87e4165c43813b4bb2710bdc5fe6297da2ca394435e3b5d95ec432508b2`; rootfs `75f1d965…`, `2d417a41…`, `7701ca41…`.
- Old artifact `13588533054` (`ffc0bc44`) was not used.

### Reconciliation of the interrupted run (read-only, 15:14–15:16Z)

- The interrupted agent did not use the broker. It ran its own root procedure (`sudo python3 -I -B -` from `deploy`), state in `/var/lib/adilbaga/deploy/1cbd535….emergency-1794148631/`. Journal: worker started 14:44:53Z and 14:48:07Z; `VERIFIED_ARCHIVE_BEFORE_ONE_LOAD` 14:48:22Z; `LOADED_IMAGE_IDENTITY_PASS` 14:48:23Z; `READ_ONLY_SOURCE_LOOKUP_RECHECK` 14:48:38Z (15 s timeout), then nothing.
- Loads: 1 (per that journal; Docker event buffer no longer held it). Cutovers before this section: 0. Rollbacks: 0.
- `/var/lib/adilbaga/deploy/1cbd535….json` = `{"status": "RUNNING"}` written 14:37:39Z by that procedure, no process behind it. Lock free. No approval file for `1cbd535`, no `.used` marker; only the 2026-10-20 authorization exists.
- Installed broker is still `2dd252ee…` (reviewed `7b8f5320…` from PR #104 not installed); `auto_smoke.py` `3f7a22c2…` = repository version; compose `7ba6711f…` unchanged.
- Timeout cause: transient. The same fixed `ls-remote` as `deploy` with the fixed key and `/etc/ssh/adilbaga-github-known-hosts` (ED25519 `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, GitHub's published key) returned `1cbd535…` 3/3 in 2.5–3.7 s.
- Scenario: D at reconciliation (unscripted procedure, stale RUNNING), resolved by an explicit decision to use the documented manual path (C). The `RUNNING` file and emergency directory were left untouched.

### Cutover (systemd unit `adilbaga-search-cutover`, script SHA-256 `d9a2110f…ee14`)

- Held `/var/lib/adilbaga/deploy/lock` for the whole run. Preflight re-checked inside the loaded image: revision label, linux/amd64, `10001:10001`, entrypoint, 3/3 rootfs layers, binary SHA-256. `PREFLIGHT_PASS` 15:23:34Z.
- Baseline old API (local): `творог dekmy` 4 results, `dekmy творог` 0 (the bug); smoke PASS; search median 615 ms.
- Backup `/root/adilbaga-release.env.e50de25.1794151454`. Tunnel stopped 15:24:14Z → `release.env` set to `1cbd535` → `compose up -d --force-recreate` → healthy 15:24:22Z; hardening identical to old container; `api.env` and compose unchanged. Tunnel restarted 15:25:02Z (public outage about 48 s).
- Old image ID `sha256:a5f4b2733b6e9fb8a3b62e88e869fdcce80d59928fd504b4503a210fa4822ea7` (`adilbaga-api:e50de25…`), kept for rollback. New image ID `sha256:153f7b296c574886e35e79bcc060d5d77631490ff39c60928cd829bf3464218a`, OCI revision `1cbd535…`. Store ID differs from the archive config digest `0b7ba1a9…`, as `deploy/README.md` Gate L allows; file, layer and binary proof match.
- Final 15:31:04Z: ref `adilbaga-api:1cbd535…`, restarts 0, healthy. Loads in this section: 0. Cutovers: 1. Rollbacks: 0.

### Acceptance

- Installed `auto_smoke.py` (health, categories, milk filters, three sorts, pagination, 400 cases, product detail, dashboard, CORS, Voice start single/list, clarification + continue with Redis session TTL and deletion): local PASS 15:24:54Z, public PASS 15:25:49Z.
- Search parity, `sort=price_asc&limit=100`: `творог dekmy` and `dekmy творог` both 7 results, same IDs and order (ids hash `ce42c639f044d064`), local and public. Extra: `творог` 46, `DEKMY` 25, `100%` 3, `a_b` 0, empty 100.
- Latency medians: local 615/501 ms old → 617/615 ms new; public 972/1185 ms.
- 300 s observation: container healthy, restarts 0, tunnel active, public live/ready OK, no `ERROR` level and no 5xx in new container logs.
- Independent workstation check 15:31Z: both orders HTTP 200, 7 identical IDs in order, every result contains both tokens, `minPrice` = cheapest offer, price order correct; three sorts with pages 1/2 without overlap; `limit=101` → 400; health, `/api/categories` (9), `/api/dashboard` 200.
- Frontend `https://aktau.market` (browser): catalog loads; `/ru/search` shows the same 7 Dekmy products for both word orders. Console shows only pre-existing Yandex Metrica CSP errors.
- Voice through a real iPhone Siri Shortcut: `NOT_VERIFIED` (application-level Voice covered by smoke). Execution as `aktau_api_runtime` is now proven by live readiness and catalog traffic.

### Left as is (needs a separate decision)

- `/var/lib/adilbaga/deploy/1cbd535….json` (`RUNNING`) blocks any broker call until reviewed; emergency directory (with a 22 MB `image.tar`) retained.
- Installed broker remains `2dd252ee…`; installing `7b8f5320…` is separate work.
- `/root/adilbaga-search-cutover-1cbd535.py` and the release.env backup are kept as evidence.
- No PostgreSQL, migration, sync, parser, Frontend, scheduler, credential or flag change.

Rollback if needed: stop cloudflared, set `/etc/adilbaga/release.env` to `API_IMAGE=adilbaga-api:e50de2532259ab477e8491c4bddc2e6120ef3da0`, `docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml up -d --force-recreate`, local health + smoke, start cloudflared.
