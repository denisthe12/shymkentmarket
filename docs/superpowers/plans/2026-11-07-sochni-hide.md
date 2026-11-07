# Скрытие «Сочни с творогом» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Карточка «Сочни с творогом» (`DANA:dana_18621`, 1009 ₸ и `ANVAR:anvar_668903`, 199 ₸) перестаёт публиковаться, и фраза «на 810 ₸ дешевле» исчезает с сайта.

**Architecture:** Правка только в данных: категория карточки `c_1f576b2844c493c7` меняется с `bread` на непубликуемую `other`. `filterClustersByScope` убирает её из bundle, поэтому `resolve` её не видит и конфликта карточек нет. На VPS обновляется только checkout, публикует плановый прогон.

**Tech Stack:** TypeScript pipeline (vitest), Go `cmd/ingest`, systemd на VPS, Supabase Postgres.

**Spec:** отдельного документа нет. Требование: решение пользователя от 2026-11-07 скрыть оба товара, потому что веса нет ни у одного магазина и разницу в 5 раз нечем подтвердить. Разделение на две карточки отклонено: оно требовало ручного `cmd/ingest -recluster -apply` на проде.

## Что проверено перед написанием плана

- Симуляция `buildSyncBundle` на копии словаря: до правки 1 группа и 2 товара, после правки 0 групп, 0 товаров, 0 в `unmapped`.
- `resolve` в `backend-go/internal/ingestion/plan.go` считает голоса только по группам из bundle, а ушедшие товары групп не образуют. Подтверждается на реальных данных в Task 3, Step 4.
- Удалять записи из словаря нельзя: товары станут неизвестными, опубликуются одиночными карточками и столкнутся за старый UUID (`canonical_split_conflict`).
- `pnpm dict:apply` на текущем словаре падает (`DINA:11288`), а 10 старых split-правил при повторном применении меняют словарь.

## Global Constraints

- `pnpm dict:apply` не запускать ни локально, ни на VPS. `dictionary.json` правится руками.
- VPS-команды вводит пользователь, Claude пишет их и проверяет вывод. Claude не подключается к VPS и не трогает ключи и пароли.
- Обновлять VPS только на SHA из `main` с зелёным CI. Репозиторий приватный, поэтому код доставляется через `git bundle`.
- Не обновлять VPS во время прогонов: 01:00 и 13:00 UTC, полный скрап в воскресенье 22:00 UTC.
- Ручной `-apply` и `-recluster` в этом плане не используются.
- Push, PR и merge выполняются только после отдельного подтверждения пользователя.

## Вне этого плана

- Починка `pnpm dict:apply`.
- Защита блока «Самая большая разница» от выбросов.
- Проверка других пар без веса («Манго желтое шт» и подобных).

## Review Focus

1. **Другие товары ушли из bundle вместе с нашими:** ожидается ровно минус 2 товара и минус 1 карточка. Проверка: Task 3, Step 4.
2. **Товары вернулись как новые:** если запись попала не в тот ключ, они окажутся в `unmapped`. Тест в Task 1 и проверка в Task 3, Step 6.
3. **Старая ссылка `91287b49-da80-47f3-92da-d737788a70aa`:** API должен отдавать 404, а не ошибку 500. Проверка: Task 3, Step 6.
4. **Закешированные страницы сайта:** блок на главной может обновиться не сразу после прогона. Проверка: Task 3, Step 6.
5. **Месячная история цен:** записанные строки остаются, новых по этим товарам не будет. Проверка: Task 3, Step 6.

---

### Task 1: Правка данных и тест

**Files:**
- Create: `pipeline/test/dictionary-hidden.test.ts`
- Modify: `data/mapping/dictionary.json`
- Modify: `data/mapping/overrides.json`

**Interfaces:**
- Consumes: `readDictionary(path)`, `readOverrides(path)`, `buildSyncBundle(files, dict, generatedAt, scope)`, `publishCategories()`.
- Produces: коммит, от которого зависит Task 2.

- [ ] **Step 1: Написать падающий тест**

В `pipeline/test/dictionary-hidden.test.ts`, путь к данным как в `pipeline/test/taxonomy.test.ts`. `files` содержит source-файлы DANA и ANVAR с товарами `dana_18621` и `anvar_668903`:

