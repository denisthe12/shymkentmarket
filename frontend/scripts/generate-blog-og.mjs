// Картинки для соцсетей (Open Graph, 1200×630) для каждой статьи блога → public/blog/og/<lang>/<slug>.png.
// Рисует Playwright, как scripts/generate-og.mjs (кириллица Golos/Montserrat есть только в woff2).
// Статьи импортируют друг друга без расширений (как принято в Next) — Node сам их не найдёт,
// поэтому подключаем резолвер, который дописывает .ts.
// Запуск: pnpm og:blog (после новой статьи или правки заголовка). PW_CHANNEL=chrome — через установленный Chrome
import { chromium } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      if (/^\\.\\.?\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context)
      return next(specifier, context)
    }`),
)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fontCss = (pkg) => pathToFileURL(join(root, 'node_modules', '@fontsource-variable', pkg, 'index.css')).href

const { POSTS } = await import('../src/content/blog/posts/index.ts')
const { AUTHORS } = await import('../src/content/blog/authors.ts')
const { SITE_NAME } = await import('../src/lib/brand.ts')

const dict = Object.fromEntries(
  ['ru', 'kk'].map((lang) => [lang, JSON.parse(readFileSync(join(root, 'src', 'i18n', `${lang}.json`), 'utf8'))]),
)

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const logo = `<svg viewBox="0 0 32 32" width="52" height="52"><path d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-8a2 2 0 0 1 0-2.6l6-8a2 2 0 0 1 1.5-.7Z" fill="#17744a"/><circle cx="10.6" cy="16" r="1.9" fill="#fff"/><path d="M16 13.2h8M16 18.8h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`

const html = (post) => {
  const t = dict[post.lang]
  const author = AUTHORS.find((a) => a.id === post.authorId)
  // Длинный заголовок — мельче, чтобы влез в 4 строки
  const size = post.title.length > 90 ? 50 : post.title.length > 60 ? 58 : 66
  return `<!doctype html>
<html lang="${post.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss('golos-text')}">
<link rel="stylesheet" href="${fontCss('montserrat')}">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fff; color: #1a1f24; font-family: 'Golos Text Variable', sans-serif;
    display: flex; flex-direction: column; padding: 64px 80px; border-left: 16px solid #17744a; }
  .display { font-family: 'Montserrat Variable', sans-serif; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 6px; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .chip { border: 2px solid #e2e6e4; border-radius: 999px; padding: 6px 18px; font-size: 22px; font-weight: 600; }
  h1 { margin-top: auto; font-size: ${size}px; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { margin-top: 36px; font-size: 24px; color: #697178; }
</style></head>
<body>
  <div class="top">
    <div class="brand display">${logo}${SITE_NAME}</div>
    <div class="chip">${escape(t.blog.title)} · ${escape(t.blog.categories[post.category])}</div>
  </div>
  <h1 class="display">${escape(post.title)}</h1>
  <p class="meta">${escape(author?.name[post.lang] ?? '')}</p>
</body></html>`
}

const tmp = mkdtempSync(join(tmpdir(), 'blog-og-'))
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  for (const post of POSTS) {
    const dir = join(root, 'public', 'blog', 'og', post.lang)
    mkdirSync(dir, { recursive: true })
    const file = join(tmp, `${post.lang}-${post.slug}.html`)
    writeFileSync(file, html(post))
    await page.goto(pathToFileURL(file).href)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(dir, `${post.slug}.png`) })
    console.log(`public/blog/og/${post.lang}/${post.slug}.png`)
  }
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
