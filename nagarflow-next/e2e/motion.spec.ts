import { test, expect } from '@playwright/test';

test('compact landing keeps city motion, useful previews and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const heading = page.getByRole('heading', { name: /City complaints.*Clear action/ });
  await expect(heading).toBeVisible();
  const courier = page.getByTestId('city-courier').first();
  const start = await courier.evaluate(el => getComputedStyle(el).offsetDistance);
  await expect.poll(() => courier.evaluate(el => getComputedStyle(el).offsetDistance)).not.toBe(start);
  await expect(heading.locator('em')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/nagarflow-simple-hero-desktop.png' });
  await page.getByRole('button', { name: 'Pause background animations' }).click();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.effect instanceof KeyframeEffect &&
    getComputedStyle(animation.effect.target as Element).animationIterationCount === 'infinite'
  ).every(animation => animation.playState === 'paused'))).toBeTruthy();
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  await expect(page.getByRole('tabpanel').getByText('Supporting excerpt', { exact: true }).locator('..')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Resume background animations' }).click();
  const workflow = page.getByRole('heading', { name: 'See how it works.' });
  await workflow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/nagarflow-simple-workflow-desktop.png' });
  const closing = page.getByRole('heading', { name: 'Keep work moving.' });
  await closing.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/nagarflow-simple-closing-desktop.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(heading).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.effect instanceof KeyframeEffect &&
    getComputedStyle(animation.effect.target as Element).animationIterationCount === 'infinite'
  ).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1800);
  await expect(page.getByText('Complaints get lost between teams.', {exact:true})).toBeInViewport();
  await page.screenshot({ path: '/tmp/nagarflow-simple-mobile.png', fullPage:true });
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await page.setViewportSize({ width: 320, height: 740 });
  const navAction = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Sign in', exact: true });
  const bounds = await navAction.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1950);
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
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel('Question',{exact:true})).toBeInViewport();
  await expect.poll(() => page.locator('#main-content').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(388);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByLabel('Document title',{exact:true})).not.toBeVisible();
  await page.screenshot({path:'/tmp/nagarflow-simple-knowledge-mobile.png',fullPage:true});
});

test('admin pages fit narrow phone screens without squeezing the workspace', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://**', route => route.abort());
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic browser passphrase!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const routes = ['/dashboard', '/complaints', '/visual-complaints', '/complaint-simulator', '/dispatch', '/maintenance', '/agencies', '/knowledge', '/predictions', '/operations', '/reports', '/emergency', '/simulation', '/accounts'];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('#main-content'), `${route} at ${width}px`).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect.poll(() => page.locator('#main-content').evaluate(el => el.getBoundingClientRect().width), { message: `${route} uses the phone width` }).toBeGreaterThanOrEqual(width - 1);
      try {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${route} has no horizontal overflow at ${width}px` }).toBeLessThanOrEqual(width);
      } catch (error) {
        console.log('Overflow elements', route, await page.evaluate(() => Array.from(document.querySelectorAll('#main-content *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 16).map(el => ({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,60),right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))));
        throw error;
      }
    }
  }
});
