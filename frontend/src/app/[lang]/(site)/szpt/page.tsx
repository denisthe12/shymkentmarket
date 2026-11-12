import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getSzptGroups } from '../../../../api/server'
import { isLanguage } from '../../../../i18n'
import { localePath } from '../../../../lib/paths'

// У раздела нет своей страницы: ведём в первую группу текущего снимка. Групп нет — 404, а не цикл редиректов
// Runtime, not build time: the build never fetches the API
export default async function Page({ params }: PageProps<'/[lang]/szpt'>) {
  await connection()
  const { lang } = await params
  if (!isLanguage(lang)) notFound()
  const groups = await getSzptGroups()
  if (groups.length === 0) notFound()
  redirect(localePath(lang, `/szpt/${groups[0].slug}`))
}