```ts
const KEY = 'c_1f576b2844c493c7'

it('Сочни с творогом не публикуются', () => {
  expect(dict.canonicals[KEY]!.category).toBe('other')
  expect(publishCategories().has('other')).toBe(false)
  const { bundle, unmapped } = buildSyncBundle(files, dict, new Date().toISOString(), publishCategories())
  expect(bundle.canonicalProducts).toHaveLength(0)
  expect(bundle.rawProducts).toHaveLength(0)
  expect(unmapped).toHaveLength(0)
})

it('оба товара остаются в словаре, скрытие записано в overrides', () => {
  expect(dict.products['DANA:dana_18621']).toBe(KEY)
  expect(dict.products['ANVAR:anvar_668903']).toBe(KEY)
  expect(overrides.moveCategory).toContainEqual(expect.objectContaining({ key: KEY, to: 'other' }))
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd pipeline && pnpm vitest run test/dictionary-hidden.test.ts`
Expected: FAIL, категория `bread`.

- [ ] **Step 3: Править словарь**

В `data/mapping/dictionary.json` в строке `c_1f576b2844c493c7` заменить `"category":"bread"` на `"category":"other"`. `generatedAt` не менять.

- [ ] **Step 4: Записать правило в overrides**

В конец массива `moveCategory` файла `data/mapping/overrides.json`:

```json
{ "key": "c_1f576b2844c493c7", "to": "other", "reason": "hidden: no weight at either store, 199 vs 1009 cannot be verified" }
```

- [ ] **Step 5: Прогнать тесты и проверить объём правки**

Run: `cd pipeline && pnpm test && pnpm typecheck`
Expected: все тесты зелёные, ошибок типов нет.

Run: `git diff --numstat data/mapping/dictionary.json`
Expected: `1	1`.

- [ ] **Step 6: Коммит**

```bash
git add pipeline/test/dictionary-hidden.test.ts data/mapping/dictionary.json data/mapping/overrides.json docs/superpowers/plans/2026-11-07-sochni-hide.md
git commit -m "fix(data): hide unverified sochni card from publication"
```

### Task 2: PR и подготовка bundle

**Files:** без изменений в репозитории.

**Interfaces:**
- Consumes: коммит Task 1.
- Produces: `RELEASE_SHA` (полный SHA merge-коммита в `main`) и файл `aktau-<short>.bundle`.

- [ ] **Step 1: После подтверждения пользователя открыть PR в `main`**

Expected: CI зелёный.

- [ ] **Step 2: После подтверждения пользователя смержить PR и записать `RELEASE_SHA`**

Expected: push CI на `main` зелёный.

- [ ] **Step 3: Собрать bundle на машине пользователя**

`BASE_SHA` равен текущему HEAD на VPS: по заметкам это `e39fdca`, точное значение подтверждается в Task 3, Step 1.

```bash
git update-ref refs/tmp/release <RELEASE_SHA>
git bundle create "$HOME/Downloads/aktau-<short>.bundle" refs/tmp/release ^<BASE_SHA>
git bundle verify "$HOME/Downloads/aktau-<short>.bundle"
```

Expected: `verify` пишет, что bundle в порядке, prerequisite равен `BASE_SHA`.

### Task 3: Выкатка на VPS и приёмка

Команды вводит пользователь и присылает вывод.

**Files:** на VPS меняется только checkout `/opt/aktau-sync`.

**Interfaces:**
- Consumes: `RELEASE_SHA`, bundle из Task 2.
- Produces: опубликованный плановым прогоном snapshot без сочней.

- [ ] **Step 1: Проверить окно и записать точку отката**

Начинать после завершения планового прогона, минимум за 30 минут до следующего таймера.

```bash
systemctl list-timers 'aktau-sync*'
systemctl is-active aktau-sync aktau-sync-full
sudo -n -u aktau-sync -H git -C /opt/aktau-sync rev-parse HEAD
sudo -n -u aktau-sync -H git -C /opt/aktau-sync status --porcelain=v1
sudo grep -cE '^(SOURCES_DIR|SYNC_OUT_DIR)=' /etc/aktau-sync.env
```

Expected: оба юнита `inactive`, HEAD равен `BASE_SHA`, status пуст, счётчик `0`. Если счётчик не `0`, остановиться: путь к bundle в Step 4 будет другим.

