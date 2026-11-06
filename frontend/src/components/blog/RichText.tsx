import Link from 'next/link'
import type { ReactNode } from 'react'
import { parseInline } from '../../lib/inlineMarkup'

const linkClass = 'font-medium text-ink underline decoration-line decoration-2 underline-offset-2 hover:decoration-ink'

/** Текст статьи с **жирным** и ссылками: внутренние — next/link, внешние — в новой вкладке */
export function RichText({ text }: { text: string }): ReactNode {
  return parseInline(text).map((node, index) => {
    if (node.kind === 'strong') return <strong key={index} className="font-semibold">{node.text}</strong>
    if (node.kind === 'link')
      return node.external ? (
        <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {node.text}
        </a>
      ) : (
        <Link key={index} href={node.href} className={linkClass}>
          {node.text}
        </Link>
      )
    return node.text
  })
}
