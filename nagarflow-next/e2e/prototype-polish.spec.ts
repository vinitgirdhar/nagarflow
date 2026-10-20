import {test, expect} from '@playwright/test';

test('a cold connection has a designed loading view and free-host explanation', async ({page}) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/session', async route => { await pending; await route.continue(); });
  try {
    await page.setViewportSize({width:390,height:844});
    await page.goto('/login', {waitUntil:'domcontentloaded'});
    const loader = page.getByRole('status', {name:'Connecting securely'});
    await expect(loader).toBeVisible();
    await expect(loader).toContainText(/free.plan.*wake/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({path:'test-results/connection-screen.png', fullPage:true});
  } finally { release(); }
  await expect(page.getByRole('heading', {name:'Welcome back'})).toBeVisible();
});

test('all three demo roles fill credentials below sign-in and open their real workspace', async ({page}) => {
  for (const [name, email, destination] of [
    ['Administrator','demo@nagarflow.app','dashboard'],
    ['Supervisor','supervisor@nagarflow.app','maintenance'],
    ['Field worker','worker@nagarflow.app','worker-portal'],
  ]) {
    await page.goto('/login');
    await page.getByRole('radio', {name, exact:true}).check();
    const signIn = page.getByRole('button', {name:'Sign in',exact:true});
    const fill = page.getByRole('button', {name:'Use demo credentials',exact:true});
    expect((await fill.boundingBox())!.y).toBeGreaterThan((await signIn.boundingBox())!.y);
    await fill.click();
    await expect(page.getByLabel('Email',{exact:true})).toHaveValue(email);
    await signIn.click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await page.goto('/account');
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await expect(page).toHaveURL(/login$/);
  }
});
