// Разметка внутри текста статьи: **жирный** и [текст](href) — больше статьям не нужно
const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string; external: boolean }

/** Строка статьи → куски для рендера (components/blog/RichText.tsx) */
export function parseInline(source: string): InlineNode[] {
  return source
    .split(TOKEN)
    .filter(Boolean)
    .map((part): InlineNode => {
      if (part.startsWith('**') && part.endsWith('**')) return { kind: 'strong', text: part.slice(2, -2) }
      const link = LINK.exec(part)
      if (link) return { kind: 'link', text: link[1], href: link[2], external: /^https?:\/\//.test(link[2]) }
      return { kind: 'text', text: part }
    })
}
