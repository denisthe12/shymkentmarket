import Image from 'next/image'
import { headingId, type Block } from '../../content/blog'
import { getPhoto } from '../../content/blog/photos'
import { getI18n, type Language } from '../../i18n'
import { Chart } from './Chart'
import { RichText } from './RichText'

function Photo({ id, lang }: { id: string; lang: Language }) {
  const photo = getPhoto(id)
  // Фото ещё не скачано (pnpm blog:photos) — статья читается и без него
  if (!photo) return null
  const { t } = getI18n(lang)
  return (
    <figure className="my-6">
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 768px) 720px, 100vw"
        className="h-auto w-full rounded-card bg-surface"
      />
      <figcaption className="mt-2 text-caption text-muted">
        {t('blog.photoCredit', { name: photo.author })}{' '}
        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
          {photo.source}
        </a>
        ,{' '}
        <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2 hover:text-ink">
          {photo.license}
        </a>
      </figcaption>
    </figure>
  )
}

/** Тело статьи: блоки контента → разметка с типографикой .article-prose */
export function ArticleBlocks({ blocks, lang }: { blocks: Block[]; lang: Language }) {
  const { t } = getI18n(lang)
  return (
    <div className="article-prose">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={index} id={headingId(block.text)}>
                {block.text}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={index} id={headingId(block.text)}>
                {block.text}
              </h3>
            )
          case 'p':
            return (
              <p key={index}>
                <RichText text={block.text} />
              </p>
            )
          case 'ul':
          case 'ol': {
            const List = block.type
            return (
              <List key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>
                    <RichText text={item} />
                  </li>
                ))}
              </List>
            )
          }
          case 'table':
            return (
              <div key={index} className="article-table">
                <table>
                  {block.caption && <caption>{block.caption}</caption>}
                  <thead>
                    <tr>
                      {block.head.map((cell, i) => (
                        <th key={i} scope="col">{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'chart':
            return <Chart key={index} chart={block.chart} lang={lang} />
          case 'image':
            return <Photo key={index} id={block.photo} lang={lang} />
          case 'callout':
            return (
              <aside key={index} className="article-callout">
                {block.title && <p className="font-semibold">{block.title}</p>}
                <p>
                  <RichText text={block.text} />
                </p>
              </aside>
            )
          case 'sources':
            return (
              <section key={index} className="article-sources" aria-label={t('blog.sources')}>
                <h2>{t('blog.sources')}</h2>
                <ol>
                  {block.items.map((item) => (
                    <li key={item.url}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            )
        }
      })}
    </div>
  )
}
