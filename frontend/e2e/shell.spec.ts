import { expect, test } from '@playwright/test'
import { stubMapTiles } from './map-tiles'

// Оболочка сайта: на телефоне разделы — в таб-баре внизу, на desktop — в шапке
test('mobile: tab bar navigates between sections and the search tab focuses the field', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'таб-бар только на мобильном')
  await page.goto('/ru/catalog')
  const tabBar = page.getByTestId('tab-bar')
  await expect(tabBar).toBeVisible()
  await expect(page.getByTestId('nav-dashboard')).toBeHidden()
  await expect(page.getByTestId('tab-catalog')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('tab-dashboard').click()
  await expect(page).toHaveURL(/\/ru\/dashboard$/)
  await expect(page.getByTestId('tab-dashboard')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('tab-search').click()
  await expect(page).toHaveURL(/\/ru\/search$/)
  await expect(page.getByTestId('search-input')).toBeFocused()

  // Футер не прячется под таб-баром, когда страница прокручена до конца.
  // scrollIntoViewIfNeeded не годится: текст под таб-баром он считает видимым и не прокручивает
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight)).toBe(true)
  const footer = await page.getByTestId('copyright').boundingBox()
  const bar = await tabBar.boundingBox()
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(bar!.y)
})

test('desktop: no tab bar, sections in the header, grey page under white header', async ({ page, isMobile }) => {
  test.skip(isMobile, 'проверка desktop')
  await page.goto('/ru/collections/milk')
  await expect(page.getByTestId('tab-bar')).toBeHidden()
  await expect(page.getByTestId('nav-catalog')).toHaveAttribute('aria-current', 'page')
  const background = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await background('header')).toBe('rgb(255, 255, 255)')
  expect(await background('main >> xpath=..')).toBe('rgb(244, 245, 246)')
})

test('no horizontal scroll on narrow phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'узкие экраны')
  await stubMapTiles(page)
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    for (const path of ['/ru/catalog', '/ru/collections/milk', '/ru/dashboard']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(0)
    }
  }
})
