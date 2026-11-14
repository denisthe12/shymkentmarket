import type { ProductCardDto, SzptProductDto } from '../../api/types'
import { toPerKgCard } from '../../lib/szpt'
import { ProductCard } from './ProductCard'
import { productGridClass } from './layout'

type Props = {
  /** Товары СЗПТ несут unitPrice — карточка показывает его второй строкой */
  products: (ProductCardDto | SzptProductDto)[]
  /** Без колонки фильтров места больше: 4 колонки с lg */
  wide?: boolean
}

export function ProductGrid({ products, wide = false }: Props) {
  return (
    <ul className={productGridClass(wide)}>
      {products.map((product) => (
        <li key={product.id} className="[&>article]:h-full">
          {'soldByWeight' in product && product.soldByWeight ? (
            <ProductCard product={toPerKgCard(product)} unitPrice={product.unitPrice} soldByWeight />
          ) : (
            <ProductCard product={product} unitPrice={'unitPrice' in product ? product.unitPrice : undefined} />
          )}
        </li>
      ))}
    </ul>
  )
}
