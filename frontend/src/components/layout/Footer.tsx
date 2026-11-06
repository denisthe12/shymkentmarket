'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useHref } from '../../lib/useLang'
import { LogoMark } from './Logo'

export function Footer() {
  const { t } = useTranslation()
  const href = useHref()

  return (
    <footer className="border-t border-line bg-card">
      <div className="container-page flex flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-center gap-3">
          <LogoMark className="size-6 shrink-0" />
          <p className="max-w-[52ch]">{t('footer.about')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Блог — только здесь, в шапке и таб-баре его нет */}
          <nav aria-label={t('footer.nav')}>
            <Link href={href('/blog')} data-testid="footer-blog" className="font-medium text-ink hover:underline">
              {t('footer.blog')}
            </Link>
          </nav>
          <p data-testid="copyright" className="shrink-0 tabular">
            {/* oxlint-disable-next-line react/purity -- год берётся в момент рендера намеренно */}
            {t('footer.rights', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  )
}
