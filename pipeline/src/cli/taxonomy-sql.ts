import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { readDictionary } from '../mapping/dictionary.js'
import { buildTaxonomyMigration, latestTaxonomyMigration, newTaxonomyMigrationPath } from '../mapping/taxonomy-sql.js'
import { mappingDir, REPO_ROOT } from '../paths.js'

// Миграции таксономии только добавляются: применённые файлы не правятся, изменения словаря дают новую миграцию
const migrations = resolve(REPO_ROOT, 'backend/prisma/migrations')
const sql = buildTaxonomyMigration(readDictionary(resolve(mappingDir(), 'dictionary.json')))
const last = latestTaxonomyMigration(migrations)
if (last && readFileSync(last, 'utf8') === sql) {
  console.error(`[taxonomy:sql] no taxonomy change: identical to ${last}`)
  process.exit(1)
}
const target = newTaxonomyMigrationPath(migrations, new Date())
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, sql, 'utf8')
console.log(`[taxonomy:sql] ${target}`)
