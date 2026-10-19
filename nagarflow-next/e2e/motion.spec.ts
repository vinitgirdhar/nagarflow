import { test, expect } from '@playwright/test';

test('continuous city motion pauses, lower sections animate, and reduced motion stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const heading = page.getByRole('heading', { name: /A city in motion.*A system in sync/ });
  await expect(heading).toBeVisible();
  const courier = page.getByTestId('city-courier').first();
  const start = await courier.evaluate(el => getComputedStyle(el).offsetDistance);
  await expect.poll(() => courier.evaluate(el => getComputedStyle(el).offsetDistance)).not.toBe(start);
  await expect(heading.locator('em span').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/nagarflow-motion-hero-desktop.png' });
  await page.getByRole('button', { name: 'Pause background animations' }).click();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.effect instanceof KeyframeEffect &&
    getComputedStyle(animation.effect.target as Element).animationIterationCount === 'infinite'
  ).every(animation => animation.playState === 'paused'))).toBeTruthy();
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  await expect(page.getByRole('tabpanel').getByText('Supporting excerpt', { exact: true }).locator('..')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Resume background animations' }).click();
  const network = page.getByRole('heading', { name: /Every handoff.*A little more connected/ });
  await network.scrollIntoViewIfNeeded();
  await expect(network).toBeVisible();
  await expect(network.locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/nagarflow-motion-network-desktop.png' });
  const closing = page.getByRole('heading', { name: /Let’s keep your.*city moving/ });
  await closing.scrollIntoViewIfNeeded();
  await expect(closing.locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/nagarflow-motion-closing-desktop.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(heading).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.effect instanceof KeyframeEffect &&
    getComputedStyle(animation.effect.target as Element).animationIterationCount === 'infinite'
  ).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: '/tmp/nagarflow-motion-hero-mobile.png' });
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await page.setViewportSize({ width: 320, height: 740 });
  const navAction = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Enter workspace', exact: true });
  const bounds = await navAction.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
});


test('workspace panels enter once and stay usable when motion is reduced', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Synthetic browser passphrase!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto('/knowledge');
  const panel=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Ask your workspace',exact:true})});
  await expect(panel).toHaveAttribute('data-workspace-reveal','visible');
  await page.getByLabel('Question',{exact:true}).fill('Where can I report a complaint?');
  await expect(panel).toHaveCSS('animation-name','none');
  await page.screenshot({path:'/tmp/nagarflow-motion-workspace-desktop.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();
  await expect(page.getByLabel('Question',{exact:true})).toBeVisible();
  await expect(panel).toHaveCSS('animation-name','none');
  await page.getByLabel('Question',{exact:true}).fill('The field remains usable');
});