Claude записывает `rawCount` и `canonicalCount` последнего опубликованного snapshot через read-only SQL.

- [ ] **Step 2: Доставить код**

```bash
scp "$HOME/Downloads/aktau-<short>.bundle" b2admin-vps:/tmp/
```

На VPS:

```bash
chmod 644 /tmp/aktau-<short>.bundle
sudo -n -u aktau-sync -H git -C /opt/aktau-sync fetch --no-tags /tmp/aktau-<short>.bundle refs/tmp/release:refs/tmp/release
sudo -n -u aktau-sync -H git -C /opt/aktau-sync checkout --detach <RELEASE_SHA>
cd /opt/aktau-sync/pipeline && sudo -n -u aktau-sync -H env PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin pnpm install --frozen-lockfile
```

Expected: HEAD равен `RELEASE_SHA`, install без изменений.

- [ ] **Step 3: Проверить запуск от имени сервиса**

Этот способ запуска на VPS ещё не использовался, поэтому сначала безвредная проверка. Секреты читаются из env-файла на месте и в командную строку не попадают. Функция живёт только в текущей SSH-сессии. Программу указывать абсолютным путём: `systemd-run` ищет её не в `PATH` юнита.

```bash
run_as_sync() { dir="$1"; shift; sudo systemd-run --quiet --wait --pipe --collect --uid=aktau-sync --working-directory="$dir" -p EnvironmentFile=/etc/aktau-sync.env -p Environment=PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin -p Environment=HOME=/var/lib/aktau-sync -p Environment=GOCACHE=/var/cache/aktau-sync/go -p Environment=GOTOOLCHAIN=local "$@"; }
run_as_sync /opt/aktau-sync/backend-go /usr/bin/bash -c 'id -un; go version; test -n "$INGEST_DATABASE_URL" && echo env-ok'
```

Expected: `aktau-sync`, версия Go, `env-ok`.

- [ ] **Step 4: Dry-run (в базу ничего не пишет)**

```bash
run_as_sync /opt/aktau-sync/pipeline /usr/bin/env pnpm sync
run_as_sync /opt/aktau-sync/backend-go /usr/local/go/bin/go run ./cmd/ingest -bundle /opt/aktau-sync/data/sync/bundle.json
```

Гейт: оба exit 0, `applied:false`, `splitCanonicalCount:0`, `mergedCanonicalCount:0`, `newCanonicalCount:0`, `rawCount` на 2 меньше и `canonicalCount` на 1 меньше значений из Step 1.

Любое другое значение означает откат checkout и разбор. Если `pnpm sync` сообщает `source file is stale`, откатиться и повторить после следующего успешного прогона.

- [ ] **Step 5: Дождаться планового прогона**

```bash
sudo journalctl -u aktau-sync -n 60 --no-pager
```

Expected: `[sync] done`, ошибок ingest нет, exit 0. Код 3 допустим, если причина в скрапере, а не в ingest.

- [ ] **Step 6: Проверить результат**

Claude выполняет read-only SQL и запросы к публичному API.

Expected:
- в последнем snapshot нет офферов у `91287b49-da80-47f3-92da-d737788a70aa`, нет raw-строк `dana_18621` и `anvar_668903`;
- опубликованных snapshot снова 14;
- в `https://api.aktau.market/api/dashboard` в `priceSpreads` нет этой карточки;
- `https://api.aktau.market/api/products/91287b49-da80-47f3-92da-d737788a70aa` отдаёт 404 (путь сверить с `frontend/src/api/httpAdapter.ts`);
- на главной сайта блок обновился, при необходимости подождать revalidation;
- строки `price_history` по этим товарам за октябрь и ноябрь на месте.

- [ ] **Step 7: Записать итог в память проекта**

Что записать: `RELEASE_SHA`, id снимка, точку отката.

## Откат

| Когда | Что делать |
|---|---|
| До планового прогона | `sudo -n -u aktau-sync -H git -C /opt/aktau-sync checkout --detach <BASE_SHA>`. База не менялась |
| После планового прогона | Тот же checkout, затем revert PR в `main`. Следующий прогон опубликует сочни снова одной карточкой с новым UUID (`newCanonicalCount:1`), старая ссылка останется 404 |
