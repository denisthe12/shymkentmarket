# Aktau Market — frontend (Next.js)

Единственный frontend проекта после Production Part 01. План — `../docs/context/08_NEXTJS_MIGRATION_PLAN.md` (COMPLETE).
Все страницы перенесены, язык — в префиксе URL (`/ru`, `/kk`), данные приходят в HTML с сервера.

Next 16, React 19, TanStack Query, Tailwind CSS v4, react-i18next (ru/kk).

## Запуск

```bash
pnpm install
cp .env.example .env.local   # HTTP; задайте реальные адреса среды, не secrets
pnpm dev --port 3100         # Backend отдельно на :3000
```

## API: mock ↔ http

| Переменная | Значения |
|---|---|
| `NEXT_PUBLIC_API_MODE` | обязательный `http`; явный `mock` только для dev/tests |
| `NEXT_PUBLIC_API_BASE_URL` | адрес API для браузера (запросы идут на `${base}/api/...`) |
| `API_BASE_URL` | адрес API для сервера Next (внутренний); не задан — берётся `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_ENABLE_TEST_MOCKS` | только `1` разрешает test-only mock production build для Playwright; не включать в deployment |

`NEXT_PUBLIC_*` подставляются при сборке — после смены нужен `pnpm build`.
Весь доступ к данным — через `catalogApi` (`src/api/catalogApi.ts`), контракт — `src/api/types.ts`. Фикстуры генерируются: `pnpm mocks`.

## Базовая аналитика (source candidate)

Только два необязательных публичных build-time ID: `NEXT_PUBLIC_GA_ID` (GA4,
формат `G-...`) и `NEXT_PUBLIC_YANDEX_METRIKA_ID` (положительный числовой ID).
Валидный ID автоматически включает соответствующий счётчик; отсутствие или
невалидность одного не мешает другому. Других env/enable flags нет.
Значения уже подготовлены Owner в Vercel; не переносить их в Git. Scope должен
быть Production/build. Изменение ID требует нового build/deploy.

Скрипты загружаются после hydration только когда browser origin совпадает с
каноническим HTTPS `NEXT_PUBLIC_SITE_URL`; localhost и preview не отслеживаются.
Один ручной pageview на initial load и смену RU/KK pathname; query/hash не
создают просмотров. Не передаются search text, query/hash, внешний referrer,
динамический document.title, session payloads или custom events. Title фиксирован
как Aktau Market. Метрика: defer, без Webvisor/clickmap/trackLinks/ecommerce.

Owner: в GA4 Web stream → Enhanced Measurement отключить history-based page
changes (иначе дублируются ручные pageviews), а также остальные автоматические
enhanced events/form interactions для режима «только базовые pageviews».
Не включать автоматический сбор user-provided data, goals/Webvisor в Метрике.
После отдельно разрешённого deploy проверить Network/Console без adblock,
один initial и SPA/Back/Forward hit в GA4 Realtime и Метрике. Наличие script
само по себе не доказывает доставку. В тестах только dummy IDs и mocks;
реальные analytics hits не разрешены. Отдельная задача Owner — Search Console /
Яндекс.Вебмастер; DNS и verification tokens этим изменением не затрагиваются.

## SEO

| Что | Где |
|---|---|
| Адрес сайта для абсолютных URL | `NEXT_PUBLIC_SITE_URL` обязателен для production build/start; существующий production domain `https://aktau.market` → `src/lib/site.ts` |
| title, description, canonical, hreflang (ru/kk/x-default), Open Graph | `pageMetadata` в `src/lib/seo.ts`, вызывается из `generateMetadata` страниц; тексты — `meta.*` в словарях |
| JSON-LD: `Product` + `AggregateOffer`, `BreadcrumbList` | `src/lib/structuredData.ts`, компонент `src/components/seo/JsonLd.tsx` |
| `/sitemap.xml`, `/robots.txt` | `src/app/sitemap.ts` (страницы, категории, товары из API на обоих языках), `src/app/robots.ts` |
| Картинка для соцсетей | `public/og/{ru,kk}.png`, генерирует `pnpm og` (Playwright, шрифты сайта) — перезапустить после правки `brand` в словарях или текстов в самом скрипте |

