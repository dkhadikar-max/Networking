const { chromium } = require('./frontend/node_modules/playwright-core');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  // 1. Login page
  await page.goto('https://app.buildyournetwork.online/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/Networking/ss-login.png' });
  console.log('LOGIN_LOADED title=' + await page.title());

  const emailOk = !!(await page.$('input[type="email"]'));
  const passOk  = !!(await page.$('input[type="password"]'));
  const btnOk   = !!(await page.$('button[type="submit"]'));
  console.log('FORM email=' + emailOk + ' pass=' + passOk + ' btn=' + btnOk);

  // 2. Bad credentials — expect error, stay on login
  await page.fill('input[type="email"]', 'notreal@example.com');
  await page.fill('input[type="password"]', 'badpass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Networking/ss-login-error.png' });
  console.log('AFTER_BAD_LOGIN url=' + page.url());

  // 3. Signup page
  await page.goto('https://app.buildyournetwork.online/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/Networking/ss-signup.png' });
  const nameInput = !!(await page.$('input[id="signup-name"]'));
  console.log('SIGNUP_LOADED name_input=' + nameInput + ' title=' + await page.title());

  // 4. Check JS bundle contains setToken (confirms deploy has auth fix)
  const scripts = await page.$$eval('script[src*="_next"]', els => els.map(e => e.src));
  let setTokenFound = false;
  for (const src of scripts.slice(0, 8)) {
    try {
      const text = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return r.text();
      }, src);
      if (text.includes('setToken') || text.includes('byn_token')) {
        setTokenFound = true;
        break;
      }
    } catch (_) {}
  }
  console.log('SETTOKEN_DEPLOYED=' + setTokenFound);

  await browser.close();
  console.log('DONE — screenshots saved');
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
