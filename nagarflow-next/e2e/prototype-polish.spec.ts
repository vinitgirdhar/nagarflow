import {test, expect} from './fixtures';

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
    if (name === 'Administrator') {
      for (const width of [320,390,768,1440]) {
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await page.screenshot({path:`test-results/demo-login-${width}.png`,fullPage:true});
      }
    }
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

test('normal sidebar navigation keeps the verified workspace while checking its session', async ({page}) => {
  await page.goto('/login');
  await page.getByRole('button',{name:'Use demo credentials',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page.getByRole('heading',{name:'City overview',exact:true})).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/session', async route => { await pending; await route.continue(); });
  try {
    await page.getByRole('link',{name:'Dispatch',exact:true}).click();
    await expect(page).toHaveURL(/dispatch$/);
    await expect(page.getByRole('heading',{name:'Vehicle dispatch',exact:true})).toBeVisible();
    await expect(page.getByRole('status',{name:'Connecting securely'})).toHaveCount(0);
  } finally { release(); }
});
