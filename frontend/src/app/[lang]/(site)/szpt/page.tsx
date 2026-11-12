import { notFound, redirect } from 'next/navigation'
import { getSzptGroups } from '../../../../api/server'
import { isLanguage } from '../../../../i18n'
import { localePath } from '../../../../lib/paths'

// У раздела нет своей страницы: ведём в первую группу текущего снимка. Групп нет — 404, а не цикл редиректов
export default async function Page({ params }: PageProps<'/[lang]/szpt'>) {
  const { lang } = await params
  if (!isLanguage(lang)) notFound()
  const groups = await getSzptGroups()
  if (groups.length === 0) notFound()
  redirect(localePath(lang, `/szpt/${groups[0].slug}`))
}
