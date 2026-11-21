import type { StoreCode } from '../../types.js'
import type { HttpClient } from './http.js'
import type { Clock } from './limiter.js'
import type { StoreLimits } from './limits.js'

/**
 * One unit of work. `category` ties the task to a scope category for counting.
 * Follow-up tasks (TaskResult.next) must keep their parent's `category`:
 * seen/total counts, the recount and dedup priority are all per category.
 */
export type StoreTask = { category: string }

export type TaskResult<T extends StoreTask> = {
  /** Raw products; runStore validates each against SourceProductSchema. */
  products?: unknown[]
  /** Follow-up tasks (e.g. further pages); each keeps the parent task's `category`. */
  next?: T[]
  /** Category total reported by the source for task.category, if known. */
  total?: number
  /** Items of task.category in this response, before any availability filter. */
  seen?: number
}

export interface StoreModule<T extends StoreTask, C = undefined> {
  storeCode: StoreCode
  city: string
  limits: StoreLimits
  headers?: Record<string, string>
  /** Optional setup (guest token, outlet choice); a failure rejects the whole run. */
  prepare?(http: HttpClient): Promise<C>
  /** One or more tasks per category; order = category priority. */
  seeds(ctx: C): T[]
  handle(task: T, ctx: C, http: HttpClient): Promise<TaskResult<T>>
  /** Context for error messages. */
  describe(task: T): string
}

export type RunOptions = {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  clock?: Clock
  random?: () => number
  now?: () => Date
  log?: (msg: string) => void
}
