// Фото для статей блога из Openverse (открытый каталог фото со свободными лицензиями, ключ не нужен)
// → public/blog/photos/<id>.jpg и src/content/blog/photo-credits.json (автор, источник, лицензия).
// Берём только лицензии, разрешающие коммерческое использование и изменение: CC0, Public Domain, CC BY.
// Сначала ищем на StockSnap (CC0, качественные стоковые фото), потом во всём каталоге.
// Запросы и alt — src/content/blog/photo-queries.ts. Уже скачанные фото пропускаются;
// чтобы заменить фото, удалите его запись из photo-credits.json и запустите снова.
// Запуск: pnpm blog:photos
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHOTO_QUERIES } from '../src/content/blog/photo-queries.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'blog', 'photos')
const creditsFile = join(root, 'src', 'content', 'blog', 'photo-credits.json')
const API = 'https://api.openverse.org/v1/images/'
const USER_AGENT = 'AktauMarketBlog/1.0 (https://aktau.market)'

const credits = JSON.parse(readFileSync(creditsFile, 'utf8'))
mkdirSync(outDir, { recursive: true })
/** Фото, уже взятые другими статьями, — чтобы не повторяться */
const used = new Set(Object.values(credits).map((c) => c.url))

const LICENSE_NAMES = { cc0: 'CC0', pdm: 'Public Domain', by: 'CC BY' }

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

async function search(query, source) {
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
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Openverse ответил ${res.status}`)
  const { results } = await res.json()
  // Достаточно крупные фото, без повторов
  return results.filter((r) => r.width >= 1200 && !used.has(r.foreign_landing_url))
}

async function findPhoto(queries) {
  for (const source of ['stocksnap', null])
    for (const query of queries) {
      const [first] = await search(query, source)
      if (first) return first
    }
  return null
}

for (const [id, { queries }] of Object.entries(PHOTO_QUERIES)) {
  const file = join(outDir, `${id}.jpg`)
  if (credits[id] && existsSync(file)) continue

  const photo = await findPhoto(queries)
  if (!photo) {
    console.error(`${id}: ничего не нашлось (${queries.join(', ')})`)
    continue
  }
  // Openverse отдаёт превью (~960px) — для колонки статьи 720px достаточно; размеры берём из самого файла
  const image = await fetch(photo.url, { headers: { 'User-Agent': USER_AGENT } })
  if (!image.ok) {
    console.error(`${id}: не удалось скачать ${photo.url} (${image.status})`)
    continue
  }
  const bytes = Buffer.from(await image.arrayBuffer())
  const size = jpegSize(bytes)
  if (!size) {
    console.error(`${id}: файл не похож на JPEG — пропускаем`)
    continue
  }
  writeFileSync(file, bytes)
  used.add(photo.foreign_landing_url)
  credits[id] = {
    src: `/blog/photos/${id}.jpg`,
    ...size,
    author: decodeCreator(photo.creator) || photo.provider,
    url: photo.foreign_landing_url,
    source: ({ stocksnap: 'StockSnap', wikimedia: 'Wikimedia Commons', flickr: 'Flickr' })[photo.source] ?? photo.source,
    license: LICENSE_NAMES[photo.license] ?? photo.license.toUpperCase(),
    licenseUrl: photo.license_url,
  }
  // Сохраняем после каждого фото — прерванный запуск продолжится с того же места
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n')
  console.log(`${id}: «${photo.title}» — ${credits[id].author}, ${credits[id].source}, ${credits[id].license}`)
}
