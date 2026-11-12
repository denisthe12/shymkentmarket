// Типизированный доступ к фикстурам. JSON генерируется scripts/generate-mocks.mjs.
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto, SzptGroupDto, SzptProductDto } from '../api/types'
import categoriesJson from './categories.json'
import dashboardJson from './dashboard.json'
import filtersJson from './filters.json'
import productsJson from './products.json'
// szpt.json — ручная фикстура раздела СЗПТ (по примерам contracts/examples/szpt-*.json), не из генератора
import szptJson from './szpt.json'

export const mockCategories = categoriesJson as CategoryDto[]
export const mockFilters = filtersJson as unknown as Record<string, FilterSchemaDto>
export const mockProducts = productsJson as unknown as ProductCardDto[]
export const mockDashboard = dashboardJson as DashboardDto
export const mockSzptGroups = szptJson.groups as SzptGroupDto[]
export const mockSzptProducts = szptJson.products as unknown as Record<string, SzptProductDto[]>
