'use client'

import { useEffect, useState } from 'react'
import type { TocItem } from '../../content/blog'

/**
 * Оглавление статьи справа: ссылки-якоря на заголовки, текущий раздел подсвечен.
 * Без JS работает как обычный список ссылок
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const headings = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => el !== null)
    if (headings.length === 0) return
    // Текущий раздел — последний заголовок, который уже ушёл выше верхней трети экрана
    const update = () => {
      const line = window.innerHeight / 3
      let current = headings[0].id
      for (const heading of headings) if (heading.getBoundingClientRect().top <= line) current = heading.id
      setActive(current)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [items])

  return (
    <ul className="flex flex-col gap-0.5 border-l border-line">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={active === item.id ? 'location' : undefined}
            className={`-ml-px block border-l-2 py-1 text-meta transition-colors ${item.level === 3 ? 'pl-6' : 'pl-3'} ${
              active === item.id ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Обёртка с подписью: справа на широком экране, сворачиваемый блок — на узком */
export function TocPanel({ items, label }: { items: TocItem[]; label: string }) {
  if (items.length === 0) return null
  return (
    <>
      <details className="mb-6 rounded-card border border-line bg-card lg:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{label}</summary>
        <nav aria-label={label} className="px-4 pb-4">
          <TableOfContents items={items} />
        </nav>
      </details>
      <nav aria-label={label} className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto lg:block">
        <p className="mb-2 text-sm font-semibold">{label}</p>
        <TableOfContents items={items} />
      </nav>
    </>
  )
}
