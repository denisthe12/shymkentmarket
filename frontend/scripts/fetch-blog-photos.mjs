// Фото для статей блога → public/blog/photos/<id>.jpg и src/content/blog/photo-credits.json (автор, источник, лицензия).
// Источники по порядку:
//   1. Pexels — если задан PEXELS_API_KEY (в .env.local, в репозиторий не попадает). Pexels License:
//      бесплатно, в том числе для коммерческого использования, без обязательной подписи (мы всё равно подписываем)
//   2. Openverse (ключ не нужен): сначала StockSnap (CC0), потом весь каталог. Только лицензии, разрешающие
//      коммерческое использование и изменение: CC0, Public Domain, CC BY
// Запросы и alt — src/content/blog/photo-queries.ts. Уже скачанные фото пропускаются;
// чтобы заменить фото, удалите его запись из photo-credits.json, добавьте его url в reject
// (иначе поиск вернёт то же фото) и запустите снова. Каждое фото проверяйте глазами: alt описывает то, что на фото.
// Запуск: pnpm blog:photos
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHOTO_QUERIES } from '../src/content/blog/photo-queries.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'blog', 'photos')
const creditsFile = join(root, 'src', 'content', 'blog', 'photo-credits.json')
const OPENVERSE = 'https://api.openverse.org/v1/images/'
const PEXELS = 'https://api.pexels.com/v1/search'
const PEXELS_KEY = process.env.PEXELS_API_KEY
const USER_AGENT = 'ShymkentMarketBlog/1.0'

const credits = JSON.parse(readFileSync(creditsFile, 'utf8'))
mkdirSync(outDir, { recursive: true })
/** Фото, уже взятые другими статьями, — чтобы не повторяться */
const used = new Set(Object.values(credits).map((c) => c.url))
// Фото, отклонённые при проверке глазами (PhotoQuery.reject), — тоже не брать повторно
for (const { reject = [] } of Object.values(PHOTO_QUERIES)) for (const url of reject) used.add(url)

const LICENSE_NAMES = { cc0: 'CC0', pdm: 'Public Domain', by: 'CC BY' }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** У StockSnap имя автора приходит URL-кодированным («Agnieszka%20Wal%u0119dziak»), у других источников — как есть */
function decodeCreator(creator) {
  if (!creator) return ''
  try {
    return decodeURIComponent(creator)
  } catch {
    return creator.replace(/%u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/%20/g, ' ')
  }
}

/** Ширина и высота JPEG из маркера SOF — без зависимостей */
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) }
    i += 2 + bytes.readUInt16BE(i + 2)
  }
  return null
}

/**
 * Фото по теме: каждое слово запроса есть в описании. Поиск нечёткий — без этой проверки
 * на «apricots» приходил цветок, на «cup of tea» — ноутбук
 */
function isRelevant(text, query) {
  const haystack = text.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !['and', 'the', 'with'].includes(w))
  // «tomatoes» находит и «tomato»: сравниваем без окончания множественного числа
  return words.every((w) => haystack.includes(w.replace(/(es|s)$/, '')))
}


async function searchPexels(query) {
  const params = new URLSearchParams({ query, orientation: 'landscape', per_page: '30' })
  const res = await fetch(`${PEXELS}?${params}`, { headers: { Authorization: PEXELS_KEY } })
  if (!res.ok) throw new Error(`Pexels ответил ${res.status}`)
  const { photos } = await res.json()
  return photos
    .map((p) =>
      ({
        page: p.url,
        image: p.src.large, // ~940px по ширине — для колонки статьи 720px достаточно
        // Описание Pexels — alt и slug страницы («/photo/sliced-watermelon-on-plate-1234/»)
        text: `${p.alt ?? ''} ${p.url.replace(/[-/]/g, ' ')}`,
        title: p.alt || p.url,
        author: p.photographer,
        source: 'Pexels',
        license: 'Pexels License',
        licenseUrl: 'https://www.pexels.com/license/',
        width: p.width,
      }),
    )
    .filter((c) => c.width >= 1200 && !used.has(c.page) && isRelevant(c.text, query))
}

async function searchOpenverse(query, source) {
  const params = new URLSearchParams({
    q: query,
    license: 'cc0,pdm,by',
    license_type: 'commercial,modification',
    aspect_ratio: 'wide',
    extension: 'jpg',
    page_size: '20',
    mature: 'false',
  })
  if (source) params.set('source', source)
  // Openverse временами отвечает 5xx — повторяем с паузой
  let res
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${OPENVERSE}?${params}`, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok || res.status < 500 || attempt === 5) break
    await sleep(attempt * 2000)
  }
  if (!res.ok) throw new Error(`Openverse ответил ${res.status}`)
  const { results } = await res.json()
  return results
    .map((r) =>
      ({
        page: r.foreign_landing_url,
        image: r.url,
        text: [r.title, ...(r.tags ?? []).map((t) => t.name)].join(' '),
        title: r.title,
        author: decodeCreator(r.creator) || r.provider,
        source: ({ stocksnap: 'StockSnap', wikimedia: 'Wikimedia Commons', flickr: 'Flickr' })[r.source] ?? r.source,
        license: LICENSE_NAMES[r.license] ?? r.license.toUpperCase(),
        licenseUrl: r.license_url,
        width: r.width,
      }),
    )
    .filter((c) => c.width >= 1200 && !used.has(c.page) && isRelevant(c.text, query))
}

async function findPhoto(queries) {
  if (PEXELS_KEY)
    for (const query of queries) {
      const [first] = await searchPexels(query)
      if (first) return first
    }
  for (const source of ['stocksnap', null])
    for (const query of queries) {
      const [first] = await searchOpenverse(query, source)
      if (first) return first
    }
  return null
}

if (!PEXELS_KEY) console.log('PEXELS_API_KEY не задан — ищем только в Openverse')

for (const [id, { queries }] of Object.entries(PHOTO_QUERIES)) {
  const file = join(outDir, `${id}.jpg`)
  if (credits[id] && existsSync(file)) continue

  let photo
  try {
    photo = await findPhoto(queries)
  } catch (error) {
    // Сбой поиска у одного фото не останавливает остальные; повторный запуск догрузит пропущенные
    console.error(`${id}: ${error.message}`)
    continue
  }
  if (!photo) {
    console.error(`${id}: ничего не нашлось (${queries.join(', ')})`)
    continue
  }
  // Wikimedia ограничивает частоту (429) — ждём и повторяем
  let image
  for (let attempt = 1; ; attempt++) {
    image = await fetch(photo.image, { headers: { 'User-Agent': USER_AGENT } })
    if (image.status !== 429 || attempt === 4) break
    await sleep(attempt * 10000)
  }
  if (!image.ok) {
    console.error(`${id}: не удалось скачать ${photo.image} (${image.status})`)
    continue
  }
  const bytes = Buffer.from(await image.arrayBuffer())
  const size = jpegSize(bytes)
  if (!size) {
    console.error(`${id}: файл не похож на JPEG — пропускаем`)
    continue
  }
  writeFileSync(file, bytes)
  used.add(photo.page)
  credits[id] = {
    src: `/blog/photos/${id}.jpg`,
    ...size,
    author: photo.author,
    url: photo.page,
    source: photo.source,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
  }
  // Сохраняем после каждого фото — прерванный запуск продолжится с того же места
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n')
  console.log(`${id}: «${photo.title}» — ${photo.author}, ${photo.source}, ${photo.license}`)
}
