'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useHref } from '../../lib/useLang'
import { SITE_NAME } from '../../lib/brand'

/** Знак: ценник со знаком «=» — «справедливая цена» */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-8a2 2 0 0 1 0-2.6l6-8a2 2 0 0 1 1.5-.7Z"
        fill="var(--color-accent)"
      />
      <circle cx="10.6" cy="16" r="1.9" fill="var(--color-card)" />
      <path d="M16 13.2h8M16 18.8h8" stroke="var(--color-card)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Уже на главной — Next не переходит на тот же адрес, поэтому прокручиваем наверх сами (длинный список товаров) */
function scrollToTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

export function Logo() {
  const href = useHref()
  const pathname = usePathname()
  const home = href('/catalog')
  return (
    <Link
      href={home}
      onClick={(e) => {
        if (pathname !== home) return
        e.preventDefault()
        scrollToTop()
      }}
      className="flex shrink-0 items-center justify-self-start gap-1 rounded-md" aria-label={SITE_NAME}>
      <LogoMark />
      <span className="font-display text-[1.0625rem] whitespace-nowrap font-extrabold tracking-[-0.02em]">{SITE_NAME}</span>
    </Link>
  )
}
