import { chromium } from 'file:///C:/Users/dell/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = 'C:\\Networking\\screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
});

// ── HOMEPAGE ──────────────────────────────────────────────────────────────────
const page = await context.newPage();
await page.goto('https://buildyournetwork.online', { waitUntil: 'networkidle', timeout: 30000 });

const homeShot = path.join(SCREENSHOT_DIR, 'homepage.png');
await page.screenshot({ path: homeShot, fullPage: true });
console.log('SCREENSHOT_HOME:', homeShot);

// Font on body
const bodyFont = await page.evaluate(() => {
  return window.getComputedStyle(document.body).fontFamily;
});
console.log('BODY_FONT:', bodyFont);

// Nav logo text
const navLogoText = await page.evaluate(() => {
  // Try common selectors for nav logo
  const candidates = [
    document.querySelector('nav .logo'),
    document.querySelector('nav a[href="/"]'),
    document.querySelector('header a[href="/"]'),
    document.querySelector('[class*="logo"]'),
    document.querySelector('nav'),
  ];
  for (const el of candidates) {
    if (el && el.textContent.trim()) return el.textContent.trim().slice(0, 100);
  }
  return 'NOT_FOUND';
});
console.log('NAV_LOGO_TEXT:', navLogoText);

// Footer copyright text
const footerText = await page.evaluate(() => {
  const footer = document.querySelector('footer');
  if (footer) return footer.textContent.trim().slice(0, 300);
  // Try copyright symbol
  const all = Array.from(document.querySelectorAll('*')).find(el =>
    el.children.length === 0 && el.textContent.includes('©')
  );
  return all ? all.textContent.trim() : 'NOT_FOUND';
});
console.log('FOOTER_TEXT:', footerText);

// Coming-soon card onclick
const comingSoonOnclick = await page.evaluate(() => {
  // Look for coming soon cards
  const allEls = Array.from(document.querySelectorAll('[onclick]'));
  const filtered = allEls.filter(el => {
    const text = (el.textContent || '').toLowerCase();
    const onclick = el.getAttribute('onclick') || '';
    return text.includes('coming') || text.includes('soon') || onclick.includes('alert') || onclick.includes('coming');
  });
  if (filtered.length > 0) {
    return filtered.map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().slice(0, 80),
      onclick: el.getAttribute('onclick')
    }));
  }
  // Also check all onclick elements
  const allOnclick = Array.from(document.querySelectorAll('[onclick]'));
  return allOnclick.length > 0
    ? allOnclick.map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 80), onclick: el.getAttribute('onclick') }))
    : 'NO_ONCLICK_ELEMENTS';
});
console.log('COMING_SOON_ONCLICK:', JSON.stringify(comingSoonOnclick, null, 2));

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
const loginPage = await context.newPage();
await loginPage.goto('https://buildyournetwork.online/login', { waitUntil: 'networkidle', timeout: 30000 });

const loginShot = path.join(SCREENSHOT_DIR, 'login.png');
await loginPage.screenshot({ path: loginShot, fullPage: true });
console.log('SCREENSHOT_LOGIN:', loginShot);

// Font on login root div
const loginFont = await loginPage.evaluate(() => {
  const root = document.querySelector('#__next') || document.querySelector('[id="root"]') || document.body;
  return window.getComputedStyle(root).fontFamily;
});
console.log('LOGIN_FONT:', loginFont);

// Login form renders?
const loginFormExists = await loginPage.evaluate(() => {
  return !!document.querySelector('form') || !!document.querySelector('input[type="email"]') || !!document.querySelector('input[type="password"]');
});
console.log('LOGIN_FORM_RENDERS:', loginFormExists);

// Login page title / heading
const loginHeading = await loginPage.evaluate(() => {
  const h1 = document.querySelector('h1');
  const h2 = document.querySelector('h2');
  return (h1 || h2)?.textContent?.trim() || 'NOT_FOUND';
});
console.log('LOGIN_HEADING:', loginHeading);

await browser.close();
console.log('DONE');
