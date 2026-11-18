import type { Page } from '@playwright/test'

// Keep map rendering tests independent of the public tile service.
export async function stubMapTiles(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
  }))
}
