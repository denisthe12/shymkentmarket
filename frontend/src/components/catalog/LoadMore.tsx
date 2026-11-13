'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LoadMoreProps } from '../../lib/loadMore'
import { Button } from '../ui/Button'
import { ProductGridSkeleton } from '../ui/Skeleton'
import { LoadingState } from '../ui/States'

/** Насколько заранее (до появления кнопки на экране) начинаем грузить следующую порцию */
const PRELOAD_MARGIN = '600px 0px'

/**
 * wide — как у ProductGrid: скелетон-ряд той же ширины.
 * «Показать ещё» с бесконечной прокруткой: когда кнопка подходит к экрану, следующая порция грузится сама.
 * Запросы те же, что и по клику: по одному, только пока есть что догрузить
 */
export function LoadMore({ hasMore, loading, auto, onLoad, wide = false }: LoadMoreProps & { wide?: boolean }) {
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
  // Порция грузится — вместо кнопки ряд скелетон-карточек, продолжающий сетку (отступ = её gap)
  if (loading)
    return (
      <div ref={ref} className="mt-2 md:mt-4">
        <LoadingState>
          <ProductGridSkeleton count={wide ? 4 : 3} wide={wide} />
        </LoadingState>
      </div>
    )
  return (
    <div ref={ref} className="mt-8 flex justify-center">
      <Button onClick={onLoad} testId="load-more" className="w-full md:w-auto">
        {t('category.loadMore')}
      </Button>
    </div>
  )
}
