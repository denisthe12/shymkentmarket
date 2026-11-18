import { expect, test } from '@playwright/test'

test('catalog → SZPT tile → group → pack size → unit-price sort', async ({ page, isMobile }) => {
  await page.goto('/ru/catalog')
  await page.getByTestId('szpt-tile').click()
  await expect(page).toHaveURL(/\/ru\/szpt\/rice$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Социально значимые продукты')
  await expect(page.getByTestId('product-card')).toHaveCount(3)

  // Фасовки — как фильтры категории: с lg колонка слева, на телефоне шторка
  const sheet = page.getByTestId('filters-sheet')
  if (isMobile) await page.getByTestId('filters-toggle').click()
  const size1kg = (isMobile ? sheet : page).getByTestId('filter-sizeGrams').getByRole('button', { name: /^1\s+кг$/ })
  await size1kg.click()
  await expect(page).toHaveURL(/size=1000/)
  await expect(page.getByTestId('product-card')).toHaveCount(1)
  await size1kg.click()
  await expect(page.getByTestId('product-card')).toHaveCount(3)
  if (isMobile) {
    await sheet.getByRole('button', { name: 'Показать' }).click()
    await expect(sheet).toBeHidden()
    await page.getByTestId('sort-chip').click()
    await page.getByTestId('sort-sheet').getByRole('radio', { name: 'Выгоднее за кг' }).click()
  } else {
    await page.getByTestId('sort-select').selectOption('unit_price_asc')
  }
  await expect(page).toHaveURL(/sort=unit_price_asc/)
  const first = page.getByTestId('product-card').first()
  await expect(first).toContainText('Рис Тест 1 кг')
  await expect(first.getByTestId('unit-price')).toHaveText(/710\s₸\/кг/)
  // Цена упаковки остаётся главной цифрой, без ложных «0 ₸/кг»
  await expect(first.getByTestId('min-price')).toHaveText(/710\s₸/)
  await expect(page.getByText(/(^|\D)0\s₸\//)).toHaveCount(0)
})

test('SZPT group HTML comes from the server and the index redirects', async ({ request }) => {
  const html = await (await request.get('/kk/szpt/milk?sort=unit_price_asc')).text()
  expect(html).toContain('<html lang="kk"')
  expect(html).toContain('Сүт — Әлеуметтік маңызы бар азық-түлік — Shymkent Market')
  expect(html.match(/data-testid="unit-price"/g)).toHaveLength(2)
  expect(html).not.toContain('data-testid="loading-state"')
  const index = await request.get('/ru/szpt', { maxRedirects: 0 })
  expect(index.status()).toBe(307)
  expect(index.headers().location).toBe('/ru/szpt/rice')
})

test('weighted group shows price per kg', async ({ page, isMobile }) => {
  await page.goto('/ru/szpt/potatoes')
  const first = page.getByTestId('product-card').first()
  await expect(first).toContainText('₸/кг')
  await expect(first).toContainText('на развес')
  await expect(page.getByTestId('filter-sizeGrams')).toHaveCount(0)
  if (isMobile) {
    await page.getByTestId('sort-chip').click()
    const sheet = page.getByTestId('sort-sheet')
    await expect(sheet.getByRole('radio', { name: 'Выгоднее за кг' })).toBeChecked()
    await sheet.getByRole('radio', { name: 'Дешевле за упаковку' }).click()
  } else {
    const select = page.getByTestId('sort-select')
    await expect(select.locator('option:checked')).toHaveText('Выгоднее за кг')
    await select.selectOption('price_asc')
  }
  await expect(page).toHaveURL(/sort=price_asc/)
})
