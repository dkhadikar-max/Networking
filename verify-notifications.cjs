const { chromium } = require('playwright');
const SCREENSHOTS = 'C:/Networking/screenshots';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk0OGJmMzRiLWIzZDYtNGE4Yi1hNmE4LTJjMzRmMmZiMWI4YiIsImVtYWlsIjoiZGtoYWRpa2FyQGdtYWlsLmNvbSIsImlhdCI6MTc4MDA0MjU1OCwiZXhwIjoxNzgwMDQ2MTU4fQ.2PWbdfa1e4SbvcHjt8C--GSPNp1HzRnxNAVOrx__3Ek';
const MY_ID = '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  // Inject token
  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function(t) { localStorage.setItem('byn_token', t); }, TOKEN);

  // Navigate to Circles
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SCREENSHOTS + '/notif-01-circles-loaded.png' });
  console.log('STEP1 url=' + page.url());

  // 1. Bell present in header
  const bell = await page.$('.notif-bell-btn');
  console.log('BELL_PRESENT=' + !!bell);

  // 2. Collaborate buttons on other users' posts
  const collabBtns = await page.$$('.circle-collab-btn');
  console.log('COLLAB_BTN_COUNT=' + collabBtns.length);

  // Screenshot header area
  await page.screenshot({ path: SCREENSHOTS + '/notif-02-header.png' });

  // 3. Unread count API
  const countResp = await page.evaluate(function(token) {
    return fetch('/api/notifications/unread-count', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json().then(function(b) { return { status: r.status, body: b }; }); });
  }, TOKEN);
  console.log('UNREAD_COUNT_API=' + JSON.stringify(countResp));

  // 4. Notifications list API
  const listResp = await page.evaluate(function(token) {
    return fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json().then(function(b) { return { status: r.status, count: b.notifications ? b.notifications.length : 'err', body: b }; }); });
  }, TOKEN);
  console.log('NOTIF_LIST_API status=' + listResp.status + ' count=' + listResp.count);

  // 5. Click bell, check panel
  if (bell) {
    await bell.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SCREENSHOTS + '/notif-03-panel-open.png' });
    const panel = await page.$('.notif-panel');
    const title = panel ? await page.$eval('.notif-panel-title', function(el) { return el.innerText; }).catch(function() { return 'N/A'; }) : 'N/A';
    console.log('PANEL_OPEN=' + !!panel + ' TITLE=' + title);
    // close
    const overlay = await page.$('.notif-overlay');
    if (overlay) await overlay.click();
    await page.waitForTimeout(500);
  }

  // 6. Click Collaborate on a non-own post
  if (collabBtns.length > 0) {
    await collabBtns[0].click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SCREENSHOTS + '/notif-04-collab-modal.png' });
    const modal = await page.$('[class*="priority"]');
    console.log('COLLAB_MODAL_OPEN=' + !!modal);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 7. Probe: direct API collaborate on another user's post
  const feedData = await page.evaluate(function(token) {
    return fetch('/api/circles/feed?offset=0&limit=10', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); });
  }, TOKEN);
  const posts = feedData.posts || [];
  const otherPost = posts.find(function(p) { return p.user_id !== MY_ID; });
  const ownPost   = posts.find(function(p) { return p.user_id === MY_ID; });
  console.log('FEED_TOTAL=' + posts.length + ' OTHER_POST=' + (otherPost ? otherPost.id : 'none'));

  if (otherPost) {
    const collabResp = await page.evaluate(function(args) {
      return fetch('/api/circles/posts/' + args.id + '/collaborate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + args.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(function(r) { return r.json().then(function(b) { return { status: r.status, body: b }; }); });
    }, { token: TOKEN, id: otherPost.id });
    console.log('COLLABORATE_API=' + JSON.stringify(collabResp));
  }

  // 8. Probe: self-collaborate should be blocked (403)
  if (ownPost) {
    const selfResp = await page.evaluate(function(args) {
      return fetch('/api/circles/posts/' + args.id + '/collaborate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + args.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(function(r) { return r.json().then(function(b) { return { status: r.status, body: b }; }); });
    }, { token: TOKEN, id: ownPost.id });
    console.log('SELF_COLLAB_BLOCKED=' + JSON.stringify(selfResp));
  }

  await browser.close();
  console.log('DONE');
})().catch(function(e) { console.error('ERR:', e.message); process.exit(1); });
