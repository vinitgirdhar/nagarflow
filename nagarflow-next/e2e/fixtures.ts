import {test as base} from '@playwright/test';
export {expect, type Page} from '@playwright/test';

// Functional CI journeys do not consume the community's live tile capacity.
// Actual tile rendering is checked interactively on the deployed application.
export const test = base.extend<{localMapTiles: void}>({
  localMapTiles: [async ({page}, use) => {
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64'),
    }));
    await use();
  }, {auto:true}],
});
