export type RunTasksOptions<T> = {
  concurrency: number
  onError: (task: T, err: unknown) => void
  /** После первой упавшей задачи новые задачи не запускаются; активные доходят до конца. */
  stopOnError?: boolean
}

/** `skipped` (не запущенные задачи) есть в результате только при `stopOnError`. */
export type RunTasksResult = { done: number; failed: number; skipped?: number }

/**
 * Динамическая очередь задач с ограниченной параллельностью. Обработчик может
 * добавлять новые задачи через `enqueue`. Прогон завершён, когда очередь пуста
 * (или остановлена) и активных обработчиков нет.
 */
export async function runTasks<T>(
  seeds: readonly T[],
  handler: (task: T, enqueue: (next: T) => void) => Promise<void>,
  opts: RunTasksOptions<T>,
): Promise<RunTasksResult> {
  const queue: T[] = [...seeds]
  const limit = Math.max(1, Math.floor(opts.concurrency) || 1)
  let active = 0
  let done = 0
  let failed = 0
  let stopped = false

  return new Promise((resolve) => {
    const enqueue = (next: T): void => {
      queue.push(next)
      pump()
    }

    const finish = (): void => {
      active--
      pump()
    }

    const run = (task: T): void => {
      active++
      let p: Promise<void>
      try {
        p = Promise.resolve(handler(task, enqueue))
      } catch (err) {
        p = Promise.reject(err)
      }
      p.then(
        () => {
          done++
        },
        (err: unknown) => {
          failed++
          if (opts.stopOnError) stopped = true
          try {
            opts.onError(task, err)
          } catch {
            // сбой onError не должен ронять прогон
          }
        },
      ).then(finish)
    }

    const pump = (): void => {
      while (!stopped && active < limit && queue.length > 0) run(queue.shift() as T)
      if (active === 0 && (stopped || queue.length === 0)) {
        resolve(opts.stopOnError ? { done, failed, skipped: queue.length } : { done, failed })
      }
    }

    pump()
  })
}
