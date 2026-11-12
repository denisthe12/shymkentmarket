'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LoadMoreProps } from '../../lib/loadMore'
import { Button } from '../ui/Button'

/** Насколько заранее (до появления кнопки на экране) начинаем грузить следующую порцию */
const PRELOAD_MARGIN = '600px 0px'

/**
 * «Показать ещё» с бесконечной прокруткой: когда кнопка подходит к экрану, следующая порция грузится сама.
 * Запросы те же, что и по клику: по одному, только пока есть что догрузить
 */
export function LoadMore({ hasMore, loading, auto, onLoad }: LoadMoreProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const watch = hasMore && auto

  useEffect(() => {
    const el = ref.current
    if (!el || !watch || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: PRELOAD_MARGIN,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [watch])

  // onLoad — новая функция на каждый рендер; держим последнюю в ref, чтобы не перезапускать эффект зря
  const load = useRef(onLoad)
  useEffect(() => {
    load.current = onLoad
  })
  useEffect(() => {
    if (visible && watch && !loading) load.current()
  }, [visible, watch, loading])

  if (!hasMore && !loading) return null
  return (
    <div ref={ref} className="mt-8 flex justify-center">
      <Button onClick={onLoad} disabled={loading} testId="load-more" className="w-full md:w-auto">
        {t(loading ? 'state.loading' : 'category.loadMore')}
      </Button>
    </div>
  )
}
