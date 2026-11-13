import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queries'
import type { ProductCardDto } from './types'

/**
 * Товар, который уже есть в кэше клиента: открывали его раньше, или он пришёл в списке категории,
 * поиска, СЗПТ. У списков тот же ProductCardDto, что и у страницы товара, — по нему страницу можно
 * показать сразу, пока сервер готовит настоящую
 */
export function findCachedProduct(client: QueryClient, id: string): ProductCardDto | undefined {
  const own = client.getQueryData<ProductCardDto>(queryKeys.product(id))
  if (own) return own
  for (const prefix of [['products'], ['szpt-products']]) {
    for (const [, data] of client.getQueriesData<InfiniteData<ProductCardDto[]>>({ queryKey: prefix })) {
      const found = data?.pages?.flat().find((p) => p.id === id)
      if (found) return found
    }
  }
  return undefined
}
