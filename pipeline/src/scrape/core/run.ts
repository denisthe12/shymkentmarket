import { SourceProductSchema, type SourceFile, type SourceProduct } from '../../types.js'
import { createHttpClient } from './http.js'
import { Limiter, realClock } from './limiter.js'
import { resolveStoreLimits } from './limits.js'
import { runTasks } from './queue.js'
import type { RunOptions, StoreModule, StoreTask } from './store.js'

export const ENGINE = 'scrape-core-1'

type CategoryCount = { seen: number; total?: number }

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Runs a store module: prepare -> seeds -> task queue, then one recount pass
 * for categories whose collected count differs from the reported total.
 *
 * The first task that fails after all retries stops the run: tasks already in
 * flight finish, no new task starts (the file will be refused anyway, so the
 * server is not pressed further), and the recount is skipped. Invalid products
 * and count mismatches are errors too, but they do not stop the run.
 */
export async function runStore<T extends StoreTask, C>(module: StoreModule<T, C>, opts: RunOptions = {}): Promise<SourceFile> {
  const log = opts.log ?? console.error
  const clock = opts.clock ?? realClock
  const startedAt = clock.now()
  const { concurrency, rps } = resolveStoreLimits(module.storeCode, module.limits, opts.env ?? process.env, log)
  const limiter = new Limiter({ concurrency, rps, clock })
  const http = createHttpClient({
    limiter,
    headers: module.headers,
    fetchImpl: opts.fetchImpl,
    clock,
    random: opts.random,
  })

  const ctx = module.prepare ? await module.prepare(http) : (undefined as C)
  const seeds = module.seeds(ctx)

  // Category priority = index of its first seed task.
  const priority = new Map<string, number>()
  seeds.forEach((t, i) => { if (!priority.has(t.category)) priority.set(t.category, i) })
  const rank = (category: string) => priority.get(category) ?? Number.POSITIVE_INFINITY

  const counts = new Map<string, CategoryCount>()
  for (const category of priority.keys()) counts.set(category, { seen: 0 })
  const kept = new Map<string, { rank: number; product: SourceProduct }>()
  const reportedInvalid = new Set<string>()
  let errorCount = 0
  let tasks = 0
  let skipped = 0
  let aborted = false

  const addProduct = (raw: unknown, task: T) => {
    const parsed = SourceProductSchema.safeParse(raw)
    if (!parsed.success) {
      const rec = raw as { sourceProductId?: unknown } | null
      const id = typeof rec?.sourceProductId === 'string' ? rec.sourceProductId : undefined
      if (id !== undefined) {
        if (reportedInvalid.has(id)) return // already counted (e.g. on the recount pass)
        reportedInvalid.add(id)
      }
      errorCount++
      const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
      log(`invalid product${id !== undefined ? ` ${id}` : ''} in ${module.describe(task)}: ${issues}`)
      return
    }
    const product = parsed.data
    const r = rank(task.category)
    const prev = kept.get(product.sourceProductId)
    if (!prev || r < prev.rank) kept.set(product.sourceProductId, { rank: r, product })
  }

  const pass = (taskSeeds: readonly T[]) =>
    runTasks<T>(
      taskSeeds,
      async (task, enqueue) => {
        const result = await module.handle(task, ctx, http)
        let count = counts.get(task.category)
        if (!count) counts.set(task.category, (count = { seen: 0 }))
        if (result.seen !== undefined) count.seen += result.seen
        if (result.total !== undefined) count.total = result.total
        for (const raw of result.products ?? []) addProduct(raw, task)
        for (const next of result.next ?? []) enqueue(next)
      },
      {
        concurrency,
        stopOnError: true,
        onError: (task, err) => {
          errorCount++
          aborted = true
          log(`task failed: ${module.describe(task)}: ${message(err)}`)
        },
      },
    ).then(r => {
      tasks += r.done + r.failed
      skipped += r.skipped ?? 0
    })

  const mismatched = () =>
    [...counts].filter(([, c]) => c.total !== undefined && c.seen !== c.total).map(([category]) => category)

  await pass(seeds)

  // Recount: categories with a seed are re-run once; the rest fail right away.
  // With errors already counted the file is refused anyway, so no recount.
  const rerun = errorCount > 0 ? [] : mismatched().filter(c => priority.has(c))
  for (const category of rerun) {
    const c = counts.get(category) as CategoryCount
    log(`category ${category}: seen ${c.seen} of total ${c.total}, recounting`)
    counts.set(category, { seen: 0 })
  }
  if (rerun.length > 0) await pass(seeds.filter(t => rerun.includes(t.category)))
  // After a stop the counts are partial by design; mismatches add nothing new.
  if (!aborted) {
    for (const category of mismatched()) {
      const c = counts.get(category) as CategoryCount
      errorCount++
      log(`category ${category}: seen ${c.seen} of total ${c.total}`)
    }
  }
  if (aborted) log(`run stopped after a failed task: ${skipped} task(s) skipped`)

  const sourceStats: SourceFile['sourceStats'] = {
    durationMs: clock.now() - startedAt,
    ...http.stats(),
    tasks,
    concurrency,
    rps,
    categories: counts.size,
    recounted: rerun.length,
    skipped,
    aborted,
    scoped: true,
    engine: ENGINE,
  }
  for (const [category, c] of counts) {
    sourceStats[`cat.${category}.seen`] = c.seen
    if (c.total !== undefined) sourceStats[`cat.${category}.total`] = c.total
  }

  return {
    storeCode: module.storeCode,
    city: module.city,
    capturedAt: (opts.now?.() ?? new Date()).toISOString(),
    errorCount,
    sourceStats,
    products: [...kept.values()].map(k => k.product),
  }
}

/** Refuses to write a partial file: any error keeps the previous file in place. */
export function assertNoErrors(file: SourceFile): void {
  if (file.errorCount > 0) {
    throw new Error(`${file.storeCode}: ${file.errorCount} error(s) during scrape, keeping previous file`)
  }
}
