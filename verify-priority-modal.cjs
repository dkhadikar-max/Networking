const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

async function dismissCookie(page) {
  const btn = await page.$('button:has-text("Accept")');
  if (btn) { await btn.click(); await page.waitForTimeout(400); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  // Accept cookie once on homepage so localStorage persists
  await dismissCookie(page);

  // ── INBOX MODE (Chat page) ─────────────────────────────────────────────────
  console.log('=== INBOX MODE ===');
  await page.goto('https://buildyournetwork.online/chat', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1500);
  await dismissCookie(page);

  await page.screenshot({ path: SS + '/pm-00-chat.png' });

  const boltBtn = await page.$('button[title="Priority messages"]');
  console.log('BOLT_BTN_FOUND=' + !!boltBtn);
  await boltBtn.click();
  await page.waitForTimeout(1500);
  await dismissCookie(page);
  await page.waitForTimeout(500);

  await page.screenshot({ path: SS + '/pm-01-inbox-open.png' });
  console.log('SCREENSHOT: inbox open');

  const header     = await page.$eval('h2', el => el.innerText).catch(() => 'NOT FOUND');
  const emptyState = await page.$('p:has-text("No priority messages")');
  const closeBtn   = await page.$('button:has-text("✕")');
  const dragHandle = await page.$('div[style*="36px"][style*="4px"]');
  const quotaLine  = await page.$('p:has-text("used this month")');

  console.log('HEADER=' + header);
  console.log('EMPTY_STATE=' + !!emptyState);
  console.log('CLOSE_BTN=' + !!closeBtn);
  console.log('DRAG_HANDLE=' + !!dragHandle);
  console.log('QUOTA_LINE=' + !!quotaLine);

  if (emptyState) console.log('EMPTY_TEXT=' + await emptyState.innerText());
  if (quotaLine)  console.log('QUOTA_TEXT=' + await quotaLine.innerText());

  // Measure panel position
  const panel = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(el => {
      const s = window.getComputedStyle(el);
      return s.position === 'fixed' && s.zIndex >= '100' && el.innerText.includes('Priority');
    });
    if (!els.length) return null;
    const r = els[0].getBoundingClientRect();
    return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom) };
  });
  console.log('MODAL_PANEL=' + JSON.stringify(panel));

  if (closeBtn) {
    await closeBtn.click();
    await page.waitForTimeout(400);
    console.log('CLOSE_WORKS=' + !(await page.$('h2:has-text("Priority")')));
  }

  // ── COMPOSE MODE (Discover SwipeCard) ─────────────────────────────────────
  console.log('\n=== COMPOSE MODE (Discover) ===');
  await page.goto('https://buildyournetwork.online/discover', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(2000);
  await dismissCookie(page);
  await page.waitForTimeout(500);

  await page.screenshot({ path: SS + '/pm-03-discover.png' });

  // Find Priority button on swipe card — it's labelled "Priority" not "⚡"
  const allBtns = await page.$$eval('button', els =>
    els.map(el => ({ text: el.innerText?.trim().slice(0, 40), cls: el.className, title: el.title }))
  );
  console.log('ALL_BTNS:', JSON.stringify(allBtns.filter(b => b.text), null, 2));

  const priorityBtn = await page.$('button:has-text("Priority")');
  console.log('PRIORITY_BTN=' + !!priorityBtn);

  if (priorityBtn) {
    await priorityBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SS + '/pm-04-compose-open.png' });
    console.log('SCREENSHOT: compose modal open');

    const header2    = await page.$eval('h2', el => el.innerText).catch(() => 'NOT FOUND');
    const textarea   = await page.$('textarea');
    const charCount  = await page.$$eval('span', els => els.map(e => e.innerText).filter(t => t.includes('/500')));
    const sendBtn    = await page.$('button:has-text("Send Priority Message")');
    const sendDisabl = sendBtn ? await sendBtn.evaluate(el => el.disabled) : null;
    const quotaSpans = await page.$$eval('span', els => els.map(e => e.innerText).filter(t => t.includes('used this month')));

    console.log('COMPOSE_HEADER=' + header2);
    console.log('TEXTAREA=' + !!textarea);
    console.log('CHAR_COUNT=' + (charCount[0] || 'NOT FOUND'));
    console.log('SEND_BTN=' + !!sendBtn);
    console.log('SEND_DISABLED_WHEN_EMPTY=' + sendDisabl);
    console.log('QUOTA_TEXT=' + (quotaSpans[0] || 'NOT FOUND'));

    if (textarea) {
      await textarea.fill('Hi! I saw your profile and would love to explore collaboration.');
      await page.waitForTimeout(400);
      const charAfter   = await page.$$eval('span', els => els.map(e => e.innerText).filter(t => t.includes('/500')));
      const sendEnabled = sendBtn ? !(await sendBtn.evaluate(el => el.disabled)) : false;
      console.log('CHAR_AFTER_TYPE=' + (charAfter[0] || 'NOT FOUND'));
      console.log('SEND_ENABLED_WITH_TEXT=' + sendEnabled);
      await page.screenshot({ path: SS + '/pm-05-compose-filled.png' });
      console.log('SCREENSHOT: compose filled');
    }

    const closeBtn2 = await page.$('button:has-text("✕")');
    if (closeBtn2) {
      await closeBtn2.click();
      await page.waitForTimeout(400);
      console.log('COMPOSE_CLOSE_WORKS=' + !(await page.$('h2:has-text("Message")')));
      await page.screenshot({ path: SS + '/pm-06-after-compose-close.png' });
    }
  }

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
