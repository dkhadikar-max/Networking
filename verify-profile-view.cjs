const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const MY_ID = '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b';
const TOKEN = jwt.sign({ id: MY_ID, email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  const cookie = await page.$('button:has-text("Accept")');
  if (cookie) { await cookie.click(); await page.waitForTimeout(300); }

  // Find a non-own user from the discover stack
  const profile = await page.evaluate(async ({ token, myId }) => {
    const r = await fetch('/api/discover?limit=5', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) return null;
    const d = await r.json();
    const profiles = d.profiles || d || [];
    return profiles.find(p => p.id !== myId) || null;
  }, { token: TOKEN, myId: MY_ID });

  if (!profile) { console.log('No discover profiles found'); await browser.close(); return; }
  console.log('TARGET_ID=' + profile.id);
  console.log('TARGET_NAME=' + profile.name);

  // Navigate to their profile
  await page.goto(`https://buildyournetwork.online/profile/${profile.id}`, { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SS + '/profile-00-view.png' });
  console.log('SCREENSHOT: non-own profile');

  // Button row audit
  const connectBtn  = await page.$('button:has-text("Connect")') || await page.$('button:has-text("Connected")');
  const priorityBtn = await page.$('button:has-text("Priority")');
  const chatLink    = await page.$('a[href*="/chat/"]');

  console.log('CONNECT_BTN=' + !!connectBtn);
  console.log('PRIORITY_BTN=' + !!priorityBtn);
  console.log('CHAT_LINK=' + !!chatLink);
  if (connectBtn)  console.log('CONNECT_TEXT=' + (await connectBtn.innerText()).trim());

  if (connectBtn && priorityBtn) {
    const cb = await connectBtn.boundingBox();
    const pb = await priorityBtn.boundingBox();
    console.log('BUTTONS_SAME_ROW=' + (Math.abs(cb.y - pb.y) < 10));
    console.log('CONNECT_W=' + Math.round(cb.width) + ' PRIORITY_W=' + Math.round(pb.width));
  }

  // Open priority modal from profile
  if (priorityBtn) {
    await priorityBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SS + '/profile-01-priority-modal.png' });
    console.log('SCREENSHOT: priority modal');

    const header  = await page.$eval('h2', el => el.innerText).catch(() => 'NOT FOUND');
    const textarea = await page.$('textarea');
    const sendBtn  = await page.$('button:has-text("Send Priority Message")');
    const quota    = await page.$$eval('span', els => els.map(e => e.innerText).find(t => t.includes('used this month')) || 'NOT FOUND');
    const sendDisabled = sendBtn ? await sendBtn.evaluate(el => el.disabled) : null;

    console.log('MODAL_HEADER=' + header);
    console.log('TARGETS_CORRECT_USER=' + (header.includes(profile.name?.split(' ')[0] || '')));
    console.log('TEXTAREA=' + !!textarea);
    console.log('SEND_DISABLED_EMPTY=' + sendDisabled);
    console.log('QUOTA=' + quota);

    if (textarea) {
      await textarea.fill('Hey! Saw your profile — would love to connect.');
      await page.waitForTimeout(300);
      await page.screenshot({ path: SS + '/profile-02-priority-filled.png' });
      console.log('SCREENSHOT: modal with text');
      const enabled = sendBtn ? !(await sendBtn.evaluate(el => el.disabled)) : false;
      console.log('SEND_ENABLED_WITH_TEXT=' + enabled);
    }

    const closeBtn = await page.$('button:has-text("✕")');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(400); }
    console.log('MODAL_CLOSED=' + !(await page.$('h2:has-text("Message")')));
  }

  // Own profile — no Priority button
  console.log('\n=== OWN PROFILE ===');
  await page.goto('https://buildyournetwork.online/profile', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SS + '/profile-03-own.png' });
  const ownPriorityBtn = await page.$('button:has-text("Priority")');
  const editBtn = await page.$('button:has-text("Edit")') || await page.$('a:has-text("Edit")');
  console.log('OWN_HAS_PRIORITY_BTN=' + !!ownPriorityBtn + ' (expect false)');
  console.log('OWN_HAS_EDIT=' + !!editBtn);

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
