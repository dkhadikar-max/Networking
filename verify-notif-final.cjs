const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss cookie banner if present
  const acceptBtn = await page.$('button:has-text("Accept")');
  if (acceptBtn) { await acceptBtn.click(); await page.waitForTimeout(400); }

  // Screenshot clean page with mode bar
  await page.screenshot({ path: SS + '/final-01-circles-clean.png' });
  console.log('MODE_BAR_VISIBLE=' + !!(await page.$('.circles-mode-bar')));
  console.log('FOR_YOU_ACTIVE=' + !!(await page.$('.circles-mode-btn.active')));
  const activeMode = await page.$eval('.circles-mode-btn.active', el => el.textContent).catch(() => 'N/A');
  console.log('ACTIVE_MODE_LABEL=' + activeMode);

  // Open bell
  const bell = await page.$('.notif-bell-btn');
  if (!bell) { console.log('BELL_NOT_FOUND'); await browser.close(); return; }
  await bell.click();
  await page.waitForTimeout(1200);

  // Screenshot: full panel
  await page.screenshot({ path: SS + '/final-02-panel-bottom-sheet.png' });

  // Measurements
  const overlay = await page.$eval('.notif-overlay', el => {
    const r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
    return { pos: s.position, z: s.zIndex, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) };
  }).catch(() => null);
  const panel = await page.$eval('.notif-panel', el => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
  }).catch(() => null);
  const handle = await page.$('.notif-drag-handle');
  const closeBtn = await page.$('.notif-close-btn');
  const notifItems = await page.$$('.notif-item');
  const actorName = await page.$('.notif-actor-name');
  const actorNameText = actorName ? await actorName.innerText() : null;
  const actorNameColor = actorName ? await actorName.evaluate(el => window.getComputedStyle(el).color) : null;

  console.log('OVERLAY:', JSON.stringify(overlay));
  console.log('PANEL:', JSON.stringify(panel));
  console.log('PANEL_BOTTOM_AT_VIEWPORT=' + (panel?.bottom === 844));
  console.log('DRAG_HANDLE_PRESENT=' + !!handle);
  console.log('CLOSE_BTN_PRESENT=' + !!closeBtn);
  console.log('NOTIF_ITEMS=' + notifItems.length);
  console.log('ACTOR_NAME=' + actorNameText);
  console.log('ACTOR_NAME_COLOR=' + actorNameColor);

  // Test: close button works
  if (closeBtn) {
    await closeBtn.click();
    await page.waitForTimeout(400);
    const panelGone = !(await page.$('.notif-panel'));
    console.log('CLOSE_BTN_WORKS=' + panelGone);
    await page.screenshot({ path: SS + '/final-03-after-close.png' });
  }

  // Test: reopen, click actor name → should navigate to profile
  await bell.click();
  await page.waitForTimeout(1000);
  const actorLink = await page.$('.notif-actor-name');
  if (actorLink) {
    await actorLink.click();
    await page.waitForTimeout(1500);
    const urlAfterClick = page.url();
    console.log('ACTOR_CLICK_URL=' + urlAfterClick + ' (should contain /profile/)');
    await page.screenshot({ path: SS + '/final-04-after-actor-click.png' });
    await page.goBack();
    await page.waitForTimeout(1000);
  }

  // Test: reopen, click row body → should navigate to circles
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bell2 = await page.$('.notif-bell-btn');
  if (bell2) {
    await bell2.click();
    await page.waitForTimeout(1000);
    const row = await page.$('.notif-item');
    if (row) {
      await row.click();
      await page.waitForTimeout(1500);
      console.log('ROW_CLICK_URL=' + page.url() + ' (should be /circles)');
      await page.screenshot({ path: SS + '/final-05-after-row-click.png' });
    }
  }

  // Test: Near Me mode (no location → nudge)
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const nearMeBtn = await page.$('.circles-mode-btn:nth-child(2)');
  if (nearMeBtn) {
    await nearMeBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SS + '/final-06-near-me.png' });
    const emptyTitle = await page.$eval('.circles-empty-title', el => el.textContent).catch(() => 'N/A');
    console.log('NEAR_ME_EMPTY_STATE=' + emptyTitle);
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