### Блог

Статьи лежат в репозитории, от API не зависят, собираются статически.

| Что | Где |
|---|---|
| Статьи | `src/content/blog/posts/{ru,kk}/<slug>.ts`, реестр и даты публикации — `posts/index.ts`. Каждая статья на одном языке, по адресу `/{lang}/blog/<slug>`; на другом языке — 404, переключатель языка ведёт в блог |
| Блоки статьи | `types.ts`: `h2`, `h3`, `p`, `ul/ol`, `table`, `chart` (SVG-график), `image` (фото), `callout`, `sources`. В тексте — `**жирный**` и `[ссылка](/ru/catalog)` |
| Цифры | `src/content/blog/data.ts` — снимок API от 06.11.2026 и инфляция БНС с источниками. Новых цифр без источника не добавлять |
| Авторы | `authors.ts`. **TODO: вымышленные авторы (`placeholder: true`) — временные, заменить на настоящих до продвижения блога.** Их LinkedIn/GitHub ведут на example.com, в JSON-LD у них нет `sameAs` |
| Страницы | `/blog` и `/blog/page/<n>` (лента обоих языков, по 10 статей — `POSTS_PER_PAGE`; `/blog/page/1` → 308 на `/blog`), `/blog/<slug>` (слева список статей, справа оглавление), `/blog/authors/<id>`. Ссылка «Блог» — только в футере |
| SEO | статья: canonical без hreflang, Open Graph `article`, JSON-LD `BlogPosting` + `BreadcrumbList`; автор — `ProfilePage`. Всё в sitemap |
| Фото | `pnpm blog:photos` — Openverse (CC0/CC BY, ключ не нужен; Pexels приостановил выдачу ключей) → `public/blog/photos`, автор и лицензия — `photo-credits.json`. Запросы и alt — `photo-queries.ts`. Автоподбор часто ошибается: каждое скачанное фото нужно посмотреть глазами, неподходящее — удалить из `photo-credits.json` и подобрать заново; alt описывает то, что на фото |
| Картинки для соцсетей | `pnpm og:blog` → `public/blog/og/<lang>/<slug>.png` — перезапустить после новой статьи или правки заголовка |

Казахские тексты написаны и вычитаны без носителя языка — перед продвижением стоит дать их на вычитку.

Поиск — `noindex, follow`, в sitemap не входит. После деплоя: Rich Results Test для страницы товара, sitemap — в Google Search Console и Яндекс.Вебмастер.

## Проверки

```bash
pnpm typecheck   # next typegen + tsc
pnpm lint
pnpm test        # Vitest
pnpm build
pnpm test:e2e    # Playwright (desktop + iPhone), сам собирает и поднимает сервер на :3100
```

Если `playwright install` не может скачать браузеры: `PW_CHANNEL=chrome pnpm test:e2e`.

Обычный E2E запускает только mock suite с явным test-only opt-in. Real HTTP:

```bash
E2E_API=http NEXT_PUBLIC_API_MODE=http \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 PW_CHANNEL=chrome pnpm test:e2e
```

Этот режим запускает только data-agnostic `e2e/http.spec.ts` против отдельного
реального Go API, без fixture assumptions. Production API failure не переключает
адаптер на mock. Каталог/Dashboard/sitemap строятся в runtime, server GET cache
ограничен 3600 s и помечен `catalog-data`; build не требует запущенного API.

## Дизайн-токены

`src/app/globals.css`, блок `@theme`. Golos Text/Montserrat — `next/font/google`;
build требует доступа к Google Fonts (независимость от Backend не означает полностью офлайн build).
