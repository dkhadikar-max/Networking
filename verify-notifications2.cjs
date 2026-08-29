// End-to-end: create post as admin, collaborate as Neha, verify notification created
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SCREENSHOTS = 'C:/Networking/screenshots';
const JWT_SECRET = 'abdplcwersthjacb12344';

const ADMIN_ID   = '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b'; // dkhadikar@gmail.com
const OTHER_ID   = '6dad2c83-9a32-4b93-a107-ca70470d1936'; // bdchange2699@gmail.com (Neha)

const adminToken = jwt.sign({ id: ADMIN_ID, email: 'dkhadikar@gmail.com' }, JWT_SECRET, { expiresIn: '1h' });
const otherToken = jwt.sign({ id: OTHER_ID, email: 'bdchange2699@gmail.com' }, JWT_SECRET, { expiresIn: '1h' });

async function apiFetch(page, token, method, path, body) {
  return page.evaluate(function(args) {
    var opts = {
      method: args.method,
      headers: { 'Authorization': 'Bearer ' + args.token, 'Content-Type': 'application/json' }
    };
    if (args.body) opts.body = JSON.stringify(args.body);
    return fetch(args.path, opts).then(function(r) {
      return r.json().then(function(b) { return { status: r.status, body: b }; });
    });
  }, { method: method, token: token, path: path, body: body || null });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function(t) { localStorage.setItem('byn_token', t); }, adminToken);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // STEP 1: Create a test post as admin
  console.log('--- STEP 1: Create test post as admin ---');
  const createResp = await apiFetch(page, adminToken, 'POST', '/api/circles/posts', {
    text: 'Test post for notification verification — building an AI-powered networking tool and looking for collaborators.',
    tags: ['Building', 'Collab'],
    structured_meta: { looking_for: 'Engineers', timeline: '3 months' },
    links: []
  });
  console.log('CREATE_POST=' + JSON.stringify({ status: createResp.status, id: createResp.body.id || createResp.body.error }));
  const postId = createResp.body.id;

  if (!postId) {
    console.log('BLOCKED: could not create post');
    await browser.close();
    process.exit(1);
  }

  // STEP 2: Reload as admin — post should appear, no Collaborate button (own post)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SCREENSHOTS + '/notif-e2e-01-own-post.png' });
  const ownCollabBtn = await page.$('.circle-collab-btn');
  console.log('OWN_POST_HAS_COLLAB_BTN=' + !!ownCollabBtn + ' (should be false)');

  // STEP 3: Switch to Neha — hit collaborate endpoint (she should see the button)
  console.log('--- STEP 2: Neha collaborates on admin post ---');
  await page.evaluate(function(t) { localStorage.setItem('byn_token', t); }, otherToken);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SCREENSHOTS + '/notif-e2e-02-other-user-feed.png' });
  const otherCollabBtns = await page.$$('.circle-collab-btn');
  console.log('OTHER_USER_COLLAB_BTN_COUNT=' + otherCollabBtns.length + ' (should be >=1)');

  const collabResp = await apiFetch(page, otherToken, 'POST', '/api/circles/posts/' + postId + '/collaborate', {});
  console.log('COLLABORATE_RESP=' + JSON.stringify(collabResp));

  // STEP 4: Switch back to admin — check notification
  console.log('--- STEP 3: Admin checks notification ---');
  await page.evaluate(function(t) { localStorage.setItem('byn_token', t); }, adminToken);

  const countResp = await apiFetch(page, adminToken, 'GET', '/api/notifications/unread-count', null);
  console.log('ADMIN_UNREAD_COUNT=' + JSON.stringify(countResp) + ' (should be >=1)');

  const listResp = await apiFetch(page, adminToken, 'GET', '/api/notifications', null);
  const notifs = listResp.body.notifications || [];
  console.log('ADMIN_NOTIF_LIST count=' + notifs.length);
  if (notifs.length > 0) {
    console.log('FIRST_NOTIF=' + JSON.stringify({
      type: notifs[0].type,
      actor_name: notifs[0].actor_name,
      ref_text: notifs[0].ref_text ? notifs[0].ref_text.slice(0, 60) : null,
      read: notifs[0].read
    }));
  }

  // STEP 5: Reload admin Circles — bell should show badge
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SCREENSHOTS + '/notif-e2e-03-bell-with-badge.png' });

  const badgeEl = await page.$('.notif-badge');
  const badgeText = badgeEl ? await badgeEl.innerText() : null;
  console.log('BELL_BADGE_VISIBLE=' + !!badgeEl + ' TEXT=' + badgeText + ' (should be 1)');

  // STEP 6: Click bell — panel should show Neha's notification
  const bell = await page.$('.notif-bell-btn');
  if (bell) {
    await bell.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SCREENSHOTS + '/notif-e2e-04-panel-with-notif.png' });
    const notifItem = await page.$('.notif-item');
    const actorEl   = await page.$('.notif-actor');
    const actorText = actorEl ? await actorEl.innerText() : 'N/A';
    console.log('NOTIF_ITEM_IN_PANEL=' + !!notifItem + ' ACTOR_TEXT=' + JSON.stringify(actorText));
    const unreadItem = await page.$('.notif-item.unread');
    console.log('UNREAD_ITEM_STYLED=' + !!unreadItem);
  }

  // Probe: self-collaborate blocked
  console.log('--- PROBE: self-collaborate blocked ---');
  const selfResp = await apiFetch(page, adminToken, 'POST', '/api/circles/posts/' + postId + '/collaborate', {});
  console.log('SELF_COLLAB=' + JSON.stringify({ status: selfResp.status, error: selfResp.body.error }) + ' (should be 400/403)');

  // Cleanup: delete the test post
  await apiFetch(page, adminToken, 'DELETE', '/api/circles/posts/' + postId, null);
  console.log('TEST_POST_CLEANED_UP');

  await browser.close();
  console.log('DONE');
})().catch(function(e) { console.error('ERR:', e.message, e.stack); process.exit(1); });
