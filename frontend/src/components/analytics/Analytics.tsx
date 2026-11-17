'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { analyticsIds } from '../../lib/analytics'
import { ensureAnalytics } from '../../lib/analytics-browser'

/** Через сколько после загрузки страницы подгрузить счётчики, если пользователь так ничего и не сделал */
export const ANALYTICS_IDLE_DELAY = 5000
const INTERACTIONS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/**
 * gtag.js (~165 КБ) и tag.js Метрики (~60 КБ) — это ~0,5 с работы главного потока на телефоне. Если грузить их
 * сразу после гидрации, они попадают в первые секунды, когда страница должна откликаться (TBT в Lighthouse).
 * Поэтому — по первому действию пользователя или через ANALYTICS_IDLE_DELAY после load. Просмотры при этом
 * не теряются: init и hit уже лежат в очередях dataLayer / ym.a, скрипты отправят их, когда загрузятся.
 * Не дождётся только тот, кто ушёл раньше задержки, ни разу не коснувшись страницы
 */
function useDeferredLoad(enabled: boolean) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled || ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = () => setReady(true)
    const startTimer = () => { timer = setTimeout(go, ANALYTICS_IDLE_DELAY) }
    for (const type of INTERACTIONS) window.addEventListener(type, go, { once: true, passive: true })
    if (document.readyState === 'complete') startTimer()
    else window.addEventListener('load', startTimer, { once: true })
    return () => {
      clearTimeout(timer)
      for (const type of INTERACTIONS) window.removeEventListener(type, go)
      window.removeEventListener('load', startTimer)
    }
  }, [enabled, ready])
  return ready
}

export function Analytics() {
  const pathname = usePathname()
  const { ga, metrika } = analyticsIds(process.env.NEXT_PUBLIC_GA_ID, process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)
  const [active, setActive] = useState(false)
  useEffect(() => {
    // Queue init + first view before Script is allowed to insert a loader.
    if (ensureAnalytics()) setActive(true)
  }, [pathname, ga, metrika])
  const load = useDeferredLoad(active)

  if (!active || !load) return null
  return <>
    {ga && <Script id="aktau-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />}
    {metrika && <Script id="aktau-metrika" src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
  </>
}
