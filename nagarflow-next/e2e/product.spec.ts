import {test,expect,type Page} from './fixtures';
async function login(page:Page,email='admin@example.test'){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('Synthetic browser passphrase!');await page.getByRole('button',{name:'Sign in',exact:true}).click();}

test('approved retrieval cites evidence and withdrawal removes it',async({page})=>{
 await login(page);await expect(page).toHaveURL(/dashboard$/);await page.goto('/knowledge');
 await page.getByText('Add a draft',{exact:true}).click();await page.getByLabel('Document title',{exact:true}).fill('Browser sanitation procedure');await page.getByLabel('Document text',{exact:true}).fill('Report missed garbage collection to the sanitation desk. Include the collection date and municipal zone.');await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const document=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Browser sanitation procedure',exact:true})});await expect(document).toContainText('DRAFT');await document.getByRole('button',{name:'Approve document',exact:true}).click();await expect(document).toContainText('APPROVED');
 await page.getByLabel('Question',{exact:true}).fill('Where to report missed garbage collection?');await page.getByRole('button',{name:'Search approved evidence',exact:true}).click();await expect(page.getByRole('heading',{name:'Evidence-backed response',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'[1] Browser sanitation procedure',exact:true})).toBeVisible();
 await document.getByRole('button',{name:'Retire document',exact:true}).click();await expect(document).toContainText('RETIRED');await page.getByLabel('Question',{exact:true}).fill('How does planetary orbital mechanics work?');await page.getByRole('button',{name:'Search approved evidence',exact:true}).click();await expect(page.getByRole('heading',{name:'No relevant evidence',exact:true})).toBeVisible();
});

test('forecasting shows real validation and simulator remains a what-if calculator',async({page})=>{
 await login(page);await expect(page).toHaveURL(/dashboard$/);await page.goto('/predictions');await expect(page.getByLabel('Zone',{exact:true})).toHaveValue('Powai');const powai=page.locator('section').filter({has:page.getByRole('heading',{name:'Powai',exact:true})});await expect(powai).toContainText('Forecast ready');await powai.getByText('Model comparison',{exact:true}).click();await expect(powai.getByRole('cell',{name:'weekly_seasonal_naive',exact:true})).toBeVisible();await expect(powai.getByRole('cell',{name:'ridge_lag_regression',exact:true})).toBeVisible();
 await page.goto('/simulation');await page.getByLabel('Demand change (%)',{exact:true}).fill('20');await page.getByRole('button',{name:'Run what-if scenario',exact:true}).click();await expect(page.getByRole('heading',{name:'Scenario result',exact:true})).toBeVisible();await expect(page.getByText(/does not update operational data/)).toBeVisible();
 await page.goto('/emergency');await expect(page.getByText('No weather observation is available yet.',{exact:true})).toBeVisible();
});

test('empty operations view and fleet registration are usable',async({page})=>{
 await login(page);await expect(page).toHaveURL(/dashboard$/);await page.goto('/operations');await expect(page.getByText('No deliveries received yet.',{exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('No recent heartbeat');
 await page.goto('/dispatch');await page.getByText('Register a fleet vehicle',{exact:true}).click();await page.getByLabel('Vehicle name',{exact:true}).fill('Browser registered truck');await page.getByLabel('Latitude',{exact:true}).fill('19.04');await page.getByLabel('Longitude',{exact:true}).fill('72.85');await page.getByRole('button',{name:'Register vehicle',exact:true}).click();await expect(page.getByText('Vehicle registered.',{exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Browser registered truck',exact:true})).toBeVisible();
});

test('public prototype credentials work without authenticator or password setup',async({page})=>{
 for (const width of [320,390,768,1440]) {
  await page.setViewportSize({width,height:900});await page.goto('/login');
  await expect(page.getByRole('region',{name:'Prototype demo credentials'})).toBeVisible();
  await expect(page.getByLabel(/Authenticator or recovery code/)).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 await page.getByRole('button',{name:'Use demo credentials',exact:true}).click();
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('demo@nagarflow.app');
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('NagarFlow Demo 2026!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/dashboard$/);
 await expect(page.getByLabel('Prototype workspace notice')).toContainText('Shared prototype.');
 await page.goto('/account');
 await expect(page.getByText('Authenticator security',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Current password',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/public prototype account/)).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/login$/);
 await login(page,'security@example.test');await expect(page).toHaveURL(/dashboard$/);
 await page.goto('/account');await expect(page.getByText('Authenticator security',{exact:true})).toHaveCount(0);
});

test('complaint classification is linked to an idempotent work order',async({page})=>{
 await login(page);await expect(page).toHaveURL(/dashboard$/);await page.goto('/complaints');await page.getByLabel('Search text or complaint ID',{exact:true}).fill('fleet-c1');await page.getByRole('button',{name:'Search records',exact:true}).click();const row=page.getByRole('row').filter({hasText:'fleet-c1'});await expect(row).toBeVisible();await row.getByRole('button',{name:'Review classification',exact:true}).click();await page.getByRole('button',{name:'Save classification',exact:true}).click();await expect(page.getByRole('status')).toContainText('Classification saved.');await row.getByRole('button',{name:'Create work order',exact:true}).click();await expect(page.getByRole('status')).toContainText('Work order ready:');await page.getByRole('link',{name:'Open field operations',exact:true}).click();await expect(page).toHaveURL(/maintenance$/);
});

test('public product page is responsive and its primary action opens real sign-in',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('heading',{name:/City complaints.*Clear action/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'/tmp/nagarflow-product-home-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/nagarflow-product-home-desktop.png',fullPage:true});await page.getByRole('link',{name:'Sign in to your workspace',exact:true}).click();await expect(page).toHaveURL(/login$/);await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
});


test('landing workflow previews support keyboard navigation and respect motion preferences',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/');
 const intake=page.getByRole('tab',{name:'Reports'});
 await intake.scrollIntoViewIfNeeded();
 await expect(intake).toHaveAttribute('aria-selected','true');
 await intake.focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Dispatch'})).toBeFocused();
 await expect(page.getByRole('tabpanel')).toContainText('Send the right team.');
 await page.keyboard.press('End');
 await expect(page.getByRole('tab',{name:'Forecasts'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tabpanel')).toContainText('Plan the next day’s work.');
 await page.getByRole('tab',{name:'Knowledge'}).click();
 await expect(page.getByRole('tabpanel')).toContainText('Find the right guidance.');
 expect(await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'))).toBeTruthy();
 await page.getByRole('button',{name:'Pause background animations'}).click();
 await expect(page.getByRole('button',{name:'Resume background animations'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Resume background animations'}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect&&getComputedStyle(a.effect.target as Element).animationIterationCount==='infinite').length)).toBe(0);
});
