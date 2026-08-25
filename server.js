import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── FIXED: Only catch MODULE_NOT_FOUND; re-throw real errors (syntax, etc.) ──
function optionalRequire(name, fallback) {
  try { return require(name); }
  catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn(`Optional dependency "${name}" is not installed; related features will be disabled.`);
      return fallback;
    }
    throw error;
  }
}

const dotenv = optionalRequire('dotenv', { config: () => {} });
dotenv.config();

const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors        = require('cors');
const cookieParser = require('cookie-parser');
const multerPkg = optionalRequire('multer', null);
const cloudinaryPkg = optionalRequire('cloudinary', { v2: { config: () => {}, uploader: { destroy: async () => {} } } });
const cloudinary = cloudinaryPkg.v2 || cloudinaryPkg;
const cloudinaryStoragePkg = optionalRequire('multer-storage-cloudinary', {});
const CloudinaryStorage = cloudinaryStoragePkg.CloudinaryStorage;
const expoPkg = optionalRequire('expo-server-sdk', { Expo: class { static isExpoPushToken() { return false; } chunkPushNotifications() { return []; } async sendPushNotificationsAsync() { return []; } } });
const { Expo } = expoPkg;
const resendPkg = optionalRequire('resend', null);
// Only create the Resend client if both the package is available AND an API key is set.
// Creating with an empty string produces a client that silently fails on every send.
const ResendClient = (resendPkg && process.env.RESEND_API_KEY)
  ? new resendPkg.Resend(process.env.RESEND_API_KEY)
  : null;
const razorpayPkg = optionalRequire('razorpay', null);
const razorpay = (razorpayPkg && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new razorpayPkg({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const webpushPkg = optionalRequire('web-push', null);
const webpush = (webpushPkg && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  ? (() => {
      webpushPkg.setVapidDetails(
        `mailto:${process.env.VAPID_EMAIL || 'support@buildyournetwork.online'}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      return webpushPkg;
    })()
  : null;
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const uuidv4 = () => crypto.randomUUID();

// ── FIXED: multer fallback returns correct object shape with .single(), .array(), etc. ──
const multer = multerPkg || (() => {
  const handler = (req, res, next) => res.status(503).json({ error: 'File uploads are temporarily unavailable on this server.' });
  return {
    single: () => handler,
    array: () => handler,
    fields: () => handler,
    none: () => handler,
    diskStorage: () => ({}),
    memoryStorage: () => ({}),
  };
})();

// ── ENVIRONMENT VALIDATION ──
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('CRITICAL: Missing environment variables: ' + missingEnvVars.join(', '));
  console.error('Server will start but database operations will fail.');
}

// ── FIXED: JWT_SECRET and ADMIN_SECRET are required — no insecure fallbacks ──
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is required for secure token signing.');
  process.exit(1);
}
if (!ADMIN_SECRET) {
  console.error('CRITICAL: ADMIN_SECRET environment variable is required for admin bootstrap security.');
  process.exit(1);
}

// ── SUPABASE CLIENT ──
// Node 20 lacks native WebSocket — pass the 'ws' package so createClient doesn't throw.
const ws = optionalRequire('ws', null);
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
      ...(ws ? { realtime: { transport: ws } } : {}),
    }
  );
  console.log('Supabase client initialized');
} catch (e) {
  console.error('Failed to initialize Supabase:', e.message);
  // Proxy that returns { data: null, error } for every query method chain so callers
  // receive a well-formed error instead of a TypeError from missing .eq/.maybeSingle etc.
  const stubResult = Promise.resolve({ data: null, count: null, error: e });
  const stubChain = () => {
    const handler = { get: (_, prop) => prop === 'then' || prop === 'catch' || prop === 'finally' ? stubResult[prop].bind(stubResult) : () => new Proxy(stubResult, handler) };
    return new Proxy(stubResult, handler);
  };
  supabase = { from: () => ({ select: stubChain, insert: stubChain, update: stubChain, upsert: stubChain, delete: stubChain }) };
}

// ── AI AGENT ORCHESTRATOR ── (non-blocking; routes return 503 until ready)
let agentOrchestrator = null;
let agentMemory       = null;
let workflowEngine    = null;
let agentScheduler    = null;

import('./agents/orchestrator.js')
  .then(async m => {
    agentOrchestrator = new m.AgentOrchestrator(supabase);
    console.log('AI agents ready ✓');
    // Chain workflow engine + scheduler — both depend on orchestrator being ready
    const [wm, sm] = await Promise.all([
      import('./agents/workflow-engine.js'),
      import('./agents/scheduler.js'),
    ]);
    workflowEngine = new wm.WorkflowEngine(supabase, agentOrchestrator);
    agentScheduler = new sm.AgentScheduler(supabase, agentOrchestrator);
    agentScheduler.start();
    console.log('Workflow engine + scheduler ready ✓');
  })
  .catch(e => console.warn('Agent system unavailable:', e.message));
import('./agents/memory.js')
  .then(m => { agentMemory = new m.AgentMemory(supabase); })
  .catch(e => console.warn('Agent memory unavailable:', e.message));

// ── CLOUDINARY CONFIG ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key:    process.env.CLOUDINARY_API_KEY    || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});
const USE_CLOUDINARY = !!(process.env.CLOUDINARY_CLOUD_NAME && multerPkg && CloudinaryStorage);

// ── EXPO PUSH ──
const expo = new Expo();

// ── APP SETUP ──
const app  = express();
const PORT = process.env.PORT || 3000;

// Railway (and most cloud platforms) sit behind a reverse proxy that sets
// X-Forwarded-For. Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// on every request and cannot identify clients correctly.
app.set('trust proxy', 1);

// FIXED: Comma-separated emails that are always admin regardless of DB state
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'dkhadikar@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

// ── SECURITY HEADERS ──
app.disable('x-powered-by');   // never reveal Express/Node version
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'",                        // all inline JS extracted to /public/js/*.js — no unsafe-inline needed
                       'https://checkout.razorpay.com', // Razorpay Standard Checkout script
                       'https://cdn.tailwindcss.com',   // Tailwind CDN used on upgrade page
                       'https://www.googletagmanager.com', // Google Analytics / GTM
                       'https://www.google-analytics.com'], // GA direct
      // scriptSrcAttr intentionally omitted -- falls back to scriptSrc (no
      // unsafe-inline), blocking onclick="..."-style attributes. None exist
      // in the codebase (verified 2026-07-31).
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com',
                       'https://cdnjs.cloudflare.com'], // Font Awesome CSS on upgrade page
      fontSrc:        ["'self'", 'https://fonts.gstatic.com',
                       'https://cdnjs.cloudflare.com'], // Font Awesome webfonts on upgrade page
      imgSrc:         ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.cloudinary.com',
                       'https://cdn.razorpay.com',      // Razorpay logo/images inside checkout modal
                       'https://www.google-analytics.com'], // GA measurement pixel
      connectSrc:     ["'self'",
                       'https://api.razorpay.com',      // Razorpay order/payment API calls
                       'https://lumberjack.razorpay.com', // Razorpay internal logging
                       'https://www.google-analytics.com', // GA data beacons
                       'https://analytics.google.com',
                       'https://www.googletagmanager.com'],
      frameSrc:       ['https://api.razorpay.com',      // Razorpay checkout modal iframe
                       'https://checkout.razorpay.com'],
      frameAncestors: ["'none'"],                       // blocks clickjacking — unchanged
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
    },
  },
}));

// Camera/mic/geolocation are unused anywhere in this app — 'payment' is deliberately
// left unrestricted since the Razorpay checkout modal (see CSP above) needs it.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ── CORS ──
const ALLOWED_ORIGINS = [
  'https://buildyournetwork.online',
  'https://www.buildyournetwork.online',
  'https://app.buildyournetwork.online',
  'https://urnetwork.online',
  'https://www.urnetwork.online',
  // Expo / Metro dev origins
  'http://localhost:8081',
  'http://localhost:19000',
  'http://localhost:19006',
  'http://localhost:3000',
  // Read additional origins from CORS_ORIGINS env var (comma-separated)
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []),
];
const corsOptions = {
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());

// ── RATE LIMITERS ──
const globalLimiter     = rateLimit({ windowMs: 60*1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, slow down' } });
const authLimiter       = rateLimit({ windowMs: 15*60*1000, max: 50, skipSuccessfulRequests: true, message: { error: 'Too many login attempts, please wait 15 minutes' } });
const adminLimiter      = rateLimit({ windowMs: 15*60*1000, max: 60, message: { error: 'Too many requests' } });
const uploadLimiter     = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'Upload limit reached' } });
const eventsLimiter     = rateLimit({ windowMs: 60*1000, max: 60, message: { error: 'Too many events' } });
const linkPreviewLimiter = rateLimit({ windowMs: 60*1000, max: 15, message: { error: 'Link preview limit reached, slow down' } });
const verifyLimiter     = rateLimit({ windowMs: 15*60*1000, max: 5, message: { error: 'Too many verification attempts — wait 15 minutes' },
  keyGenerator: (req) => {
    try {
      const token = req.cookies?.byn_token || (req.headers.authorization || '').split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return `verify:${decoded.id}`;
    } catch { return req.ip; }
  }
});
const msgLimiter        = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'Message rate limit reached' } });
// BUG FIX 2: Bootstrap brute-force — strict limiter, independent of auth limiter
const bootstrapLimiter  = rateLimit({ windowMs: 60*60*1000, max: 10, message: { error: 'Too many bootstrap attempts' } });
// BUG FIX 4: OTP send — own strict limiter so it can't share quota with login
const otpSendLimiter    = rateLimit({ windowMs: 15*60*1000, max: 5, message: { error: 'Too many OTP requests — wait 15 minutes' },
  keyGenerator: (req) => {
    try {
      const token = req.cookies?.byn_token || (req.headers.authorization || '').split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return `otp-send:${decoded.id}`;
    } catch { return req.ip; }
  }
});
// BUG FIX 3: Works creation — prevent spam
const worksLimiter      = rateLimit({ windowMs: 60*1000, max: 5, message: { error: 'Works creation rate limit reached' } });
// BUG FIX 9: Public profile scraping — per-IP cap
const profileViewLimiter = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'Too many profile requests' } });
const forgotPasswordLimiter = rateLimit({ windowMs: 60*60*1000, max: 3, message: { error: 'Too many reset requests — try again in an hour' } });
const resetPasswordLimiter  = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Too many reset attempts — wait 15 minutes' } });
// Strict limiter for DSA illegal-content reports — prevents mass auto-ban abuse
const dsaReportLimiter  = rateLimit({ windowMs: 60*60*1000, max: 5,  message: { error: 'Report limit reached — try again in an hour' } });
const feedbackLimiter   = rateLimit({ windowMs: 60*60*1000, max: 5,  message: { error: 'Feedback limit reached — try again later' } });
const circlePostLimiter = rateLimit({ windowMs: 5*60*1000,  max: 10, message: { error: 'Post rate limit reached — slow down' } });
const circleGroupCreateLimiter = rateLimit({ windowMs: 60*60*1000, max: 5,  message: { error: 'Too many circles created — try again in an hour' } });
const circleGroupActionLimiter = rateLimit({ windowMs: 60*1000,     max: 20, message: { error: 'Slow down' } });

// ── EMAIL-VERIFICATION ABUSE PROTECTION (2026-08-15 audit, revised 2026-08-25) ──
// Per-IP layer, additive to the per-account limiters below and to the
// precise DB-backed cooldown/hour/day caps in issueAndSendOtp(). Combined
// across BOTH /api/signup and /api/auth/send-otp (one shared counter per
// IP, not two separate loose ones) — per-account limits alone cap what any
// ONE account can do, not what many accounts distributed across the same
// network sum to; this is the first layer that actually bounds that.
// authLimiter (used elsewhere on /api/signup) has skipSuccessfulRequests:true
// — deliberately, for login, so a few wrong passwords before a correct one
// isn't punished — but that means it does NOT meaningfully cap signup abuse,
// since every successful signup (the actual quota-draining case) is skipped.
// otpIpLimiter below counts every request, success or not.
//
// Repeat offenders escalate instead of just getting a fresh budget every
// hour forever: each time an IP exceeds the limit, its next block gets
// longer (15min × violation count, capped at 24h) — same shape as the
// existing per-account LOGIN_LOCKOUT below, applied per-IP here. In-memory
// (resets on restart, single Railway instance, no shared store elsewhere in
// this file) — worst case a repeat offender gets one extra free window
// right after a deploy, not a security hole.
const otpIpViolations = new Map(); // ip -> { count, blockedUntil }
const OTP_IP_ESCALATION_STEP_MS = 15 * 60 * 1000;
const OTP_IP_ESCALATION_MAX_MS  = 24 * 60 * 60 * 1000;

function otpIpBlockGate(req, res, next) {
  const v = otpIpViolations.get(req.ip);
  if (v && v.blockedUntil > Date.now()) {
    const waitMin = Math.ceil((v.blockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many attempts from this network — try again in ${waitMin} minute(s)`, code: 'IP_BLOCKED' });
  }
  next();
}

const otpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Too many verification requests from this network — please try again later' },
  handler: (req, res, _next, options) => {
    const v = otpIpViolations.get(req.ip) || { count: 0, blockedUntil: 0 };
    v.count += 1;
    v.blockedUntil = Date.now() + Math.min(OTP_IP_ESCALATION_STEP_MS * v.count, OTP_IP_ESCALATION_MAX_MS);
    otpIpViolations.set(req.ip, v);
    res.status(429).json(options.message);
  },
});

// ── GLOBAL OTP EMAIL BUDGET (circuit breaker) ──
// Everything above — per-account cooldown/hour/day, per-IP throttle — bounds
// what any single account or network can do, but none of it sees AGGREGATE
// volume across many different accounts on many different networks. A
// sufficiently distributed sender (e.g. many accounts, each staying under
// its own 3/hour cap) can still exhaust Resend's own account-level quota.
// This is BYN's own approximate hourly/daily budget for OTP emails
// specifically, checked immediately before every Resend call — once it's
// hit, no further OTP sends are attempted until the window rolls over,
// regardless of which account or IP is asking. Tune the two env vars to
// your actual Resend plan; these defaults are conservative placeholders,
// not a measured number from your account.
const OTP_GLOBAL_HOUR_BUDGET = parseInt(process.env.OTP_GLOBAL_HOURLY_BUDGET || '100', 10);
const OTP_GLOBAL_DAY_BUDGET  = parseInt(process.env.OTP_GLOBAL_DAILY_BUDGET  || '500', 10);
let otpGlobalHourCount = 0, otpGlobalHourWindowStart = Date.now();
let otpGlobalDayCount  = 0, otpGlobalDayWindowStart  = Date.now();

function claimGlobalOtpBudget() {
  const now = Date.now();
  if (now - otpGlobalHourWindowStart >= 60 * 60 * 1000) { otpGlobalHourCount = 0; otpGlobalHourWindowStart = now; }
  if (now - otpGlobalDayWindowStart  >= 24 * 60 * 60 * 1000) { otpGlobalDayCount = 0; otpGlobalDayWindowStart = now; }
  if (otpGlobalHourCount >= OTP_GLOBAL_HOUR_BUDGET) return false;
  if (otpGlobalDayCount  >= OTP_GLOBAL_DAY_BUDGET)  return false;
  otpGlobalHourCount++; otpGlobalDayCount++;
  return true;
}

// ── PER-ACCOUNT LOGIN LOCKOUT ──
const LOGIN_LOCKOUT_THRESHOLD  = 10;              // consecutive wrong-password attempts
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// Pre-generated once at startup — bcrypt.compare against this on "user not found"
// so response time is indistinguishable from a real wrong-password attempt.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('__byn_timing_dummy__', 12);

app.use(globalLimiter);

// ── REQUEST LOGGER ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now()-start}ms`);
  });
  next();
});

// SECURITY: capture raw body for Razorpay webhook HMAC before json() parses it
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
// ── TRAILING SLASH → CANONICAL REDIRECT (prevents duplicate content indexing) ──
app.use((req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('/')) {
    const qs = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
    return res.redirect(301, req.path.slice(0, -1) + qs);
  }
  next();
});

// ── SITEMAP + ROBOTS: registered BEFORE express.static so static files can never shadow them ──
app.get('/sitemap.xml', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  // Stable per-tier dates — prevents crawlers from seeing 709 pages as "changed today"
  // on every sitemap fetch, which wastes crawl budget.
  const D_CORE  = '2026-05-20'; // core brand + existing landing pages (Phase 1/2 rewrites)
  const D_NEW   = '2026-06-01'; // Phase 3 P2/P3/P4 new pages + international expansion
  const D_PROG  = '2026-05-18'; // programmatic city/intent/category pages (deployed Phase 1 AI OS)
  const D_UTIL  = '2026-05-01'; // utility/policy pages
  const citySlugs   = Object.keys(CITIES);
  const usSlugs     = Object.keys(US_CITIES);
  const euSlugs     = Object.keys(EU_CITIES);
  const allGlobal   = [...usSlugs, ...euSlugs];
  const cityUrls    = citySlugs.map(slug => ({ loc: BASE + '/networking-in-' + slug, priority: '0.8', freq: 'monthly', lastmod: D_PROG }));
  const globalCityUrls = allGlobal.map(slug => ({ loc: BASE + '/networking-in-' + slug, priority: '0.8', freq: 'monthly', lastmod: D_PROG }));
  const intentPatterns = ['founders-in-', 'startup-founders-', 'find-cofounders-', 'startup-networking-', 'professional-networking-'];
  const intentUrls = intentPatterns.flatMap(p => citySlugs.map(slug => ({ loc: BASE + '/' + p + slug, priority: '0.7', freq: 'monthly', lastmod: D_PROG })));
  const globalIntentUrls = intentPatterns.flatMap(p => allGlobal.map(slug => ({ loc: BASE + '/' + p + slug, priority: '0.7', freq: 'monthly', lastmod: D_PROG })));
  const categoryUrls = CATEGORY_SLUGS.flatMap(cat => citySlugs.map(slug => ({ loc: BASE + '/' + cat + '-' + slug, priority: '0.7', freq: 'monthly', lastmod: D_PROG })));
  const urls = [
    { loc: BASE + '/',                               priority: '1.0', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/what-is-byn',                    priority: '1.0', freq: 'monthly', lastmod: D_CORE },
    { loc: BASE + '/intent-based-networking',        priority: '0.9', freq: 'monthly', lastmod: '2026-06-03' },
    { loc: BASE + '/networking-for-founders',        priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/linkedin-alternative',           priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/linkedin-vs-byn',                priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/meetup-alternative',             priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/best-networking-platform-for-founders', priority: '0.9', freq: 'weekly', lastmod: D_CORE },
    { loc: BASE + '/networking-for-entrepreneurs',   priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/networking-for-creators',        priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/networking-for-freelancers',     priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/startup-community-india',        priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/business-networking-app',        priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/networking-for-investors',       priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/find-cofounders',                priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/startup-founders-india',         priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/professional-networking',        priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/build-professional-network',     priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/startup-networking-us',          priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/startup-networking-europe',      priority: '0.9', freq: 'weekly',  lastmod: D_CORE },
    { loc: BASE + '/find-startup-mentor',            priority: '0.9', freq: 'weekly',  lastmod: D_NEW  },
    { loc: BASE + '/angel-investors-india',          priority: '0.9', freq: 'weekly',  lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-events',      priority: '0.8', freq: 'weekly',  lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-uk',          priority: '0.8', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-dubai',       priority: '0.8', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-turkey',      priority: '0.7', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-kenya',       priority: '0.7', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-south-africa',priority: '0.7', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-australia',   priority: '0.8', freq: 'monthly', lastmod: D_NEW  },
    { loc: BASE + '/startup-networking-singapore',   priority: '0.8', freq: 'monthly', lastmod: D_NEW  },
    ...cityUrls,
    ...globalCityUrls,
    ...intentUrls,
    ...globalIntentUrls,
    ...categoryUrls,
    { loc: BASE + '/blog',                           priority: '0.8', freq: 'weekly',  lastmod: D_CORE },
    ...ARTICLES.map(a => ({ loc: BASE + '/blog/' + a.slug, priority: '0.7', freq: 'monthly', lastmod: a.date })),
    { loc: BASE + '/llms.txt',                       priority: '0.5', freq: 'monthly', lastmod: D_CORE },
    { loc: BASE + '/terms',                          priority: '0.3', freq: 'monthly', lastmod: D_UTIL },
    { loc: BASE + '/privacy',                        priority: '0.3', freq: 'monthly', lastmod: D_UTIL },
    { loc: BASE + '/support',                        priority: '0.4', freq: 'monthly', lastmod: D_UTIL },
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url>\n    <loc>' + u.loc + '</loc>\n    <lastmod>' + u.lastmod + '</lastmod>\n    <changefreq>' + u.freq + '</changefreq>\n    <priority>' + u.priority + '</priority>\n  </url>').join('\n') +
    '\n</urlset>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});
app.get('/llms.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'public', 'llms.txt'));
});

app.get('/robots.txt', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const txt = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /app',
    'Disallow: /admin',
    'Disallow: /upgrade',
    '',
    '# AI search crawlers — explicitly allowed for AEO',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: Claude-User',
    'Allow: /',
    '',
    'User-agent: Claude-SearchBot',
    'Allow: /',
    '',
    'User-agent: anthropic-ai',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Perplexity-User',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
    '',
    'User-agent: Meta-ExternalAgent',
    'Allow: /',
    '',
    'User-agent: CCBot',
    'Allow: /',
    '',
    'User-agent: Googlebot',
    'Crawl-delay: 1',
    '',
    'User-agent: Bingbot',
    'Crawl-delay: 1',
    '',
    'Sitemap: ' + BASE + '/sitemap.xml',
  ].join('\n');
  res.send(txt);
});

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// ── PHASE 5 — Crawl budget: X-Robots-Tag on private routes ──────────────────
app.use(['/api', '/app', '/admin', '/upgrade'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// ── PHASE 6 — SEO Measurement: in-memory page view + signup attribution ──────
const seoPageViews = new Map(); // page slug → view count (resets on deploy)
const seoSignups   = new Map(); // page slug → signup count (resets on deploy)

// Cache-Control helper for SEO landing pages (1-hour public cache)
const sendSeoPage = (res, file) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept-Encoding');
  const slug = file.replace('.html', '');
  seoPageViews.set(slug, (seoPageViews.get(slug) || 0) + 1);
  res.sendFile(path.join(__dirname, 'public', file));
};


// AEO + search-intent landing pages
app.get('/networking-for-founders',               (req, res) => sendSeoPage(res, 'networking-for-founders.html'));
app.get('/linkedin-alternative',                  (req, res) => sendSeoPage(res, 'linkedin-alternative.html'));
app.get('/linkedin-vs-byn',                       (req, res) => sendSeoPage(res, 'linkedin-vs-byn.html'));
app.get('/meetup-alternative',                    (req, res) => sendSeoPage(res, 'meetup-alternative.html'));
app.get('/best-networking-platform-for-founders', (req, res) => sendSeoPage(res, 'best-networking-platform-for-founders.html'));
app.get('/networking-for-entrepreneurs', (req, res) => sendSeoPage(res, 'networking-for-entrepreneurs.html'));
app.get('/networking-for-creators',      (req, res) => sendSeoPage(res, 'networking-for-creators.html'));
app.get('/networking-for-freelancers',   (req, res) => sendSeoPage(res, 'networking-for-freelancers.html'));
app.get('/startup-community-india',      (req, res) => sendSeoPage(res, 'startup-community-india.html'));
app.get('/business-networking-app',      (req, res) => sendSeoPage(res, 'business-networking-app.html'));
app.get('/networking-for-investors',     (req, res) => sendSeoPage(res, 'networking-for-investors.html'));
app.get('/find-cofounders',              (req, res) => sendSeoPage(res, 'find-cofounders.html'));
app.get('/startup-founders-india',       (req, res) => sendSeoPage(res, 'startup-founders-india.html'));
app.get('/what-is-byn',                  (req, res) => sendSeoPage(res, 'what-is-byn.html'));
app.get('/intent-based-networking',      (req, res) => sendSeoPage(res, 'intent-based-networking.html'));
app.get('/professional-networking',      (req, res) => sendSeoPage(res, 'professional-networking.html'));
app.get('/build-professional-network',   (req, res) => sendSeoPage(res, 'build-professional-network.html'));
app.get('/startup-networking-us',        (req, res) => sendSeoPage(res, 'startup-networking-us.html'));
app.get('/startup-networking-europe',    (req, res) => sendSeoPage(res, 'startup-networking-europe.html'));
app.get('/find-startup-mentor',              (req, res) => sendSeoPage(res, 'find-startup-mentor.html'));
app.get('/angel-investors-india',            (req, res) => sendSeoPage(res, 'angel-investors-india.html'));
app.get('/startup-networking-events',        (req, res) => sendSeoPage(res, 'startup-networking-events.html'));
app.get('/startup-networking-uk',            (req, res) => sendSeoPage(res, 'startup-networking-uk.html'));
app.get('/startup-networking-dubai',         (req, res) => sendSeoPage(res, 'startup-networking-dubai.html'));
app.get('/startup-networking-turkey',        (req, res) => sendSeoPage(res, 'startup-networking-turkey.html'));
app.get('/startup-networking-kenya',         (req, res) => sendSeoPage(res, 'startup-networking-kenya.html'));
app.get('/startup-networking-south-africa',  (req, res) => sendSeoPage(res, 'startup-networking-south-africa.html'));
app.get('/startup-networking-australia',     (req, res) => sendSeoPage(res, 'startup-networking-australia.html'));
app.get('/startup-networking-singapore',     (req, res) => sendSeoPage(res, 'startup-networking-singapore.html'));

// ── PHASE 4 — Programmatic SEO: City landing pages ──────────────────────────

const CITIES = {
  hyderabad:  { name: 'Hyderabad',    state: 'Telangana',       ecosystem: 'biotech, pharma, IT services, and deep tech',          hubs: 'T-Hub, NASSCOM Hyderabad, and IIT Hyderabad',                          excerpt: "Hyderabad is home to T-Hub, one of Asia's largest startup incubators, and a rapidly growing ecosystem of tech, biotech, and deep-tech startups. The city's top engineering colleges and lower cost of living make it a prime location for early-stage founders." },
  bengaluru:  { name: 'Bengaluru',    state: 'Karnataka',       ecosystem: 'SaaS, AI/ML, fintech, consumer internet, and deep tech', hubs: 'NASSCOM CoE, IISc, IIMB NSRCEL, and a dense VC ecosystem',             excerpt: "Bengaluru is India's Silicon Valley with the highest density of tech startups, angel investors, and VC firms in the country. Its deep talent pool of engineers and product managers makes it the preferred city for technical co-founder search." },
  mumbai:     { name: 'Mumbai',       state: 'Maharashtra',     ecosystem: 'fintech, D2C, media, edtech, and healthcare',           hubs: 'IIT Bombay STP, WeWork Labs, and a large angel investor network',       excerpt: "Mumbai is India's financial capital and home to a thriving fintech and D2C startup ecosystem. The city's access to capital, media networks, and a large consumer market makes it ideal for founders building B2C products." },
  delhi:      { name: 'Delhi / NCR',  state: 'Delhi',           ecosystem: 'edtech, logistics, enterprise SaaS, and e-commerce',   hubs: 'IIT Delhi, NASSCOM 10000 Startups, and Delhi Startup Hub',             excerpt: "Delhi NCR is India's second-largest startup hub — anchored by Gurugram and Noida. The region's access to enterprise clients and government contracts drives its strength in edtech, logistics, and enterprise software." },
  pune:       { name: 'Pune',         state: 'Maharashtra',     ecosystem: 'manufacturing tech, SaaS, automotive, and edtech',     hubs: 'Venture Center, College of Engineering Pune, and Persistent Systems', excerpt: "Pune combines a large student population from top engineering colleges with proximity to Mumbai's capital markets. Strong in manufacturing tech, SaaS, and automotive — increasingly popular with founders seeking lower costs than Bengaluru." },
  chennai:    { name: 'Chennai',      state: 'Tamil Nadu',      ecosystem: 'hardware, deep tech, automotive, and health tech',     hubs: 'IIT Madras Research Park, NASSCOM Chennai, and SIPCOT IT Park',        excerpt: "Chennai has one of India's strongest deep-tech and hardware startup ecosystems, anchored by IIT Madras Research Park. The go-to city for hardware, IoT, automotive tech, and a growing base of SaaS and health-tech founders." },
  kolkata:    { name: 'Kolkata',      state: 'West Bengal',     ecosystem: 'fintech, agritech, social impact, and e-commerce',    hubs: 'IIT Kharagpur, Bengal Startup, and Calcutta Innovation Hub',           excerpt: "Kolkata is an emerging startup hub with strength in fintech, agritech, and social impact ventures. Its lower cost base and proximity to ASEAN markets attract founders building for the next billion users." },
  ahmedabad:  { name: 'Ahmedabad',    state: 'Gujarat',         ecosystem: 'fintech, MSME tech, manufacturing, and agritech',     hubs: 'GUSEC, IIM Ahmedabad CIIE, and GIFT City',                            excerpt: "Ahmedabad is the entrepreneurial capital of Gujarat — a state with the highest density of small-business owners in India. GUSEC and CIIE drive a strong fintech and MSME-tech startup ecosystem." },
  jaipur:     { name: 'Jaipur',       state: 'Rajasthan',       ecosystem: 'travel tech, fashion tech, handicraft e-commerce, and edtech', hubs: 'iStart Rajasthan, IIT Jodhpur, and Jaipur Startup Ecosystem',    excerpt: "Jaipur is India's fastest-growing Tier 2 startup hub with strength in travel tech, fashion tech, and e-commerce for India's craft economy. The iStart Rajasthan program has catalysed hundreds of startups across the state." },
  kochi:      { name: 'Kochi',        state: 'Kerala',          ecosystem: 'tourism tech, sustainability, fintech, and health tech', hubs: 'Kerala Startup Mission (KSUM), Startup Village, and Infopark',       excerpt: "Kochi leads Kerala's startup ecosystem driven by Kerala Startup Mission, one of India's most active state-run startup programs. Strong in sustainability, tourism tech, and fintech with a growing base of climate-tech and health-tech founders." },
  gurgaon:    { name: 'Gurgaon',      state: 'Haryana',         ecosystem: 'fintech, edtech, enterprise SaaS, HR tech, and mobility',hubs: 'Awfis, WeWork Gurgaon, and the Cyber City startup corridor',          excerpt: "Gurgaon (Gurugram) is the corporate and startup spine of Delhi NCR. Home to the India offices of hundreds of global tech companies and a dense network of angel investors, it is the go-to city for B2B SaaS, HR tech, and enterprise founders seeking enterprise sales access." },
  noida:          { name: 'Noida',             state: 'Uttar Pradesh',   ecosystem: 'IT services, gaming, edtech, e-commerce, and media tech',               hubs: 'STPI Noida, Amity University, and the Sector 62 tech corridor',                    excerpt: "Noida is the technology backbone of Delhi NCR, anchored by a dense IT services cluster and a fast-growing startup scene in gaming, edtech, and media tech. Lower real estate costs and proximity to Delhi make it attractive for early-stage and bootstrapped founders." },
  lucknow:        { name: 'Lucknow',           state: 'Uttar Pradesh',   ecosystem: 'edtech, agritech, fintech, and government-tech',                          hubs: 'Startup Incubation Centre LNMIIT, IIM Lucknow, and Lucknow Startup Hub',           excerpt: "Lucknow is Uttar Pradesh's rising startup hub, with a fast-growing community of edtech, agritech, and fintech founders. The state government's startup policy and access to Tier 3 markets make it strategic for founders building for Bharat." },
  chandigarh:     { name: 'Chandigarh',        state: 'Punjab',          ecosystem: 'IT services, health tech, agritech, and clean energy',                   hubs: 'PEC University Startup Hub, IT Park Chandigarh, and STPI Chandigarh',              excerpt: "Chandigarh anchors the Punjab-Haryana startup corridor with a strong IT services base and growing clusters in health tech and agritech. Its planned city infrastructure and high quality of life make it popular with founders building remote-friendly startups." },
  bhopal:         { name: 'Bhopal',            state: 'Madhya Pradesh',  ecosystem: 'agritech, manufacturing tech, smart city solutions, and edtech',         hubs: 'MANIT Bhopal Tech Hub, MP Startup Policy Centre, and IIT Indore satellite',        excerpt: "Bhopal is Madhya Pradesh's startup gateway, with government backing through the MP Startup Policy and a growing agritech ecosystem serving India's largest wheat-producing state. The city's low cost of operations makes it attractive for hardware and deep-tech founders." },
  indore:         { name: 'Indore',            state: 'Madhya Pradesh',  ecosystem: 'manufacturing tech, fintech, MSME digitisation, and agritech',           hubs: 'IIT Indore, Indore Smart City Lab, and NASSCOM Indore Chapter',                    excerpt: "Indore is emerging as central India's startup capital — consistently ranked India's cleanest city and home to a thriving MSME ecosystem ripe for digitisation. Founders building for small-business India and supply-chain tech find strong product-market fit here." },
  nagpur:         { name: 'Nagpur',            state: 'Maharashtra',     ecosystem: 'agritech, logistics, clean energy, and orange economy',                  hubs: 'VNIT Nagpur Incubation Centre, MIHAN Special Economic Zone, and Nagpur Startup Hub', excerpt: "Nagpur sits at India's geographic center and is a critical logistics node. The city is building a strong agritech ecosystem leveraging Maharashtra's orange and cotton belts, while MIHAN SEZ attracts aerospace and logistics tech startups." },
  coimbatore:     { name: 'Coimbatore',        state: 'Tamil Nadu',      ecosystem: 'manufacturing tech, textiles, engineering, and IoT',                     hubs: 'PSG-STEP, CODISSIA, and Amrita School of Business',                                excerpt: "Coimbatore is Tamil Nadu's industrial powerhouse — home to thousands of engineering MSMEs and a fast-growing startup ecosystem in manufacturing tech, IoT, and textiles. The city's strong engineering talent base and manufacturing roots create a unique environment for hardware and deep-tech founders." },
  visakhapatnam:  { name: 'Visakhapatnam',     state: 'Andhra Pradesh',  ecosystem: 'pharma, IT services, blue economy, and logistics',                       hubs: 'Andhra University Tech Park, Vizag Fintech Valley, and GITAM Incubation',          excerpt: "Visakhapatnam (Vizag) is Andhra Pradesh's technology gateway, anchored by Fintech Valley and a large pharma cluster. The city's deep-water port, naval presence, and growing IT sector create opportunities for blue economy, logistics, and pharma-tech founders." },
  patna:          { name: 'Patna',             state: 'Bihar',           ecosystem: 'edtech, agritech, fintech, and rural tech',                              hubs: 'Startup Bihar, IIT Patna Incubation Centre, and Bihar Innovation Lab',             excerpt: "Patna is Bihar's startup launchpad, with a rapidly growing community building for India's next 300 million internet users. Edtech, agritech, and fintech startups targeting Tier 3 and rural markets find strong product-market fit here, with the state government providing active support." },
  surat:          { name: 'Surat',             state: 'Gujarat',         ecosystem: 'diamond tech, textile fintech, MSME digitisation, and logistics',        hubs: 'SVNIT Surat Incubation, Southern Gujarat Chamber of Commerce, and Surat Diamond Bourse', excerpt: "Surat is India's diamond and textile trading capital, generating $30B+ in annual trade. The city's massive MSME base and the new Surat Diamond Bourse are driving demand for fintech, trade tech, and supply-chain digitisation startups." },
  vadodara:       { name: 'Vadodara',          state: 'Gujarat',         ecosystem: 'chemicals, manufacturing tech, industrial IoT, and engineering',         hubs: 'M S University of Baroda Incubation, GIDC Vadodara, and Baroda Startup Hub',       excerpt: "Vadodara is Gujarat's industrial heart — home to India's largest petrochemicals cluster and a strong manufacturing base. The city's engineering talent and established industry make it ideal for founders in industrial IoT, chemicals tech, and B2B manufacturing solutions." },
  nashik:         { name: 'Nashik',            state: 'Maharashtra',     ecosystem: 'agritech, wine and food tech, manufacturing, and engineering',            hubs: 'Nashik Engineering Cluster, Malegaon Startup Centre, and YCMOU Incubation',        excerpt: "Nashik is Maharashtra's agritech frontier — one of India's largest grape and onion producing regions with a growing wine industry. Founders building farm-to-market platforms, agri-fintech, and food-tech products find a natural testing ground here." },
  guwahati:       { name: 'Guwahati',          state: 'Assam',           ecosystem: 'agritech, bamboo tech, tourism tech, and fintech',                       hubs: 'IIT Guwahati TIC, ASTEC Assam, and North East Venture Fund',                      excerpt: "Guwahati is Northeast India's startup hub — strategically located at the gateway to eight states and Southeast Asia. Founders building in agritech (tea, bamboo, silk), tourism tech, and solutions for Northeast India's underserved markets are establishing a first-mover advantage." },
  bhubaneswar:    { name: 'Bhubaneswar',       state: 'Odisha',          ecosystem: 'IT services, mining tech, edtech, and tourism tech',                     hubs: 'iHub Odisha, KIIT TBI, and Startup Odisha',                                        excerpt: "Bhubaneswar is Odisha's rapidly expanding IT hub, home to a large IT services cluster and a government-backed startup ecosystem through Startup Odisha. The city's mining economy, tourism assets, and large student population drive demand for deep-tech and edtech startups." },
  thiruvananthapuram: { name: 'Thiruvananthapuram', state: 'Kerala',    ecosystem: 'space tech, IT services, health tech, and clean energy',                  hubs: 'Kerala Startup Mission, Technopark, and Indian Space Science and Technology Institute', excerpt: "Thiruvananthapuram (Trivandrum) is home to ISRO and Technopark — creating a unique ecosystem of space tech, IT services, and high-science startups. The Kerala Startup Mission provides strong government support, making it one of India's most startup-friendly cities." },
  mysuru:         { name: 'Mysuru',            state: 'Karnataka',       ecosystem: 'IT services, tourism tech, heritage tech, and health tech',               hubs: 'KITS Mysuru, University of Mysore Incubation, and Mysuru Startup Hub',             excerpt: "Mysuru combines a large IT services workforce with a growing startup ecosystem in tourism tech and cultural heritage digitisation. The city's lower costs than Bengaluru and its UNESCO-recognized heritage make it ideal for founders building at the intersection of tech and India's tourism economy." },
  ranchi:         { name: 'Ranchi',            state: 'Jharkhand',       ecosystem: 'mining tech, agritech, tribal economy tech, and edtech',                 hubs: 'IIT ISM Dhanbad, Startup Jharkhand, and XLRI Jamshedpur',                         excerpt: "Ranchi is Jharkhand's startup capital, with an emerging ecosystem building technology for the mining industry, tribal economy, and a large unbanked population. The state's mineral wealth and underserved Tier 3 markets create strong opportunities for impact-tech and fintech founders." },
  kanpur:         { name: 'Kanpur',            state: 'Uttar Pradesh',   ecosystem: 'leather tech, manufacturing, chemical engineering, and MSME digitisation', hubs: 'IIT Kanpur Startup Incubation, HBTU, and UP Startup Hub',                          excerpt: "Kanpur is one of India's oldest industrial cities — home to a massive leather and textile industry now embracing technology. IIT Kanpur's strong research output and the city's MSME base create opportunities for founders in leather tech, manufacturing 4.0, and B2B supply-chain software." },
  amritsar:       { name: 'Amritsar',          state: 'Punjab',          ecosystem: 'tourism tech, agritech, food tech, and cross-border trade',               hubs: 'Guru Nanak Dev University Incubation, Amritsar Smart City Hub, and Punjab Agri Export',  excerpt: "Amritsar is Punjab's spiritual and cultural capital — home to the Golden Temple and a massive domestic and international tourism economy. Founders building in tourism tech, halal food-tech, agri-exports, and border trade technology find a unique market here." },
  ludhiana:       { name: 'Ludhiana',          state: 'Punjab',          ecosystem: 'textile tech, bicycle manufacturing, MSME digitisation, and agritech',   hubs: 'Punjab Agricultural University, FICCI Ludhiana, and Ludhiana Smart City Hub',     excerpt: "Ludhiana is India's largest industrial city in Punjab — producing 95% of India's bicycles and a dominant share of its hosiery. The city's massive MSME base in textiles, engineering goods, and manufacturing is being digitised by a new generation of B2B founders." },
  jodhpur:        { name: 'Jodhpur',           state: 'Rajasthan',       ecosystem: 'handicraft e-commerce, solar energy, tourism tech, and MSME tech',       hubs: 'IIT Jodhpur Incubation, Rajasthan iStart Jodhpur, and MSME Service Institute',    excerpt: "Jodhpur is Rajasthan's Blue City and a hub for handicraft e-commerce, solar energy, and tourism tech. IIT Jodhpur's research output in clean energy and materials science is building a deep-tech cluster, while the city's artisan economy is being digitised by a new wave of e-commerce founders." },
  dehradun:       { name: 'Dehradun',          state: 'Uttarakhand',     ecosystem: 'edtech, tourism tech, sustainability, and defence tech',                  hubs: 'IIT Roorkee (nearby), Doon School Ecosystem, and Uttarakhand Startup Policy Hub',  excerpt: "Dehradun is emerging as a startup hub in the Himalayan foothills, with strength in edtech (driven by premier boarding schools), eco-tourism tech, and defence tech near the Dehradun cantonment. The city attracts founders seeking lower costs and high quality of life." },
  rajkot:         { name: 'Rajkot',            state: 'Gujarat',         ecosystem: 'precision engineering, auto components, MSME tech, and clean energy',     hubs: 'Rajkot Startup Hub, IIIT Vadodara (nearby), and GCCI Rajkot Chapter',             excerpt: "Rajkot is Gujarat's precision engineering capital — producing auto components, machine tools, and castings for global markets. The city's engineering MSME base is creating strong demand for Industry 4.0, quality management, and export-tech startups." },
  udaipur:        { name: 'Udaipur',           state: 'Rajasthan',       ecosystem: 'tourism tech, marble and mining, zinc industry, and handicraft',          hubs: 'Maharana Pratap University Incubation, iStart Udaipur, and Zinc City Startup Hub',  excerpt: "Udaipur — the City of Lakes — sits at the intersection of Rajasthan's zinc mining industry (Hindustan Zinc headquarters) and a thriving luxury tourism economy. Founders building in tourism tech, mining digitisation, and handicraft e-commerce find natural product-market fit here." },
  kota:           { name: 'Kota',              state: 'Rajasthan',       ecosystem: 'edtech, coaching tech, fintech for students, and e-learning',             hubs: 'IIT Bombay Extension Centre, Allen Career Institute, and iStart Kota',             excerpt: "Kota is India's coaching capital — educating over 200,000 students annually for JEE and NEET. This creates a massive edtech and student-fintech opportunity. Founders building edtech platforms, mental health tools for students, and coaching-tech solutions have a natural testing ground here." },
  madurai:        { name: 'Madurai',           state: 'Tamil Nadu',      ecosystem: 'textile tech, agritech, tourism tech, and manufacturing',                 hubs: 'NIT Tiruchirappalli (nearby), Madurai Kamaraj University Incubation, and TIDCO',   excerpt: "Madurai is Tamil Nadu's cultural capital and a significant manufacturing and agricultural hub. The city's textile industry, jasmine economy, and proximity to agriculture create strong opportunities for founders building in agri-fintech, textile tech, and religious tourism technology." },
  vijayawada:     { name: 'Vijayawada',        state: 'Andhra Pradesh',  ecosystem: 'logistics, agritech, fintech, and MSME tech',                            hubs: 'Andhra Pradesh Innovation Society, SRM University AP, and APSSDC Innovation',     excerpt: "Vijayawada is Andhra Pradesh's commercial capital, positioned at the heart of the state's agricultural and logistics corridor. The city's APSSDC innovation ecosystem and access to AP's massive agricultural output create strong opportunities for agri-fintech, cold chain, and logistics tech founders." },
  mangaluru:      { name: 'Mangaluru',         state: 'Karnataka',       ecosystem: 'banking tech, cashew and seafood export, IT services, and port logistics', hubs: 'NITK Surathkal, Manipal Academy of Higher Education, and Mangaluru Startup Hub',  excerpt: "Mangaluru is the banking tech capital of coastal Karnataka — home to headquarters of major cooperative banks and the financial services sector. The city's strong engineering colleges (NITK, Manipal), seafood and cashew export economy, and port infrastructure create unique opportunities for founders in fintech and trade tech." },
  agra:           { name: 'Agra',              state: 'Uttar Pradesh',   ecosystem: 'tourism tech, leather goods, handicraft e-commerce, and cultural heritage', hubs: 'Agra Smart City Hub, FICCI UP Agra Chapter, and Dr. Bhimrao Ambedkar University', excerpt: "Agra is India's most visited city — home to the Taj Mahal and a massive handicraft and leather economy. Founders building in tourism tech, handicraft e-commerce, and heritage preservation technology find a natural laboratory here, serving 7+ million annual visitors." },
  varanasi:       { name: 'Varanasi',          state: 'Uttar Pradesh',   ecosystem: 'religious tourism tech, handicraft e-commerce, edtech, and silk industry', hubs: 'IIT BHU, Banaras Hindu University Incubation, and UP Startup Hub Varanasi',       excerpt: "Varanasi is one of the world's oldest living cities — attracting 8+ million pilgrims annually and home to a rich silk weaving tradition. IIT BHU's strong research output and the city's unique position at the intersection of spirituality, culture, and commerce create distinct startup opportunities." },
  raipur:         { name: 'Raipur',            state: 'Chhattisgarh',    ecosystem: 'mining tech, agritech, steel industry tech, and tribal economy',          hubs: 'IIT Bhilai, NIT Raipur Incubation, and Chhattisgarh Startup Mission',            excerpt: "Raipur is the steel capital of India's heartland — anchored by a massive steel and mining industry alongside one of India's most tribal-community-rich states. Founders building in industrial IoT, mining tech, tribal economy digitisation, and agritech serving Chhattisgarh's rice bowl find strong local demand." },
  trichy:         { name: 'Tiruchirappalli',   state: 'Tamil Nadu',      ecosystem: 'aerospace and defence, manufacturing, engineering, and religious tourism', hubs: 'NIT Tiruchirappalli, Anna University Regional Campus, and BHEL Trichy Incubation', excerpt: "Tiruchirappalli (Trichy) is Tamil Nadu's aerospace and manufacturing hub — home to BHEL's largest plant and NIT Trichy, one of India's top engineering colleges. The city's aerospace ecosystem, strong engineering talent, and role as a major religious tourism destination (Srirangam) create opportunities across deep-tech and tourism sectors." }
};

// Top 10 Indian cities — always indexed. All other Indian city pages get noindex to preserve crawl budget.
const TOP_CITIES = new Set(['bengaluru','mumbai','delhi','hyderabad','pune','chennai','gurgaon','noida','kochi','jaipur']);

// ── US CITIES ────────────────────────────────────────────────────────────────
const US_CITIES = {
  sanfrancisco: { name: 'San Francisco', region: 'California', ecosystem: 'AI/ML, SaaS, fintech, consumer apps, and deep tech', hubs: 'Y Combinator, Andreessen Horowitz, First Round Capital, and the Caltrain corridor', excerpt: "San Francisco is the world's premier startup ecosystem — home to Y Combinator, the highest density of venture capital on Earth, and a talent pool of engineers, designers, and product leaders who have built products used by billions. It's the benchmark city for AI/ML, SaaS, and consumer technology.", geoRegion: 'US-CA', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  newyork:      { name: 'New York City', region: 'New York', ecosystem: 'fintech, media tech, real estate tech, adtech, and enterprise SaaS', hubs: 'Insight Partners, Bessemer Venture Partners, NYC SeedStart, and Cornell Tech', excerpt: "New York City is the largest startup ecosystem on the US East Coast and the world's fintech capital. Its proximity to Wall Street, major media companies, and an unmatched talent pool across finance, design, and marketing make it the top city for fintech, media tech, and real estate technology startups.", geoRegion: 'US-NY', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  austin:       { name: 'Austin', region: 'Texas', ecosystem: 'SaaS, energy tech, semiconductor design, crypto/Web3, and defence tech', hubs: 'Capital Factory, Silicon Hills VC network, UT Austin, and the Dell Medical School Innovation Hub', excerpt: "Austin has become the fastest-growing tech hub in the United States, fuelled by the migration of companies and founders from Silicon Valley. Capital Factory anchors a vibrant SaaS and energy-tech ecosystem, while SXSW provides the largest annual startup gathering in North America. Texas's zero state income tax and lower cost of living are accelerating founder migration.", geoRegion: 'US-TX', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  boston:       { name: 'Boston', region: 'Massachusetts', ecosystem: 'biotech, medtech, robotics, edtech, and deep tech', hubs: 'MIT, Harvard, Mass General Brigham Innovation Hub, and Flagship Pioneering', excerpt: "Boston is America's deepest science and technology ecosystem — anchored by MIT and Harvard, which produce more startup founders per capita than any other universities in the world. The city's biotech cluster in Kendall Square is the most concentrated biotech ecosystem globally, and its robotics, medtech, and climate-tech sectors are world-leading.", geoRegion: 'US-MA', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  seattle:      { name: 'Seattle', region: 'Washington', ecosystem: 'cloud computing, enterprise SaaS, e-commerce, gaming, and biotech', hubs: 'Madrona Venture Group, Pioneer Square Labs, University of Washington CoMotion, and Allen Institute', excerpt: "Seattle is the cloud-computing capital of the world — home to Amazon Web Services and Microsoft Azure, the two dominant platforms powering the global software economy. This creates an unmatched ecosystem for enterprise SaaS and cloud-native startups, supported by a deep pool of senior engineers from Amazon, Microsoft, and Expedia.", geoRegion: 'US-WA', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  losangeles:   { name: 'Los Angeles', region: 'California', ecosystem: 'creator economy, entertainment tech, e-commerce, consumer apps, and fintech', hubs: 'Upfront Ventures, Crosscut, UCLA, USC Marshall Greif Center, and the Venice Beach tech corridor', excerpt: "Los Angeles is the world's creator economy hub — the intersection of entertainment, technology, and culture that no other city can replicate. Its startup ecosystem spans entertainment tech, influencer commerce, consumer apps, and a rapidly growing fintech and health-tech sector. The city's proximity to Hollywood and the music industry creates unique opportunities in content technology.", geoRegion: 'US-CA', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  chicago:      { name: 'Chicago', region: 'Illinois', ecosystem: 'enterprise SaaS, fintech, food tech, logistics, and industrial tech', hubs: 'JUMP Investors, Hyde Park Angels, 1871 tech hub, and the University of Chicago Polsky Center', excerpt: "Chicago is the Midwest's largest startup hub and the heart of the US B2B software ecosystem. Its deep roots in finance, commodities trading, and logistics have produced world-class startups in enterprise software, fintech, and supply-chain technology. 1871, the city's flagship tech incubator, anchors a thriving community of over 400 startups.", geoRegion: 'US-IL', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  miami:        { name: 'Miami', region: 'Florida', ecosystem: 'crypto/Web3, fintech, Latin America tech bridge, real estate tech, and healthcare', hubs: 'Founders Fund Miami, Backdrop, Endeavor Miami, and the Wynwood tech corridor', excerpt: "Miami has emerged as a top-five US startup hub, driven by a mass migration of crypto founders, fintech companies, and venture capital from New York and Silicon Valley. The city's position as the gateway to Latin America creates unique opportunities in cross-border fintech, logistics, and consumer tech. Florida's zero state income tax and an aggressively pro-startup policy have accelerated the transformation.", geoRegion: 'US-FL', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  denver:       { name: 'Denver', region: 'Colorado', ecosystem: 'health tech, aerospace, outdoor tech, SaaS, and clean energy', hubs: 'Techstars (HQ), Boomtown, CU Boulder Silicon Flatirons, and Denver Startup Week network', excerpt: "Denver is one of America's fastest-growing tech cities — home to Techstars' global headquarters and a thriving ecosystem of health-tech, aerospace, and SaaS startups. The city's access to federal government contracts, proximity to major research universities, and exceptional quality of life make it a magnet for founders leaving San Francisco and New York.", geoRegion: 'US-CO', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
  atlanta:      { name: 'Atlanta', region: 'Georgia', ecosystem: 'fintech, supply chain tech, enterprise software, health tech, and media', hubs: 'Atlanta Tech Village, Georgia Tech CREATE-X, Invest Atlanta, and the Ponce City Market tech hub', excerpt: "Atlanta is the fintech capital of the United States — processing over 70% of all US payment transactions through companies headquartered in the city. Its Georgia Tech ecosystem produces world-class engineers and startup founders, while a growing cluster of enterprise software, supply-chain tech, and healthcare IT companies have established Atlanta as the dominant Southeastern US startup hub.", geoRegion: 'US-GA', locale: 'en_US', currency: 'USD', countryName: 'United States', hubPage: 'startup-networking-us', hubLabel: 'Startup Networking US' },
};

// ── EU CITIES ─────────────────────────────────────────────────────────────────
const EU_CITIES = {
  london:      { name: 'London', region: 'United Kingdom', ecosystem: 'fintech, AI/ML, healthtech, deep tech, and enterprise software', hubs: 'Sequoia Capital Europe, Index Ventures, Silicon Roundabout (Tech City), and Imperial College London', excerpt: "London is Europe's largest and most globally connected startup ecosystem — the continent's fintech capital and home to more unicorns than any other European city. Its access to international talent, deep capital markets, and proximity to major global enterprises make it the default base for European startups targeting global expansion. The Tech City corridor between Old Street and Shoreditch anchors a dense network of AI, fintech, and SaaS companies.", geoRegion: 'GB', locale: 'en_GB', currency: 'GBP', countryName: 'United Kingdom', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  berlin:      { name: 'Berlin', region: 'Germany', ecosystem: 'mobility tech, climate tech, e-commerce, SaaS, and Web3', hubs: 'Point Nine Capital, Project A, Rocket Internet, Factory Berlin, and HU Berlin', excerpt: "Berlin is Europe's startup capital by volume — home to more early-stage companies than any other European city. Its creative culture, lower cost of living compared to London, and an influx of international founder talent have produced breakout companies across mobility (Tier), climate tech (Enpal), and e-commerce (Zalando, HelloFresh). Factory Berlin anchors the most active co-working and VC ecosystem in continental Europe.", geoRegion: 'DE', locale: 'de_DE', currency: 'EUR', countryName: 'Germany', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  amsterdam:   { name: 'Amsterdam', region: 'Netherlands', ecosystem: 'adtech, travel tech, fintech, sustainability, and logistics', hubs: 'Adyen, Booking.com ecosystem, Startupbootcamp, and Amsterdam Science Park', excerpt: "Amsterdam is Europe's tech and logistics gateway — home to Adyen (global fintech leader), Booking.com (the world's largest travel platform), and ASML (semiconductor equipment). The city's startup ecosystem benefits from exceptional international connectivity, English-language operations, and a government actively supporting innovation through programs like TechLeap.nl.", geoRegion: 'NL', locale: 'nl_NL', currency: 'EUR', countryName: 'Netherlands', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  stockholm:   { name: 'Stockholm', region: 'Sweden', ecosystem: 'gaming, music tech, fintech, SaaS, and climate tech', hubs: 'EQT Ventures, Creandum, Spotify ecosystem, KTH Royal Institute, and STING incubator', excerpt: "Stockholm is Europe's unicorn factory — producing more unicorns per capita than any city outside Silicon Valley. Spotify, Klarna, Mojang, King, and iZettle all originated here. The city's world-class engineering education (KTH, Chalmers), strong social safety net that enables risk-taking, and a culture of design-led product thinking have created a startup ecosystem that consistently punches far above its weight.", geoRegion: 'SE', locale: 'sv_SE', currency: 'EUR', countryName: 'Sweden', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  paris:       { name: 'Paris', region: 'France', ecosystem: 'AI/ML, fashion tech, food tech, luxury tech, and enterprise SaaS', hubs: "Station F (world's largest startup campus), Xavier Niel ecosystem, Partech Ventures, and École Polytechnique", excerpt: "Paris has transformed into a global startup powerhouse, anchored by Station F — the world's largest startup campus with 1,000 resident startups. President Macron's La French Tech initiative and a reformed talent visa program have made Paris the most internationally ambitious startup hub in continental Europe. Its AI research cluster, luxury-tech capabilities, and deep enterprise sales market make it Europe's fastest-rising challenger to London.", geoRegion: 'FR', locale: 'fr_FR', currency: 'EUR', countryName: 'France', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  dublin:      { name: 'Dublin', region: 'Ireland', ecosystem: 'enterprise SaaS, fintech, cloud infrastructure, pharma tech, and cybersecurity', hubs: 'Enterprise Ireland, NDRC, Silicon Docks (Google, Meta, Stripe), and Trinity College Dublin', excerpt: "Dublin is Europe's Silicon Valley annex — the European headquarters of Google, Meta, LinkedIn, Stripe, and dozens of the world's largest tech companies. This corporate concentration creates an unmatched talent ecosystem and a strong pipeline of experienced operators spinning out to found startups. Enterprise Ireland's active startup support and Ireland's competitive corporate tax rate make Dublin one of the most commercially attractive startup locations in Europe.", geoRegion: 'IE', locale: 'en_IE', currency: 'EUR', countryName: 'Ireland', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  barcelona:   { name: 'Barcelona', region: 'Spain', ecosystem: 'travel tech, IoT/smart cities, marketplace, mobile tech, and sustainability', hubs: 'Wayra (Telefónica), Lanzadera, Barcelona Tech City, and UPC (Universitat Politècnica de Catalunya)', excerpt: "Barcelona is Europe's Mediterranean startup hub — the largest tech ecosystem in Southern Europe and host of Mobile World Congress, the world's biggest mobile technology event. The city's strength in travel tech (Skyscanner, eDreams), IoT, and smart-city technology is complemented by a thriving marketplace and creator economy ecosystem. Its combination of top European engineering talent, warm climate, and lower costs than London attract founders from across Europe.", geoRegion: 'ES', locale: 'es_ES', currency: 'EUR', countryName: 'Spain', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  helsinki:    { name: 'Helsinki', region: 'Finland', ecosystem: 'gaming, health tech, edtech, climate tech, and deep tech', hubs: "Slush (Europe's largest startup event), FCAI, Aalto University, and Maria 01 startup campus", excerpt: "Helsinki produces more gaming companies per capita than anywhere on Earth — Rovio, Supercell, and Remedy Entertainment all emerged from its ecosystem. Slush, the annual Helsinki startup conference, has become Europe's most important founder-investor networking event. Finland's engineering culture and government innovation funding (Business Finland) create deep advantages in health tech, cleantech, and deep-tech startups.", geoRegion: 'FI', locale: 'fi_FI', currency: 'EUR', countryName: 'Finland', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
  zurich:      { name: 'Zurich', region: 'Switzerland', ecosystem: 'fintech, blockchain/crypto, health tech, deep tech, and enterprise software', hubs: 'ETH Zurich, Innosuisse, Crypto Valley Zug, and F10 fintech accelerator', excerpt: "Zurich is Europe's financial technology capital and home to ETH Zurich, one of the world's leading engineering universities. The Crypto Valley in nearby Zug is the global epicentre of blockchain and Web3 development. Switzerland's political stability, access to global capital, and research depth in quantum computing and biotech make Zurich the premier location for deep-tech and fintech founders.", geoRegion: 'CH', locale: 'de_CH', currency: 'CHF', countryName: 'Switzerland', hubPage: 'startup-networking-europe', hubLabel: 'Startup Networking Europe' },
};

// SEO page metadata for /api/admin/seo (defined after CITIES so city pages auto-populate)
const SEO_PAGES = [
  // ── Core brand pages ──
  { slug: '',                             label: 'Homepage',                   schema: 'WebSite+SoftwareApplication+FAQPage', priority: '1.0' },
  { slug: 'what-is-byn',                 label: 'What is BYN',                schema: 'WebPage+FAQPage',                     priority: '1.0' },
  { slug: 'intent-based-networking',     label: 'Intent-Based Networking',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  // ── High-intent landing pages ──
  { slug: 'networking-for-founders',      label: 'Networking for Founders',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'linkedin-alternative',         label: 'LinkedIn Alternative',       schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'best-networking-platform-for-founders', label: 'Best Networking Platform', schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.9' },
  { slug: 'networking-for-entrepreneurs', label: 'Networking for Entrepreneurs',schema: 'WebPage+FAQPage+BreadcrumbList',      priority: '0.9' },
  { slug: 'startup-community-india',      label: 'Startup Community India',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'find-cofounders',              label: 'Find Co-founders',           schema: 'WebPage+HowTo+FAQPage+BreadcrumbList', priority: '0.9' },
  { slug: 'professional-networking',      label: 'Professional Networking',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'build-professional-network',   label: 'Build Professional Network', schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'find-startup-mentor',          label: 'Find Startup Mentor',        schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'angel-investors-india',        label: 'Angel Investors India',      schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'linkedin-vs-byn',             label: 'LinkedIn vs BYN',            schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'meetup-alternative',           label: 'Meetup Alternative',         schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'networking-for-creators',      label: 'Networking for Creators',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'networking-for-freelancers',   label: 'Networking for Freelancers', schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'business-networking-app',      label: 'Business Networking App',    schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'networking-for-investors',     label: 'Networking for Investors',   schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-founders-india',       label: 'Startup Founders India',     schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-networking-events',    label: 'Startup Networking Events',  schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  // ── International hub pages ──
  { slug: 'startup-networking-us',        label: 'Startup Networking US',      schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'startup-networking-europe',    label: 'Startup Networking Europe',  schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.9' },
  { slug: 'startup-networking-uk',        label: 'Startup Networking UK',      schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-networking-australia', label: 'Startup Networking AU',      schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-networking-singapore', label: 'Startup Networking SG',      schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-networking-dubai',     label: 'Startup Networking Dubai',   schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.8' },
  { slug: 'startup-networking-kenya',     label: 'Startup Networking Kenya',   schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.7' },
  { slug: 'startup-networking-south-africa', label: 'Startup Networking ZA',   schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.7' },
  { slug: 'startup-networking-turkey',    label: 'Startup Networking Turkey',  schema: 'WebPage+FAQPage+BreadcrumbList',       priority: '0.7' },
  // ── Programmatic: Indian city hub pages ──
  ...Object.keys(CITIES).map(s => ({
    slug: 'networking-in-' + s,
    label: 'Networking in ' + CITIES[s].name,
    schema: 'WebPage+FAQPage+BreadcrumbList',
    priority: '0.8',
  })),
  // ── Programmatic: Indian city intent pages (6 patterns) ──
  ...Object.keys(CITIES).map(s => ({ slug: 'founders-in-' + s,              label: 'Founders in ' + CITIES[s].name,           schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.7' })),
  ...Object.keys(CITIES).map(s => ({ slug: 'startup-founders-' + s,         label: 'Startup Founders ' + CITIES[s].name,       schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.7' })),
  ...Object.keys(CITIES).map(s => ({ slug: 'find-cofounders-' + s,          label: 'Find Co-founders ' + CITIES[s].name,       schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.7' })),
  ...Object.keys(CITIES).map(s => ({ slug: 'startup-networking-' + s,       label: 'Startup Networking ' + CITIES[s].name,     schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.7' })),
  ...Object.keys(CITIES).map(s => ({ slug: 'professional-networking-' + s,  label: 'Professional Networking ' + CITIES[s].name,schema: 'WebPage+FAQPage+BreadcrumbList', priority: '0.7' })),
];
// Category × city pages pushed after CATEGORY_SLUGS is defined (line ~2547)

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateCityPage(slug, city, BASE) {
  const title  = `Professional Networking in ${city.name} — Build Your Network`;
  const metaDesc = `Build your professional network in ${city.name}. Connect with founders, mentors, freelancers, and career professionals by declared intent — not job title. Free, no install required.`;
  const canonical = `${BASE}/networking-in-${slug}`;
  const otherCityLinks = Object.keys(CITIES).filter(k => k !== slug)
    .map(k => `<a href="/networking-in-${k}">${escHtml(CITIES[k].name)}</a>`).join('\n        ');

  const faqs = [
    {
      q: `What is the best professional networking app in ${city.name}?`,
      a: `Build Your Network (BYN) is the best intent-based professional networking app in ${city.name}. It connects you with the right people — founders, freelancers, mentors, investors, and career professionals — based on what you are actively looking for, not your job history. GPS-based discovery, free, no install required.`
    },
    {
      q: `Who uses Build Your Network in ${city.name}?`,
      a: `BYN is used by startup founders, freelancers and consultants, professionals changing careers, remote workers seeking community, experienced operators open to mentoring, and anyone who wants to build genuine professional relationships in ${city.name} based on shared goals — not cold outreach.`
    },
    {
      q: `Are there mentors, investors, and collaborators in ${city.name} on Build Your Network?`,
      a: `Yes. Investors, mentors, freelancers, and experienced operators in ${city.name} use Build Your Network to find their next opportunity or give back. They set their intent explicitly — 'Open to Advising', 'Angel Investing', 'Hiring', 'Freelance Available' — so you always know who is open and to what.`
    },
    {
      q: `What professional ecosystem exists in ${city.name}?`,
      a: `${city.name}'s professional ecosystem is strong in ${city.ecosystem}. Key institutions include ${city.hubs}. ${city.excerpt}`
    },
    {
      q: `How does Build Your Network work in ${city.name}?`,
      a: `Professionals in ${city.name} create a free profile on Build Your Network, declare their intent — co-founder search, freelance work, career change, mentorship, or collaboration — and enable GPS-based location discovery. BYN surfaces people within their chosen radius who have declared matching intent. Both parties see each other's goals before the first message, making every introduction purposeful.`
    },
    {
      q: `Is Build Your Network free in ${city.name}?`,
      a: `Yes. Build Your Network is free in ${city.name} — 30 daily connection requests, direct messaging, and location-based discovery at no cost. No install required; works in your mobile browser. Premium plans unlock unlimited daily connections and priority visibility.`
    }
  ];

  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        'name': title,
        'url': canonical,
        'description': metaDesc,
        'inLanguage': 'en-IN',
        'speakable': { '@type': 'SpeakableSpecification', 'cssSelector': ['.direct-answer'] },
        'breadcrumb': {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE + '/' },
            { '@type': 'ListItem', 'position': 2, 'name': 'Startup Community India', 'item': BASE + '/startup-community-india' },
            { '@type': 'ListItem', 'position': 3, 'name': `Networking in ${city.name}`, 'item': canonical }
          ]
        }
      },
      {
        '@type': 'FAQPage',
        'mainEntity': faqs.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } }))
      }
    ]
  });

  const faqHtml = faqs.map((f, i) => `
      <details class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <summary itemprop="name">${escHtml(f.q)}</summary>
        <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
          <p itemprop="text">${escHtml(f.a)}</p>
        </div>
      </details>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0F766E">
  <title>${escHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://www.googletagmanager.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="/assets/logo.png" type="image/png">
  <link rel="canonical" href="${escHtml(canonical)}">
  <meta name="description" content="${escHtml(metaDesc)}">
  <meta name="robots" content="${TOP_CITIES.has(slug) ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow'}">
  <meta name="geo.region" content="IN">
  <meta name="geo.placename" content="${escHtml(city.name)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escHtml(canonical)}">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(metaDesc)}">
  <meta property="og:image" content="${BASE}/assets/logo.png">
  <meta property="og:image:alt" content="Build Your Network — founder networking in ${escHtml(city.name)}">
  <meta property="og:site_name" content="Build Your Network">
  <meta property="og:locale" content="en_IN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(metaDesc)}">
  <meta name="twitter:image" content="${BASE}/assets/logo.png">
  <meta name="twitter:site" content="@buildyournetwork">
  <script type="application/ld+json">${faqJsonLd}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Build Your Network","alternateName":"BYN","url":"${BASE}","applicationCategory":"BusinessApplication","operatingSystem":"Android, Web","inLanguage":"en-IN","description":"Free intent-based professional networking platform for founders, freelancers, career professionals, mentors, and investors in India.","offers":{"@type":"Offer","price":"0","priceCurrency":"INR","availability":"https://schema.org/InStock"}},{"@type":"Organization","name":"Build Your Network","alternateName":"BYN","url":"${BASE}","logo":{"@type":"ImageObject","url":"${BASE}/assets/logo.png","width":512,"height":512},"foundingDate":"2024","areaServed":"IN","contactPoint":{"@type":"ContactPoint","contactType":"Customer Support","email":"support@buildyournetwork.online"}}]}</script>
  <style>
    :root{--bg:#FFF4EC;--bg-secondary:#FDE8D7;--card:#FFFFFF;--primary:#0F766E;--highlight:#CCFBF1;--text:#1F2937;--text-secondary:#6B7280;--text-muted:#9CA3AF}
    *{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
    body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(253,232,215,.6)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
    .logo img{width:26px;height:26px;border-radius:6px}
    .nav-cta{background:var(--primary);color:white;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
    .page-wrap{max-width:860px;margin:0 auto;padding:100px 24px 80px}
    .breadcrumb{font-size:13px;color:var(--text-muted);margin-bottom:32px}.breadcrumb a{color:var(--primary);text-decoration:none}
    .tag{display:inline-block;background:var(--highlight);color:var(--primary);font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;margin-bottom:16px;letter-spacing:.02em;text-transform:uppercase}
    h1{font-size:clamp(28px,4.5vw,44px);font-weight:800;line-height:1.15;letter-spacing:-1px;margin-bottom:20px}h1 span{color:var(--primary)}
    .lead{font-size:18px;color:var(--text-secondary);line-height:1.7;margin-bottom:36px;max-width:680px}
    .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:36px}
    .btn-p{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--primary);color:white;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px}
    .btn-s{display:inline-flex;align-items:center;gap:8px;padding:14px 24px;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;border:2px solid var(--primary)}
    .quick-answer{background:#f0fdf9;border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:48px;font-size:15px;line-height:1.75;color:var(--text)}
    .quick-answer strong{color:var(--primary)}
    .know-block{background:var(--card);border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:24px 28px;margin-bottom:64px}
    .know-block h2{font-size:18px;font-weight:700;margin-bottom:12px}
    .know-block p{font-size:15px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px}.know-block p:last-child{margin-bottom:0}
    .section-h2{font-size:clamp(22px,3vw,30px);font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
    .section-sub{font-size:16px;color:var(--text-secondary);margin-bottom:32px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-bottom:64px}
    .card{background:var(--card);border:1px solid var(--bg-secondary);border-radius:16px;padding:22px}
    .card-icon{font-size:26px;margin-bottom:10px}.card h3{font-size:15px;font-weight:700;margin-bottom:6px}
    .card p{font-size:13px;color:var(--text-secondary);line-height:1.55}
    .eco-block{background:var(--bg-secondary);border-radius:16px;padding:28px;margin-bottom:64px}
    .eco-block h3{font-size:16px;font-weight:700;margin-bottom:10px}
    .eco-block p{font-size:14px;color:var(--text-secondary);line-height:1.7}
    .eco-meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}
    .eco-meta span{font-size:12px;font-weight:600;color:var(--primary);background:var(--card);padding:4px 10px;border-radius:6px}
    details.faq-item{border:1px solid var(--bg-secondary);border-radius:12px;margin-bottom:10px;overflow:hidden}
    details.faq-item summary{padding:18px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:var(--card)}
    details.faq-item summary::-webkit-details-marker{display:none}
    details.faq-item summary::after{content:'+';font-size:20px;color:var(--primary);font-weight:400;flex-shrink:0;margin-left:12px}
    details[open].faq-item summary::after{content:'−'}
    details.faq-item div{padding:0 20px 18px;background:var(--card);font-size:14px;color:var(--text-secondary);line-height:1.7}
    .faq-section{margin-bottom:64px}
    .city-links{background:var(--bg-secondary);border-radius:16px;padding:28px;margin-bottom:64px}
    .city-links h3{font-size:15px;font-weight:700;margin-bottom:14px}
    .city-links a{display:inline-block;background:var(--card);color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border-radius:8px;margin:4px 4px 4px 0;border:1px solid rgba(15,118,110,.15)}
    .page-links{background:var(--card);border:1px solid var(--bg-secondary);border-radius:16px;padding:24px;margin-bottom:64px}
    .page-links h3{font-size:15px;font-weight:700;margin-bottom:14px}
    .page-links a{display:inline-block;color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border-radius:8px;margin:4px 4px 4px 0;background:var(--bg);border:1px solid var(--bg-secondary)}
    .cta-block{background:var(--primary);border-radius:20px;padding:48px 40px;text-align:center;color:white;margin-bottom:64px}
    .cta-block h2{font-size:clamp(20px,3vw,28px);font-weight:800;margin-bottom:12px}
    .cta-block p{font-size:15px;opacity:.85;margin-bottom:24px}
    .cta-block .btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:white;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:700;font-size:15px}
    footer{border-top:1px solid var(--bg-secondary);padding:32px 24px;text-align:center}
    footer p{font-size:13px;color:var(--text-muted)}footer a{color:var(--primary);text-decoration:none}
    @media(max-width:640px){.page-wrap{padding:80px 16px 60px}.cta-block{padding:32px 20px}}
  </style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network" loading="lazy">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>

<div class="page-wrap">
  <p class="breadcrumb"><a href="/">Home</a> › <a href="/startup-community-india">Startup Community India</a> › ${escHtml(city.name)}</p>
  <span class="tag">${escHtml(city.name)} · ${escHtml(city.state)}</span>
  <h1>Build Your <span>Professional Network</span> in ${escHtml(city.name)}</h1>
  <p class="lead">Build Your Network is the free intent-based networking platform for professionals in ${escHtml(city.name)}. Whether you are a founder seeking a co-founder, a freelancer finding clients, a professional changing careers, or an expert open to mentoring — connect with the right people based on what you actually want.</p>
  <div class="cta-row">
    <a href="/signup" class="btn-p">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      Start Networking in ${escHtml(city.name)} — Free
    </a>
    <a href="#faq" class="btn-s">How it works</a>
  </div>

  <section class="quick-answer" aria-label="Quick answer">
    <p><strong>Build Your Network (BYN)</strong> is the free intent-based professional networking platform in ${escHtml(city.name)}, ${escHtml(city.state)}. It connects founders, freelancers, career professionals, mentors, and investors based on declared intent — with GPS-based discovery across ${escHtml(city.name)}. No app install required.</p>
  </section>

  <div class="know-block">
    <h2>Professional networking in ${escHtml(city.name)} — how it works</h2>
    <p>${escHtml(city.excerpt)}</p>
    <p>Build Your Network connects ${escHtml(city.name)}'s professional community by intent. Whether you are a founder seeking a co-founder, a freelancer finding clients, a professional changing careers, or an expert open to mentoring — set your intent and the platform surfaces the right people within your chosen radius. Both parties see each other's goals before the first message, making every introduction count.</p>
    <p>Free to join. Works in your browser. No app install required. GPS-based discovery within ${escHtml(city.name)}: 10 km, 50 km, 200 km, or all of India.</p>
  </div>

  <h2 class="section-h2">Who you will find in ${escHtml(city.name)} on BYN</h2>
  <p class="section-sub">Every type of professional connection — filtered by what they actually want.</p>
  <div class="cards">
    <div class="card">
      <div class="card-icon">🤝</div>
      <h3>Co-Founders &amp; Collaborators</h3>
      <p>Founders and builders in ${escHtml(city.name)} actively looking for complementary partners — technical, business, creative — within your chosen radius.</p>
    </div>
    <div class="card">
      <div class="card-icon">💼</div>
      <h3>Freelancers &amp; Consultants</h3>
      <p>Independent professionals in ${escHtml(city.name)} who have declared they are open to new projects and clients. Filter by skill and proximity.</p>
    </div>
    <div class="card">
      <div class="card-icon">🎓</div>
      <h3>Mentors &amp; Advisors</h3>
      <p>Experienced operators in ${escHtml(city.name)} who are open to advising. Filter by 'Open to Advising' intent to find the right guide for your goals.</p>
    </div>
    <div class="card">
      <div class="card-icon">💰</div>
      <h3>Investors</h3>
      <p>Investors in ${escHtml(city.name)} who have declared they are actively looking for early-stage deals. No cold introductions — both sides show intent upfront.</p>
    </div>
  </div>

  <div class="eco-block">
    <h3>${escHtml(city.name)} Startup Ecosystem</h3>
    <p>${escHtml(city.excerpt)}</p>
    <div class="eco-meta">
      <span>📍 ${escHtml(city.name)}, ${escHtml(city.state)}</span>
      <span>🏭 ${escHtml(city.ecosystem)}</span>
      <span>🏛 ${escHtml(city.hubs)}</span>
    </div>
  </div>

  <div class="faq-section" id="faq">
    <h2 class="section-h2">Professional Networking in ${escHtml(city.name)} — FAQ</h2>
    <p class="section-sub">Common questions from professionals looking to build meaningful connections in ${escHtml(city.name)}.</p>
    <div itemscope itemtype="https://schema.org/FAQPage">${faqHtml}
    </div>
  </div>

  <div class="city-links">
    <h3>Networking in other Indian cities</h3>
    ${otherCityLinks}
  </div>

  <div class="page-links">
    <h3>More founder resources</h3>
    <a href="/networking-for-founders">Networking for Founders</a>
    <a href="/find-cofounders">How to Find a Co-Founder</a>
    <a href="/startup-community-india">Startup Community India</a>
    <a href="/linkedin-alternative">LinkedIn Alternative</a>
    <a href="/linkedin-vs-byn">LinkedIn vs BYN</a>
    <a href="/meetup-alternative">Meetup Alternative</a>
    <a href="/best-networking-platform-for-founders">Best Networking Platform</a>
    <a href="/networking-for-investors">Networking for Investors</a>
    <a href="/find-cofounders-${slug}">Find Co-founders in ${escHtml(city.name)}</a>
    <a href="/founders-in-${slug}">Startup Founders in ${escHtml(city.name)}</a>
    <a href="/startup-networking-${slug}">Startup Networking ${escHtml(city.name)}</a>
  </div>

  <div class="cta-block">
    <h2>Start building your network in ${escHtml(city.name)}</h2>
    <p>Join Build Your Network free. Declare your intent. Meet the right people. GPS-based discovery across ${escHtml(city.name)} and all of India.</p>
    <a href="/signup" class="btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      Join Free — Network in ${escHtml(city.name)}
    </a>
  </div>
</div>

<footer><p>&copy; 2026 <a href="/">BuildYourNetwork</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:support@buildyournetwork.online">Support</a></p></footer>
${COOKIE_BANNER_SNIPPET}
<script src="/js/ref-capture.js" defer></script>
</body>
</html>`;
}

// ── GLOBAL CITY PAGE GENERATOR (US / EU) ─────────────────────────────────────
function generateGlobalCityPage(slug, city, BASE) {
  const E = escHtml;
  const title     = `Professional Networking in ${city.name} — Build Your Network`;
  const metaDesc  = `Build your professional network in ${city.name}. Connect with founders, mentors, freelancers, and career professionals by declared intent — not job title. Free, no install required.`;
  const canonical = `${BASE}/networking-in-${slug}`;
  const peerCities = city.hubPage === 'startup-networking-us' ? US_CITIES : EU_CITIES;
  const regionLabel = city.hubPage === 'startup-networking-us' ? 'US' : 'European';
  const otherCityLinks = Object.keys(peerCities).filter(k => k !== slug)
    .map(k => `<a href="/networking-in-${k}">${E(peerCities[k].name)}</a>`).join('\n        ');

  const faqs = [
    { q: `What is the best professional networking app in ${city.name}?`, a: `Build Your Network (BYN) is the free intent-based professional networking platform for ${city.name}. It connects founders, freelancers, career professionals, mentors, and investors based on what they are actively looking for — with GPS-based discovery and no install required.` },
    { q: `Who uses Build Your Network in ${city.name}?`, a: `BYN is used by startup founders, freelancers, consultants, career changers, remote workers, mentors, and investors in ${city.name}. Anyone who wants to build genuine professional relationships based on shared goals — not cold outreach — will find value on BYN.` },
    { q: `Are there mentors, investors, and collaborators in ${city.name} on Build Your Network?`, a: `Yes. Investors set their intent to 'Angel Investing', mentors to 'Open to Advising', freelancers to 'Available for Projects'. Filter by intent in ${city.name} to see exactly who is open and to what — no guessing, no cold messages.` },
    { q: `What professional ecosystem exists in ${city.name}?`, a: `${city.name}'s professional ecosystem is strong in ${city.ecosystem}. Key institutions include ${city.hubs}. ${city.excerpt}` },
    { q: `How does Build Your Network work in ${city.name}?`, a: `Professionals in ${city.name} create a free profile, declare their intent — co-founder search, freelance, career change, mentoring, investing — and enable GPS-based discovery. BYN surfaces people within their chosen radius who have declared matching intent. Both parties see each other's goals before the first message.` },
    { q: `Is Build Your Network free in ${city.name}?`, a: `Yes. Build Your Network is free in ${city.name} — 30 daily connection requests, direct messaging, and location-based discovery at no cost. No install required; works in your browser. Premium plans unlock unlimited daily connections and priority visibility.` },
  ];

  const faqJsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', 'name': title, 'url': canonical, 'description': metaDesc, 'inLanguage': city.locale.replace('_','-'),
      'speakable': { '@type': 'SpeakableSpecification', 'cssSelector': ['.direct-answer'] },
      'breadcrumb': { '@type': 'BreadcrumbList', 'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE + '/' },
        { '@type': 'ListItem', 'position': 2, 'name': city.hubLabel, 'item': BASE + '/' + city.hubPage },
        { '@type': 'ListItem', 'position': 3, 'name': `Networking in ${city.name}`, 'item': canonical }
      ]}
    },
    { '@type': 'FAQPage', 'mainEntity': faqs.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } })) },
  ]});

  const faqHtml = faqs.map(f => `
      <details class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <summary itemprop="name">${E(f.q)}</summary>
        <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer"><p itemprop="text">${E(f.a)}</p></div>
      </details>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0F766E">
  <title>${E(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="/assets/logo.png" type="image/png">
  <link rel="canonical" href="${E(canonical)}">
  <meta name="description" content="${E(metaDesc)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <meta name="geo.region" content="${E(city.geoRegion)}">
  <meta name="geo.placename" content="${E(city.name)}">
  <meta property="og:type" content="website"><meta property="og:url" content="${E(canonical)}">
  <meta property="og:title" content="${E(title)}"><meta property="og:description" content="${E(metaDesc)}">
  <meta property="og:image" content="${BASE}/assets/logo.png">
  <meta property="og:image:alt" content="Build Your Network — founder networking in ${E(city.name)}">
  <meta property="og:site_name" content="Build Your Network"><meta property="og:locale" content="${E(city.locale)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${E(title)}">
  <meta name="twitter:description" content="${E(metaDesc)}"><meta name="twitter:image" content="${BASE}/assets/logo.png">
  <meta name="twitter:site" content="@buildyournetwork">
  <script type="application/ld+json">${faqJsonLd}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Build Your Network","alternateName":"BYN","url":"${BASE}","applicationCategory":"BusinessApplication","operatingSystem":"Android, Web","inLanguage":"en","description":"Free intent-based professional networking platform for founders, freelancers, mentors, and career professionals worldwide.","offers":{"@type":"Offer","price":"0","priceCurrency":"${city.currency}","availability":"https://schema.org/InStock"}},{"@type":"Organization","name":"Build Your Network","url":"${BASE}","logo":{"@type":"ImageObject","url":"${BASE}/assets/logo.png","width":512,"height":512},"foundingDate":"2024","areaServed":["IN","US","GB","EU"],"contactPoint":{"@type":"ContactPoint","contactType":"Customer Support","email":"support@buildyournetwork.online"}}]}</script>
  <style>
    :root{--bg:#FFF4EC;--bg-secondary:#FDE8D7;--card:#FFFFFF;--primary:#0F766E;--highlight:#CCFBF1;--text:#1F2937;--text-secondary:#6B7280;--text-muted:#9CA3AF}
    *{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
    body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(253,232,215,.6)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
    .logo img{width:26px;height:26px;border-radius:6px}.nav-cta{background:var(--primary);color:white;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
    .page-wrap{max-width:860px;margin:0 auto;padding:100px 24px 80px}
    .breadcrumb{font-size:13px;color:var(--text-muted);margin-bottom:32px}.breadcrumb a{color:var(--primary);text-decoration:none}
    .tag{display:inline-block;background:var(--highlight);color:var(--primary);font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;margin-bottom:16px;letter-spacing:.02em;text-transform:uppercase}
    h1{font-size:clamp(28px,4.5vw,44px);font-weight:800;line-height:1.15;letter-spacing:-1px;margin-bottom:20px}h1 span{color:var(--primary)}
    .lead{font-size:18px;color:var(--text-secondary);line-height:1.7;margin-bottom:36px;max-width:680px}
    .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:36px}
    .btn-p{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--primary);color:white;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px}
    .btn-s{display:inline-flex;align-items:center;gap:8px;padding:14px 24px;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;border:2px solid var(--primary)}
    .quick-answer{background:#f0fdf9;border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:48px;font-size:15px;line-height:1.75;color:var(--text)}
    .quick-answer strong{color:var(--primary)}
    .know-block{background:var(--card);border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:24px 28px;margin-bottom:64px}
    .know-block h2{font-size:18px;font-weight:700;margin-bottom:12px}.know-block p{font-size:15px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px}.know-block p:last-child{margin-bottom:0}
    .section-h2{font-size:clamp(22px,3vw,30px);font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
    .section-sub{font-size:16px;color:var(--text-secondary);margin-bottom:32px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-bottom:64px}
    .card{background:var(--card);border:1px solid var(--bg-secondary);border-radius:16px;padding:22px}
    .card-icon{font-size:26px;margin-bottom:10px}.card h3{font-size:15px;font-weight:700;margin-bottom:6px}.card p{font-size:13px;color:var(--text-secondary);line-height:1.55}
    .eco-block{background:var(--bg-secondary);border-radius:16px;padding:28px;margin-bottom:64px}
    .eco-block h3{font-size:16px;font-weight:700;margin-bottom:10px}.eco-block p{font-size:14px;color:var(--text-secondary);line-height:1.7}
    .eco-meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}.eco-meta span{font-size:12px;font-weight:600;color:var(--primary);background:var(--card);padding:4px 10px;border-radius:6px}
    details.faq-item{border:1px solid var(--bg-secondary);border-radius:12px;margin-bottom:10px;overflow:hidden}
    details.faq-item summary{padding:18px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:var(--card)}
    details.faq-item summary::-webkit-details-marker{display:none}
    details.faq-item summary::after{content:'+';font-size:20px;color:var(--primary);font-weight:400;flex-shrink:0;margin-left:12px}
    details[open].faq-item summary::after{content:'−'}
    details.faq-item div{padding:0 20px 18px;background:var(--card);font-size:14px;color:var(--text-secondary);line-height:1.7}
    .faq-section{margin-bottom:64px}
    .city-links{background:var(--bg-secondary);border-radius:16px;padding:28px;margin-bottom:64px}
    .city-links h3{font-size:15px;font-weight:700;margin-bottom:14px}
    .city-links a{display:inline-block;background:var(--card);color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border-radius:8px;margin:4px 4px 4px 0;border:1px solid rgba(15,118,110,.15)}
    .page-links{background:var(--card);border:1px solid var(--bg-secondary);border-radius:16px;padding:24px;margin-bottom:64px}
    .page-links h3{font-size:15px;font-weight:700;margin-bottom:14px}
    .page-links a{display:inline-block;color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border-radius:8px;margin:4px 4px 4px 0;background:var(--bg);border:1px solid var(--bg-secondary)}
    .cta-block{background:var(--primary);border-radius:20px;padding:48px 40px;text-align:center;color:white;margin-bottom:64px}
    .cta-block h2{font-size:clamp(20px,3vw,28px);font-weight:800;margin-bottom:12px}.cta-block p{font-size:15px;opacity:.85;margin-bottom:24px}
    .cta-block .btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:white;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:700;font-size:15px}
    footer{border-top:1px solid var(--bg-secondary);padding:32px 24px;text-align:center}
    footer p{font-size:13px;color:var(--text-muted)}footer a{color:var(--primary);text-decoration:none}
    @media(max-width:640px){.page-wrap{padding:80px 16px 60px}.cta-block{padding:32px 20px}}
  </style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network" loading="lazy">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>
<div class="page-wrap">
  <p class="breadcrumb"><a href="/">Home</a> › <a href="/${E(city.hubPage)}">${E(city.hubLabel)}</a> › ${E(city.name)}</p>
  <span class="tag">${E(city.name)} · ${E(city.region)}</span>
  <h1>Build Your <span>Professional Network</span> in ${E(city.name)}</h1>
  <p class="lead">Build Your Network is the free intent-based professional networking platform for ${E(city.name)}. Whether you are a founder, freelancer, career professional, mentor, or investor — declare your intent and connect with the right people in your city.</p>
  <div class="cta-row">
    <a href="/signup" class="btn-p"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Start Networking in ${E(city.name)} — Free</a>
    <a href="#faq" class="btn-s">How it works</a>
  </div>
  <section class="quick-answer" aria-label="Quick answer">
    <p><strong>Build Your Network (BYN)</strong> is the free intent-based professional networking platform for ${E(city.name)}, ${E(city.region)}. It connects founders, freelancers, career professionals, mentors, and investors based on declared intent — with GPS-based discovery. No app install required.</p>
  </section>
  <div class="know-block">
    <h2>Professional networking in ${E(city.name)} — how it works</h2>
    <p>${E(city.excerpt)}</p>
    <p>Build Your Network connects ${E(city.name)}'s professional community by intent. Whether you are a founder seeking a co-founder, a freelancer finding clients, a professional changing careers, or an expert open to mentoring — set your intent and the platform surfaces the right people within your chosen radius. Both parties see each other's goals before the first message, making every introduction count.</p>
    <p>Free to join. Works in your browser. No app install required.</p>
  </div>
  <h2 class="section-h2">Who you will find in ${E(city.name)} on BYN</h2>
  <p class="section-sub">Every type of professional connection — filtered by what they actually want.</p>
  <div class="cards">
    <div class="card"><div class="card-icon">🤝</div><h3>Co-Founders &amp; Collaborators</h3><p>Founders and builders in ${E(city.name)} actively looking for complementary partners — technical, business, or creative — within your chosen radius.</p></div>
    <div class="card"><div class="card-icon">💼</div><h3>Freelancers &amp; Consultants</h3><p>Independent professionals in ${E(city.name)} open to new projects and clients. Filter by skill and intent to find the right fit.</p></div>
    <div class="card"><div class="card-icon">🎓</div><h3>Mentors &amp; Advisors</h3><p>Experienced operators in ${E(city.name)} who are open to advising. Filter by 'Open to Advising' intent to find the right guide for your stage.</p></div>
    <div class="card"><div class="card-icon">💰</div><h3>Investors</h3><p>Investors in ${E(city.name)} who have declared they are actively looking for early-stage deals. No cold introductions — both sides show intent upfront.</p></div>
  </div>
  <div class="eco-block">
    <h3>${E(city.name)} Startup Ecosystem</h3>
    <p>${E(city.excerpt)}</p>
    <div class="eco-meta">
      <span>📍 ${E(city.name)}, ${E(city.region)}</span>
      <span>🏭 ${E(city.ecosystem)}</span>
      <span>🏛 ${E(city.hubs)}</span>
    </div>
  </div>
  <div class="faq-section" id="faq">
    <h2 class="section-h2">Professional Networking in ${E(city.name)} — FAQ</h2>
    <p class="section-sub">Common questions from professionals looking to build meaningful connections in ${E(city.name)}.</p>
    <div itemscope itemtype="https://schema.org/FAQPage">${faqHtml}</div>
  </div>
  <div class="city-links">
    <h3>Networking in other ${E(regionLabel)} cities</h3>
    ${otherCityLinks}
  </div>
  <div class="page-links">
    <h3>More founder resources</h3>
    <a href="/networking-for-founders">Networking for Founders</a>
    <a href="/find-cofounders">How to Find a Co-Founder</a>
    <a href="/${E(city.hubPage)}">${E(city.hubLabel)}</a>
    <a href="/linkedin-alternative">LinkedIn Alternative</a>
    <a href="/linkedin-vs-byn">LinkedIn vs BYN</a>
    <a href="/meetup-alternative">Meetup Alternative</a>
    <a href="/best-networking-platform-for-founders">Best Networking Platform</a>
    <a href="/find-cofounders-${slug}">Find Co-founders in ${E(city.name)}</a>
    <a href="/founders-in-${slug}">Startup Founders in ${E(city.name)}</a>
    <a href="/startup-networking-${slug}">Startup Networking ${E(city.name)}</a>
  </div>
  <div class="cta-block">
    <h2>Start building your network in ${E(city.name)}</h2>
    <p>Join Build Your Network free. Declare your intent. Meet the right people. GPS-based discovery, no install required.</p>
    <a href="/signup" class="btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Join Free — Network in ${E(city.name)}</a>
  </div>
</div>
<footer><p>&copy; 2026 <a href="/">BuildYourNetwork</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:support@buildyournetwork.online">Support</a></p></footer>
${COOKIE_BANNER_SNIPPET}
<script src="/js/ref-capture-simple.js" defer></script>
</body></html>`;
}

// ── GLOBAL CITY INTENT PAGE GENERATOR (US / EU) ───────────────────────────────
function globalCityIntentSchema(title, canonical, BASE, city, faqs, breadLabel, breadPath) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', 'name': title, 'url': canonical, 'inLanguage': city.locale.replace('_','-'),
      'speakable': { '@type': 'SpeakableSpecification', 'cssSelector': ['.direct-answer'] },
      'breadcrumb': { '@type': 'BreadcrumbList', 'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home',      'item': BASE + '/' },
        { '@type': 'ListItem', 'position': 2, 'name': breadLabel,   'item': BASE + '/' + breadPath },
        { '@type': 'ListItem', 'position': 3, 'name': city.name,    'item': canonical }
      ]}
    },
    { '@type': 'FAQPage', 'mainEntity': faqs.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } })) },
    { '@type': 'SoftwareApplication', 'name': 'Build Your Network', 'url': BASE,
      'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Android, Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': city.currency }
    }
  ]});
}

function generateGlobalCityIntentPage(slug, city, BASE, pattern) {
  const E  = escHtml;
  const cn = city.name;
  const peerCities   = city.hubPage === 'startup-networking-us' ? US_CITIES : EU_CITIES;
  const regionLabel  = city.hubPage === 'startup-networking-us' ? 'US' : 'European';

  const configs = {
    'founders-in-': {
      title:    `Startup Founders in ${cn} — Connect & Collaborate | Build Your Network`,
      metaDesc: `Find and connect with startup founders in ${cn}. Build Your Network shows you founders actively building in ${cn}, ${city.region} — filtered by intent, skills, and proximity. Free to join.`,
      canonical: `${BASE}/founders-in-${slug}`,
      tag:      `${cn} Founders`,
      h1:       `Connect with Startup Founders in <span>${cn}</span>`,
      lead:     `Build Your Network surfaces startup founders in ${cn} who are actively building — filtered by what they're working on, what skills they need, and how close they are to you. No cold email, no noise.`,
      answerH2: `Who are the startup founders in ${cn}?`,
      answerP:  [`${cn} has a growing community of startup founders across ${city.ecosystem}. Key institutions supporting them include ${city.hubs}. ${city.excerpt}`,
                 `On Build Your Network, founders in ${cn} list their venture, their skills, and their current intent — whether they're looking for a co-founder, a mentor, or their first investor. You see exactly who is building what, before you send the first message.`],
      cards: [
        { icon: '🔍', h: 'Discover who\'s building',  p: `See founders in ${cn} filtered by industry, skills, and what they're working on right now.` },
        { icon: '🤝', h: 'Intent-based connection',   p: 'Both founders declare intent before connecting — no wasted meetings, no pitch spam.' },
        { icon: '📍', h: 'Location-aware discovery',  p: `Filter by distance within ${cn} for in-person co-working and collaboration.` },
      ],
      faqs: [
        { q: `How do I find startup founders in ${cn}?`, a: `Join Build Your Network free, enable location discovery, and set your radius to cover ${cn}. BYN shows you founders in ${cn} who are actively building and open to connections — filtered by intent, industry, and skills. No cold outreach needed.` },
        { q: `What are startup founders in ${cn} building?`, a: `${cn} founders are predominantly building in ${city.ecosystem}. ${city.excerpt} On Build Your Network, each founder lists their current project, skills, and intent — giving you full context before the first conversation.` },
        { q: `Is Build Your Network free for founders in ${cn}?`, a: `Yes. Build Your Network is free for founders in ${cn} — create a profile, set your intent, and discover other founders in your city at no cost. Premium plans unlock unlimited connections and priority visibility.` },
        { q: `How is BYN different from LinkedIn for finding founders in ${cn}?`, a: `LinkedIn shows you job titles and work history. BYN shows you what founders in ${cn} are actively building and what they need right now. Intent-based discovery means you connect with people who are looking for exactly what you offer.` },
        { q: `Can I find co-founders in ${cn} through Build Your Network?`, a: `Yes. Set your intent to "Looking for Co-founder" and BYN will surface founders in ${cn} with complementary skills who are also open to co-founding. Filter by technical vs business background, industry, and distance.` },
        { q: `Are there networking events for founders in ${cn}?`, a: `Build Your Network is always-on discovery — unlike event platforms, you can find and message founders in ${cn} any time, not just at scheduled meetups. Key startup hubs in ${cn} include ${city.hubs}.` },
      ],
      breadLabel: city.hubLabel, breadPath: city.hubPage,
      ctaH: `Join ${cn}'s Founder Community`, ctaP: 'Free to join. No app download required.',
    },
    'startup-founders-': {
      title:    `Startup Founder Community in ${cn} — Build Your Network`,
      metaDesc: `Join the startup founder community in ${cn}. Build Your Network connects founders, co-founders, mentors, and investors across ${cn}'s startup ecosystem. Free.`,
      canonical: `${BASE}/startup-founders-${slug}`,
      tag:      `${cn} Founder Community`,
      h1:       `${cn}'s <span>Startup Founder Community</span>`,
      lead:     `Build Your Network is the always-on community for startup founders in ${cn}. Connect with founders building in ${city.ecosystem}, find mentors who've done it before, and get in front of investors actively looking at ${cn} deals.`,
      answerH2: `What is the startup founder community in ${cn}?`,
      answerP:  [`${cn}'s startup ecosystem spans ${city.ecosystem}, supported by ${city.hubs}. ${city.excerpt}`,
                 `Build Your Network brings this community online — founders, mentors, and investors all on one platform, each declaring their intent so every connection is purposeful.`],
      cards: [
        { icon: '🏙️', h: `${cn} founder network`,    p: `Access the growing community of founders, operators, and builders in ${cn}'s startup ecosystem.` },
        { icon: '🎯', h: 'Intent-first community',   p: 'Every member declares what they need — co-founder, mentor, investor, or collaborator — before you connect.' },
        { icon: '📈', h: 'Mentors & investors',      p: `Meet ${cn}-based mentors who have scaled startups and investors actively deploying in the city.` },
      ],
      faqs: [
        { q: `What is the startup founder community in ${cn}?`, a: `${cn}'s startup founder community spans ${city.ecosystem}, backed by ${city.hubs}. Build Your Network is the platform where this community connects online — founders, mentors, and investors all in one place, with intent-based discovery that removes cold-outreach friction.` },
        { q: `How do I join the startup community in ${cn}?`, a: `Create a free profile on Build Your Network, set your location to ${cn}, and declare your intent. You'll immediately appear in discovery for other founders, mentors, and investors in ${cn} who are looking for what you offer.` },
        { q: `Are there angel investors in ${cn} on Build Your Network?`, a: `Yes. Investors in ${cn} use BYN to discover early-stage founders. They set their intent to "Angel Investing" — so when you filter by investor intent in ${cn}, you see exactly who is actively looking at new deals.` },
        { q: `What startup hubs and accelerators are in ${cn}?`, a: `Key startup infrastructure in ${cn} includes ${city.hubs}. ${city.excerpt}` },
        { q: `How is Build Your Network different from other startup communities in ${cn}?`, a: `Most startup communities are event-based or passive directories. BYN is active — every member declares their current intent, so you know who is open to co-founding, who is mentoring, and who is investing, right now.` },
        { q: `Is Build Your Network free for founders in ${cn}?`, a: `Yes. Free accounts include profile creation, intent setting, location-based discovery, and direct messaging. Premium plans unlock unlimited daily connections and priority visibility for faster introductions.` },
      ],
      breadLabel: city.hubLabel, breadPath: city.hubPage,
      ctaH: `Join ${cn}'s Startup Community`, ctaP: 'Free. No app download needed.',
    },
    'find-cofounders-': {
      title:    `Find a Co-Founder in ${cn} — Build Your Network`,
      metaDesc: `Find your co-founder in ${cn}. Build Your Network matches startup founders in ${cn} based on complementary skills and intent. Free to join. No install required.`,
      canonical: `${BASE}/find-cofounders-${slug}`,
      tag:      `Find Co-founders in ${cn}`,
      h1:       `Find Your <span>Co-Founder</span> in ${cn}`,
      lead:     `Build Your Network matches founders in ${cn} who are actively looking for a co-founder. Set your skills, declare your intent, and get surfaced to founders in ${cn} with complementary profiles — no cold email required.`,
      answerH2: `How to find a co-founder in ${cn}`,
      answerP:  [`The best co-founders come from warm connections in your ecosystem. ${cn} has a strong startup base across ${city.ecosystem}, supported by ${city.hubs}.`,
                 `Build Your Network makes co-founder discovery in ${cn} intent-driven: both parties declare they're looking for a co-founder before the match is made. This filters out passive networkers and surfaces only founders who are actively building and ready to partner.`],
      cards: [
        { icon: '🧩', h: 'Skill-based matching',      p: `Tell BYN your skills and what you're building. It surfaces co-founder candidates in ${cn} with complementary profiles.` },
        { icon: '🤝', h: 'Both sides declare intent', p: 'Co-founder matches only happen when both founders have declared they\'re looking — no wasted conversations.' },
        { icon: '📍', h: `${cn} proximity filter`,    p: `Filter by distance within ${cn} to find co-founders you can meet in person for the early-stage work that matters.` },
      ],
      faqs: [
        { q: `How do I find a co-founder in ${cn}?`, a: `Join Build Your Network free, set your intent to "Looking for Co-founder", add your skills and startup description, and enable location discovery in ${cn}. BYN surfaces founders in ${cn} with complementary skills who are also looking for a co-founder. You can filter by distance — 10 km, 50 km, or 200 km.` },
        { q: `What skills should I look for in a co-founder in ${cn}?`, a: `The most common co-founder pairings in ${cn}'s ecosystem are technical + business (a developer and a GTM founder), or domain expert + operator. In ${cn}'s ${city.ecosystem} space, look for complementary expertise rather than duplicate skills. BYN lets you filter by skill category.` },
        { q: `Is it safe to connect with co-founders on Build Your Network?`, a: `Yes. Every BYN member has a verified profile with their intent, current project, and background visible before you connect. You can review their profile, see their skills and what they're building, and message them directly — all before any commitment.` },
        { q: `How long does it take to find a co-founder in ${cn} on BYN?`, a: `Most founders on BYN receive their first relevant co-founder match within 48 hours of setting up a complete profile. Response rates are higher than LinkedIn DMs because both parties have declared matching intent before the connection request.` },
        { q: `Are there technical co-founders available in ${cn}?`, a: `Yes. ${cn} has a strong talent base across ${city.ecosystem}, and BYN has profiles from engineers, product managers, designers, and domain experts in the city. Filter by skill (engineering, product, design, finance, marketing) to find the right complement for your startup.` },
        { q: `What is Build Your Network and is it free?`, a: `Build Your Network (BYN) is a free intent-based networking platform for startup founders. Free accounts include profile creation, co-founder matching, and direct messaging. Premium plans unlock unlimited daily connections and priority discovery.` },
      ],
      breadLabel: 'Find Co-founders', breadPath: 'find-cofounders',
      ctaH: `Find Your Co-Founder in ${cn}`, ctaP: 'Free. Works in your browser — no download needed.',
    },
    'startup-networking-': {
      title:    `Startup Networking in ${cn} — Connect with Founders | BYN`,
      metaDesc: `Startup networking in ${cn} — connect with founders, investors, and mentors in ${cn}'s startup ecosystem. Build Your Network is the free platform for startup networking in ${cn}, ${city.region}.`,
      canonical: `${BASE}/startup-networking-${slug}`,
      tag:      `Startup Networking · ${cn}`,
      h1:       `Startup Networking in <span>${cn}</span>`,
      lead:     `Build Your Network is the always-on startup networking platform for ${cn}. Meet founders, investors, and mentors in ${cn}'s ecosystem without waiting for the next event. Discover people based on intent, not job title.`,
      answerH2: `How startup networking works in ${cn}`,
      answerP:  [`${cn}'s startup ecosystem is built on ${city.ecosystem}, powered by institutions like ${city.hubs}. ${city.excerpt}`,
                 `Traditional startup networking in ${cn} is event-dependent — pitch nights, demo days, accelerator cohorts. Build Your Network makes it always-on: discover and message founders, investors, and mentors in ${cn} any day, filtered by what they're actively looking for.`],
      cards: [
        { icon: '🌐', h: 'Always-on networking',     p: `Meet founders and investors in ${cn} any time — not just at scheduled events.` },
        { icon: '🎯', h: 'Intent before connection', p: 'See what each person is open to before you reach out — co-founding, investing, advising, or collaborating.' },
        { icon: '🏙️', h: `${cn} ecosystem access`,  p: `GPS-based discovery surfaces people in ${cn} within your chosen radius — 10 km to 200 km.` },
      ],
      faqs: [
        { q: `How do I do startup networking in ${cn}?`, a: `Join Build Your Network free, set your location to ${cn}, and declare your intent. BYN immediately surfaces people in ${cn} who match your intent — no event required, no cold email.` },
        { q: `What startup networking events happen in ${cn}?`, a: `${cn} has regular startup events through ${city.hubs}. Beyond events, Build Your Network provides always-on networking — you can discover and connect with founders, investors, and mentors in ${cn} any day of the week.` },
        { q: `How do I meet angel investors through startup networking in ${cn}?`, a: `On Build Your Network, investors in ${cn} set their intent to "Angel Investing". Filter by investor intent in your city radius and you'll see exactly which investors in ${cn} are actively looking at new investments — and you can message them directly.` },
        { q: `Is Build Your Network better than LinkedIn for startup networking in ${cn}?`, a: `For startup-specific networking, yes. LinkedIn shows past jobs; BYN shows current intent. Every member in ${cn} on BYN has declared what they need right now — co-founder, mentor, investor, or collaborator — making connections significantly more likely to convert.` },
        { q: `How do I find mentors for my startup in ${cn}?`, a: `On BYN, mentors in ${cn} set their intent to "Open to Advising". Filter by mentor intent and your city to see exactly who is available. ${cn} has experienced operators across ${city.ecosystem} — many of whom actively mentor early-stage founders via BYN.` },
        { q: `Is Build Your Network free for startup networking in ${cn}?`, a: `Yes. Build Your Network is free — create a profile, set your intent, and start connecting with founders, investors, and mentors in ${cn} at no cost. Premium plans unlock unlimited connections and priority visibility.` },
      ],
      breadLabel: 'Networking for Founders', breadPath: 'networking-for-founders',
      ctaH: `Start Networking in ${cn}`, ctaP: 'Free. No install required.',
    },
  };

  const cfg = configs[pattern];
  if (!cfg) return '';

  const faqHtml = cfg.faqs.map(f => `
      <details class="faq" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <summary itemprop="name">${E(f.q)}</summary>
        <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer"><p itemprop="text">${E(f.a)}</p></div>
      </details>`).join('');

  const schema = globalCityIntentSchema(cfg.title, cfg.canonical, BASE, city, cfg.faqs, cfg.breadLabel, cfg.breadPath);

  const head = `
  <title>${E(cfg.title)}</title>
  <link rel="canonical" href="${E(cfg.canonical)}">
  <meta name="description" content="${E(cfg.metaDesc)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <meta name="geo.region" content="${E(city.geoRegion)}">
  <meta name="geo.placename" content="${E(cn)}">
  <meta property="og:type" content="website"><meta property="og:url" content="${E(cfg.canonical)}">
  <meta property="og:title" content="${E(cfg.title)}"><meta property="og:description" content="${E(cfg.metaDesc)}">
  <meta property="og:image" content="${BASE}/assets/logo.png">
  <meta property="og:site_name" content="Build Your Network"><meta property="og:locale" content="${E(city.locale)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${E(cfg.title)}">
  <meta name="twitter:description" content="${E(cfg.metaDesc)}"><meta name="twitter:image" content="${BASE}/assets/logo.png">
  <meta name="twitter:site" content="@buildyournetwork">
  <script type="application/ld+json">${schema}</script>`;

  const body = `
<div class="wrap">
  <p class="bc"><a href="/">Home</a> › <a href="/${cfg.breadPath}">${E(cfg.breadLabel)}</a> › ${E(cn)}</p>
  <span class="tag">${E(cfg.tag)}</span>
  <h1>${cfg.h1}</h1>
  <p class="lead">${E(cfg.lead)}</p>
  <div class="cta-row">
    <a href="/signup" class="btn-p">Join Free in ${E(cn)}</a>
    <a href="#faq" class="btn-s">How it works</a>
  </div>
  <div class="answer-block">
    <h2>${E(cfg.answerH2)}</h2>
    ${cfg.answerP.map(p => `<p>${E(p)}</p>`).join('')}
  </div>
  <div class="sh2">${E(cfg.cards[0].h)}, ${E(cfg.cards[1].h)}, and more</div>
  <p class="sub">Built for ${E(cn)}'s founder ecosystem</p>
  <div class="cards">
    ${cfg.cards.map(c => `<div class="card"><div class="card-icon">${c.icon}</div><h3>${E(c.h)}</h3><p>${E(c.p)}</p></div>`).join('')}
  </div>
  <div id="faq" class="faq-sec" itemscope itemtype="https://schema.org/FAQPage">
    <h2 class="sh2">Frequently Asked Questions</h2>
    <p class="sub" style="margin-bottom:20px">About startup networking in ${E(cn)}</p>
    ${faqHtml}
  </div>
  <div class="city-pills">
    <h3>Other startup cities in ${regionLabel === 'US' ? 'the United States' : 'Europe'}</h3>
    ${otherCityPills(slug, pattern, peerCities)}
  </div>
  <div class="rel-links">
    <h3>Related pages</h3>
    <a href="/networking-in-${slug}">Networking in ${E(cn)}</a>
    <a href="/founders-in-${slug}">Founders in ${E(cn)}</a>
    <a href="/find-cofounders-${slug}">Find Co-founders in ${E(cn)}</a>
    <a href="/startup-founders-${slug}">Startup Founders ${E(cn)}</a>
    <a href="/startup-networking-${slug}">Startup Networking ${E(cn)}</a>
    <a href="/networking-for-founders">Networking for Founders</a>
    <a href="/find-cofounders">Find Co-founders</a>
    <a href="/${E(city.hubPage)}">${E(city.hubLabel)}</a>
    <a href="/linkedin-alternative">LinkedIn Alternative</a>
    <a href="/linkedin-vs-byn">LinkedIn vs BYN</a>
    <a href="/best-networking-platform-for-founders">Best Networking Platform</a>
    <a href="/meetup-alternative">Meetup Alternative</a>
  </div>
  <div class="cta-block">
    <h2>${E(cfg.ctaH)}</h2>
    <p>${E(cfg.ctaP)}</p>
    <a href="/signup" class="btn">Get Started — Free</a>
  </div>
</div>`;

  return cityPageShell(head, body, BASE);
}

// ── HUB PAGE GENERATOR (US / EU) ─────────────────────────────────────────────
function generateHubPage(region, cities, BASE) {
  const E = escHtml;
  const isUS   = region === 'us';
  const title  = isUS ? 'Startup Networking in the United States — Build Your Network' : 'Startup Networking in Europe — Build Your Network';
  const metaDesc = isUS
    ? 'Connect with startup founders, co-founders, mentors, and investors across the United States. Build Your Network is the free intent-based platform for US startup networking.'
    : 'Connect with startup founders, co-founders, mentors, and investors across Europe. Build Your Network is the free intent-based platform for European startup networking.';
  const canonical = `${BASE}/${isUS ? 'startup-networking-us' : 'startup-networking-europe'}`;
  const h1label   = isUS ? 'United States' : 'Europe';
  const geoRegion = isUS ? 'US' : 'EU';
  const locale    = isUS ? 'en_US' : 'en_GB';
  const currency  = isUS ? 'USD' : 'EUR';

  const cityLinks = Object.entries(cities).map(([s, c]) =>
    `<a href="/networking-in-${s}">${E(c.name)}</a>`).join('\n    ');
  const intentLinks = Object.entries(cities).flatMap(([s, c]) => [
    `<a href="/founders-in-${s}">Founders in ${E(c.name)}</a>`,
    `<a href="/startup-networking-${s}">Networking in ${E(c.name)}</a>`,
  ]).join('\n    ');

  const faqs = isUS ? [
    { q: 'What is the best networking platform for startup founders in the US?', a: 'Build Your Network (BYN) is a free intent-based networking platform for startup founders in the United States. Unlike LinkedIn, BYN is built specifically for founder discovery — every member declares their current intent (co-founder search, angel investing, mentoring) so every connection is purposeful. Available across San Francisco, New York, Austin, Boston, Seattle, Los Angeles, Chicago, Miami, Denver, and Atlanta.' },
    { q: 'How do I find a co-founder in the United States?', a: 'Join Build Your Network free, set your intent to "Looking for Co-founder", and enable location discovery. BYN surfaces founders across US cities with complementary skills who are actively seeking co-founders. Filter by city, distance, skills, and industry to find your match.' },
    { q: 'Is Build Your Network available across the United States?', a: 'Yes. Build Your Network is available in all US cities. The platform uses GPS-based discovery — so whether you are in San Francisco, New York, Austin, Boston, or any other city, you can discover founders, mentors, and investors within your chosen radius.' },
    { q: 'How is BYN different from LinkedIn for US startup networking?', a: 'LinkedIn shows professional history. BYN shows current intent — what each founder is building and what they need right now. This intent-based discovery dramatically increases the quality and conversion rate of networking connections for US founders.' },
    { q: 'Is Build Your Network free for US founders?', a: 'Yes. Build Your Network is free for founders across the United States — including 30 daily connection requests, GPS-based discovery, and direct messaging. Premium plans unlock unlimited connections and priority visibility.' },
  ] : [
    { q: 'What is the best networking platform for startup founders in Europe?', a: 'Build Your Network (BYN) is a free intent-based networking platform for startup founders across Europe. Unlike LinkedIn, BYN is built specifically for founder discovery — every member declares their current intent (co-founder search, angel investing, mentoring) so every connection is purposeful. Available across London, Berlin, Amsterdam, Stockholm, Paris, Dublin, Barcelona, Helsinki, and Zurich.' },
    { q: 'How do I find a co-founder in Europe?', a: 'Join Build Your Network free, set your intent to "Looking for Co-founder", and enable location discovery. BYN surfaces founders across European cities with complementary skills who are actively seeking co-founders. Filter by city, distance, skills, and industry.' },
    { q: 'Is Build Your Network available across Europe?', a: 'Yes. Build Your Network is available in all major European startup cities. The platform uses GPS-based discovery — so whether you are in London, Berlin, Paris, Amsterdam, Stockholm, or Dublin, you can discover founders, mentors, and investors within your chosen radius.' },
    { q: 'How is BYN different from LinkedIn for European startup networking?', a: 'LinkedIn shows professional history. BYN shows current intent — what each founder is building and what they need right now. This intent-based approach dramatically increases the quality and conversion rate of networking connections for European founders.' },
    { q: 'Is Build Your Network free for European founders?', a: 'Yes. Build Your Network is free for founders across Europe — including 30 daily connection requests, GPS-based discovery, and direct messaging. Premium plans unlock unlimited connections and priority visibility.' },
  ];

  const faqJsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', 'name': title, 'url': canonical, 'description': metaDesc, 'inLanguage': locale.replace('_','-'),
      'breadcrumb': { '@type': 'BreadcrumbList', 'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE + '/' },
        { '@type': 'ListItem', 'position': 2, 'name': title,  'item': canonical }
      ]}
    },
    { '@type': 'FAQPage', 'mainEntity': faqs.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } })) },
    { '@type': 'SoftwareApplication', 'name': 'Build Your Network', 'url': BASE,
      'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Android, Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': currency }
    }
  ]});

  const faqHtml = faqs.map(f => `
    <details class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <summary itemprop="name">${E(f.q)}</summary>
      <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer"><p itemprop="text">${E(f.a)}</p></div>
    </details>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0F766E">
  <title>${E(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="/assets/logo.png" type="image/png">
  <link rel="canonical" href="${E(canonical)}">
  <meta name="description" content="${E(metaDesc)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <meta name="geo.region" content="${E(geoRegion)}">
  <meta property="og:type" content="website"><meta property="og:url" content="${E(canonical)}">
  <meta property="og:title" content="${E(title)}"><meta property="og:description" content="${E(metaDesc)}">
  <meta property="og:image" content="${BASE}/assets/logo.png">
  <meta property="og:site_name" content="Build Your Network"><meta property="og:locale" content="${E(locale)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${E(title)}">
  <meta name="twitter:description" content="${E(metaDesc)}"><meta name="twitter:image" content="${BASE}/assets/logo.png">
  <script type="application/ld+json">${faqJsonLd}</script>
  <style>
    :root{--bg:#FFF4EC;--bg2:#FDE8D7;--card:#fff;--primary:#0F766E;--hl:#CCFBF1;--text:#1F2937;--muted:#6B7280;--dim:#9CA3AF}
    *{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
    body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(253,232,215,.6)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
    .logo img{width:26px;height:26px;border-radius:6px}.nav-cta{background:var(--primary);color:#fff;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
    .wrap{max-width:900px;margin:0 auto;padding:100px 24px 80px}
    .tag{display:inline-block;background:var(--hl);color:var(--primary);font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;margin-bottom:16px;letter-spacing:.02em;text-transform:uppercase}
    h1{font-size:clamp(28px,4.5vw,46px);font-weight:800;line-height:1.15;letter-spacing:-1px;margin-bottom:18px}h1 span{color:var(--primary)}
    .lead{font-size:18px;color:var(--muted);line-height:1.7;margin-bottom:36px;max-width:700px}
    .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:56px}
    .btn-p{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--primary);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px}
    .btn-s{display:inline-flex;align-items:center;gap:8px;padding:14px 24px;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;border:2px solid var(--primary)}
    .ql{background:#f0fdf9;border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:56px;font-size:15px;line-height:1.75}
    .ql strong{color:var(--primary)}
    .sh2{font-size:clamp(20px,3vw,30px);font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
    .sub{font-size:15px;color:var(--muted);margin-bottom:28px}
    .city-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:56px}
    .city-card{background:var(--card);border:1px solid var(--bg2);border-radius:14px;padding:18px;text-decoration:none;color:var(--text);transition:box-shadow .15s}
    .city-card:hover{box-shadow:0 4px 18px rgba(15,118,110,.1)}
    .city-card h3{font-size:15px;font-weight:700;margin-bottom:4px;color:var(--primary)}
    .city-card p{font-size:12px;color:var(--muted);line-height:1.5}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:56px}
    .card{background:var(--card);border:1px solid var(--bg2);border-radius:16px;padding:22px}
    .card-icon{font-size:26px;margin-bottom:10px}.card h3{font-size:15px;font-weight:700;margin-bottom:6px}.card p{font-size:13px;color:var(--muted);line-height:1.55}
    details.faq-item{border:1px solid var(--bg2);border-radius:12px;margin-bottom:10px;overflow:hidden}
    details.faq-item summary{padding:18px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:var(--card)}
    details.faq-item summary::-webkit-details-marker{display:none}
    details.faq-item summary::after{content:'+';font-size:20px;color:var(--primary);font-weight:400;flex-shrink:0;margin-left:12px}
    details[open].faq-item summary::after{content:'−'}
    details.faq-item div{padding:0 20px 18px;background:var(--card);font-size:14px;color:var(--muted);line-height:1.7}
    .intent-grid{background:var(--bg2);border-radius:16px;padding:24px;margin-bottom:48px}
    .intent-grid h3{font-size:14px;font-weight:700;margin-bottom:12px}
    .intent-grid a{display:inline-block;background:var(--card);color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:5px 12px;border-radius:8px;margin:3px;border:1px solid rgba(15,118,110,.15)}
    .cta-block{background:var(--primary);border-radius:20px;padding:44px 36px;text-align:center;color:#fff;margin-bottom:60px}
    .cta-block h2{font-size:clamp(18px,3vw,26px);font-weight:800;margin-bottom:10px}
    .cta-block p{font-size:15px;opacity:.85;margin-bottom:22px}
    .cta-block .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;background:#fff;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:700;font-size:15px}
    footer{border-top:1px solid var(--bg2);padding:28px 24px;text-align:center;font-size:13px;color:var(--dim)}
    footer a{color:var(--primary);text-decoration:none}
    @media(max-width:640px){.wrap{padding:80px 16px 60px}.cta-block{padding:28px 16px}}
  </style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network" loading="lazy">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>
<div class="wrap">
  <span class="tag">Startup Networking · ${E(h1label)}</span>
  <h1>Startup Networking in <span>${E(h1label)}</span></h1>
  <p class="lead">${isUS
    ? 'Build Your Network connects startup founders, co-founders, mentors, and investors across the United States — with GPS-based intent discovery in every major US tech city. Free to join. No install required.'
    : 'Build Your Network connects startup founders, co-founders, mentors, and investors across Europe — with GPS-based intent discovery in every major European startup hub. Free to join. No install required.'
  }</p>
  <div class="cta-row">
    <a href="/signup" class="btn-p">Join Free — Start Networking</a>
    <a href="#cities" class="btn-s">Browse Cities</a>
  </div>

  <div class="ql">
    <p><strong>Build Your Network (BYN)</strong> is the free intent-based networking platform for startup founders ${isUS ? 'across the United States' : 'across Europe'}. Unlike LinkedIn, every member declares their current intent — co-founder search, angel investing, mentoring, or collaboration — so every introduction is purposeful. GPS-based discovery works within any city radius from 10 km to 200 km. No app install required.</p>
  </div>

  <h2 class="sh2" id="cities">${E(h1label)} Startup Cities</h2>
  <p class="sub">Discover founders, investors, and mentors in these cities.</p>
  <div class="city-grid">
    ${Object.entries(cities).map(([s, c]) => `
    <a href="/networking-in-${s}" class="city-card">
      <h3>${E(c.name)}</h3>
      <p>${E(c.ecosystem.split(',').slice(0,2).join(','))}</p>
    </a>`).join('')}
  </div>

  <h2 class="sh2">Why Build Your Network for ${E(h1label)} Startup Networking</h2>
  <p class="sub">Three things that make BYN different.</p>
  <div class="cards">
    <div class="card"><div class="card-icon">🎯</div><h3>Intent-based discovery</h3><p>Every member declares what they're actively looking for — co-founder, investor, mentor, or collaborator. You connect with intent, not cold messages.</p></div>
    <div class="card"><div class="card-icon">📍</div><h3>GPS city discovery</h3><p>Filter by radius — 10 km, 50 km, or 200 km — to find founders you can actually meet. Works in every ${E(h1label)} city on this page.</p></div>
    <div class="card"><div class="card-icon">🆓</div><h3>Free to start</h3><p>30 daily connections, GPS discovery, direct messaging, and full profile — all free. No credit card, no install required.</p></div>
  </div>

  <div class="intent-grid">
    <h3>Browse by city and intent</h3>
    ${intentLinks}
  </div>

  <div class="faq-sec" id="faq" itemscope itemtype="https://schema.org/FAQPage">
    <h2 class="sh2">Frequently Asked Questions</h2>
    <p class="sub" style="margin-bottom:20px">Startup networking ${isUS ? 'in the United States' : 'in Europe'}</p>
    ${faqHtml}
  </div>

  <div class="cta-block">
    <h2>Start networking with founders ${isUS ? 'across the US' : 'across Europe'}</h2>
    <p>Free. GPS-based. No install. Works in every major ${E(h1label)} startup city.</p>
    <a href="/signup" class="btn">Join Free — Find Founders</a>
  </div>
</div>
<footer><p>&copy; 2026 <a href="/">Build Your Network</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:support@buildyournetwork.online">Support</a></p></footer>
${COOKIE_BANNER_SNIPPET}
<script src="/js/ref-capture-simple.js" defer></script>
</body></html>`;
}

// Bangalore → Bengaluru canonical redirect
app.get('/networking-in-bangalore',    (req, res) => res.redirect(301, '/networking-in-bengaluru'));
app.get('/founders-in-bangalore',      (req, res) => res.redirect(301, '/founders-in-bengaluru'));
app.get('/startup-founders-bangalore', (req, res) => res.redirect(301, '/startup-founders-bengaluru'));
app.get('/find-cofounders-bangalore',  (req, res) => res.redirect(301, '/find-cofounders-bengaluru'));
app.get('/startup-networking-bangalore',(req,res) => res.redirect(301, '/startup-networking-bengaluru'));

// ── PHASE 3 — 4 additional city-intent route patterns ────────────────────────

function makeCityRoute(pattern, pageViews) {
  return (req, res) => {
    const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
    const raw  = req.params.city || '';
    const slug = raw.toLowerCase().replace(/[^a-z]/g, '');
    const indiaCity  = CITIES[slug];
    const globalCity = US_CITIES[slug] || EU_CITIES[slug];
    const city = indiaCity || globalCity;
    if (!city) return res.status(404).json({ error: 'Not found' });
    const pageSlug = pattern + slug;
    seoPageViews.set(pageSlug, (seoPageViews.get(pageSlug) || 0) + 1);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(indiaCity
      ? generateCityIntentPage(slug, city, BASE, pattern)
      : generateGlobalCityIntentPage(slug, city, BASE, pattern));
  };
}

function cityIntentSchema(title, canonical, BASE, city, faqs, breadLabel, breadPath) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', 'name': title, 'url': canonical,
        'inLanguage': 'en-IN',
        'speakable': { '@type': 'SpeakableSpecification', 'cssSelector': ['.direct-answer'] },
        'breadcrumb': {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Home',          'item': BASE + '/' },
            { '@type': 'ListItem', 'position': 2, 'name': breadLabel,       'item': BASE + '/' + breadPath },
            { '@type': 'ListItem', 'position': 3, 'name': city.name,        'item': canonical }
          ]
        }
      },
      {
        '@type': 'FAQPage',
        'mainEntity': faqs.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a } }))
      },
      {
        '@type': 'SoftwareApplication', 'name': 'Build Your Network', 'url': BASE,
        'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Android, Web',
        'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'INR' }
      }
    ]
  });
}

function otherCityPills(slug, pattern, cities) {
  return Object.keys(cities).filter(k => k !== slug)
    .map(k => `<a href="/${pattern}${k}" class="city-pill">${escHtml(cities[k].name)}</a>`).join('');
}

const COOKIE_BANNER_SNIPPET = `<div id="byn-ck" style="display:none;position:fixed;bottom:0;left:0;right:0;z-index:9000;background:#fff;border-top:1px solid #e2e8f0;box-shadow:0 -2px 16px rgba(0,0,0,.08)"><div style="max-width:900px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap"><p style="flex:1;font-size:13px;color:#475569;margin:0;line-height:1.5">We use analytics cookies to improve your experience. <a href="/privacy" style="color:#0F766E;text-decoration:underline">Privacy Policy</a></p><div style="display:flex;gap:8px;flex-shrink:0"><button id="byn-ck-d" style="padding:8px 16px;border-radius:8px;border:1.5px solid #e2e8f0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Decline</button><button id="byn-ck-a" style="padding:8px 16px;border-radius:8px;border:none;background:#0F766E;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Accept</button></div></div></div>
<script src="/js/cookie-consent.js" defer></script>`;

const CITY_PAGE_CSS = `
    :root{--bg:#FFF4EC;--bg2:#FDE8D7;--card:#fff;--primary:#0F766E;--hl:#CCFBF1;--text:#1F2937;--muted:#6B7280;--dim:#9CA3AF}
    *{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
    body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(253,232,215,.6)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
    .logo img{width:26px;height:26px;border-radius:6px}
    .nav-cta{background:var(--primary);color:#fff;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
    .wrap{max-width:860px;margin:0 auto;padding:100px 24px 80px}
    .bc{font-size:13px;color:var(--dim);margin-bottom:32px}.bc a{color:var(--primary);text-decoration:none}
    .tag{display:inline-block;background:var(--hl);color:var(--primary);font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;margin-bottom:16px;letter-spacing:.02em;text-transform:uppercase}
    h1{font-size:clamp(28px,4.5vw,44px);font-weight:800;line-height:1.15;letter-spacing:-1px;margin-bottom:20px}h1 span{color:var(--primary)}
    .lead{font-size:18px;color:var(--muted);line-height:1.7;margin-bottom:36px;max-width:680px}
    .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:60px}
    .btn-p{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--primary);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px}
    .btn-s{display:inline-flex;align-items:center;gap:8px;padding:14px 24px;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;border:2px solid var(--primary)}
    .answer-block{background:var(--card);border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:24px 28px;margin-bottom:56px}
    .answer-block h2{font-size:17px;font-weight:700;margin-bottom:10px}
    .answer-block p{font-size:15px;color:var(--muted);line-height:1.7;margin-bottom:8px}.answer-block p:last-child{margin-bottom:0}
    .sh2{font-size:clamp(20px,3vw,28px);font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
    .sub{font-size:15px;color:var(--muted);margin-bottom:28px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:56px}
    .card{background:var(--card);border:1px solid var(--bg2);border-radius:16px;padding:22px}
    .card-icon{font-size:26px;margin-bottom:10px}.card h3{font-size:15px;font-weight:700;margin-bottom:6px}
    .card p{font-size:13px;color:var(--muted);line-height:1.55}
    details.faq{border:1px solid var(--bg2);border-radius:12px;margin-bottom:10px;overflow:hidden}
    details.faq summary{padding:18px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:var(--card)}
    details.faq summary::-webkit-details-marker{display:none}
    details.faq summary::after{content:'+';font-size:20px;color:var(--primary);font-weight:400;flex-shrink:0;margin-left:12px}
    details[open].faq summary::after{content:'−'}
    details.faq div{padding:0 20px 18px;background:var(--card);font-size:14px;color:var(--muted);line-height:1.7}
    .faq-sec{margin-bottom:56px}
    .city-pills{background:var(--bg2);border-radius:16px;padding:24px;margin-bottom:48px}
    .city-pills h3{font-size:14px;font-weight:700;margin-bottom:12px}
    .city-pill{display:inline-block;background:var(--card);color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:5px 12px;border-radius:8px;margin:3px;border:1px solid rgba(15,118,110,.15)}
    .rel-links{background:var(--card);border:1px solid var(--bg2);border-radius:16px;padding:24px;margin-bottom:48px}
    .rel-links h3{font-size:14px;font-weight:700;margin-bottom:12px}
    .rel-links a{display:inline-block;color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:5px 12px;border-radius:8px;margin:3px;background:var(--bg);border:1px solid var(--bg2)}
    .cta-block{background:var(--primary);border-radius:20px;padding:44px 36px;text-align:center;color:#fff;margin-bottom:60px}
    .cta-block h2{font-size:clamp(18px,3vw,26px);font-weight:800;margin-bottom:10px}
    .cta-block p{font-size:15px;opacity:.85;margin-bottom:22px}
    .cta-block .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;background:#fff;color:var(--primary);text-decoration:none;border-radius:10px;font-weight:700;font-size:15px}
    footer{border-top:1px solid var(--bg2);padding:28px 24px;text-align:center;font-size:13px;color:var(--dim)}
    footer a{color:var(--primary);text-decoration:none}
    @media(max-width:640px){.wrap{padding:80px 16px 60px}.cta-block{padding:28px 16px}}`;

function cityPageShell(head, body, BASE) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${head}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="/assets/logo.png" type="image/png">
  <style>${CITY_PAGE_CSS}</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network" loading="lazy">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>
${body}
<footer><p>&copy; 2026 <a href="/">Build Your Network</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:support@buildyournetwork.online">Support</a></p></footer>
${COOKIE_BANNER_SNIPPET}
<script src="/js/ref-capture-simple.js" defer></script>
</body></html>`;
}

function generateCityIntentPage(slug, city, BASE, pattern) {
  const E = escHtml;
  const cn = city.name;

  const configs = {
    'founders-in-': {
      title:    `Startup Founders in ${cn} — Connect & Collaborate | Build Your Network`,
      metaDesc: `Find and connect with startup founders in ${cn}. Build Your Network shows you founders actively building in ${cn}, ${city.state} — filtered by intent, skills, and proximity. Free to join.`,
      canonical: `${BASE}/founders-in-${slug}`,
      tag:      `${cn} Founders`,
      h1:       `Connect with Startup Founders in <span>${cn}</span>`,
      lead:     `Build Your Network surfaces startup founders in ${cn} who are actively building — filtered by what they're working on, what skills they need, and how close they are to you. No cold email, no noise.`,
      answerH2: `Who are the startup founders in ${cn}?`,
      answerP:  [`${cn} has a growing community of startup founders across ${city.ecosystem}. Key institutions supporting them include ${city.hubs}. ${city.excerpt}`,
                 `On Build Your Network, founders in ${cn} list their venture, their skills, and their current intent — whether they're looking for a co-founder, a mentor, or their first investor. You see exactly who is building what, before you send the first message.`],
      cards: [
        { icon: '🔍', h: 'Discover who\'s building',   p: `See founders in ${cn} filtered by industry, skills, and what they're working on right now.` },
        { icon: '🤝', h: 'Intent-based connection',    p: 'Both founders declare intent before connecting — no wasted meetings, no pitch spam.' },
        { icon: '📍', h: 'Location-aware discovery',   p: `Filter by distance within ${cn} for in-person co-working and collaboration.` },
      ],
      faqs: [
        { q: `How do I find startup founders in ${cn}?`, a: `Join Build Your Network free, enable location discovery, and set your radius to cover ${cn}. BYN shows you founders in ${cn} who are actively building and open to connections — filtered by intent, industry, and skills. No cold outreach needed.` },
        { q: `What are startup founders in ${cn} building?`, a: `${cn} founders are predominantly building in ${city.ecosystem}. ${city.excerpt} On Build Your Network, each founder lists their current project, skills, and intent — giving you full context before the first conversation.` },
        { q: `Is Build Your Network free for founders in ${cn}?`, a: `Yes. Build Your Network is free for founders in ${cn} — create a profile, set your intent, and discover other founders in your city at no cost. Premium plans unlock unlimited connections and priority visibility.` },
        { q: `How is BYN different from LinkedIn for finding founders in ${cn}?`, a: `LinkedIn shows you job titles and work history. BYN shows you what founders in ${cn} are actively building and what they need right now. Intent-based discovery means you connect with people who are looking for exactly what you offer.` },
        { q: `Can I find co-founders in ${cn} through Build Your Network?`, a: `Yes. Set your intent to "Looking for Co-founder" and BYN will surface founders in ${cn} with complementary skills who are also open to co-founding. Filter by technical vs business background, industry, and distance.` },
        { q: `Are there networking events for founders in ${cn}?`, a: `Build Your Network is always-on discovery — unlike event platforms, you can find and message founders in ${cn} any time, not just at scheduled meetups. Key startup hubs in ${cn} include ${city.hubs}.` },
      ],
      breadLabel: 'Startup Founders India', breadPath: 'startup-founders-india',
      ctaH: `Join ${cn}'s Founder Community`, ctaP: 'Free to join. No app download required.',
    },
    'startup-founders-': {
      title:    `Startup Founder Community in ${cn} — Build Your Network`,
      metaDesc: `Join the startup founder community in ${cn}. Build Your Network connects founders, co-founders, mentors, and investors across ${cn}'s startup ecosystem. Free.`,
      canonical: `${BASE}/startup-founders-${slug}`,
      tag:      `${cn} Founder Community`,
      h1:       `${cn}'s <span>Startup Founder Community</span>`,
      lead:     `Build Your Network is the always-on community for startup founders in ${cn}. Connect with founders building in ${city.ecosystem}, find mentors who've done it before, and get in front of investors actively looking at ${cn} deals.`,
      answerH2: `What is the startup founder community in ${cn}?`,
      answerP:  [`${cn}'s startup ecosystem spans ${city.ecosystem}, supported by ${city.hubs}. ${city.excerpt}`,
                 `Build Your Network brings this community online — founders, mentors, and investors all on one platform, each declaring their intent so every connection is purposeful.`],
      cards: [
        { icon: '🏙️', h: `${cn} founder network`,      p: `Access the growing community of founders, operators, and builders in ${cn}'s startup ecosystem.` },
        { icon: '🎯', h: 'Intent-first community',     p: 'Every member declares what they need — co-founder, mentor, investor, or collaborator — before you connect.' },
        { icon: '📈', h: 'Mentors & investors',        p: `Meet ${cn}-based mentors who have scaled startups and investors actively deploying in the city.` },
      ],
      faqs: [
        { q: `What is the startup founder community in ${cn}?`, a: `${cn}'s startup founder community spans ${city.ecosystem}, backed by ${city.hubs}. Build Your Network is the platform where this community connects online — founders, mentors, and investors all in one place, with intent-based discovery that removes cold-outreach friction.` },
        { q: `How do I join the startup community in ${cn}?`, a: `Create a free profile on Build Your Network, set your location to ${cn}, and declare your intent. You'll immediately appear in discovery for other founders, mentors, and investors in ${cn} who are looking for what you offer.` },
        { q: `Are there angel investors in ${cn} on Build Your Network?`, a: `Yes. Investors in ${cn} use BYN to discover early-stage founders. They set their intent to "Angel Investing" or "Looking to Invest" — so when you filter by investor intent in ${cn}, you see exactly who is actively looking at new deals.` },
        { q: `What startup hubs and accelerators are in ${cn}?`, a: `Key startup infrastructure in ${cn} includes ${city.hubs}. ${city.excerpt}` },
        { q: `How is Build Your Network different from other startup communities in ${cn}?`, a: `Most startup communities are event-based or passive directories. BYN is active — every member declares their current intent, so you know who is open to co-founding, who is mentoring, and who is investing, right now. No guessing, no cold DMs.` },
        { q: `Is Build Your Network free for founders in ${cn}?`, a: `Yes. Free accounts include profile creation, intent setting, location-based discovery, and direct messaging. Premium plans unlock unlimited daily connections and priority visibility for faster introductions.` },
      ],
      breadLabel: 'Startup Community India', breadPath: 'startup-community-india',
      ctaH: `Join ${cn}'s Startup Community`, ctaP: 'Free. No app download needed.',
    },
    'find-cofounders-': {
      title:    `Find a Co-Founder in ${cn} — Build Your Network`,
      metaDesc: `Find your co-founder in ${cn}. Build Your Network matches startup founders in ${cn} based on complementary skills and intent. Free to join. No install required.`,
      canonical: `${BASE}/find-cofounders-${slug}`,
      tag:      `Find Co-founders in ${cn}`,
      h1:       `Find Your <span>Co-Founder</span> in ${cn}`,
      lead:     `Build Your Network matches founders in ${cn} who are actively looking for a co-founder. Set your skills, declare your intent, and get surfaced to founders in ${cn} with complementary profiles — no cold email required.`,
      answerH2: `How to find a co-founder in ${cn}`,
      answerP:  [`The best co-founders come from warm connections in your ecosystem. ${cn} has a strong startup base across ${city.ecosystem}, supported by ${city.hubs}.`,
                 `Build Your Network makes co-founder discovery in ${cn} intent-driven: both parties declare they're looking for a co-founder before the match is made. This filters out passive networkers and surfaces only founders who are actively building and ready to partner.`],
      cards: [
        { icon: '🧩', h: 'Skill-based matching',       p: `Tell BYN your skills and what you're building. It surfaces co-founder candidates in ${cn} with complementary profiles.` },
        { icon: '🤝', h: 'Both sides declare intent',  p: 'Co-founder matches only happen when both founders have declared they\'re looking — no wasted conversations.' },
        { icon: '📍', h: `${cn} proximity filter`,     p: `Filter by distance within ${cn} to find co-founders you can meet in person for the early-stage work that matters.` },
      ],
      faqs: [
        { q: `How do I find a co-founder in ${cn}?`, a: `Join Build Your Network free, set your intent to "Looking for Co-founder", add your skills and startup description, and enable location discovery in ${cn}. BYN surfaces founders in ${cn} with complementary skills who are also looking for a co-founder. You can filter by distance — 10 km, 50 km, or 200 km.` },
        { q: `What skills should I look for in a co-founder in ${cn}?`, a: `The most common co-founder pairings in ${cn}'s ecosystem are technical + business (a developer and a GTM founder), or domain expert + operator. In ${cn}'s ${city.ecosystem} space, look for complementary expertise rather than duplicate skills. BYN lets you filter by skill category.` },
        { q: `Is it safe to connect with co-founders on Build Your Network?`, a: `Yes. Every BYN member has a verified profile with their intent, current project, and background visible before you connect. You can review their profile, see their skills and what they're building, and message them directly — all before any commitment.` },
        { q: `How long does it take to find a co-founder in ${cn} on BYN?`, a: `Most founders on BYN receive their first relevant co-founder match within 48 hours of setting up a complete profile. Response rates are higher than LinkedIn DMs because both parties have declared matching intent before the connection request.` },
        { q: `Are there technical co-founders available in ${cn}?`, a: `Yes. ${cn} has a strong talent base across ${city.ecosystem}, and BYN has profiles from engineers, product managers, designers, and domain experts in the city. Filter by skill (engineering, product, design, finance, marketing) to find the right complement for your startup.` },
        { q: `What is Build Your Network and is it free?`, a: `Build Your Network (BYN) is a free intent-based networking platform for startup founders in India. Free accounts include profile creation, co-founder matching, and direct messaging. Premium plans (₹249/month) unlock unlimited daily connections and priority discovery.` },
      ],
      breadLabel: 'Find Co-founders', breadPath: 'find-cofounders',
      ctaH: `Find Your Co-Founder in ${cn}`, ctaP: 'Free. Works in your browser — no download needed.',
    },
    'startup-networking-': {
      title:    `Startup Networking in ${cn} — Connect with Founders | BYN`,
      metaDesc: `Startup networking in ${cn} — connect with founders, investors, and mentors in ${cn}'s startup ecosystem. Build Your Network is the free platform for startup networking in ${cn}, ${city.state}.`,
      canonical: `${BASE}/startup-networking-${slug}`,
      tag:      `Startup Networking · ${cn}`,
      h1:       `Startup Networking in <span>${cn}</span>`,
      lead:     `Build Your Network is the always-on startup networking platform for ${cn}. Meet founders, investors, and mentors in ${cn}'s ecosystem without waiting for the next event. Discover people based on intent, not job title.`,
      answerH2: `How startup networking works in ${cn}`,
      answerP:  [`${cn}'s startup ecosystem is built on ${city.ecosystem}, powered by institutions like ${city.hubs}. ${city.excerpt}`,
                 `Traditional startup networking in ${cn} is event-dependent — pitch nights, demo days, accelerator cohorts. Build Your Network makes it always-on: discover and message founders, investors, and mentors in ${cn} any day, filtered by what they're actively looking for.`],
      cards: [
        { icon: '🌐', h: 'Always-on networking',       p: `Meet founders and investors in ${cn} any time — not just at scheduled events.` },
        { icon: '🎯', h: 'Intent before connection',   p: 'See what each person is open to before you reach out — co-founding, investing, advising, or collaborating.' },
        { icon: '🏙️', h: `${cn} ecosystem access`,    p: `GPS-based discovery surfaces people in ${cn} within your chosen radius — 10 km to 200 km.` },
      ],
      faqs: [
        { q: `How do I do startup networking in ${cn}?`, a: `Join Build Your Network free, set your location to ${cn}, and declare your intent (looking for a co-founder, open to investing, seeking mentorship, etc.). BYN immediately surfaces people in ${cn} who match your intent — no event required, no cold email.` },
        { q: `What startup networking events happen in ${cn}?`, a: `${cn} has regular startup events through ${city.hubs}. Beyond events, Build Your Network provides always-on networking — you can discover and connect with founders, investors, and mentors in ${cn} any day of the week, not just at scheduled meetups.` },
        { q: `How do I meet angel investors through startup networking in ${cn}?`, a: `On Build Your Network, investors in ${cn} set their intent to "Angel Investing" or "Open to Deals". Filter by investor intent in your city radius and you'll see exactly which investors in ${cn} are actively looking at new investments — and you can message them directly.` },
        { q: `Is Build Your Network better than LinkedIn for startup networking in ${cn}?`, a: `For startup-specific networking, yes. LinkedIn shows past jobs; BYN shows current intent. Every member in ${cn} on BYN has declared what they need right now — co-founder, mentor, investor, or collaborator — making connections significantly more likely to convert.` },
        { q: `How do I find mentors for my startup in ${cn}?`, a: `On BYN, mentors in ${cn} set their intent to "Open to Advising". Filter by mentor intent and your city to see exactly who is available. ${cn} has experienced operators across ${city.ecosystem} — many of whom actively mentor early-stage founders via BYN.` },
        { q: `Is Build Your Network free for startup networking in ${cn}?`, a: `Yes. Build Your Network is free — create a profile, set your intent, and start connecting with founders, investors, and mentors in ${cn} at no cost. Premium plans (₹249/month) unlock unlimited connections and priority visibility.` },
      ],
      breadLabel: 'Networking for Founders', breadPath: 'networking-for-founders',
      ctaH: `Start Networking in ${cn}`, ctaP: 'Free. No install required.',
    },
    'professional-networking-': {
      title:    `Professional Networking in ${cn} — Build Your Network`,
      metaDesc: `Build your professional network in ${cn}. Connect with founders, freelancers, mentors, and career professionals by declared intent — not job title. Free, no install required.`,
      canonical: `${BASE}/professional-networking-${slug}`,
      tag:      `Professional Networking · ${cn}`,
      h1:       `Professional Networking in <span>${cn}</span>`,
      lead:     `Build Your Network is the free intent-based professional networking platform for ${cn}. Whether you are changing careers, building a startup, seeking freelance clients, or open to mentoring — declare your intent and meet the right people.`,
      answerH2: `How professional networking works in ${cn}`,
      answerP:  [`${cn}'s professional community is active across ${city.ecosystem}, with key institutions at ${city.hubs}. ${city.excerpt}`,
                 `BYN removes the friction from professional networking in ${cn}: every member declares what they are actively looking for, so you only meet people who want what you offer.`],
      cards: [
        { icon: '🎯', h: 'Intent before connection',   p: `See what each person in ${cn} is open to — co-founding, freelance, mentoring, hiring, or collaborating — before you reach out.` },
        { icon: '📍', h: 'Location-aware discovery',   p: `GPS-based discovery surfaces professionals in ${cn} within your chosen radius — 10 km, 50 km, 200 km, or all of India.` },
        { icon: '🤝', h: 'Every type of professional', p: 'Founders, freelancers, career changers, mentors, investors — all declaring intent so every connection is purposeful.' },
      ],
      faqs: [
        { q: `How do I build a professional network in ${cn}?`, a: `Join Build Your Network free, set your location to ${cn}, and declare your intent — whether that is finding a job, landing clients, changing careers, mentoring, or co-founding. BYN surfaces professionals in ${cn} who match your goals, GPS-filtered to your chosen radius.` },
        { q: `Who uses Build Your Network in ${cn}?`, a: `BYN is used by startup founders, freelancers, consultants, career changers, remote workers, mentors, and investors in ${cn}. Anyone building a professional network in ${cn} based on shared goals — not cold outreach — will find value on BYN.` },
        { q: `Is Build Your Network better than LinkedIn for professional networking in ${cn}?`, a: `For intent-based networking, yes. LinkedIn shows past jobs; BYN shows current goals. Every member in ${cn} on BYN has declared what they need right now — making connections far more likely to be relevant and reciprocal.` },
        { q: `Can freelancers use Build Your Network in ${cn}?`, a: `Yes. Freelancers and consultants in ${cn} use BYN to find clients, collaborators, and referral partners. Set your intent to "Available for Projects" and your skills — BYN surfaces people in ${cn} who are looking for exactly what you offer.` },
        { q: `How do I find a mentor in ${cn}?`, a: `On BYN, mentors in ${cn} set their intent to "Open to Advising". Filter by mentor intent to see exactly who is available in ${cn} and open to new mentoring relationships.` },
        { q: `Is Build Your Network free for professional networking in ${cn}?`, a: `Yes. Build Your Network is free — create a profile, set your intent, and start building your professional network in ${cn} at no cost. Premium plans (₹249/month) unlock unlimited connections and priority visibility.` },
      ],
      breadLabel: 'Networking for Professionals', breadPath: 'professional-networking',
      ctaH: `Build Your Network in ${cn}`, ctaP: 'Free. No install required.',
    },
  };

  const cfg = configs[pattern];
  if (!cfg) return '';

  const faqHtml = cfg.faqs.map(f => `
      <details class="faq" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <summary itemprop="name">${E(f.q)}</summary>
        <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
          <p itemprop="text">${E(f.a)}</p>
        </div>
      </details>`).join('');

  const schema = cityIntentSchema(cfg.title, cfg.canonical, BASE, city, cfg.faqs, cfg.breadLabel, cfg.breadPath);

  const head = `
  <title>${E(cfg.title)}</title>
  <link rel="canonical" href="${E(cfg.canonical)}">
  <meta name="description" content="${E(cfg.metaDesc)}">
  <meta name="robots" content="${TOP_CITIES.has(slug) ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow'}">
  <meta name="geo.region" content="IN">
  <meta name="geo.placename" content="${E(cn)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${E(cfg.canonical)}">
  <meta property="og:title" content="${E(cfg.title)}">
  <meta property="og:description" content="${E(cfg.metaDesc)}">
  <meta property="og:image" content="${BASE}/assets/logo.png">
  <meta property="og:image:alt" content="Build Your Network — ${E(cn)}">
  <meta property="og:site_name" content="Build Your Network">
  <meta property="og:locale" content="en_IN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${E(cfg.title)}">
  <meta name="twitter:description" content="${E(cfg.metaDesc)}">
  <meta name="twitter:image" content="${BASE}/assets/logo.png">
  <meta name="twitter:site" content="@buildyournetwork">
  <script type="application/ld+json">${schema}</script>`;

  const body = `
<div class="wrap">
  <p class="bc"><a href="/">Home</a> › <a href="/${cfg.breadPath}">${E(cfg.breadLabel)}</a> › ${E(cn)}</p>
  <span class="tag">${E(cfg.tag)}</span>
  <h1>${cfg.h1}</h1>
  <p class="lead">${E(cfg.lead)}</p>
  <div class="cta-row">
    <a href="/signup" class="btn-p">Join Free in ${E(cn)}</a>
    <a href="#faq" class="btn-s">How it works</a>
  </div>

  <div class="answer-block">
    <h2>${E(cfg.answerH2)}</h2>
    ${cfg.answerP.map(p => `<p>${E(p)}</p>`).join('')}
  </div>

  <div class="sh2">${E(cfg.cards[0].h)}, ${E(cfg.cards[1].h)}, and more</div>
  <p class="sub">Built for India's founder ecosystem</p>
  <div class="cards">
    ${cfg.cards.map(c => `<div class="card"><div class="card-icon">${c.icon}</div><h3>${E(c.h)}</h3><p>${E(c.p)}</p></div>`).join('')}
  </div>

  <div id="faq" class="faq-sec" itemscope itemtype="https://schema.org/FAQPage">
    <h2 class="sh2">Frequently Asked Questions</h2>
    <p class="sub" style="margin-bottom:20px">About startup networking in ${E(cn)}</p>
    ${faqHtml}
  </div>

  <div class="city-pills">
    <h3>Other startup cities in India</h3>
    ${otherCityPills(slug, pattern, CITIES)}
  </div>

  <div class="rel-links">
    <h3>Related pages</h3>
    <a href="/networking-in-${slug}">Networking in ${E(cn)}</a>
    <a href="/founders-in-${slug}">Founders in ${E(cn)}</a>
    <a href="/find-cofounders-${slug}">Find Co-founders in ${E(cn)}</a>
    <a href="/startup-founders-${slug}">Startup Founders ${E(cn)}</a>
    <a href="/startup-networking-${slug}">Startup Networking ${E(cn)}</a>
    <a href="/networking-for-founders">Networking for Founders</a>
    <a href="/find-cofounders">Find Co-founders</a>
    <a href="/startup-community-india">Startup Community India</a>
    <a href="/linkedin-alternative">LinkedIn Alternative</a>
    <a href="/linkedin-vs-byn">LinkedIn vs BYN</a>
    <a href="/best-networking-platform-for-founders">Best Networking Platform</a>
    <a href="/meetup-alternative">Meetup Alternative</a>
  </div>

  <div class="cta-block">
    <h2>${E(cfg.ctaH)}</h2>
    <p>${E(cfg.ctaP)}</p>
    <a href="/signup" class="btn">Get Started — Free</a>
  </div>
</div>`;

  return cityPageShell(head, body, BASE);
}

// ── 300 PROGRAMMATIC SEO PAGES ── 7 categories × 43 cities
// AI-overview-optimised: quick-answer box, FAQPage schema, SpeakableSpecification, internal linking

const CATEGORY_INTENTS = {
  'founder-networking': {
    slug:    'founder-networking',
    title:   (c) => `Founder Networking in ${c.name} — Connect with Startups | BYN`,
    metaDesc:(c) => `Connect with startup founders in ${c.name} on Build Your Network. Free intent-based networking platform for early-stage founders in ${c.name}, ${c.state} — find co-founders, mentors, and investors.`,
    h1:      (c) => `Founder Networking in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is the free networking platform for startup founders in ${c.name}. It matches founders based on declared intent — whether you're looking for a co-founder, mentor, or investor — using GPS-based discovery across ${c.name}, ${c.state}.`,
    lead:    (c) => `${c.excerpt} BYN connects you with the right founders in ${c.name} — no cold outreach, no noise. Just intent-matched introductions.`,
    sections: [
      { h2: 'Why Founder Networking Requires Intent',        p: (c) => `Traditional platforms optimize for connections. BYN optimizes for outcomes. Founders in ${c.name} declare what they're building and who they need — making every introduction purposeful.` },
      { h2: 'How BYN Works for Founders',                   p: (c) => `Create a free profile, add your startup and intent, and BYN surfaces relevant founders in ${c.name}. GPS-based discovery means you connect with people building near you.` },
      { h2: 'Founder Community in ${c.name}',               p: (c) => `${c.name}'s startup ecosystem — anchored by ${c.hubs} — is built on ${c.ecosystem}. BYN gives you direct access to this community.` },
    ],
    faqs: (c) => [
      { q:`How do startup founders network in ${c.name}?`,        a:`Founders in ${c.name} network through events at ${c.hubs} and intent-based platforms like BYN — which matches you by what you're building and what you need, not just who you know.` },
      { q:`Is BYN free for founders in ${c.name}?`,               a:`Yes. BYN is completely free for founders in ${c.name}. Create a profile, declare your intent, and start connecting today.` },
      { q:`Can I find a co-founder through founder networking in ${c.name}?`, a:`Yes. BYN's founder networking in ${c.name} is built for co-founder search — filter by skills, commitment level, and domain to find your match.` },
      { q:`What startups are based in ${c.name}?`,                a:`${c.name} has a strong ${c.ecosystem} ecosystem. BYN helps you discover active founders building in these sectors.` },
    ],
    related: ['startup-ecosystem', 'cofounder-matching', 'entrepreneur-networking'],
  },
  'entrepreneur-networking': {
    slug:    'entrepreneur-networking',
    title:   (c) => `Entrepreneur Networking in ${c.name} | BYN — Free Platform`,
    metaDesc:(c) => `Join ${c.name}'s entrepreneur networking community on BYN. Connect with business owners, MSME founders, and investors in ${c.name}, ${c.state} — free and intent-based.`,
    h1:      (c) => `Entrepreneur Networking in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is India's free entrepreneur networking platform for ${c.name}. Connect with fellow entrepreneurs, find business partners, and get introductions to mentors and investors — based on your declared business intent.`,
    lead:    (c) => `Entrepreneur networking in ${c.name} is more than exchanging business cards — it's about finding people who understand the founder journey. BYN connects ${c.name}'s entrepreneurial community based on what they're building.`,
    sections: [
      { h2: 'Entrepreneur vs Business Networking',              p: (c) => `Business networking is transactional. Entrepreneur networking is about finding people to build with. BYN's ${c.name} community is for builders, not networkers.` },
      { h2: 'Finding Business Partners in ${c.name}',           p: (c) => `BYN's intent-based matching helps entrepreneurs in ${c.name} find co-founders, advisors, and early collaborators with aligned goals.` },
      { h2: 'Entrepreneurship in ${c.name}',                    p: (c) => `${c.excerpt} BYN makes it easy to tap into ${c.name}'s entrepreneurial energy wherever you are in your journey.` },
    ],
    faqs: (c) => [
      { q:`How do entrepreneurs network in ${c.name}?`,          a:`Entrepreneurs in ${c.name} network at events at ${c.hubs} and online platforms like BYN — which matches you based on business intent, not social connections.` },
      { q:`Is BYN for MSME and SMB entrepreneurs in ${c.name}?`, a:`Yes. BYN welcomes founders at all stages — from early-stage startups to MSME owners building in ${c.name}.` },
      { q:`How is BYN different from LinkedIn for entrepreneurs?`,a:`LinkedIn optimises for career connections. BYN is built for entrepreneurs — you declare what you're building and what you need, and BYN surfaces relevant people in ${c.name}.` },
      { q:`What business communities exist in ${c.name}?`,       a:`${c.name} has an active ${c.ecosystem} business community anchored by ${c.hubs}. BYN extends this community digitally.` },
    ],
    related: ['founder-networking', 'startup-ecosystem', 'investor-networking'],
  },
  'cofounder-matching': {
    slug:    'cofounder-matching',
    title:   (c) => `Co-founder Matching in ${c.name} — Find Your Co-founder | BYN`,
    metaDesc:(c) => `Find a co-founder in ${c.name} with BYN's free matching platform. Filter by skills, commitment, and domain. GPS-based discovery across ${c.name}'s startup ecosystem.`,
    h1:      (c) => `Co-founder Matching in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is a free co-founder matching platform for ${c.name}. Declare your skills and what you're building — BYN matches you with complementary co-founders in ${c.name} based on intent and skill-fit.`,
    lead:    (c) => `Finding the right co-founder is the most important early decision a startup founder makes. BYN's co-founder matching in ${c.name} removes the noise — surfacing founders with complementary skills who are ready to build.`,
    sections: [
      { h2: 'Technical vs Business Co-founder in ${c.name}',    p: (c) => `${c.name}'s ${c.ecosystem} ecosystem creates demand for both technical and business co-founders. BYN lets you filter by background and find the exact co-founder type your startup needs.` },
      { h2: 'How Co-founder Matching Works on BYN',             p: (c) => `Declare what you're building and what kind of co-founder you need. BYN surfaces founders in ${c.name} with the complementary profile. No cold messages to random profiles.` },
      { h2: 'Co-founder Ecosystem in ${c.name}',                p: (c) => `${c.excerpt} BYN connects you with co-founders embedded in ${c.name}'s startup community and ready to build.` },
    ],
    faqs: (c) => [
      { q:`How do I find a co-founder in ${c.name}?`,            a:`Join BYN free, describe your startup idea and what skills you're looking for. BYN surfaces co-founders in ${c.name} with complementary profiles — filter by technical/business background, domain, and commitment level.` },
      { q:`What should I look for in a co-founder in ${c.name}?`,a:`Look for complementary skills, shared commitment, aligned vision, and someone you can disagree with productively. BYN's profile system in ${c.name} lets you filter for these attributes before you connect.` },
      { q:`Where do founders meet co-founders in ${c.name}?`,    a:`Founders in ${c.name} find co-founders at hackathons, events at ${c.hubs}, and intent-based platforms like BYN where people explicitly declare their co-founder availability.` },
      { q:`Is BYN free for co-founder matching in ${c.name}?`,   a:`Yes. BYN's co-founder matching is completely free in ${c.name}. Create a profile and start connecting today.` },
    ],
    related: ['founder-networking', 'startup-ecosystem', 'entrepreneur-networking'],
  },
  'freelancer-networking': {
    slug:    'freelancer-networking',
    title:   (c) => `Freelancer Networking in ${c.name} | Join BYN — Free Platform`,
    metaDesc:(c) => `Freelancers in ${c.name}: grow your professional network on BYN. Connect with startup founders, find contract projects, and build your reputation in ${c.name}'s startup ecosystem — free.`,
    h1:      (c) => `Freelancer Networking in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is a free networking platform for freelancers in ${c.name}. Connect with startup founders looking for contract talent, find collaborative projects, and build your reputation in ${c.name}'s startup community — no app install required.`,
    lead:    (c) => `The startup ecosystem in ${c.name} runs on freelance talent. BYN connects independent professionals with founders who need exactly their skills — turning networking into real opportunities.`,
    sections: [
      { h2: 'Freelancers and the Startup Economy in ${c.name}',  p: (c) => `${c.name}'s ${c.ecosystem} ecosystem creates constant demand for freelance talent in design, development, marketing, and operations. BYN gives you direct access to these founders.` },
      { h2: 'How BYN Helps Freelancers Find Startup Clients',    p: (c) => `Create a BYN profile, declare your skills and what type of work you're open to, and connect with founders in ${c.name} who need your specific expertise.` },
      { h2: "Freelance Opportunities in ${c.name}'s Startup Scene", p: (c) => `${c.excerpt} This growing ecosystem means growing demand for freelance talent. BYN gives you direct access to ${c.name}'s startup founders.` },
    ],
    faqs: (c) => [
      { q:`How do freelancers grow their network in ${c.name}?`,  a:`Freelancers in ${c.name} build their network through startup events, communities at ${c.hubs}, and BYN — where founders actively look for contract talent.` },
      { q:`Can freelancers join startup communities in ${c.name}?`,a:`Yes. BYN welcomes freelancers and contractors. Many founders in ${c.name} are actively looking for freelance collaborators in design, development, and marketing.` },
      { q:`What types of freelancers find work through BYN in ${c.name}?`, a:`Developers, designers, marketers, writers, financial advisors, and legal consultants in ${c.name} use BYN to connect with startup founders who need contract or part-time help.` },
      { q:`Is BYN free for freelancers in ${c.name}?`,            a:`Yes. BYN is completely free. Declare your skills and what you're looking for, and start connecting with founders in ${c.name} immediately.` },
    ],
    related: ['creator-networking', 'founder-networking', 'startup-ecosystem'],
  },
  'creator-networking': {
    slug:    'creator-networking',
    title:   (c) => `Creator Networking in ${c.name} | BYN — Connect with Founders`,
    metaDesc:(c) => `Creators and indie makers in ${c.name}: connect with founders, brands, and collaborators on BYN. Build your professional network in ${c.name}'s startup community — free.`,
    h1:      (c) => `Creator Networking in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is a free platform for creators in ${c.name} to connect with startup founders, brand collaborators, and fellow builders. Declare your niche and intent — BYN surfaces the right connections in ${c.name}.`,
    lead:    (c) => `The creator economy is converging with the startup ecosystem in ${c.name}. BYN bridges these worlds — connecting creators with founders who need their audience, skills, and content expertise.`,
    sections: [
      { h2: 'Creator Economy Meets Startup Ecosystem in ${c.name}', p: (c) => `${c.name}'s ${c.ecosystem} ecosystem creates opportunities for creators who understand the startup world. BYN's intent-based networking lets you declare exactly who you want to meet.` },
      { h2: 'How Creators Use BYN to Find Collaborators',          p: (c) => `Create a BYN profile, describe your content niche and what you're building or looking for, and connect with founders and creators in ${c.name} who share your goals.` },
      { h2: 'Content Creation and Startups in ${c.name}',          p: (c) => `${c.excerpt} BYN gives creators in ${c.name} direct access to the founders and brands building in this ecosystem.` },
    ],
    faqs: (c) => [
      { q:`How do creators build professional networks in ${c.name}?`, a:`Creators in ${c.name} build professional networks through startup events, creator meetups at ${c.hubs}, and BYN — where you connect with founders and brands who need your content expertise.` },
      { q:`Can creators collaborate with startups in ${c.name}?`,  a:`Yes. Many founders in ${c.name} look for creator partners for content marketing, brand building, and distribution. BYN connects you directly based on mutual intent.` },
      { q:`What kinds of creators use BYN in ${c.name}?`,          a:`Content creators, YouTubers, podcasters, writers, designers, indie app makers, and community builders in ${c.name} use BYN to find startup collaborators and brand partnerships.` },
      { q:`Is BYN free for content creators in ${c.name}?`,        a:`Yes. BYN is completely free for creators in ${c.name}. Join, declare your niche, and start networking with the startup community immediately.` },
    ],
    related: ['freelancer-networking', 'founder-networking', 'entrepreneur-networking'],
  },
  'investor-networking': {
    slug:    'investor-networking',
    title:   (c) => `Investor Networking in ${c.name} — Discover Founders | BYN`,
    metaDesc:(c) => `Angel investors and VCs in ${c.name}: discover early-stage founders on BYN. Connect with vetted startups in ${c.name}'s ecosystem — free, intent-based networking platform.`,
    h1:      (c) => `Investor Networking in ${c.name}`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> helps investors in ${c.name} discover early-stage founders actively raising. Founders on BYN declare their funding stage and intent — making it easy for angels and VCs to find relevant startups in ${c.name}.`,
    lead:    (c) => `Finding early-stage deal flow in ${c.name} requires being where founders are. BYN's intent-based platform surfaces founders who are actively raising — giving investors a direct pipeline to ${c.name}'s startup ecosystem.`,
    sections: [
      { h2: 'Angel Investing and Deal Flow in ${c.name}',      p: (c) => `${c.name}'s ${c.ecosystem} ecosystem is active for early-stage investment. BYN gives investors direct access to founders declaring their fundraising intent.` },
      { h2: 'How BYN Works for Investors',                     p: (c) => `Create an investor profile on BYN, declare your investment focus and stage preference, and start connecting with founders in ${c.name} who match your thesis. No intermediaries.` },
      { h2: 'Investment Landscape in ${c.name}',               p: (c) => `${c.excerpt} BYN gives investors a direct channel to the most ambitious founders building in ${c.name} today.` },
    ],
    faqs: (c) => [
      { q:`How do angel investors find startups in ${c.name}?`,  a:`Angel investors in ${c.name} find startups at pitch events at ${c.hubs} and intent-based platforms like BYN — where founders explicitly declare their fundraising stage and goals.` },
      { q:`Is BYN useful for investors looking for deal flow in ${c.name}?`, a:`Yes. BYN's founder profiles include startup stage, sector, and fundraising intent — making it easy to identify relevant deal flow in ${c.name}.` },
      { q:`What sectors are investors most active in ${c.name}?`, a:`${c.name}'s ${c.ecosystem} ecosystem drives investor interest. BYN lets you filter founders by sector and stage to find deal flow matching your thesis.` },
      { q:`How do investors connect with founders on BYN in ${c.name}?`, a:`Create a BYN investor profile with your focus areas and connect directly with founders in ${c.name} who are raising at your preferred stage.` },
    ],
    related: ['founder-networking', 'startup-ecosystem', 'entrepreneur-networking'],
  },
  'startup-ecosystem': {
    slug:    'startup-ecosystem',
    title:   (c) => `Startup Ecosystem in ${c.name} — Network with BYN`,
    metaDesc:(c) => `Explore ${c.name}'s startup ecosystem on BYN. Connect with founders, co-founders, and investors in ${c.name}'s tech and startup community — free, GPS-based networking platform.`,
    h1:      (c) => `${c.name} Startup Ecosystem — Connect with BYN`,
    answer:  (c) => `<strong>Build Your Network (BYN)</strong> is the networking layer for ${c.name}'s startup ecosystem. Founders, investors, mentors, and operators in ${c.name} use BYN to connect based on declared intent — cutting through noise to find the right people.`,
    lead:    (c) => `${c.excerpt} BYN adds a persistent digital layer to ${c.name}'s startup ecosystem — keeping every founder, investor, and operator connected beyond events and introductions.`,
    sections: [
      { h2: "${c.name}'s Key Startup Sectors",                 p: (c) => `The ${c.name} startup ecosystem is built on ${c.ecosystem}. BYN connects founders in these sectors with the co-founders, mentors, and investors they need.` },
      { h2: 'Networking Infrastructure for the Startup Ecosystem', p: (c) => `BYN provides the networking layer ${c.name}'s startup community was missing — intent-based, GPS-enabled, and free. No apps, no LinkedIn spam, just relevant connections.` },
      { h2: "Growing ${c.name}'s Startup Community",           p: (c) => `${c.hubs} are doing tremendous work to grow ${c.name}'s startup ecosystem. BYN extends this work online — keeping the community connected between events and introductions.` },
    ],
    faqs: (c) => [
      { q:`What is the startup ecosystem like in ${c.name}?`,    a:`${c.name} has a strong ${c.ecosystem} ecosystem anchored by ${c.hubs}. ${c.excerpt}` },
      { q:`How do I tap into ${c.name}'s startup community?`,    a:`Join BYN free, declare what you're building and who you're looking for, and instantly connect with active founders, mentors, and investors in ${c.name}.` },
      { q:`What startup hubs are in ${c.name}?`,                 a:`The key startup institutions in ${c.name} include ${c.hubs}. BYN complements these in-person hubs with year-round digital connectivity.` },
      { q:`Is BYN available in ${c.name}?`,                      a:`Yes. BYN uses GPS-based discovery to surface founders and builders in ${c.name}. It's free to join and works without a mobile app install.` },
    ],
    related: ['founder-networking', 'cofounder-matching', 'investor-networking'],
  },
};

const CATEGORY_SLUGS = Object.keys(CATEGORY_INTENTS);

function generateCategoryPage(citySlug, city, BASE, catKey) {
  const E = escHtml;
  const cat = CATEGORY_INTENTS[catKey];
  if (!cat) return '<h1>Not found</h1>';

  const canonical = `${BASE}/${catKey}-${citySlug}`;
  const title    = cat.title(city);
  const metaDesc = cat.metaDesc(city);
  const h1text   = cat.h1(city);
  const answer   = cat.answer(city);
  const lead     = cat.lead(city);
  const faqs     = cat.faqs(city);

  // Related city links (up to 8 other cities, same category)
  const otherCities = Object.keys(CITIES).filter(k => k !== citySlug).slice(0, 8)
    .map(k => `<a href="/${catKey}-${k}">${E(CITIES[k].name)}</a>`).join('\n        ');

  // Related category links (same city)
  const relatedCategoryLinks = cat.related
    .map(r => `<a href="/${r}-${citySlug}">${E(CATEGORY_INTENTS[r]?.h1(city) || r)}</a>`).join('\n        ');

  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });

  const webpageJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: metaDesc,
    url: canonical,
    inLanguage: 'en-IN',
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.direct-answer'] },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: h1text, item: canonical },
      ],
    },
    isPartOf: { '@type': 'WebSite', name: 'Build Your Network', url: BASE },
  });

  const faqHtml = faqs.map(f => `
    <details class="faq-item" itemscope itemtype="https://schema.org/Question">
      <summary itemprop="name">${E(f.q)}</summary>
      <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
        <p itemprop="text">${E(f.a)}</p>
      </div>
    </details>`).join('');

  const sectionsHtml = cat.sections.map(s => `
    <div class="know-block">
      <h2>${E(s.h2.replace('${c.name}', city.name))}</h2>
      <p>${E(s.p(city))}</p>
    </div>`).join('');

  const head = `
  <title>${E(title)}</title>
  <meta name="description" content="${E(metaDesc)}">
  <meta name="robots" content="${TOP_CITIES.has(citySlug) ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow'}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${E(title)}">
  <meta property="og:description" content="${E(metaDesc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#0F766E">
  <script type="application/ld+json">${webpageJsonLd}</script>
  <script type="application/ld+json">${faqJsonLd}</script>`;

  const body = `
<div class="city-hero">
  <div class="city-hero-inner">
    <div class="city-tag">${E(city.name)} · ${E(city.state)}</div>
    <h1>${E(h1text)}</h1>
    <p class="lead">${E(lead)}</p>
    <div class="cta-row">
      <a href="/signup" class="btn">Join Free — No App Required</a>
      <a href="/networking-in-${citySlug}" class="btn-sec">All ${E(city.name)} Networking</a>
    </div>
    <section class="quick-answer" aria-label="Quick answer">
      <p>${answer}</p>
    </section>
  </div>
</div>
<div class="city-body">
  ${sectionsHtml}
  <div class="know-block">
    <h2>Related Networking in ${E(city.name)}</h2>
    <div class="pill-row">
        ${relatedCategoryLinks}
    </div>
  </div>
  <div class="know-block">
    <h2>Explore Other Cities</h2>
    <div class="pill-row">
        ${otherCities}
    </div>
  </div>
  <div class="faq-block">
    <h2>Frequently Asked Questions</h2>
    ${faqHtml}
  </div>
  <div class="cta-block">
    <h2>Start Networking in ${E(city.name)} — Free</h2>
    <p>Join Build Your Network and connect with the right people in ${E(city.name)} based on what you're building and who you need.</p>
    <a href="/signup" class="btn">Get Started — Free</a>
  </div>
</div>`;

  return cityPageShell(head, body, BASE);
}

// Route maker for 7 new category patterns
function makeCategoryRoute(catKey) {
  return (req, res) => {
    const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
    const slug = req.params.city.toLowerCase().replace(/[^a-z]/g, '');
    const city = CITIES[slug];
    if (!city) return res.status(404).json({ error: 'Not found' });
    const pageKey = catKey + '-' + slug;
    seoPageViews.set(pageKey, (seoPageViews.get(pageKey) || 0) + 1);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(generateCategoryPage(slug, city, BASE, catKey));
  };
}

// Register 7 category routes × 43 cities = 301 programmatic pages
app.get('/founder-networking-:city',     makeCategoryRoute('founder-networking'));
app.get('/entrepreneur-networking-:city',makeCategoryRoute('entrepreneur-networking'));
app.get('/cofounder-matching-:city',     makeCategoryRoute('cofounder-matching'));
app.get('/freelancer-networking-:city',  makeCategoryRoute('freelancer-networking'));
app.get('/creator-networking-:city',     makeCategoryRoute('creator-networking'));
app.get('/investor-networking-:city',    makeCategoryRoute('investor-networking'));
app.get('/startup-ecosystem-:city',      makeCategoryRoute('startup-ecosystem'));

// Register 4 new intent-pattern routes + Programmatic city route
app.get('/founders-in-:city',            makeCityRoute('founders-in-',            seoPageViews));
app.get('/startup-founders-:city',       makeCityRoute('startup-founders-',       seoPageViews));
app.get('/find-cofounders-:city',        makeCityRoute('find-cofounders-',        seoPageViews));
app.get('/startup-networking-:city',     makeCityRoute('startup-networking-',     seoPageViews));
app.get('/professional-networking-:city',makeCityRoute('professional-networking-',seoPageViews));

// Programmatic city route — must come after all static routes
app.get('/networking-in-:city', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  const slug      = req.params.city.toLowerCase().replace(/[^a-z]/g, '');
  const indiaCity = CITIES[slug];
  const globalCity = US_CITIES[slug] || EU_CITIES[slug];
  const city = indiaCity || globalCity;
  if (!city) return res.status(404).json({ error: 'Not found' });
  const citySlug = 'networking-in-' + slug;
  seoPageViews.set(citySlug, (seoPageViews.get(citySlug) || 0) + 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Vary', 'Accept-Encoding');
  res.send(indiaCity ? generateCityPage(slug, city, BASE) : generateGlobalCityPage(slug, city, BASE));
});

// US and Europe hub pages
app.get('/startup-networking-us', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  seoPageViews.set('startup-networking-us', (seoPageViews.get('startup-networking-us') || 0) + 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Vary', 'Accept-Encoding');
  res.send(generateHubPage('us', US_CITIES, BASE));
});

app.get('/startup-networking-europe', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  seoPageViews.set('startup-networking-europe', (seoPageViews.get('startup-networking-europe') || 0) + 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Vary', 'Accept-Encoding');
  res.send(generateHubPage('eu', EU_CITIES, BASE));
});

// ── PHASE 7 — Blog content system ────────────────────────────────────────────
const ARTICLES = [
  {
    slug: 'how-to-find-a-cofounder-in-india',
    title: 'How to Find a Co-Founder in India in 2026',
    metaDesc: 'A practical guide to finding the right co-founder in India — covering where to look, what to look for, and how to structure the conversation before you commit.',
    date: '2025-04-10',
    category: 'Co-founder Search',
    keywords: 'how to find a cofounder in india, cofounder search india, find technical cofounder, startup cofounder platform india',
    h1: 'How to Find a Co-Founder in India in 2026',
    intro: 'Finding a co-founder is one of the most consequential decisions you will make as an early-stage founder. The wrong co-founder is worse than no co-founder — misaligned incentives, equity disputes, and divergent work ethics can destroy a startup faster than a failed product.',
    sections: [
      { h2: 'Where most Indian founders look for co-founders (and why it fails)', body: 'Most founders start with LinkedIn — and most get nowhere. LinkedIn has no co-founder intent filter. You are messaging professionals based on job titles, not on whether they are actively looking to start something. The response rate for cold LinkedIn DMs to potential co-founders is consistently under 5%.\n\nThe second most common approach is friends-of-friends — which works occasionally but limits your search to your existing social graph. You end up with someone familiar, not necessarily complementary.\n\nStartup events (Meetup, IIT/IIM entrepreneur fests, T-Hub events) produce occasional matches but are event-gated — your networking window is three hours once a month, and most attendees are there to learn, not to commit to a co-founder relationship.' },
      { h2: 'What actually works: intent-based co-founder discovery', body: 'The most effective co-founder searches in India now happen through platforms built for that specific use case. Build Your Network (BYN) is the only platform in India where founders explicitly set their intent to "Looking for Co-founder", making their need visible to others who want to partner.\n\nThis shifts the dynamic completely. Instead of cold-messaging someone who might be interested, you are connecting with someone who has already declared that they are actively looking. Response rates are dramatically higher — typically 40-60% on BYN vs under 5% on LinkedIn for the same ask.' },
      { h2: 'What to look for before you commit to a co-founder', body: 'Before any co-founder conversation becomes a commitment, evaluate four things:\n\n1. **Skill complementarity** — If you are technical, find a business co-founder. If you are business-focused, find a technical co-founder. Two business co-founders without a technical partner is a common early mistake in India.\n\n2. **Work style compatibility** — Are you both full-time? Are you both comfortable with ambiguity? Misaligned commitment levels (one full-time, one consulting) create resentment fast.\n\n3. **Domain fit** — Has your potential co-founder worked in your target domain? Domain knowledge matters less than you think early on, but industry relationships matter a lot.\n\n4. **Equity and legal clarity** — Have the equity, vesting, and IP assignment conversation before you start building anything together.' },
      { h2: 'The 90-day trial co-founder structure', body: 'The best way to evaluate a potential co-founder in India is a structured 90-day trial before any equity commitment. Agree on a project milestone — build a specific feature, close a specific number of customer conversations, or complete a market research document. Evaluate at the end.\n\nThis is standard practice at top accelerators like Y Combinator and has been adopted by many early-stage founders in India. It removes the pressure of a permanent commitment before you have seen how the person works under real conditions.' },
    ],
    relatedSlugs: ['cofounder-equity-split-guide', 'startup-networking-india-guide'],
    cityLinks: ['/find-cofounders', '/networking-for-founders', '/find-cofounders-bengaluru', '/find-cofounders-mumbai', '/find-cofounders-hyderabad'],
    ctaText: 'Find co-founders on Build Your Network — intent-based, GPS-filtered, free.',
    ctaBtn: 'Start Co-founder Search',
  },
  {
    slug: 'cofounder-equity-split-guide',
    title: 'Co-Founder Equity Split: What Indian Startups Get Wrong',
    metaDesc: 'How to split equity with a co-founder in India — common mistakes, the right frameworks, and why a 50-50 split is often the best starting point.',
    date: '2025-04-18',
    category: 'Co-founder Search',
    keywords: 'cofounder equity split india, startup equity split founders, how to split equity startup india, founder equity agreement',
    h1: 'Co-Founder Equity Split: What Indian Startups Get Wrong',
    intro: 'Equity split conversations are avoided by most early-stage founders until they become unavoidable — and by then, the resentment has usually already started. Getting the equity split right at the beginning is not about fairness; it is about alignment.',
    sections: [
      { h2: 'The most common mistake: contribution-based early splits', body: 'The most frequent mistake Indian startups make is splitting equity based on early contribution — "you built the MVP, you get 70%; I did the market research, I get 30%." This feels logical but is almost always wrong.\n\nEarly contribution is the least reliable predictor of long-term value. The founder who wrote 10,000 lines of code in the first month may burn out in month four. The founder who spent three months building customer relationships may close the deal that funds the next two years. Early work does not predict future performance.' },
      { h2: 'Why 50-50 is often the right answer', body: 'For two-founder startups at the pre-product stage, a 50-50 split with vesting is usually the best starting point. Here is why:\n\nIt signals equal commitment. It eliminates one co-founder feeling like an employee. It forces genuine consensus on decisions (no one can override the other without a real conversation). And practically, it is what most top investors in India expect to see in an early-stage startup.\n\nThe risk of 50-50 — "what if we deadlock?" — is real but manageable: build an explicit deadlock resolution process into your founders\' agreement. The risk of an unequal split that creates resentment is far more common and far harder to fix.' },
      { h2: 'Vesting: the protection mechanism that most Indian startups skip', body: 'Every co-founder agreement in India should have a 4-year vesting schedule with a 1-year cliff. This means:\n\n- No equity vests in the first 12 months (the cliff)\n- After 12 months, 25% vests immediately\n- The remaining 75% vests monthly over the next 36 months\n\nThis protects both founders. If one co-founder leaves in month eight, they take no equity with them. If both stay and build, both get the full allocation.\n\nMost Indian startup failures involving co-founder disputes happen because there was no vesting schedule. One founder leaves early and keeps 40% of the company — making it nearly impossible to raise funding.' },
      { h2: 'The conversation you must have before signing anything', body: 'Before any equity agreement, have explicit conversations about: full-time vs part-time commitment, salary expectations (especially once you raise), how decisions will be made, what happens if one of you wants to leave, and IP assignment (all code, designs, and IP must be assigned to the company, not held personally).\n\nIn India, the simplest legal vehicle for a startup co-founder agreement is a well-drafted SHA (Shareholders Agreement) drafted by a startup-focused CA or lawyer. Do not use templates — get it done properly once. Costs ₹15,000-40,000 and prevents problems worth crores later.' },
    ],
    relatedSlugs: ['how-to-find-a-cofounder-in-india', 'startup-networking-india-guide'],
    cityLinks: ['/find-cofounders', '/networking-for-founders', '/find-cofounders-bengaluru', '/find-cofounders-mumbai'],
    ctaText: 'Find the right co-founder before you worry about the split.',
    ctaBtn: 'Start Co-founder Search Free',
  },
  {
    slug: 'startup-networking-india-guide',
    title: 'Startup Networking in India: The Complete Guide for Founders',
    metaDesc: 'How startup founders in India should build their professional network — which platforms work, what to avoid, and how to convert connections into co-founders, investors, and customers.',
    date: '2025-04-25',
    category: 'Founder Growth',
    keywords: 'startup networking india, how to network as a founder india, founder networking guide, best networking for startups india',
    h1: 'Startup Networking in India: The Complete Guide for Founders',
    intro: 'Networking is not optional for startup founders in India — it is infrastructure. Your next co-founder, first investor, or first enterprise customer is almost certainly in someone else\'s network before they are in yours. This guide covers what actually works.',
    sections: [
      { h2: 'Why generic networking advice fails Indian founders', body: 'Most networking advice is written for corporate professionals in Western markets. "Attend conferences." "Use LinkedIn Premium." "Build your personal brand." This advice is expensive, slow, and optimized for the wrong outcome for an early-stage Indian founder.\n\nYou do not need 10,000 LinkedIn followers. You need three things: one technical co-founder, two or three early customers who will tell you what to build, and one investor who can write a first check. Networking for founders is about finding those three things — everything else is a distraction.' },
      { h2: 'The three types of relationships that matter most for Indian founders', body: '**Co-founders and early team**: The relationship that determines whether your startup survives the first year. Found through domain-specific communities, alumni networks, and intent-based platforms like Build Your Network where both parties declare their co-founder search status.\n\n**Peer founders at the same stage**: The most underrated relationship in early-stage startups. Founders at the same stage share information about investors, pilots, government schemes, and co-working spaces. They are your competitive intelligence and emotional support network simultaneously.\n\n**One or two senior advisors**: Experienced operators who have navigated what you are about to navigate. They should own 0.25-1% equity with a 2-year vest. More than two senior advisors is usually a distraction — fewer is usually better.' },
      { h2: 'Where to build your founder network in India (by effectiveness)', body: 'Ranked by ROI for early-stage founders in India:\n\n1. **Intent-based platforms (Build Your Network)**: Highest signal for co-founder and investor discovery. You see only people who are actively looking for what you offer.\n\n2. **Accelerator programs (Y Combinator, Antler, NASSCOM, TechStars)**: The highest-quality founder networks you can access. Even if you are not selected, the process of applying and doing intros builds relevant connections.\n\n3. **Alumni networks (IIT, IIM, BITS, NIT)**: Still the strongest trust-building shortcut in India. A shared college creates an implicit reference that cold introductions cannot replicate.\n\n4. **Domain Slack and WhatsApp groups**: High noise, occasional signal. Worth joining one or two that are highly specific to your domain.\n\n5. **LinkedIn**: Good for credibility and content. Poor for active co-founder or investor discovery without a structured approach.' },
      { h2: 'The outreach framework that actually works', body: 'Most founder networking fails because the outreach is too vague. "I would love to connect and learn from your experience" gets ignored. Here is what works:\n\n**For co-founder outreach**: State specifically what you are building, what you have already done (users, revenue, deployed product), and exactly what kind of co-founder you are looking for. Make the mutual benefit clear upfront.\n\n**For investor outreach**: Attach a one-pager. State your traction (even if small), your ask, and why you are reaching out to this specific investor (not just "I think BYN is a good fit for your portfolio"). Specificity signals preparation.\n\n**For advisor outreach**: Be specific about what you need from them. "I need someone who has navigated Series A enterprise sales in India" is easier to say yes to than "I want to learn from your experience."' },
    ],
    relatedSlugs: ['how-to-find-a-cofounder-in-india', 'investor-networking-india'],
    cityLinks: ['/startup-community-india', '/startup-networking-events', '/networking-for-founders', '/networking-in-bengaluru', '/networking-in-mumbai', '/networking-in-hyderabad'],
    ctaText: 'Build Your Network connects founders, investors, and mentors across India by intent.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'investor-networking-india',
    title: 'How to Network with Angel Investors in India as a First-Time Founder',
    metaDesc: 'How first-time founders in India can build relationships with angel investors — without cold pitching, without a warm intro, and without attending expensive events.',
    date: '2025-05-02',
    category: 'Fundraising',
    keywords: 'angel investor networking india, how to meet angel investors india, startup investor outreach india, first time founder investor networking',
    h1: 'How to Network with Angel Investors in India as a First-Time Founder',
    intro: 'Most first-time founders in India treat investor networking like a transaction — pitch deck, cold email, rejection. The founders who successfully raise their first angel round treat it as a relationship-building process that starts 6-12 months before they actually need the money.',
    sections: [
      { h2: 'The investor landscape in India that first-time founders miss', body: 'India\'s angel investing landscape is more accessible than most founders believe. There are three tiers:\n\n**Micro-angels (₹5L-₹25L tickets)**: Successful professionals — CA, CXOs, startup employees with ESOPs — who are deploying small personal capital into early-stage startups. Often found on platforms like Build Your Network, LetsVenture, and local angel networks.\n\n**Angel networks (₹25L-₹2Cr tickets)**: Mumbai Angels, Indian Angel Network, Lead Angels, 100X.VC, and regional equivalents. These are organized groups that pool capital and do structured due diligence.\n\n**Institutional pre-seed (₹2Cr-₹10Cr)**: Antler, Kalaari, Blume, 3one4, and similar firms that write first checks into pre-revenue or early-revenue companies.' },
      { h2: 'How to build investor relationships before you need the money', body: 'The single best time to meet an investor is before you need their money. Here is the specific approach:\n\n1. **Join the platforms they use**: Build Your Network has investors who have declared "Open to Angel Investing" intent. This means they are actively looking — your first message has a completely different reception than a cold email.\n\n2. **Write about what you are building**: Not a pitch — an honest update about what you are learning. Send it to 10 investors monthly as a "build in public" update. Most will not respond, but three or four will. Those become your relationship pipeline.\n\n3. **Ask for feedback, not money**: "I am building X. I would love 20 minutes of your perspective on this market — not a pitch, just genuine feedback." Conversion rate is 5x higher than "would you like to invest?"' },
      { h2: 'What investors in India actually want to see before writing a first check', body: 'Indian angel investors at the ₹25L-₹2Cr level are primarily evaluating: the founder\'s ability to execute on something specific, evidence that the market problem is real, and some signal that users want this (even if paid or beta users).\n\nThey are not primarily evaluating the size of the market (you can always tell a big market story), the technology (they usually cannot evaluate it anyway), or your projections (no one believes year-3 projections at pre-seed).\n\nThe most compelling pitch deck for an Indian angel investor is: 3-4 slides on the problem (with specific user quotes), 1 slide on what you have already built and shipped, 1 slide on early traction (even 100 users counts), and 1 slide on the ask and use of funds.' },
      { h2: 'The platforms and communities where Indian angels are actually active', body: 'Beyond cold email:\n\n- **Build Your Network**: Angels declare investment intent and are discoverable by city and stage preference\n- **LetsVenture**: India\'s largest organized angel platform for ticket sizes of ₹25L+\n- **Titan Capital community events**: Access to prominent Indian angel investors through their portfolio company events\n- **YC Alumni India network**: Very high quality, but requires someone in the network to make the introduction\n- **Domain-specific Slack groups** (FinTech, HealthTech, AgriTech): Investors active in specific domains often participate in these groups' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'how-to-find-a-cofounder-in-india'],
    cityLinks: ['/angel-investors-india', '/networking-for-investors', '/find-startup-mentor', '/founders-in-bengaluru', '/founders-in-mumbai'],
    ctaText: 'Find angels who are actively looking for startups — on Build Your Network.',
    ctaBtn: 'Find Investors Free',
  },
  {
    slug: 'bengaluru-startup-ecosystem-guide',
    title: 'Bengaluru Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'Everything a startup founder needs to know about building a company in Bengaluru — the ecosystem, co-working spaces, investor community, and how to build your network fast.',
    date: '2025-05-08',
    category: 'City Guides',
    keywords: 'bengaluru startup ecosystem, startup founder network bengaluru, co-working spaces bengaluru startups, bangalore angel investors 2026',
    h1: 'Bengaluru Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Bengaluru is India\'s default location for a reason. The density of technical talent, the highest concentration of VC firms in the country, and a culture of startup-native professionals who understand equity and ambiguity make it uniquely well-suited for technology startups.',
    sections: [
      { h2: 'Why Bengaluru remains India\'s #1 startup city', body: 'Three structural advantages explain Bengaluru\'s dominance:\n\n**Engineering talent density**: The concentration of senior engineers from Amazon, Flipkart, Swiggy, PhonePe, and hundreds of product companies creates a pool of potential technical co-founders and early employees unlike any other Indian city. Engineers in Bengaluru are significantly more likely to have worked in a startup than engineers elsewhere.\n\n**VC ecosystem**: Bengaluru is home to the India offices of virtually every major VC fund — Sequoia India, Accel, Matrix, Kalaari, Nexus, and 3one4 are all headquartered or have primary offices in the city.\n\n**Founder culture**: There is a social acceptance of leaving a high-paying job to start a company in Bengaluru that does not exist at the same level in Mumbai, Delhi, or Hyderabad. This makes co-founder recruitment significantly easier.' },
      { h2: 'Where to build your founder network in Bengaluru', body: 'Specific places where your probability of finding a technical co-founder, investor, or early customer is highest in Bengaluru:\n\n**Indiranagar and Koramangala**: The two highest-density startup neighborhoods. Most accelerator demo days, startup events, and co-founder networking events happen within 5 km of these two areas.\n\n**NASSCOM CoE**: Has regular events specifically for founders at the pre-seed and seed stage.\n\n**IIMB NSRCEL**: Run accelerator programs that attract founders from across India. Excellent for B2B SaaS and deep tech founders.\n\n**Build Your Network**: GPS-filtered discovery lets you find founders and investors within 10 km of your location in Bengaluru. Set your intent and location — the platform surfaces co-founders actively looking in your neighborhood.' },
      { h2: 'The Bengaluru investor community in 2026', body: 'Angel investors in Bengaluru tend to concentrate in two groups:\n\n**Ex-startup operators**: Former employees of Flipkart, Ola, BYJU\'S, Freshworks, Razorpay who received large ESOP payouts and are now deploying ₹5L-₹50L tickets into early-stage startups. This is the most accessible capital in Bengaluru for first-time founders.\n\n**Institutional pre-seed**: Blume Ventures, 3one4, and Antler all run strong deal flows from Bengaluru and actively look at pre-product teams with strong founding backgrounds.\n\nThe Bengaluru angel community is tightly networked — one warm introduction cascades quickly. Getting your first meeting right matters significantly.' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'investor-networking-india'],
    cityLinks: ['/find-startup-mentor', '/angel-investors-india', '/networking-in-bengaluru', '/founders-in-bengaluru', '/find-cofounders-bengaluru', '/startup-networking-bengaluru'],
    ctaText: 'Find co-founders and investors in Bengaluru on Build Your Network.',
    ctaBtn: 'Join Free in Bengaluru',
  },
  {
    slug: 'mumbai-startup-ecosystem-guide',
    title: 'Mumbai Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'A founder\'s guide to building a startup in Mumbai — the ecosystem, fintech advantage, investor access, and how to network with other founders in the city.',
    date: '2025-05-12',
    category: 'City Guides',
    keywords: 'mumbai startup ecosystem, startup networking mumbai, fintech startups mumbai, angel investors mumbai 2026',
    h1: 'Mumbai Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Mumbai is India\'s financial capital and the dominant location for fintech, D2C, and media-tech startups. If your startup touches financial services, consumer brands, or media, Mumbai gives you unmatched access to the customers, distribution partners, and capital you need.',
    sections: [
      { h2: 'What Mumbai does uniquely well for startups', body: 'Mumbai\'s advantages are concentrated and specific:\n\n**Capital access**: Mumbai has the highest density of institutional capital in India. HNI investors, family offices, and the city\'s financial ecosystem create a fundraising environment that Bengaluru\'s VC-heavy market cannot replicate for cheque sizes of ₹50L-₹5Cr.\n\n**D2C and consumer brand expertise**: The cluster of advertising agencies, media companies, and distribution networks in Mumbai is unmatched in India for building a consumer brand. If you are building a D2C startup, Mumbai gives you access to brand-building talent that Bengaluru simply does not have.\n\n**Fintech regulatory adjacency**: RBI, SEBI, and NPCI proximity matters for regulated fintech businesses. Mumbai-based founders have meaningfully easier access to regulatory guidance and compliance expertise.' },
      { h2: 'Where founders network in Mumbai', body: 'Specific locations and communities:\n\n**Bandra-Kurla Complex (BKC)**: The financial and startup hub. Most fintech startups, VC firms, and accelerator offices are in or near BKC.\n\n**Powai**: The tech cluster adjacent to IIT Bombay. Strong for deep tech, edtech, and product-focused founders.\n\n**IIT Bombay STP (Society for Technology and Policies)**: One of the most active founder communities in Mumbai, running regular events and providing incubation support.\n\n**Build Your Network**: GPS discovery within 10 km lets you find co-founders and investors actively looking in your specific area of Mumbai — BKC, Powai, Andheri, or Bandra.' },
      { h2: 'Mumbai vs Bengaluru for tech startups: the honest comparison', body: 'For most technology startups, Bengaluru wins on engineering talent, technical co-founder availability, and VC access. Mumbai wins on capital access (HNI/family office), distribution and brand-building expertise, financial services ecosystem, and D2C go-to-market.\n\nMany founders run the two cities in parallel — Bengaluru engineering team, Mumbai sales and fundraising. This is more common than it appears, and it is usually the right call for startups with a B2B SaaS or fintech component.' },
    ],
    relatedSlugs: ['bengaluru-startup-ecosystem-guide', 'startup-networking-india-guide'],
    cityLinks: ['/find-startup-mentor', '/angel-investors-india', '/networking-in-mumbai', '/founders-in-mumbai', '/find-cofounders-mumbai'],
    ctaText: 'Find co-founders and investors in Mumbai on Build Your Network.',
    ctaBtn: 'Join Free in Mumbai',
  },
  {
    slug: 'technical-cofounder-search-india',
    title: 'How to Find a Technical Co-Founder in India: The Honest Guide',
    metaDesc: 'Where to find a technical co-founder in India, what actually works, and how to evaluate a technical partner when you are not technical yourself.',
    date: '2025-05-16',
    category: 'Co-founder Search',
    keywords: 'find technical cofounder india, technical cofounder search, how to find cto cofounder india, non technical founder cofounder',
    h1: 'How to Find a Technical Co-Founder in India: The Honest Guide',
    intro: 'Finding a technical co-founder is the most common challenge for non-technical startup founders in India. The standard advice — "post on LinkedIn", "attend hackathons", "ask your engineer friends" — fails most of the time. Here is what actually works.',
    sections: [
      { h2: 'Why engineers are reluctant to join early-stage startups in India', body: 'Senior engineers in India have significant opportunity cost. A software engineer with 5 years of experience at a product company in Bengaluru is earning ₹30-50L/year. Joining an early-stage startup for equity requires them to take a 40-70% salary cut and bet on a 5-7 year outcome.\n\nThis means your pitch to a technical co-founder needs to address the financial reality explicitly: What is the path to recovering their income? How much equity makes the risk worthwhile? What is the traction that makes this a credible bet?\n\nFounders who treat technical co-founder recruitment like they are doing the engineer a favor consistently fail to attract strong technical co-founders.' },
      { h2: 'The three types of technical co-founders available in India', body: '**The corporate engineer looking to build**: The most common profile — a 4-8 year engineering professional who has built significant skills at a product company and wants to apply them to something they own. Usually wants meaningful equity (20-35%), strong co-founder equity, and some path to market salary as the company grows.\n\n**The student / recent graduate**: High ambition, lower opportunity cost, lower immediate salary expectation. The risk is experience — building a startup requires navigating technical decisions that a senior engineer handles automatically.\n\n**The serial founder / ex-CTO**: Rare, expensive (equity-wise), and usually only interested in founders who have strong domain expertise or early traction. Best approached through warm introductions.' },
      { h2: 'Where to find technical co-founders in India today', body: 'Ranked by effectiveness:\n\n1. **Intent-based platforms (Build Your Network)**: The most direct route — engineers who have declared "Looking for Co-founder" intent are already in search mode. GPS filtering lets you find technical co-founders in your city.\n\n2. **IIT/BITS/NIT alumni networks**: The highest-trust shortcut. A shared institution creates implicit credibility that cold outreach cannot replicate.\n\n3. **Hackathons**: AngelHack India, HackInOut, and university hackathons consistently produce co-founder matches. Spend a weekend building with someone before you commit to a multi-year relationship.\n\n4. **Freelance platforms**: Upwork and Toptal occasionally produce co-founder matches, but the dynamic starts commercially, which makes the transition to equity partnership awkward.\n\n5. **LinkedIn (with a very specific approach)**: Not "would you like to co-found?" but "I am building X, we have [traction], I am looking for a technical co-founder who has done [specific thing] — is that something you are exploring?"' },
      { h2: 'How to evaluate a technical co-founder when you are not technical', body: 'Four non-technical indicators of a strong technical co-founder:\n\n1. **They ask questions before writing code**: Good engineers spend time understanding the problem. If a potential technical co-founder wants to start building immediately without deeply understanding the customer, that is a red flag.\n\n2. **They have shipped products to real users**: Ask specifically — not "what have you built" but "what products have real users used?" Portfolio that includes production systems beats impressive GitHub repos.\n\n3. **They think about the problem, not just the solution**: The best technical co-founders are interested in understanding why users behave the way they do, not just what feature to build next.\n\n4. **Their references are from people they have built products with**: Not managers. Not colleagues who watched them work. People who built something with them under deadline pressure.' },
    ],
    relatedSlugs: ['how-to-find-a-cofounder-in-india', 'cofounder-equity-split-guide'],
    cityLinks: ['/find-cofounders', '/networking-for-founders', '/find-cofounders-bengaluru', '/find-cofounders-hyderabad', '/find-cofounders-mumbai'],
    ctaText: 'Find technical co-founders by intent on Build Your Network — GPS-filtered by city.',
    ctaBtn: 'Find Technical Co-founders',
  },
  {
    slug: 'startup-community-india-2025',
    title: 'The Best Startup Communities in India for Founders in 2026',
    metaDesc: 'A ranked guide to the best startup communities, networks, and platforms for founders in India in 2026 — from Bengaluru to Delhi, online and in-person.',
    date: '2025-05-20',
    category: 'Founder Growth',
    keywords: 'best startup communities india, startup founder community 2026, online startup community india, founder network india',
    h1: 'The Best Startup Communities in India for Founders in 2026',
    intro: 'A founder\'s community determines their ceiling. The right community brings faster fundraising, better co-founder matches, and the operational knowledge that typically takes years to acquire. This is the ranked guide to what actually works in India in 2025.',
    sections: [
      { h2: 'What makes a startup community valuable for founders', body: 'Not all startup communities are equal. The most valuable founder communities share four properties:\n\n**High trust signals**: Members are filtered by achievement, not just willingness to pay a membership fee. The value of a community comes from who else is in it.\n\n**Intent transparency**: The best communities make it easy to know what people are looking for — co-founders, funding, partnerships, customers. Communities without this default to noise.\n\n**Operational knowledge sharing**: The communities that accelerate founders most are those where members share what actually happened — failed fundraises, broken co-founder relationships, churn rates — not just wins.\n\n**Local density**: For early-stage founders, in-person relationships in the same city are worth significantly more than distributed online connections. Local community density drives co-founder matches and intro chains.' },
      { h2: 'Top startup communities in India ranked by founder ROI', body: '**Build Your Network**: India\'s only intent-based founder networking platform. Founders, investors, and mentors declare what they are looking for — enabling direct matches without the noise of general communities. GPS-filtered by city.\n\n**YC Alumni India network**: The highest-quality closed network for founders with YC backing. Not accessible without YC participation, but the warm intro chain from any YC founder is extremely valuable.\n\n**NASSCOM 10000 Startups**: Pan-India reach, government support, good for B2B SaaS and enterprise founders who need procurement introductions.\n\n**Antler India**: Has both a cohort program and an alumni community that is increasingly active. Strong for founders at the ideation stage.\n\n**Operator Angel networks (Mumbai Angels, Indian Angel Network)**: Excellent for relationship-building with angels — but the community is investor-facing, so it requires more work for a first-time founder to break in.' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'investor-networking-india'],
    cityLinks: ['/startup-community-india', '/startup-networking-events', '/networking-for-founders', '/networking-in-bengaluru'],
    ctaText: 'Join India\'s intent-based founder community — Build Your Network.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'founder-mentor-india',
    title: 'How to Find a Startup Mentor in India: A Practical Guide',
    metaDesc: 'Where to find a startup mentor in India, what to ask them, and how to structure a mentor relationship that actually adds value to your startup.',
    date: '2025-05-24',
    category: 'Founder Growth',
    keywords: 'startup mentor india, find mentor startup india, founder advisor india, startup advisor equity india',
    h1: 'How to Find a Startup Mentor in India: A Practical Guide',
    intro: 'Most startup advice in India about finding mentors is generic and useless: "attend startup events", "reach out on LinkedIn", "ask for a coffee chat." Here is what actually produces useful mentorship relationships for early-stage founders.',
    sections: [
      { h2: 'The difference between a mentor and an advisor (and why it matters)', body: 'A mentor gives you time and perspective for free. An advisor gives you specific, recurring value in exchange for equity (typically 0.1-0.5% with a 1-2 year vest).\n\nMost early-stage founders conflate the two. They try to compensate mentors with equity, which creates awkward obligation. Or they expect advisor-level commitment from someone who agreed to a coffee chat.\n\nBe explicit from the first conversation: "I am looking for mentorship, not an advisory relationship — I am not offering equity at this stage." Most experienced founders will respect this directness. Those who want equity upfront for an initial conversation are not the mentors you want anyway.' },
      { h2: 'Where to find startup mentors in India in 2025', body: '**Build Your Network**: Experienced founders and operators who have set their intent to "Open to Advising" are discoverable by city. This is the only platform in India where mentorship intent is explicitly declared.\n\n**Accelerator programs**: IIM-A CIIE, NASSCOM CoE, T-Hub, Kerala Startup Mission, and IIMB NSRCEL all have mentor networks accessible to founders in their programs.\n\n**Alumni networks**: An IIT alumnus who has built a startup is usually willing to give 30 minutes to another IIT founder. The shared institution creates implicit obligation that most people honor.\n\n**YC Startup School**: Free program, online, and has a mentor matching component. Good for founders who want domain-specific mentors regardless of geography.' },
      { h2: 'What to ask a mentor in the first meeting', body: 'The most common mistake is asking too-broad questions. "What should I be focusing on?" puts the burden on the mentor to structure a conversation they have no context for.\n\nBetter approach: give them a specific situation with a specific decision point. "I have two customers willing to pay ₹5000/month each. I also have one customer willing to pay ₹50,000/month but with significant customization. Which do I prioritize?" This is a question a good mentor can answer usefully in 10 minutes.\n\nIn the first meeting, evaluate: Do they ask good questions? Do they give you frameworks, not just answers? Do they push back when your reasoning has gaps? Are they interested in your problem or are they lecturing about their own experience?' },
    ],
    relatedSlugs: ['investor-networking-india', 'startup-networking-india-guide'],
    cityLinks: ['/find-startup-mentor', '/networking-for-founders', '/networking-in-bengaluru', '/networking-in-mumbai'],
    ctaText: 'Find mentors who are open to advising on Build Your Network.',
    ctaBtn: 'Find a Mentor Free',
  },
  {
    slug: 'hyderabad-startup-ecosystem-guide',
    title: 'Hyderabad Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'A practical guide to building a startup in Hyderabad — T-Hub, the biotech and deep-tech ecosystem, investor access, and how to network with founders in the city.',
    date: '2025-05-27',
    category: 'City Guides',
    keywords: 'hyderabad startup ecosystem, startup networking hyderabad, t-hub startups, hyderabad deep tech startups 2026',
    h1: 'Hyderabad Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Hyderabad is India\'s fastest-growing startup city after Bengaluru. T-Hub\'s infrastructure, IIT Hyderabad\'s deep-tech research output, and a government that actively courts startups make it an increasingly strong choice for founders — especially in biotech, pharma tech, and enterprise SaaS.',
    sections: [
      { h2: 'Hyderabad\'s distinctive advantage for startups', body: 'Three specific advantages that make Hyderabad worth serious consideration:\n\n**T-Hub**: Asia\'s largest startup incubator by physical scale. T-Hub\'s network effect — connecting startups to large corporations (Cyient, Durgam Cheruvu Tech Corridor) — is unique in India. Corporate pilots that take months to arrange in Bengaluru often happen in weeks through T-Hub introductions.\n\n**Lower burn rate**: Office space, engineering talent, and operational costs in Hyderabad run 30-40% below Bengaluru. For pre-seed startups where runway is everything, this extends your runway by several months on the same capital.\n\n**State government support**: Telangana\'s T-IDEA program provides direct grants to startups and has a genuine track record of disbursement — unlike many state startup programs that are more announcement than execution.' },
      { h2: 'Where to build your network in Hyderabad', body: 'The key founder networking locations in Hyderabad:\n\n**T-Hub (Raidurgam)**: The epicenter. Even if you are not in T-Hub\'s program, their public events are some of the best in the country for enterprise tech and deep-tech founders.\n\n**IIT Hyderabad campus**: Growing fast as a deep-tech and hardware startup ecosystem. Research park events and alumni channels are high-signal.\n\n**NASSCOM Hyderabad**: Regular community events specifically for product companies.\n\n**Build Your Network**: GPS-filtered co-founder and investor discovery within 10 km of your location in Hyderabad. Engineers and founders who have set co-founder search intent are surfaced directly.' },
      { h2: 'Hyderabad for biotech and deep-tech founders', body: 'Hyderabad\'s strongest vertical is biotech, pharma, and life sciences — driven by the concentration of pharma companies (Dr. Reddy\'s, Aurobindo, Divi\'s) and the Genome Valley biotech cluster. Founders building in computational biology, pharma-tech, or medical devices have access to a co-founder and advisor pool that does not exist at the same quality in any other Indian city.\n\nFor deep-tech more broadly, IIT Hyderabad\'s research output is increasingly commercialization-focused. The Technology Transfer Office has relationships with several Bengaluru VCs who actively look at IIT Hyderabad spin-outs.' },
    ],
    relatedSlugs: ['bengaluru-startup-ecosystem-guide', 'startup-networking-india-guide'],
    cityLinks: ['/find-startup-mentor', '/angel-investors-india', '/networking-in-hyderabad', '/founders-in-hyderabad', '/find-cofounders-hyderabad'],
    ctaText: 'Find co-founders and investors in Hyderabad on Build Your Network.',
    ctaBtn: 'Join Free in Hyderabad',
  },
  {
    slug: 'building-startup-team-india',
    title: 'Building Your First Startup Team in India: What Founders Get Wrong',
    metaDesc: 'How to build your first startup team in India — when to hire, who to hire first, equity vs salary tradeoffs, and the hiring mistakes that kill early-stage startups.',
    date: '2025-05-30',
    category: 'Founder Growth',
    keywords: 'building startup team india, first startup hire india, startup team equity india, early stage startup hiring india',
    h1: 'Building Your First Startup Team in India: What Founders Get Wrong',
    intro: 'Most early-stage Indian startups hire too early and the wrong people. The result is a burn rate that cannot be sustained, equity diluted to people who leave before the vesting cliff, and organizational complexity that slows decision-making. Here is the honest guide to building a startup team in India.',
    sections: [
      { h2: 'The right time to hire your first employee in India', body: 'The right time to hire your first non-co-founder employee is when you have product-market fit signal — not before. In practical terms: you have at least 10-20 customers who are paying or deeply engaged, you have found one repeatable acquisition channel, and you and your co-founders are consistently overwhelmed by the same type of work.\n\nHiring before this point is almost always premature. You do not know what you need yet. The person you hire for your hypothesis of the problem will often not be the right hire for the actual problem.' },
      { h2: 'Who to hire first: the universal mistake', body: 'Most Indian startups make two early hiring mistakes:\n\n**Hiring a business development person before you have product-market fit**: BD before PMF is evangelism for a product that has not proven it can be sold. The BD person will generate meetings and POCs that go nowhere — and you will spend 6 months not learning what the actual problem is.\n\n**Hiring for the org chart you want, not the company you are**: "We need a VP of Engineering" at 5 people means you are hiring for optics, not function. Hire the most senior technical person who will actually write code, not the most impressive title.' },
      { h2: 'Equity vs salary for early hires in India', body: 'The honest tradeoff table for India:\n\n**Engineer, 3-5 years experience**: ₹25-40L/year market rate. Can you offer ₹18-25L + meaningful equity (0.5-1%)? If yes, you can attract strong engineers. If you cannot offer either, you will get engineers with limited options.\n\n**Product manager, 3-5 years**: ₹20-35L/year market rate. Similar tradeoff — meaningful equity is often more compelling than cash at early stage for PMs who understand startup risk.\n\n**Rule of thumb**: Salary cuts of more than 50% below market rarely work for sustained performance. Equity must be meaningful — 0.5-1% for senior early employees, with proper vesting and an explanation of what it could be worth.' },
    ],
    relatedSlugs: ['how-to-find-a-cofounder-in-india', 'cofounder-equity-split-guide'],
    cityLinks: ['/find-cofounders', '/networking-for-founders', '/startup-community-india'],
    ctaText: 'Find your first team members and co-founders on Build Your Network.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'linkedin-alternative-founders-india',
    title: 'Why Startup Founders in India Are Moving Away from LinkedIn',
    metaDesc: 'LinkedIn is not built for startup founders. Here is why Indian founders are switching to intent-based platforms for co-founder search, investor access, and founder networking.',
    date: '2025-06-02',
    category: 'Platform Comparisons',
    keywords: 'linkedin alternative founders india, why founders leave linkedin, startup networking not linkedin india, build your network vs linkedin',
    h1: 'Why Startup Founders in India Are Moving Away from LinkedIn',
    intro: 'LinkedIn\'s user base in India has grown dramatically — but founder satisfaction with LinkedIn for startup-specific networking has not. The problem is structural: LinkedIn is optimized for job-seeking and content engagement. Startup founders need something fundamentally different.',
    sections: [
      { h2: 'The specific ways LinkedIn fails startup founders in India', body: 'LinkedIn\'s failures for the startup founder use case are concrete:\n\n**No co-founder intent filter**: You cannot search LinkedIn for "founder actively looking for technical co-founder in Bengaluru within 10 km." You can search by job title, but "Software Engineer at TCS" does not tell you if someone is ready to take the leap.\n\n**Recruiter noise drowns signal**: LinkedIn\'s revenue depends on recruiter subscriptions. The platform is structurally incentivized to deliver recruiting messages to your inbox — which means your actual founder networking messages compete with 20 recruiter InMails for attention.\n\n**Premium cost is prohibitive for early-stage founders**: LinkedIn Premium Career at ₹2,800/month or Sales Navigator at ₹5,500/month is significant burn for a pre-revenue startup. And Premium does not solve the fundamental problem — there is still no intent filter for co-founder search.' },
      { h2: 'What founders are using instead', body: 'The platforms that are capturing Indian founder networking that LinkedIn cannot:\n\n**Build Your Network**: Intent-based co-founder, investor, and mentor discovery. GPS-filtered to your city. Free with 30 daily connections. The only platform where founders explicitly declare "Looking for Co-founder" or "Open to Angel Investing" — making first messages have immediate context.\n\n**Domain-specific Slack and WhatsApp communities**: High noise but occasionally useful for peer founder connections. Best for getting quick answers from founders in the same domain.\n\n**Accelerator alumni networks**: The highest-quality closed networks for founders, but only accessible after program participation.\n\n**IIT/IIM alumni networks**: The trust shortcut that still works better than any platform for warm founder introductions in India.' },
      { h2: 'The feature that makes the difference: declared intent', body: 'The fundamental improvement that intent-based platforms provide over LinkedIn is not a better algorithm — it is forcing users to declare what they are actually looking for.\n\nWhen a founder on Build Your Network sets their profile to "Looking for Co-founder — Technical", they are signaling to every other user that a connection request from them is welcome and expected. The first message does not need to spend three sentences establishing context and legitimacy. Both parties already know why the connection is being made.\n\nThis single change — declared intent before connection — produces fundamentally different networking dynamics. Response rates for intentional networking on purpose-built platforms are 5-10x higher than cold outreach on LinkedIn.' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'how-to-find-a-cofounder-in-india'],
    cityLinks: ['/linkedin-alternative', '/linkedin-vs-byn', '/best-networking-platform-for-founders', '/networking-for-founders'],
    ctaText: 'Try the intent-based alternative to LinkedIn for founders — Build Your Network.',
    ctaBtn: 'Join BYN Free',
  },
  {
    slug: 'delhi-startup-ecosystem-guide',
    title: 'Delhi NCR Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'A practical guide to building a startup in Delhi NCR — Gurugram, Noida, and Delhi — covering the ecosystem, investor access, co-working spaces, and founder networking.',
    date: '2025-06-05',
    category: 'City Guides',
    keywords: 'delhi startup ecosystem, gurgaon startup founders, noida startup ecosystem, delhi ncr startups 2026',
    h1: 'Delhi NCR Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Delhi NCR encompasses three distinct startup zones — Gurugram, Noida, and Delhi proper — each with different strengths. Understanding which zone fits your startup saves months of misaligned effort.',
    sections: [
      { h2: 'Gurugram vs Noida vs Delhi: which zone is right for your startup', body: '**Gurugram (Gurgaon)**: India\'s B2B SaaS and enterprise startup hub. The concentration of MNC offices, HR tech companies, and a large population of corporate decision-makers makes Gurugram the best location for enterprise-selling startups. If your customers are large companies with procurement budgets, you want to be here.\n\n**Noida**: The IT services and product startup cluster east of Delhi. Lower real estate costs than Gurugram, strong engineering talent from the Sector 62 tech corridor, and growing clusters in gaming, edtech, and media tech. If you are building in consumer tech or media, Noida\'s talent pool and cost structure work well.\n\n**Delhi proper**: Strong for government-adjacent startups, social enterprises, and logistics companies that need proximity to political and regulatory decision-makers. Less of a pure tech startup hub.' },
      { h2: 'The Delhi NCR investor landscape', body: 'Delhi NCR\'s investor community is more enterprise-focused than Bengaluru\'s consumer-internet roots:\n\n**Nexus Venture Partners**: Strong presence in Delhi NCR, with a portfolio heavy in enterprise SaaS and B2B.\n\n**WaterBridge Ventures**: Delhi-based, invests in consumer internet and B2B companies across India.\n\n**Elevation Capital (Saif Partners)**: Based in Gurugram, with a strong track record in consumer internet and fintech.\n\n**Angel networks**: Indian Angel Network is headquartered in Delhi and has a particularly strong deal flow for hardware, sustainability, and enterprise software startups.' },
      { h2: 'Building your founder network in Delhi NCR', body: '**Delhi Startup Hub**: Government-run but genuinely useful — regular events and co-working spaces in central Delhi.\n\n**Nasscom 10000 Startups Delhi chapter**: Strong community events for B2B founders.\n\n**Cyberpark Gurugram**: Hub for enterprise tech startups in Gurugram with regular networking events.\n\n**Build Your Network**: GPS-filtered discovery in Gurugram, Noida, and Delhi lets you find co-founders and investors within 10 km of your workspace. Set your location to your specific zone for the most relevant matches.' },
    ],
    relatedSlugs: ['bengaluru-startup-ecosystem-guide', 'startup-networking-india-guide'],
    cityLinks: ['/find-startup-mentor', '/angel-investors-india', '/networking-in-delhi', '/networking-in-gurgaon', '/networking-in-noida', '/founders-in-delhi'],
    ctaText: 'Find co-founders and investors in Delhi NCR on Build Your Network.',
    ctaBtn: 'Join Free in Delhi NCR',
  },
  {
    slug: 'fundraising-india-first-check',
    title: 'Getting Your First Investment Check in India: A Founder\'s Honest Guide',
    metaDesc: 'How to get your first investment check in India as an early-stage startup — from the right investors to approach, how to structure the ask, and what actually gets a first meeting.',
    date: '2025-06-08',
    category: 'Fundraising',
    keywords: 'first investment india startup, pre-seed funding india, how to raise first check india, angel investment first time founder india',
    h1: 'Getting Your First Investment Check in India: An Honest Guide',
    intro: 'The first check is the hardest check. You have no track record, limited traction, and are asking someone to believe in a future that does not exist yet. Here is what actually works for getting that first commitment.',
    sections: [
      { h2: 'Who writes first checks in India (and who does not)', body: '**First check writers in India**:\n- Ex-startup founders who have had an exit (₹5L-₹50L tickets)\n- Ex-senior employees of successful startups with ESOP payouts (₹5L-₹25L)\n- Organized angel networks: Mumbai Angels, Indian Angel Network, Lead Angels (₹25L-₹2Cr)\n- Pre-seed funds: Antler, 100X.VC, Gemba Capital (₹2Cr-₹10Cr)\n\n**Who does not write first checks despite seeming like they might**:\n- Venture capitalists at Sequoia, Accel, Matrix — they do seed (₹10Cr+), not pre-seed\n- Corporate innovation programs — they do pilots, not equity investments\n- Most accelerators — they do small cheques (₹5L-₹25L) but usually want more traction than you have' },
      { h2: 'The one thing that gets a first meeting with an Indian angel', body: 'A warm introduction from someone the angel trusts. This single fact drives more first-meeting conversion than any other variable.\n\nThe question is how to get that warm introduction without already knowing the angel. The approach that works:\n\n1. Map the angel\'s portfolio companies\n2. Find founders of those portfolio companies who you have a credible connection to (shared institution, shared industry, mutual contact)\n3. Get a coffee meeting with those founders\n4. If the meeting goes well, ask for an introduction: "I respect your investor\'s judgment — would you be willing to make an introduction if you think BYN is relevant to what they invest in?"\n\nThis takes 4-6 weeks but produces warm introductions with 40-60% conversion to a first meeting vs under 5% for cold outreach.' },
      { h2: 'What to do if you have no network access to angels', body: 'If your network gives you no path to angels, use intent-based platforms:\n\n**Build Your Network**: Investors who have declared "Open to Angel Investing" intent are discoverable by city. This is the most direct route to angels who are actively seeking new investments — the context of your first message is entirely different from a cold email.\n\n**LetsVenture**: India\'s largest angel investment platform. Your startup profile is visible to 5,000+ angels. Not perfect — there is noise — but it is the most accessible structured angel access point in India.\n\n**100X.VC**: Pre-seed focused, no warm intro needed — apply directly. They do 10-15 investments per quarter at ₹50L-₹2Cr.' },
    ],
    relatedSlugs: ['investor-networking-india', 'startup-networking-india-guide'],
    cityLinks: ['/angel-investors-india', '/networking-for-investors', '/find-startup-mentor', '/founders-in-bengaluru', '/founders-in-mumbai'],
    ctaText: 'Find investors who are actively looking on Build Your Network.',
    ctaBtn: 'Find Investors Free',
  },
  {
    slug: 'pune-startup-ecosystem-guide',
    title: 'Pune Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'A practical guide to building a startup in Pune — the manufacturing-tech advantage, proximity to Mumbai, investor access, and how to network with founders in the city.',
    date: '2025-06-10',
    category: 'City Guides',
    keywords: 'pune startup ecosystem, startup networking pune, manufacturing tech startups pune, pune startup founders 2026',
    h1: 'Pune Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Pune is chronically underrated as a startup location. The combination of top engineering colleges, proximity to Mumbai\'s capital markets, lower costs than Bengaluru, and a growing base of manufacturing-tech and SaaS founders makes it a compelling choice — especially for founders building for industrial or automotive customers.',
    sections: [
      { h2: 'Pune\'s unique startup advantages', body: '**Engineering college density**: Pune has one of the highest concentrations of engineering colleges in India — COEP, PICT, VIT Pune, MIT Pune. This creates a large pool of early-career engineers willing to join startups at competitive salaries below Bengaluru market rates.\n\n**Manufacturing proximity**: Pune\'s proximity to India\'s largest automotive and manufacturing clusters (Chakan, Pimpri-Chinchwad) creates direct customer access for industrial IoT, manufacturing SaaS, and supply chain startups. Customers are 30 minutes away, not in a different city.\n\n**Mumbai proximity for capital**: Pune is 3 hours from Mumbai — close enough for regular investor meetings without the Mumbai cost structure. Many Pune founders maintain Bengaluru engineering teams and do Mumbai fundraising trips.' },
      { h2: 'Where founders network in Pune', body: '**Venture Center (NCL Innovation Park)**: One of India\'s premier deep-tech incubators, adjacent to NCL\'s research labs. Strong for materials science, chemistry-tech, and industrial startups.\n\n**COEP Tech Park**: Increasingly active startup community with government support from the Maharashtra Startup Mission.\n\n**Persistent Systems alumni network**: One of the largest alumni networks in Indian product companies — many senior Persistent alumni are active angel investors and advisors in Pune.\n\n**Build Your Network**: GPS-filtered discovery in Pune lets you find co-founders and investors in your specific part of the city — Koregaon Park, Kothrud, Baner, or Hinjewadi.' },
    ],
    relatedSlugs: ['mumbai-startup-ecosystem-guide', 'bengaluru-startup-ecosystem-guide'],
    cityLinks: ['/find-startup-mentor', '/networking-in-pune', '/founders-in-pune', '/find-cofounders-pune'],
    ctaText: 'Find co-founders and investors in Pune on Build Your Network.',
    ctaBtn: 'Join Free in Pune',
  },
  {
    slug: 'networking-india-tier2-cities',
    title: 'Startup Networking in Tier 2 Indian Cities: Jaipur, Kochi, Ahmedabad',
    metaDesc: 'How startup founders in Jaipur, Kochi, and Ahmedabad can build strong networks despite smaller ecosystems — and why Tier 2 city founders have structural advantages.',
    date: '2025-06-13',
    category: 'City Guides',
    keywords: 'startup networking tier 2 india, jaipur startups, kochi startups, ahmedabad startup ecosystem, tier 2 city founder networking',
    h1: 'Startup Networking in Tier 2 Indian Cities: Jaipur, Kochi, Ahmedabad',
    intro: 'Tier 2 cities are not second-class startup locations. Jaipur\'s travel-tech and fashion-tech ecosystem, Kochi\'s sustainability and tourism-tech base, and Ahmedabad\'s MSME-tech and fintech cluster each offer advantages that Bengaluru cannot match for founders building for those specific markets.',
    sections: [
      { h2: 'Why Tier 2 cities can be the right choice', body: 'Three structural advantages that Tier 2 city founders have:\n\n**Customer proximity**: A fashion-tech startup in Jaipur is walking distance from India\'s largest handicraft supply chain. An agri-tech startup in Ahmedabad is 30 minutes from some of India\'s largest agricultural cooperatives. The gap between founder and customer is meaningfully smaller.\n\n**Lower burn rate**: Engineering talent in Tier 2 cities costs 30-50% less than Bengaluru. For pre-seed startups, this translates directly into runway.\n\n**Government support concentration**: State-level startup programs (iStart Rajasthan, Kerala Startup Mission, GUSEC) have more resources and attention per founder than pan-India programs — because fewer founders compete for them.' },
      { h2: 'The networking challenge in Tier 2 cities (and how to solve it)', body: 'The primary networking disadvantage in Tier 2 cities is lower density — fewer founders, fewer events, fewer investors with local presence. The practical solutions:\n\n**Digital-first community building**: Build Your Network\'s GPS radius filter can be set to 200 km, connecting you with founders across your broader region. For Tier 2 founders, the national discover mode is especially valuable.\n\n**Deliberate metro trips**: Monthly or quarterly trips to Bengaluru or Mumbai for investor meetings, co-founder search, and community events. Budget ₹20,000-₹40,000 per quarter for this — it is a legitimate business expense with strong ROI.\n\n**State-specific accelerators**: iStart Rajasthan, KSUM (Kerala Startup Mission), and GUSEC have communities and investor networks specifically designed for Tier 2 founders. Leverage them before trying to access metro networks.' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'startup-community-india-2025'],
    cityLinks: ['/startup-networking-events', '/startup-community-india', '/networking-in-jaipur', '/networking-in-kochi', '/networking-in-ahmedabad'],
    ctaText: 'Find founders and investors in Tier 2 cities on Build Your Network.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'b2b-saas-startup-india',
    title: 'Building a B2B SaaS Startup in India: The Founder\'s Playbook',
    metaDesc: 'How to build and sell a B2B SaaS startup in India — from finding enterprise customers to hiring your first sales team and building your investor story.',
    date: '2025-06-16',
    category: 'Founder Growth',
    keywords: 'b2b saas india startup, b2b startup india, enterprise saas india founders, how to sell b2b saas india',
    h1: 'Building a B2B SaaS Startup in India: The Founder\'s Playbook',
    intro: 'B2B SaaS is India\'s strongest startup vertical in 2026 — driven by digital transformation budgets, GST compliance needs, and global Indian diaspora teams buying Indian SaaS. But building and selling B2B SaaS in India has specific dynamics that founders from consumer internet backgrounds consistently misread.',
    sections: [
      { h2: 'The India-specific B2B SaaS pricing reality', body: 'India pricing for B2B SaaS is approximately 20-30% of equivalent US pricing for the same product. This is not a concession — it is a deliberate strategy. The rationale:\n\nYour Indian customers are your fastest route to case studies, feedback, and product refinement. They are geographically proximate, they will answer your WhatsApp messages, and they will tell you exactly what is broken. Use Indian pricing to acquire your first 20 customers fast, build case studies, and use those case studies to go upmarket to global SMBs and enterprises at full pricing.\n\nThe mistake is trying to sell at US pricing in India from day one. You will get long sales cycles, price objections at every stage, and pilot-to-paid conversion rates below 20%.' },
      { h2: 'How to find your first enterprise customers in India', body: 'The three channels that work for B2B SaaS customer acquisition in India:\n\n**Founder network introductions**: The fastest path to a first customer in India is a warm introduction from a founder who has already sold to that customer. This is why being plugged into the right founder community — Build Your Network, YC alumni India, accelerator cohorts — is directly tied to revenue.\n\n**NASSCOM ecosystem introductions**: For enterprise customers in IT, BFS, and healthcare, NASSCOM\'s enterprise connect programs provide introductions that would otherwise take 6-12 months of cold outreach to arrange.\n\n**Domain-specific communities**: If you are building HR tech, attend HR Conclave India. If you are building fintech, attend FICCI fintech events. The decision-makers at enterprise companies attend these events specifically to find new vendors.' },
    ],
    relatedSlugs: ['startup-networking-india-guide', 'building-startup-team-india'],
    cityLinks: ['/professional-networking', '/business-networking-app', '/networking-in-bengaluru', '/networking-in-gurgaon', '/startup-community-india'],
    ctaText: 'Connect with B2B SaaS founders and investors across India on Build Your Network.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'chennai-startup-ecosystem-guide',
    title: 'Chennai Startup Ecosystem: Guide for Founders in 2026',
    metaDesc: 'A guide to building a startup in Chennai — IIT Madras Research Park, the hardware and deep-tech ecosystem, investor access, and founder networking in the city.',
    date: '2025-06-19',
    category: 'City Guides',
    keywords: 'chennai startup ecosystem, iit madras startups, hardware startup india, deep tech startups chennai 2026',
    h1: 'Chennai Startup Ecosystem: A Practical Guide for Founders in 2026',
    intro: 'Chennai is India\'s premier location for hardware, deep-tech, and automotive-tech startups — anchored by IIT Madras Research Park, one of the most productive startup incubators in Asia. If you are building anything with physical components, Chennai gives you advantages that software-first cities cannot.',
    sections: [
      { h2: 'What makes Chennai different from other Indian startup cities', body: '**IIT Madras Research Park**: India\'s most productive deep-tech startup incubator by commercialization rate. Companies like SigTuple, Uniphore, and Mad Street Den originated from this ecosystem. Access to faculty co-founders and research lab partnerships is the defining advantage.\n\n**Hardware expertise concentration**: Chennai\'s manufacturing heritage — automotive (Ford, Hyundai, BMW, Renault-Nissan all manufacture in Chennai) — creates a talent pool of manufacturing, supply chain, and embedded systems engineers that does not exist at the same scale in Bengaluru.\n\n**SIPCOT IT Park and Tidel Park**: Software export hubs that have produced a large pool of senior engineers who are increasingly open to startup equity in the current job market.' },
      { h2: 'Building your founder network in Chennai', body: '**IIT Madras Research Park events**: The single best networking venue in Chennai for deep-tech and hardware founders. Regular events, high-quality founders, and direct access to the IIT Madras faculty network.\n\n**NASSCOM Chennai chapter**: Strong for software product founders — regular community events and enterprise connect programs.\n\n**TiE Chennai**: One of India\'s most active TiE chapters, with a strong mentor network and organized angel deal flows.\n\n**Build Your Network**: GPS-filtered discovery lets you find co-founders and investors in Chennai — Adyar, Anna Nagar, OMR, or Tidel Park area — within your chosen radius.' },
    ],
    relatedSlugs: ['bengaluru-startup-ecosystem-guide', 'hyderabad-startup-ecosystem-guide'],
    cityLinks: ['/find-startup-mentor', '/networking-in-chennai', '/founders-in-chennai', '/find-cofounders-chennai'],
    ctaText: 'Find co-founders and investors in Chennai on Build Your Network.',
    ctaBtn: 'Join Free in Chennai',
  },
  {
    slug: 'startup-india-scheme-guide',
    title: 'Startup India Scheme: What Founders Actually Get (and What They Don\'t)',
    metaDesc: 'An honest guide to the Startup India government scheme — the real benefits, the registration process, tax exemptions, and what founders should use it for.',
    date: '2025-06-22',
    category: 'Founder Growth',
    keywords: 'startup india scheme, dpiit recognition startup india, startup india registration benefits, government startup scheme india',
    h1: 'Startup India Scheme: What Founders Actually Get (and What They Don\'t)',
    intro: 'The Startup India scheme is widely discussed and poorly understood. Most founders either dismiss it entirely ("government schemes are useless") or have unrealistic expectations ("you get free money"). The truth is more nuanced — there are real, specific benefits worth getting, and the process is simpler than most founders think.',
    sections: [
      { h2: 'The DPIIT recognition: what it actually unlocks', body: 'DPIIT recognition (the formal Startup India registration) is free and takes 2-4 weeks. The actual benefits:\n\n**Tax exemption on profits (Section 80-IAC)**: 100% tax exemption on profits for 3 consecutive years out of the first 10 years. Requires a separate application beyond DPIIT recognition, and applies only if you are profitable — which most startups are not in their first 3 years. Still worth getting when relevant.\n\n**Angel tax exemption (Section 56(2)(viib))**: DPIIT-recognized startups are exempt from angel tax on investment received at above book value. This is the most practically useful benefit — it removes a significant compliance burden when raising angel rounds.\n\n**Fast-track IP filing**: 80% fee reduction on patent, trademark, and design applications. If you have IP worth protecting, this is significant.\n\n**Self-certification for 6 labour and 3 environment laws**: Reduces compliance burden in the first years.' },
      { h2: 'How to get DPIIT recognition (the actual process)', body: 'The process is:\n\n1. Register your startup as a Private Limited Company, LLP, or Registered Partnership\n2. Go to startupindia.gov.in and create an account\n3. Apply for DPIIT recognition — you need your incorporation certificate, PAN, and a brief description of your innovation\n4. Wait 2-4 weeks for recognition\n\nThe innovation criterion is broadly interpreted — you do not need a patent or research paper. A product that uses technology to solve a problem in a novel way qualifies. Most software startups qualify without any issues.\n\nCost: effectively zero. Your CA will charge ₹3,000-₹10,000 to handle the filing if you prefer not to do it yourself.' },
      { h2: 'What the scheme does not do', body: 'Common misconceptions:\n\n**It does not give you direct grant money**: The Startup India scheme is a recognition program, not a grant program. Direct grant programs (like TIDE 2.0, MSME Technology Centers, or state-level schemes) exist separately and require separate applications.\n\n**It does not guarantee bank loans**: Banks still evaluate your business on standard credit criteria. Recognition helps marginally with some government-backed schemes but does not replace traction-based lending criteria.\n\n**It does not help with customer acquisition**: Being "DPIIT-recognized" does not automatically open enterprise customer doors. Some procurement teams care; most do not.' },
    ],
    relatedSlugs: ['fundraising-india-first-check', 'building-startup-team-india'],
    cityLinks: ['/networking-for-founders', '/startup-community-india', '/angel-investors-india'],
    ctaText: 'Connect with founders who have navigated Startup India registration on Build Your Network.',
    ctaBtn: 'Join Free',
  },
  {
    slug: 'cofounder-relationship-management',
    title: 'Managing Your Co-Founder Relationship: What Breaks Startups',
    metaDesc: 'The co-founder relationship is the most important factor in startup survival. Here is how to build and maintain a healthy co-founder relationship — and what warning signs to watch for.',
    date: '2025-06-25',
    category: 'Co-founder Search',
    keywords: 'cofounder relationship advice, managing cofounder conflict, startup cofounder problems, cofounder communication startup',
    h1: 'Managing Your Co-Founder Relationship: What Breaks Startups',
    intro: 'Co-founder conflicts are the number one reason startups fail after achieving initial product-market fit. The most common story: two founders build something that works, then fall apart over equity, credit, or decision authority just when the company needed stability. This guide covers what actually breaks co-founder relationships and how to prevent it.',
    sections: [
      { h2: 'The four conversations co-founders avoid having early', body: '**Equity and dilution expectations**: Most co-founders agree on the initial split but never discuss how they will approach dilution in future rounds, when and whether they might bring on a third co-founder, or what happens to unvested equity if the company pivots.\n\n**Salary and financial expectations**: When does each co-founder expect to return to market salary? What if one co-founder has family obligations that require a specific minimum? These conversations are uncomfortable but critical.\n\n**Role evolution**: The roles that make sense at a 5-person company are usually wrong at a 20-person company. Who leads what as the company grows? Who has final say on product vs. technical decisions?\n\n**Exit preferences**: One co-founder wants to build a generational company. The other wants to sell in 5 years. These preferences will create conflict the moment an acquisition offer arrives — and the conversation is much easier to have before that moment.' },
      { h2: 'Warning signs of a co-founder relationship in distress', body: 'Four early warning signs:\n\n1. **One co-founder stops sharing bad news**: When a co-founder starts filtering information before sharing it, it usually means they are anticipating negative judgment rather than collaborative problem-solving.\n\n2. **Credit attribution becomes contested**: "I built that" conversations about features, customer relationships, or investor introductions are a leading indicator of equity-related resentment.\n\n3. **Decisions are being made unilaterally**: If one co-founder starts executing on decisions without the other\'s input — and stops in response to feedback — that is a healthy dynamic. If they continue unilaterally, it is not.\n\n4. **Outside relationships become load-bearing**: When co-founders are venting to employees, investors, or spouses about each other, the relationship has already moved into a destructive pattern.' },
      { h2: 'How to address co-founder conflict before it becomes terminal', body: 'The interventions that work:\n\n**Structured weekly check-ins with a specific agenda**: Not a status meeting — a relationship maintenance meeting. "What is working in how we are collaborating? What is not working? What do you need from me this week that I am not providing?" Takes 30 minutes. Run it every week.\n\n**Bring in a neutral third party before you are in crisis**: An advisor, investor, or startup coach who both co-founders respect can facilitate hard conversations that are impossible to have directly. Waiting until crisis makes this significantly harder.\n\n**Document decisions explicitly**: The most common co-founder conflict source is "we agreed to X" when one person remembers Y. A shared decision log (even a simple Notion doc) removes a large category of conflict.' },
    ],
    relatedSlugs: ['how-to-find-a-cofounder-in-india', 'cofounder-equity-split-guide'],
    cityLinks: ['/find-cofounders', '/networking-for-founders'],
    ctaText: 'Find the right co-founder with Build Your Network — intent-matched from day one.',
    ctaBtn: 'Start Co-founder Search',
  },
];

// Extend SEO_PAGES with blog entries (must run after ARTICLES is defined)
SEO_PAGES.push({ slug: 'blog', label: 'Blog Index', schema: 'Blog', priority: '0.8' });
ARTICLES.forEach(a => SEO_PAGES.push({ slug: 'blog/' + a.slug, label: a.title, schema: 'Article+BreadcrumbList', priority: '0.7' }));

// Extend SEO_PAGES with 301 new category pages (7 categories × 43 cities)
CATEGORY_SLUGS.forEach(cat => {
  Object.keys(CITIES).forEach(citySlug => {
    const city = CITIES[citySlug];
    SEO_PAGES.push({
      slug:  cat + '-' + citySlug,
      label: CATEGORY_INTENTS[cat].h1(city),
      schema:'WebPage+FAQPage+BreadcrumbList',
      priority: '0.7',
    });
  });
});

function blogShell(head, body, BASE) {
  const E = escHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${head}
<meta name="theme-color" content="#0F766E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="/assets/logo.png" type="image/png">
<style>
:root{--bg:#FFF4EC;--bg2:#FDE8D7;--card:#fff;--primary:#0F766E;--hl:#CCFBF1;--text:#1F2937;--muted:#6B7280;--border:rgba(253,232,215,.8)}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.nav-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.logo img{width:26px;height:26px;border-radius:6px}
.nav-cta{background:var(--primary);color:#fff;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
.wrap{max-width:820px;margin:0 auto;padding:100px 24px 80px}
footer{border-top:1px solid var(--bg2);padding:24px;text-align:center;font-size:12px;color:var(--muted)}
footer a{color:var(--primary);text-decoration:none}
@media(max-width:640px){.wrap{padding:80px 16px 60px}}
${body.css || ''}
</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>
<div class="wrap">${body.html}</div>
<footer><p>&copy; 2026 <a href="/">BuildYourNetwork</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/blog">Blog</a></p></footer>
${COOKIE_BANNER_SNIPPET}
</body></html>`;
}

app.get('/blog', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  const E = escHtml;
  const categories = [...new Set(ARTICLES.map(a => a.category))];
  const head = `
<title>Startup Networking &amp; Founder Growth Blog | Build Your Network</title>
<link rel="canonical" href="${BASE}/blog">
<meta name="description" content="Practical guides for startup founders in India — co-founder search, investor networking, city ecosystem guides, and founder growth strategies.">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}/blog">
<meta property="og:title" content="Startup Networking &amp; Founder Growth Blog | Build Your Network">
<meta property="og:description" content="Practical guides for startup founders in India — co-founder search, investor networking, city ecosystem guides, and founder growth strategies.">
<meta property="og:site_name" content="Build Your Network">
<script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org',
    '@type':'Blog',
    'name':'Build Your Network — Founder Blog',
    'url': BASE + '/blog',
    'description':'Practical guides for startup founders in India on co-founder search, investor networking, and founder growth.',
    'publisher':{'@type':'Organization','name':'Build Your Network','url': BASE},
  })}</script>`;

  const articleCards = ARTICLES.map(a => `
<article class="card">
  <span class="cat">${E(a.category)}</span>
  <a href="/blog/${E(a.slug)}" class="card-title">${E(a.title)}</a>
  <p class="card-desc">${E(a.metaDesc)}</p>
  <div class="card-meta"><time datetime="${E(a.date)}">${new Date(a.date).toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'})}</time></div>
</article>`).join('');

  const css = `.bc{font-size:13px;color:var(--muted);margin-bottom:28px}.bc a{color:var(--primary);text-decoration:none}
h1{font-size:clamp(24px,4vw,36px);font-weight:800;letter-spacing:-.5px;margin-bottom:12px}
.lead{font-size:16px;color:var(--muted);margin-bottom:40px;line-height:1.7}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;margin-bottom:48px}
.card{background:var(--card);border-radius:16px;padding:24px;border:1px solid var(--bg2)}
.cat{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary);background:var(--hl);padding:3px 8px;border-radius:4px;margin-bottom:10px}
.card-title{display:block;font-size:16px;font-weight:700;color:var(--text);text-decoration:none;margin-bottom:8px;line-height:1.4}
.card-title:hover{color:var(--primary)}
.card-desc{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:12px}
.card-meta{font-size:12px;color:var(--muted)}
@media(max-width:580px){.grid{grid-template-columns:1fr}}`;

  const html = `
<p class="bc"><a href="/">Home</a> › Blog</p>
<h1>Startup Networking &amp; Founder Growth</h1>
<p class="lead">Practical guides for founders in India — co-founder search, investor networking, city ecosystem deep-dives, and what actually moves the needle.</p>
<div class="grid">${articleCards}</div>`;

  seoPageViews.set('blog', (seoPageViews.get('blog') || 0) + 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=21600'); // 6h — index refreshes when articles are added
  res.setHeader('Vary', 'Accept-Encoding');
  res.send(blogShell(head, { html, css }, BASE));
});

app.get('/blog/:slug', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  const article = ARTICLES.find(a => a.slug === req.params.slug);
  if (!article) return res.status(404).json({ error: 'Not found' });
  const E = escHtml;
  const canonical = BASE + '/blog/' + article.slug;
  const related = ARTICLES.filter(a => article.relatedSlugs.includes(a.slug));
  const dateStr = new Date(article.date).toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        'headline': article.title,
        'description': article.metaDesc,
        'url': canonical,
        'datePublished': article.date,
        'dateModified': article.date,
        'author': { '@type': 'Organization', 'name': 'Build Your Network', 'url': BASE },
        'publisher': { '@type': 'Organization', 'name': 'Build Your Network', 'url': BASE, 'logo': { '@type': 'ImageObject', 'url': BASE + '/assets/logo.png', 'width': 512, 'height': 512 } },
        'image': { '@type': 'ImageObject', 'url': BASE + '/assets/logo.png', 'width': 512, 'height': 512 },
        'inLanguage': 'en-IN',
        'keywords': article.keywords,
        'about': { '@type': 'Organization', 'name': 'Build Your Network', 'url': BASE },
        'speakable': { '@type': 'SpeakableSpecification', 'cssSelector': ['.direct-answer'] },
        'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE + '/' },
          { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': BASE + '/blog' },
          { '@type': 'ListItem', 'position': 3, 'name': article.title, 'item': canonical },
        ],
      },
    ],
  });

  const head = `
<title>${E(article.title)} | Build Your Network</title>
<link rel="canonical" href="${canonical}">
<meta name="description" content="${E(article.metaDesc)}">
<meta name="keywords" content="${E(article.keywords)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${E(article.title)}">
<meta property="og:description" content="${E(article.metaDesc)}">
<meta property="og:site_name" content="Build Your Network">
<meta property="og:locale" content="en_IN">
<meta property="article:published_time" content="${article.date}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${E(article.title)}">
<meta name="twitter:description" content="${E(article.metaDesc)}">
<script type="application/ld+json">${jsonLd}</script>`;

  const sectionsHtml = article.sections.map(s => `
<h2>${E(s.h2)}</h2>
<div class="body-text">${E(s.body).replace(/\n\n/g,'</p><p>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/^/,'<p>').replace(/$/,'</p>').replace(/<\/p><p>(\d+\.\s)/g,'</p><p class="li">$1').replace(/\n- /g,'</li><li>').replace(/\n1\. /g,'<br>')}</div>`).join('');

  const relatedHtml = related.length ? `<div class="related"><h3>Related guides</h3>${related.map(r => `<a href="/blog/${E(r.slug)}">${E(r.title)}</a>`).join('')}</div>` : '';
  const cityHtml = article.cityLinks.length ? `<div class="city-links"><h3>Explore by city</h3>${article.cityLinks.map(c => `<a href="${E(c)}">${E(c.replace(/^\//, '').replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase()))}</a>`).join('')}</div>` : '';

  const css = `.bc{font-size:13px;color:var(--muted);margin-bottom:28px}.bc a{color:var(--primary);text-decoration:none}
.cat{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary);background:var(--hl);padding:3px 8px;border-radius:4px;margin-bottom:12px}
h1{font-size:clamp(24px,4vw,36px);font-weight:800;letter-spacing:-.5px;margin-bottom:16px;line-height:1.2}
.meta{font-size:13px;color:var(--muted);margin-bottom:32px}
.intro{font-size:17px;color:var(--muted);line-height:1.8;margin-bottom:24px;border-left:3px solid var(--primary);padding-left:16px}
.takeaways{background:#f0fdf9;border-left:4px solid var(--primary);border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:40px}
.takeaways strong{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary);margin-bottom:8px}
.takeaways ul{margin-left:16px;font-size:14px;line-height:1.8;color:#374151}
h2{font-size:clamp(18px,3vw,22px);font-weight:700;margin:40px 0 12px;letter-spacing:-.3px}
.body-text{font-size:15px;line-height:1.8;color:#374151;margin-bottom:24px}
.body-text p{margin-bottom:14px}
.body-text strong{color:var(--text)}
.cta-inline{background:var(--primary);border-radius:16px;padding:32px;text-align:center;color:#fff;margin:48px 0}
.cta-inline h3{font-size:18px;font-weight:700;margin-bottom:8px}
.cta-inline p{font-size:14px;opacity:.85;margin-bottom:16px}
.cta-inline a{display:inline-block;background:#fff;color:var(--primary);text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:700;font-size:14px}
.related,.city-links{background:var(--bg2);border-radius:14px;padding:24px;margin-bottom:24px}
.related h3,.city-links h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:12px}
.related a,.city-links a{display:inline-block;background:#fff;color:var(--primary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border-radius:7px;margin:3px;border:1px solid rgba(15,118,110,.15)}`;

  const takeawayItems = article.sections.slice(0, 3).map(s => `<li>${E(s.h2)}</li>`).join('');
  const html = `
<p class="bc"><a href="/">Home</a> › <a href="/blog">Blog</a> › ${E(article.category)}</p>
<span class="cat">${E(article.category)}</span>
<h1>${E(article.h1)}</h1>
<p class="meta"><time datetime="${article.date}">${dateStr}</time></p>
<p class="intro">${E(article.intro)}</p>
<div class="takeaways" aria-label="Key takeaways"><strong>Key takeaways</strong><ul>${takeawayItems}</ul></div>
${sectionsHtml}
<div class="cta-inline">
  <h3>${E(article.ctaText)}</h3>
  <p>Free to join. No install. Works in your browser.</p>
  <a href="/signup">${E(article.ctaBtn)} &#8594;</a>
</div>
${relatedHtml}
${cityHtml}`;

  seoPageViews.set('blog/' + article.slug, (seoPageViews.get('blog/' + article.slug) || 0) + 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — article content is static
  res.setHeader('Vary', 'Accept-Encoding');
  res.send(blogShell(head, { html, css }, BASE));
});

// ── PHASE 5 — Public founder profile pages (crawlable, no auth) ──────────────
// Safe public fields only — email, lat, lng, password, otp, push_token excluded by select.
// Quality gate: profile_score >= 60, trust_score >= 10, not banned.
const PROFILE_PUBLIC_FIELDS = 'id,name,bio,photos,location,intent,interests,skills,currently_exploring,working_on,profile_score,trust_score,is_profile_complete,banned,instagram,linkedin,website,created_at';

app.get('/founders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Validate UUID format to prevent unnecessary DB queries
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const { data: user } = await supabase.from('users')
      .select(PROFILE_PUBLIC_FIELDS).eq('id', id).maybeSingle();
    // Quality gate: must exist, not banned, profile complete enough
    if (!user || user.banned || (user.profile_score || 0) < 60 || (user.trust_score || 0) < 10) {
      return res.status(404).json({ error: 'Not found' });
    }
    const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
    const canonical = BASE + '/founders/' + id;
    const E = escHtml;
    const name = E(user.name || 'Founder');
    const bio  = E((user.bio || '').slice(0, 300));
    const location = E(user.location || 'India');
    const intent = E((Array.isArray(user.intent) ? user.intent : [user.intent || '']).filter(Boolean).join(', '));
    const skills = (user.skills || []).slice(0, 8).map(s => E(s));
    const interests = (user.interests || []).slice(0, 6).map(i => E(i));
    const photo = (user.photos || [])[0] || null;
    const metaTitle = name + (location ? ' — Startup Founder in ' + location : ' — Startup Founder') + ' | Build Your Network';
    const metaDesc = (user.bio || '').slice(0, 155) || ('Founder profile for ' + (user.name || 'a startup founder') + ' on Build Your Network — the intent-based founder networking platform in India.');

    const personSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      'name': user.name,
      'url': canonical,
      'description': user.bio || undefined,
      'jobTitle': intent || 'Startup Founder',
      'knowsAbout': [...(user.skills || []), ...(user.interests || [])].slice(0, 12),
      'workLocation': user.location ? { '@type': 'Place', 'name': user.location } : undefined,
      'memberOf': { '@type': 'Organization', 'name': 'Build Your Network', 'url': BASE },
      ...(photo ? { 'image': photo } : {}),
      ...(user.linkedin ? { 'sameAs': [user.linkedin] } : {}),
    }).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${E(metaTitle)}</title>
<link rel="canonical" href="${canonical}">
<meta name="description" content="${E(metaDesc)}">
<meta name="robots" content="index, follow, max-snippet:-1">
<meta property="og:type" content="profile">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${E(metaTitle)}">
<meta property="og:description" content="${E(metaDesc)}">
${photo ? '<meta property="og:image" content="' + E(photo) + '">' : ''}
<meta property="og:site_name" content="Build Your Network">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="${photo ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${E(metaTitle)}">
<meta name="twitter:description" content="${E(metaDesc)}">
${photo ? '<meta name="twitter:image" content="' + E(photo) + '">' : ''}
<script type="application/ld+json">${personSchema}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="/assets/logo.png" type="image/png">
<style>
:root{--bg:#FFF4EC;--bg2:#FDE8D7;--card:#fff;--primary:#0F766E;--hl:#CCFBF1;--text:#1F2937;--muted:#6B7280}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,244,236,.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(253,232,215,.6)}
.nav-inner{max-width:900px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.logo{font-weight:800;font-size:18px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.logo img{width:26px;height:26px;border-radius:6px}
.nav-cta{background:var(--primary);color:#fff;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none}
.wrap{max-width:700px;margin:0 auto;padding:100px 24px 80px}
.bc{font-size:13px;color:var(--muted);margin-bottom:28px}.bc a{color:var(--primary);text-decoration:none}
.profile-head{display:flex;gap:20px;align-items:flex-start;margin-bottom:32px}
.avatar{width:80px;height:80px;border-radius:16px;object-fit:cover;background:var(--bg2);flex-shrink:0}
.avatar-ph{width:80px;height:80px;border-radius:16px;background:var(--hl);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:var(--primary);flex-shrink:0}
.ph-info h1{font-size:clamp(20px,3.5vw,28px);font-weight:800;letter-spacing:-.5px;margin-bottom:6px}
.location{font-size:14px;color:var(--muted);margin-bottom:8px}
.intent-tag{display:inline-block;background:var(--hl);color:var(--primary);font-size:12px;font-weight:600;padding:3px 10px;border-radius:100px;margin-right:6px;margin-bottom:4px}
.bio{font-size:15px;color:var(--muted);line-height:1.7;margin-bottom:32px}
.pills-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:10px}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.pill{background:var(--card);border:1px solid var(--bg2);border-radius:8px;padding:6px 14px;font-size:13px;color:var(--text);font-weight:500}
.cta-block{background:var(--primary);border-radius:16px;padding:32px 28px;text-align:center;color:#fff;margin-top:40px}
.cta-block h2{font-size:18px;font-weight:800;margin-bottom:8px}
.cta-block p{font-size:14px;opacity:.85;margin-bottom:18px}
.cta-block a{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#fff;color:var(--primary);text-decoration:none;border-radius:8px;font-weight:700;font-size:14px}
.links{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px}
.ext-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--primary);text-decoration:none;font-weight:600;background:var(--card);border:1px solid var(--bg2);border-radius:8px;padding:7px 14px}
footer{border-top:1px solid var(--bg2);padding:24px;text-align:center;font-size:12px;color:var(--muted)}
footer a{color:var(--primary);text-decoration:none}
@media(max-width:480px){.profile-head{flex-direction:column}.wrap{padding:80px 16px 60px}}
</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="logo"><img src="/assets/logo.png" alt="Build Your Network">BuildYourNetwork</a>
  <a href="/signup" class="nav-cta">Join Free</a>
</div></nav>
<div class="wrap">
  <p class="bc"><a href="/">Home</a> › <a href="/networking-for-founders">Founder Network</a> › ${name}</p>
  <div class="profile-head" itemscope itemtype="https://schema.org/Person">
    ${photo ? '<img class="avatar" src="' + E(photo) + '" alt="' + name + '" itemprop="image">' : '<div class="avatar-ph">' + (user.name || 'F').charAt(0).toUpperCase() + '</div>'}
    <div class="ph-info">
      <h1 itemprop="name">${name}</h1>
      ${location ? '<p class="location" itemprop="workLocation">' + location + '</p>' : ''}
      ${intent ? intent.split(',').map(i => '<span class="intent-tag">' + i.trim() + '</span>').join('') : ''}
    </div>
  </div>
  ${bio ? '<p class="bio">' + bio + '</p>' : ''}
  ${skills.length ? '<p class="pills-label">Skills</p><div class="pills">' + skills.map(s => '<span class="pill">' + s + '</span>').join('') + '</div>' : ''}
  ${interests.length ? '<p class="pills-label">Interests</p><div class="pills">' + interests.map(i => '<span class="pill">' + i + '</span>').join('') + '</div>' : ''}
  ${(user.linkedin || user.website) ? '<div class="links">' + (user.linkedin ? '<a class="ext-link" href="' + E(user.linkedin) + '" rel="noopener" target="_blank">LinkedIn</a>' : '') + (user.website ? '<a class="ext-link" href="' + E(user.website) + '" rel="noopener" target="_blank">Website</a>' : '') + '</div>' : ''}
  <div class="cta-block">
    <h2>Connect with ${name} on Build Your Network</h2>
    <p>Join free to send a connection request. Intent-based matching — no cold DMs.</p>
    <a href="/signup">Join BYN Free &#8594;</a>
  </div>
</div>
<footer><p>&copy; 2026 <a href="/">BuildYourNetwork</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></p></footer>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(html);
  } catch(e) {
    console.error('Public profile page error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PHASE 5 — Webmaster verification + IndexNow ──────────────────────────────
// Google Search Console: set GSC_VERIFICATION env var to the token from the
// verification file URL (e.g. for google<TOKEN>.html set GSC_VERIFICATION=<TOKEN>)
if (process.env.GSC_VERIFICATION) {
  app.get('/google' + process.env.GSC_VERIFICATION + '.html', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send('google-site-verification: ' + process.env.GSC_VERIFICATION);
  });
}

// Bing Webmaster Tools: set BING_VERIFICATION env var to the BingSiteAuth key
if (process.env.BING_VERIFICATION) {
  app.get('/BingSiteAuth.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send('<?xml version="1.0"?>\n<users>\n  <user>' + process.env.BING_VERIFICATION + '</user>\n</users>');
  });
}

// IndexNow — key file served at /<KEY>.txt; submission fires on startup
// Set INDEXNOW_KEY env var to a random UUID (generate once, reuse forever)
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || null;
if (INDEXNOW_KEY) {
  app.get('/' + INDEXNOW_KEY + '.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(INDEXNOW_KEY);
  });
}

// sitemap.xml and robots.txt are registered before express.static (above)


// APK download — serves BuildYourNetwork.apk directly from public/apk/.
// If APK_DOWNLOAD_URL env var is set it takes priority (for future EAS-hosted builds).
const APK_FILE = path.join(__dirname, 'public', 'apk', 'BuildYourNetwork.apk');
app.get('/download/android', (req, res) => {
  if (process.env.APK_DOWNLOAD_URL) {
    return res.redirect(302, process.env.APK_DOWNLOAD_URL);
  }
  if (fs.existsSync(APK_FILE)) {
    res.setHeader('Content-Disposition', 'attachment; filename="BuildYourNetwork.apk"');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    return res.sendFile(APK_FILE);
  }
  res.status(404).json({ error: 'APK not available yet. Check back shortly.' });
});
app.get('/apk/:filename', (req, res) => res.redirect(302, '/download/android'));

// ── MULTER / STORAGE ──
const ALLOWED_MIMETYPES = ['image/jpeg','image/png','image/webp'];

const cloudinaryStorage = USE_CLOUDINARY ? new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'networkapp',
    allowed_formats: ['jpg','jpeg','png','webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  },
}) : null;

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname).toLowerCase())
});

const upload = multer({
  storage: cloudinaryStorage || diskStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Fail closed in production if Cloudinary isn't configured — never silently
    // fall back to the less-validated local-disk storage path on a live deploy.
    if (!USE_CLOUDINARY && process.env.NODE_ENV === 'production') {
      return cb(new Error('Uploads are temporarily unavailable'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMETYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
    cb(null, true);
  }
});

// ── FILE URL HELPER ──
function getFileUrl(file) {
  if (USE_CLOUDINARY && file.path) return file.path;
  return '/uploads/' + file.filename;
}

// ── FIXED: Cloudinary deletion extracts public_id correctly ──
async function deleteCloudinaryPhoto(url) {
  if (!USE_CLOUDINARY || !url) return;
  try {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = 'networkapp/' + filename.replace(/\.[^.]+$/, '');
    await cloudinary.uploader.destroy(publicId);
  } catch(e) { console.error('Cloudinary delete error:', e.message); }
}

// ── FIXED: SANITIZATION ──
// Trims/length-limits only — does NOT HTML-encode. Output encoding is the
// consumer's job (React auto-escapes JSX text; public/webapp.html uses its
// own esc()/escA()). Escaping here corrupted stored text — e.g. an interest
// of `Band: "The Doors"` was persisted as `Band: &quot;The Doors&quot;` and
// every consumer displayed the literal entity instead of a quote character.
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s.trim().slice(0, 1000);
}

// Only http(s) links may be stored for user-supplied profile URLs — blocks
// javascript:/data:/vbscript: URI injection via linkedin/website fields.
function sanitizeUrlField(v) {
  if (typeof v !== 'string' || !v.trim()) return '';
  const trimmed = v.trim();
  try {
    const u = new URL(trimmed);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? trimmed : '';
  } catch {
    return '';
  }
}

// FIXED: Recursively sanitize strings inside arrays
function sanitizeObj(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  fields.forEach(f => {
    if (obj[f] !== undefined) {
      if (typeof obj[f] === 'string') {
        obj[f] = sanitize(obj[f]);
      } else if (Array.isArray(obj[f])) {
        obj[f] = obj[f].map(item => typeof item === 'string' ? sanitize(item) : item);
      }
    }
  });
  return obj;
}

const URL_PATTERN = /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(\/[^\s]*)?/gi;

// Constant-time string comparison — prevents timing attacks on shared secrets (webhook sigs, admin bootstrap secret).
function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a ?? ''), 'utf8');
  const bBuf = Buffer.from(String(b ?? ''), 'utf8');
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

// Anonymizes a users row in place of a hard delete — connections and the
// other party's messages stay resolvable (see migrations/012_soft_delete_users.sql).
// Original email is freed up for reuse; login is blocked via deleted_at.
function anonymizeUser(id) {
  return {
    email: `deleted-${id}@deleted.buildyournetwork.online`,
    password: bcrypt.hashSync(crypto.randomUUID(), 12),
    name: 'Deleted User',
    bio: '', headline: '', photos: [], instagram: '', linkedin: '', website: '',
    location: '', lat: null, lng: null,
    skills: [], interests: [],
    currently_exploring: '', working_on: '', interested_in: '',
    push_token: null,
    verification: { status: 'none', confidence: 0 },
    deleted_at: new Date().toISOString(),
  };
}

// Masks an email for logs — keeps enough to correlate support tickets without storing PII in plaintext log aggregation.
function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  const user = s.slice(0, at);
  const domain = s.slice(at + 1);
  const maskedUser = user.length <= 2 ? user[0] + '*' : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

// ── CLEAN HELPERS ──
function cleanPublic(u) {
  if (!u) return null;
  const r = { ...u };
  delete r.password;
  delete r.email;
  delete r.lat; delete r.lng;
  delete r.banned;
  delete r.otp_code;
  delete r.otp_expires_at;
  delete r.push_token;
  delete r.role;           // admin status must not be publicly enumerable
  delete r.failed_login_attempts;
  delete r.lockout_until;
  r.is_recently_active = !!(u.last_active &&
    (Date.now() - new Date(u.last_active).getTime()) < 30 * 60 * 1000);
  delete r.last_active;
  return r;
}

function clean(u) {
  if (!u) return null;
  const r = { ...u };
  delete r.password;
  delete r.otp_code;
  delete r.otp_expires_at;
  delete r.push_token;
  delete r.failed_login_attempts;
  delete r.lockout_until;
  return r;
}

function mapMessage(m) {
  if (!m) return null;
  const r = { ...m };
  r.from = r.sender_id;
  delete r.sender_id;
  return r;
}

function mapPriorityMsg(pm) {
  if (!pm) return null;
  const r = { ...pm };
  r.from = r.from_user;
  r.to   = r.to_user;
  delete r.from_user; delete r.to_user;
  return r;
}

// ── TRUST SCORE (7 steps, max 100) ──
function calcTrust(u) {
  let score = 0;
  if ((u.photos || []).length >= 4)                            score += 20;
  if ((u.interests || []).length >= 1)                         score += 10;
  if (u.intent && u.intent.length > 0)                        score += 10;
  if (u.bio && u.bio.trim().length >= 10)                     score += 10;
  if (u.location && u.location.trim().length > 0)             score += 10;
  if (u.linkedin || u.website || u.instagram)                 score += 10;
  if (u.verification && u.verification.status === 'verified') score += 30;
  return score;
}

// ── REVIEW TAGS ──
const REVIEW_TAGS = [
  'Responsive','Professional','Knowledgeable','Collaborative',
  'Trustworthy','Inspiring','Well-connected','Good listener',
  'Helpful','Creative','Reliable','Authentic',
];

// ── REVIEW SUMMARY HELPER ──
function buildReviewSummary(reviews) {
  if (!reviews.length) return { count: 0, avg_rating: 0, top_tags: [] };
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const tagCounts = {};
  reviews.forEach(r => (r.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const top_tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
  return { count: reviews.length, avg_rating: Math.round(avg * 10) / 10, top_tags };
}

// ── PROFILE COMPLETION SCORE ──
function calcProfileScore(u) {
  let score = 0;
  const photos    = u.photos    || [];
  const interests = u.interests || [];
  if (photos.length >= 4)          score += 30;
  else if (photos.length >= 1)     score += 10;
  if (interests.length >= 3)       score += 20;
  else if (interests.length >= 1)  score += 8;
  if (u.intent && u.intent.length > 0)      score += 20;
  if (u.bio && u.bio.length >= 10)          score += 10;
  if (u.name && u.name.length >= 2)         score += 10;
  if (u.location && u.location.length > 0)  score += 10;
  return Math.min(score, 100);
}

async function syncProfileScore(userId, user) {
  const score    = calcProfileScore(user);
  const complete = score >= 70;
  await supabase.from('users').update({
    profile_score: score,
    is_profile_complete: complete
  }).eq('id', userId);
  return { profile_score: score, is_profile_complete: complete };
}

function trustSteps(u) {
  return [
    { label: '4+ photos uploaded (+20)',  done: (u.photos||[]).length >= 4 },
    { label: 'Interests added (+10)',      done: (u.interests||[]).length >= 1 },
    { label: 'Networking goal set (+10)', done: !!(u.intent && u.intent.length > 0) },
    { label: 'Bio written (+10)',          done: !!(u.bio && u.bio.trim().length >= 10) },
    { label: 'Location added (+10)',       done: !!(u.location && u.location.trim().length > 0) },
    { label: 'Social link added (+10)',    done: !!(u.linkedin||u.website||u.instagram) },
    { label: 'Identity verified (+30)',    done: !!(u.verification && u.verification.status==='verified') },
  ];
}

// ── MATCH ENGINE ──
const INTENT_COMPAT = {
  'explore-network':    ['explore-network','exchange-ideas','build-relationships','collaborate'],
  'exchange-ideas':     ['exchange-ideas','explore-network','learn-mentorship','collaborate'],
  'learn-mentorship':   ['exchange-ideas','explore-network','build-relationships'],
  'build-relationships':['build-relationships','explore-network','exchange-ideas','collaborate'],
  'collaborate':        ['collaborate','exchange-ideas','build-relationships']
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// FIXED: Validates coordinates to prevent NaN scores
function matchScore(a, b) {
  let interest = 0, intent = 0, context = 0, location = 0;
  const aInt = (a.interests||[]).map(s=>s.toLowerCase());
  const bInt = (b.interests||[]).map(s=>s.toLowerCase());
  if (aInt.length && bInt.length) {
    const overlap = aInt.filter(s=>bInt.includes(s)).length;
    interest = Math.round((overlap / Math.min(Math.max(aInt.length,bInt.length),6)) * 35);
  }
  if (a.interested_in && b.interested_in) {
    const aW = a.interested_in.toLowerCase().split(/\W+/).filter(w=>w.length>3);
    const bW = b.interested_in.toLowerCase().split(/\W+/).filter(w=>w.length>3);
    interest = Math.min(interest + aW.filter(w=>bW.includes(w)).length*4, 35);
  }
  if (a.intent && b.intent) {
    intent = (INTENT_COMPAT[a.intent]||[]).includes(b.intent) ? 25 : 8;
  }
  const aS = (a.skills||[]).map(s=>s.toLowerCase());
  const bS = (b.skills||[]).map(s=>s.toLowerCase());
  context = Math.min(aS.filter(s=>bS.includes(s)).length * 5, 12);
  if (a.currently_exploring && b.working_on) {
    const w = a.currently_exploring.toLowerCase().split(/\W+/).filter(x=>x.length>3);
    if (w.some(x=>b.working_on.toLowerCase().includes(x))) context = Math.min(context+8, 20);
  }
  // FIXED: Use != null so latitude 0 is handled correctly; validate parseFloat results
  if (a.lat != null && b.lat != null && a.lng != null && b.lng != null) {
    const aLat = parseFloat(a.lat);
    const aLng = parseFloat(a.lng);
    const bLat = parseFloat(b.lat);
    const bLng = parseFloat(b.lng);
    if (!isNaN(aLat) && !isNaN(aLng) && !isNaN(bLat) && !isNaN(bLng)) {
      const d = haversine(aLat, aLng, bLat, bLng);
      location = d<10?20:d<50?15:d<200?8:3;
    }
  } else if (a.location && b.location && a.location.toLowerCase()===b.location.toLowerCase()) {
    location = 20;
  } else if (a.remote && b.remote) {
    location = 10;
  }
  return Math.min(Math.max(interest+intent+context+location+5, 1), 99);
}

// Legacy intent slugs → human-readable labels. `users.intent` is written either
// as one of these slugs (onboarding, see INTENT_LEGACY_MAP) or as a plain label
// already (ProfileEdit's intent chips) — mirrors frontend/lib/intent.ts, keep
// both in sync if this map changes.
const INTENT_DISPLAY_LABELS = {
  'explore-network': 'Exploring network',
  'exchange-ideas': 'Exchanging ideas',
  'learn-mentorship': 'Learning / Mentorship',
  'build-relationships': 'Building relationships',
  'collaborate': 'Collaborate on projects',
  'find-cofounder': 'Finding a co-founder',
  'find-mentor': 'Finding a mentor',
  'hire': 'Hiring talent',
  'find-investors': 'Finding investors',
};
function formatIntent(intent) {
  if (!intent) return '';
  return INTENT_DISPLAY_LABELS[intent] || intent;
}

function getInsight(a, b) {
  const shared = (a.interests||[]).filter(s=>(b.interests||[]).map(x=>x.toLowerCase()).includes(s.toLowerCase()));
  if (shared.length) return 'Shared curiosity in ' + shared.slice(0,2).join(' & ');
  if (a.currently_exploring && b.working_on) {
    const w = a.currently_exploring.toLowerCase().split(/\W+/).filter(x=>x.length>3);
    if (w.some(x=>b.working_on.toLowerCase().includes(x))) return "Their work connects with what you're exploring";
  }
  return b.intent ? 'Looking to ' + formatIntent(b.intent).toLowerCase() : 'Could be worth a conversation';
}

function getMatchReasons(a, b) {
  const reasons = [];

  // Same city
  if (a.location && b.location) {
    const aCity = a.location.split(',')[0].trim().toLowerCase();
    const bCity = b.location.split(',')[0].trim().toLowerCase();
    if (aCity && bCity && aCity === bCity) reasons.push(`Same city · ${a.location.split(',')[0].trim()}`);
  }

  // Both remote
  if (a.remote && b.remote) reasons.push('Both working remotely');

  // Intent — shared or theirs
  if (b.intent) {
    const bIntent = formatIntent(b.intent);
    const aIntent = formatIntent(a.intent).toLowerCase();
    if (aIntent && aIntent === bIntent.toLowerCase()) {
      reasons.push(`Both looking for ${bIntent.toLowerCase()}`);
    } else {
      reasons.push(`Looking for ${bIntent.toLowerCase()}`);
    }
  }

  // Shared skills
  const sharedSkills = (a.skills||[]).filter(s=>(b.skills||[]).some(x=>x.toLowerCase()===s.toLowerCase()));
  if (sharedSkills.length) reasons.push(`Shared skills · ${sharedSkills.slice(0,2).join(', ')}`);

  // Shared interests
  const sharedInterests = (a.interests||[]).filter(s=>(b.interests||[]).some(x=>x.toLowerCase()===s.toLowerCase()));
  if (sharedInterests.length) reasons.push(`Both into ${sharedInterests.slice(0,2).join(' & ')}`);

  // Exploring ↔ building overlap
  if (a.currently_exploring && b.working_on) {
    const kw = a.currently_exploring.toLowerCase().split(/\W+/).filter(x=>x.length>3);
    if (kw.some(x=>b.working_on.toLowerCase().includes(x))) reasons.push("Their work connects to what you're exploring");
  }

  return reasons.slice(0, 3);
}

// ── DATE HELPERS ──
function todayKey()     { return new Date().toISOString().slice(0,10); }
function thisMonthKey() { return new Date().toISOString().slice(0,7);  }

// ── FIXED: Daily swipe count uses correct head:true response shape ──
async function getTodaySwipeCountExact(userId) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count, error } = await supabase.from('swipes')
    .select('*', { count: 'exact', head: true })
    .eq('from_user', userId)
    .gte('created_at', todayStart.toISOString());
  if (error) throw error;
  return count || 0;
}

// ── PUSH NOTIFICATIONS ──
async function sendPush(userIds, title, body, data = {}) {
  if (!userIds.length) return;
  const { data: rows } = await supabase.from('users')
    .select('push_token').in('id', userIds);
  const pushMessages = (rows || [])
    .filter(u => u.push_token && Expo.isExpoPushToken(u.push_token))
    .map(u => ({ to: u.push_token, sound: 'default', title, body, data }));
  if (!pushMessages.length) return;
  const chunks = expo.chunkPushNotifications(pushMessages);
  for (const chunk of chunks) {
    try { await expo.sendPushNotificationsAsync(chunk); }
    catch (e) { console.error('Push send error:', e.message); }
  }
}

async function sendLikeNotification(likerId, targetId) {
  try {
    const [{ data: liker }, { data: target }] = await Promise.all([
      supabase.from('users').select('name,intent,interests,skills,lat,lng,location,remote,working_on,currently_exploring,interested_in').eq('id', likerId).maybeSingle(),
      supabase.from('users').select('premium,is_premium,interests,skills,lat,lng,location,remote,working_on,currently_exploring,interested_in').eq('id', targetId).maybeSingle(),
    ]);
    if (!liker || !target) return;

    const score = Math.min(matchScore(liker, target), 99);
    const isPremium = !!(target.premium || target.is_premium);
    const intent = liker.intent || null;

    const title = isPremium ? `❤️ ${liker.name} liked you` : '❤️ Someone liked you';
    const body  = isPremium
      ? (intent ? `${liker.name} is looking to ${intent.toLowerCase()} — you're a ${score}% match.` : `You two are a ${score}% match — say hello.`)
      : (intent ? `They're looking to ${intent.toLowerCase()} and you're a ${score}% match.` : `You two are a ${score}% match — go check them out.`);

    sendWebPush([targetId], title, body, { screen: 'LikedMe' }).catch(() => {});
  } catch (e) { /* non-critical */ }
}

async function sendWebPush(userIds, title, body, data = {}) {
  if (!webpush || !userIds.length) return;
  const { data: rows } = await supabase.from('push_subscriptions')
    .select('subscription, user_id').in('user_id', userIds);
  if (!rows?.length) return;
  const payload = JSON.stringify({ title, body, data });
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        supabase.from('push_subscriptions')
          .delete().eq('user_id', row.user_id).eq('endpoint', row.subscription.endpoint)
          .then(() => {}).catch(() => {});
      }
    }
  }
}

// ── FIXED: AUTH MIDDLEWARE ──
// Verifies token, checks user exists in DB, checks banned status,
// and attaches full user data to avoid duplicate DB queries in guards.
async function auth(req, res, next) {
  const bearerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = bearerToken || req.cookies?.byn_token;
  if (!token) return res.status(401).json({ error: 'No token' });

  // Step 1: Verify JWT signature — synchronous, no DB involved
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Step 2: Fetch user from DB — DB errors return 503, not 401
  try {
    const { data: user, error } = await supabase.from('users')
      .select('*').eq('id', decoded.id).maybeSingle();
    if (error) return res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
    if (!user) return res.status(401).json({ error: 'Account not found' });
    if (user.banned) return res.status(403).json({ error: 'Account restricted' });

    // SECURITY: invalidate tokens issued before a password reset
    if (user.password_changed_at && decoded.iat * 1000 < new Date(user.password_changed_at).getTime()) {
      return res.status(401).json({ error: 'Password was changed — please sign in again' });
    }

    req.user     = decoded;
    req.userData = user;

    // Update last_active non-blocking after every authenticated request
    setImmediate(async () => {
      try {
        await supabase.from('users')
          .update({ last_active: new Date().toISOString() })
          .eq('id', user.id);
      } catch(e) { /* non-critical */ }
    });
    next();
  } catch (e) {
    console.error('Auth DB error:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
  }
}

// BUG FIX 7: adminAuth now splits JWT errors (401) from DB errors (503), matching auth()
async function adminAuth(req, res, next) {
  const token = req.cookies?.byn_token
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'No token' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { data: user, error } = await supabase.from('users')
      .select('*').eq('id', decoded.id).maybeSingle();
    if (error) return res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
    if (!user || user.banned) return res.status(403).json({ error: 'Access denied' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (user.password_changed_at && decoded.iat * 1000 < new Date(user.password_changed_at).getTime())
      return res.status(401).json({ error: 'Session expired — please log in again' });
    req.user = decoded;
    next();
  } catch (e) {
    console.error('adminAuth DB error:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
  }
}

// FIXED: Uses req.userData to avoid duplicate DB queries
async function profileGuard(req, res, next) {
  try {
    const user = req.userData;
    if (!user) {
      const { data: u } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
      if (!u) return res.status(404).json({ error: 'Not found' });
      req.userData = u;
      return profileGuard(req, res, next);
    }
    const score = calcProfileScore(user);
    if (score < 70) {
      return res.status(403).json({
        error: 'Complete your profile to continue',
        code:  'PROFILE_INCOMPLETE',
      });
    }
    next();
  } catch(e) {
    console.error('profileGuard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
}

// FIXED: Uses req.userData to avoid duplicate DB queries
async function trustGuard(req, res, next) {
  try {
    const user = req.userData;
    if (!user) {
      const { data: u } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
      if (!u) return res.status(404).json({ error: 'Not found' });
      req.userData = u;
      return trustGuard(req, res, next);
    }
    const score = calcTrust(user);
    if (score < 20) {
      return res.status(403).json({
        error: 'Complete your profile to unlock Discovery (need 20+ trust points)',
        code: 'TRUST_TOO_LOW',
        trust_score: score,
        required: 20,
        trust_steps: trustSteps(user),
      });
    }
    next();
  } catch(e) {
    console.error('trustGuard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
}

// Lightweight guard for browsing discovery — only requires intent to be set (trust >= 10).
// The discover route itself gates on having at least 1 photo (NO_PHOTO check).
// profileGuard (70) and full trustGuard (20) are still enforced on swipe/connect.
async function discoverGuard(req, res, next) {
  try {
    const user = req.userData;
    if (!user) {
      const { data: u } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
      if (!u) return res.status(404).json({ error: 'Not found' });
      req.userData = u;
      return discoverGuard(req, res, next);
    }
    const score = calcTrust(user);
    if (score < 10) {
      return res.status(403).json({
        error: 'Set your networking goal to unlock Discovery',
        code: 'TRUST_TOO_LOW',
        trust_score: score,
        required: 10,
        trust_steps: trustSteps(user),
      });
    }
    next();
  } catch(e) {
    console.error('discoverGuard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── FIXED: ADMIN AUDIT LOG ──
// Persists to Supabase audit_logs table; keeps in-memory buffer for fast reads.
const adminAuditLog = [];
async function auditLog(adminId, action, targetId) {
  const entry = { adminId, action, targetId, at: new Date().toISOString() };
  adminAuditLog.push(entry);
  if (adminAuditLog.length > 1000) adminAuditLog.shift();
  try {
    await supabase.from('audit_logs').insert({
      admin_id: adminId,
      action,
      target_id: targetId,
      created_at: entry.at
    });
  } catch (e) {
    console.error('Audit log persist error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'buildyournetwork', timestamp: new Date().toISOString() });
});

// ── FIXED: SIGNUP with email validation ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// User-supplied IDs (targetId, reviewedId, etc.) get interpolated straight into
// PostgREST .or() filter strings in several places — .eq()/.in() are parameterized
// by the client and safe, but .or() takes a raw string, so an unvalidated ID could
// inject extra filter clauses. Every ID this app generates is a uuidv4(), so
// rejecting anything that isn't UUID-shaped before it reaches a query closes that
// off without having to rewrite each .or() call.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// ── OTP HELPER ──
function generateOtp() {
  // crypto is imported at the top — randomInt is cryptographically secure
  return String(crypto.randomInt(100000, 1000000));
}

// Resend's JS SDK (v2) never throws for an API-level rejection — fetchRequest()
// always resolves `{ data, error }`, even for a 403/422 (suppressed recipient,
// invalid address, domain not verified, etc.); it only throws for a genuine
// network-level exception (DNS failure, connection refused). The previous
// version of this function `await`ed the call and returned `true` unless that
// threw, so EVERY Resend-side rejection was silently reported as a successful
// send — the confirmed root cause of "new users sometimes unable to complete
// signup" (they're waiting on a code that was in fact never delivered) and of
// suppressed addresses being retried indefinitely. See
// docs/email-verification-audit-2026-08-15.md, root cause #1.
//
// Returns a structured result instead of a bare boolean so callers can tell
// a hard rejection (bad/suppressed address — stop retrying) apart from a
// transient one (Resend outage/misconfig — safe to retry later):
//   { ok: true }
//   { ok: false, reason: 'not_configured' | 'suppressed' | 'provider_error' }
function classifyResendError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  // Resend's documented rejection reasons for a recipient it will refuse to
  // send to again (suppression list, hard bounce, spam complaint, or an
  // address it considers invalid). Anything else (auth error, domain not
  // verified, malformed request, 5xx) is treated as transient/provider-side.
  const SUPPRESSION_KEYWORDS = ['suppress', 'bounce', 'complain', 'invalid_recipient', 'not a valid email'];
  return SUPPRESSION_KEYWORDS.some(k => text.includes(k)) ? 'suppressed' : 'provider_error';
}

async function sendOtpEmail(toEmail, otp, name) {
  if (!ResendClient) {
    console.error('[OTP] Resend client not created — RESEND_API_KEY env var is missing or empty in Railway');
    return { ok: false, reason: 'not_configured' };
  }
  // onboarding@resend.dev is a Resend sandbox sender that ONLY delivers to the
  // Resend account owner's email. For production, set RESEND_FROM to an address
  // on a verified domain (e.g. noreply@buildyournetwork.online).
  const FROM = process.env.RESEND_FROM || 'Build Your Network <onboarding@resend.dev>';
  console.log(`[OTP] Sending from="${FROM}" to="${maskEmail(toEmail)}"`);
  try {
    const { error } = await ResendClient.emails.send({
      from: FROM,
      to: toEmail,
      subject: `${otp} is your Build Your Network verification code`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="color:#0F766E;margin-bottom:4px">Build Your Network</h2>
          <p style="color:#6B7280;font-size:13px;margin-top:0">connect · grow · thrive</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
          <p style="font-size:16px;color:#111827">Hi ${name || 'there'},</p>
          <p style="font-size:15px;color:#374151">Your verification code is:</p>
          <div style="background:#F0FDF4;border:2px solid #0F766E;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
            <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#0F766E">${otp}</span>
          </div>
          <p style="font-size:13px;color:#6B7280">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
          <p style="font-size:12px;color:#9CA3AF">Build Your Network · buildyournetwork.online</p>
        </div>
      `,
    });
    if (error) {
      // Full detail server-side only — never forwarded to the client (no
      // Resend API key/secret is ever present in this object, but the raw
      // error can include internal request ids etc. that don't belong in a
      // user-facing response either).
      console.error('[OTP] Resend rejected the send:', maskEmail(toEmail), JSON.stringify(error));
      return { ok: false, reason: classifyResendError(error) };
    }
    return { ok: true };
  } catch(e) {
    // Genuine network/transport exception — Resend never got to respond.
    console.error('[OTP] Email send threw (network/transport):', e.message);
    return { ok: false, reason: 'provider_error' };
  }
}

// ── SHARED OTP ISSUE+SEND PATH (signup and resend both go through this) ──
// Enforces, per account: a 60s cooldown, max 3/hour, max 5/day, and a
// permanent skip once Resend has told us the address is suppressed/bounced —
// closing the gaps found in docs/email-verification-audit-2026-08-15.md
// (root causes #2–#4: signup's initial send had none of these guards, and
// the resend endpoint had only a coarse 5/15min in-memory limiter with no
// cooldown or daily cap and no persisted suppression awareness).
//
// The cooldown/hour/day claim is written via a single conditional
// UPDATE ... WHERE — Postgres serializes concurrent UPDATEs to the same row,
// re-evaluating the WHERE clause against the just-committed data, so two
// simultaneous requests for the same account can never both win the claim.
// This is what "prevent concurrent duplicate sends" is actually enforced by,
// not just the `resending` disabled-button state on the frontend (which a
// second browser tab, or a replayed request, wouldn't respect).
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_HOUR_LIMIT  = 3;
const OTP_DAY_LIMIT   = 5;

async function issueAndSendOtp(user) {
  if (user.email_suppressed) {
    return { ok: false, code: 'EMAIL_SUPPRESSED' };
  }

  // Checked before the per-account claim below, deliberately: if BYN's own
  // global send budget is exhausted, that's not this user's fault, so it
  // shouldn't cost them one of their own 3-per-hour/5-per-day attempts —
  // once the global window rolls over they should still have their normal
  // personal budget intact.
  if (!claimGlobalOtpBudget()) {
    console.error(`[OTP] Global email budget exhausted (hour:${otpGlobalHourCount}/${OTP_GLOBAL_HOUR_BUDGET}, day:${otpGlobalDayCount}/${OTP_GLOBAL_DAY_BUDGET}) — refusing send to protect the Resend account quota`);
    return { ok: false, code: 'GLOBAL_BUDGET_EXHAUSTED' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const cooldownCutoffIso = new Date(now.getTime() - OTP_COOLDOWN_MS).toISOString();

  const hourStale = !user.otp_hour_window_start || (now - new Date(user.otp_hour_window_start)) >= 60 * 60 * 1000;
  const dayStale  = !user.otp_day_window_start  || (now - new Date(user.otp_day_window_start))  >= 24 * 60 * 60 * 1000;
  const nextHourCount = hourStale ? 1 : (user.otp_hour_count || 0) + 1;
  const nextDayCount  = dayStale  ? 1 : (user.otp_day_count  || 0) + 1;

  if (!hourStale && nextHourCount > OTP_HOUR_LIMIT) return { ok: false, code: 'HOURLY_LIMIT' };
  if (!dayStale  && nextDayCount  > OTP_DAY_LIMIT)  return { ok: false, code: 'DAILY_LIMIT' };

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Atomically claim this send: only succeeds if otp_last_sent_at is null or
  // older than the cooldown window. A concurrent duplicate request loses this
  // race and gets zero rows back.
  const { data: claimed, error: claimErr } = await supabase.from('users')
    .update({
      otp_code: otp, otp_expires_at: otpExpiry,
      otp_last_sent_at: nowIso,
      otp_hour_count: nextHourCount, otp_hour_window_start: hourStale ? nowIso : user.otp_hour_window_start,
      otp_day_count: nextDayCount, otp_day_window_start: dayStale ? nowIso : user.otp_day_window_start,
    })
    .eq('id', user.id)
    .or(`otp_last_sent_at.is.null,otp_last_sent_at.lt.${cooldownCutoffIso}`)
    .select('email, name')
    .maybeSingle();

  if (claimErr) {
    console.error('[OTP] Cooldown-claim update failed:', claimErr.message);
    return { ok: false, code: 'PROVIDER_ERROR' };
  }
  if (!claimed) {
    // Either genuinely on cooldown, or lost a concurrent race for the same window.
    return { ok: false, code: 'COOLDOWN' };
  }

  const sendResult = await sendOtpEmail(claimed.email, otp, claimed.name);
  if (!sendResult.ok) {
    if (sendResult.reason === 'suppressed') {
      await supabase.from('users').update({
        email_suppressed: true,
        email_suppressed_reason: 'resend_rejected',
        email_suppressed_at: new Date().toISOString(),
      }).eq('id', user.id);
      return { ok: false, code: 'EMAIL_SUPPRESSED' };
    }
    return { ok: false, code: sendResult.reason === 'not_configured' ? 'PROVIDER_ERROR' : 'PROVIDER_ERROR' };
  }
  return { ok: true };
}

app.post('/api/signup', otpIpBlockGate, otpIpLimiter, authLimiter, async (req, res) => {
  try {
    // Honeypot: a field with no matching visible input in the real signup
    // form (frontend/app/(auth)/signup/page.tsx) — kept off-screen rather
    // than display:none, since some scrapers skip display:none fields.
    // Real users never populate it; anything filling it in is scripted.
    // Rejected as an ordinary validation error (not a distinct "bot
    // detected" message) so an adaptive attacker can't fingerprint the
    // honeypot from the response. No account is created, no email is sent.
    if (req.body.company_website) {
      return res.status(400).json({ error: 'Invalid signup request' });
    }

    const { email, password, name, ref_code, age_confirmed } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    if (!age_confirmed) return res.status(400).json({ error: 'You must confirm you are 16 or older' });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < 8) return res.status(400).json({ error: 'Password min 8 chars' });

    // Check email uniqueness
    const { data: existing } = await supabase.from('users')
      .select('id').eq('email', normalizedEmail).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const id   = uuidv4();
    const role = ADMIN_EMAILS.includes(normalizedEmail) ? 'admin' : 'user';
    const newUser = {
      id, email: normalizedEmail, password: await bcrypt.hash(password.slice(0, 72), 12), name: sanitize(name).slice(0, 120),
      bio: '', photos: [], instagram: '', linkedin: '', website: '',
      location: '', lat: null, lng: null, remote: false,
      skills: [], interests: [],
      currently_exploring: '', working_on: '', interested_in: '',
      intent: 'explore-network', role, premium: false,
      trust_score: 0, profile_score: 0, is_profile_complete: false,
      verification: { status: 'none', confidence: 0 },
      banned: false, created_at: new Date().toISOString(),
      consent_given_at: new Date().toISOString(), consent_version: 'v1.0',
      do_not_sell: false,
    };

    newUser.trust_score         = calcTrust(newUser);
    newUser.profile_score       = calcProfileScore(newUser);
    newUser.is_profile_complete = newUser.profile_score >= 70;
    newUser.email_verified      = false;
    // otp_code/otp_expires_at intentionally left unset here — issueAndSendOtp()
    // below sets them atomically as part of its own cooldown-claim update, so
    // this signup's first send goes through the exact same 60s/hour/day/
    // suppression checks as every subsequent resend (see the shared-path
    // comment above issueAndSendOtp). Previously signup generated and stored
    // its own OTP inline, bypassing all of those checks entirely.

    const { data: inserted, error: insertErr } = await supabase.from('users')
      .insert(newUser).select().single();
    if (insertErr) throw new Error(insertErr.message);

    // Send OTP email (non-blocking — don't fail signup if email fails or is
    // rate-limited; account creation must succeed independently of email
    // delivery, per docs/email-verification-audit-2026-08-15.md item #15).
    issueAndSendOtp(inserted).catch(e => console.error('[signup] issueAndSendOtp failed:', e.message));

    // Referral attribution — look up referrer by 8-char code prefix, best-effort
    if (ref_code) {
      const cleanCode = String(ref_code).replace(/[^a-f0-9]/gi, '').slice(0, 8);
      if (cleanCode.length >= 6) {
        try {
          const { data: referrer } = await supabase.from('users')
            .select('id').ilike('id', `${cleanCode}%`).limit(1).maybeSingle();
          if (referrer && referrer.id !== id) {
            await supabase.from('users').update({ referred_by: referrer.id }).eq('id', id);
            await supabase.from('user_acquisition').upsert(
              { user_id: id, source: 'Friend/Referral', referral: referrer.id },
              { onConflict: 'user_id' }
            );
            // Referral reward: 10 successful referrals → 1 month Premium free
            const { count: refCount } = await supabase.from('users')
              .select('*', { count: 'exact', head: true })
              .eq('referred_by', referrer.id);
            if (refCount === 10) {
              const { data: ref } = await supabase.from('users')
                .select('premium_expires_at').eq('id', referrer.id).single();
              const base = ref?.premium_expires_at && new Date(ref.premium_expires_at) > new Date()
                ? new Date(ref.premium_expires_at)
                : new Date();
              base.setMonth(base.getMonth() + 1);
              await supabase.from('users')
                .update({ premium_expires_at: base.toISOString(), is_premium: true })
                .eq('id', referrer.id);
            }
          }
        } catch(_) {}
      }
    }

    // SEO landing page signup attribution — capture which page drove this signup
    try {
      const referer = req.headers['referer'] || req.headers['referrer'] || '';
      if (referer) {
        const matched = SEO_PAGES.find(p => p.slug && referer.includes('/' + p.slug));
        if (matched) seoSignups.set(matched.slug, (seoSignups.get(matched.slug) || 0) + 1);
      }
    } catch(_) {}

    const token = jwt.sign({ id, email: normalizedEmail, name: newUser.name }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('byn_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000, path: '/' });
    res.json({ token, user: clean(inserted), email_verified: false });
  } catch(e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── LOGIN ──
app.post('/api/login', authLimiter, async (req, res) => {
  const tag = `[login][${Date.now()}]`;
  try {
    // Step 1: parse body
    if (!req.body || typeof req.body !== 'object') {
      console.error(`${tag} step1 FAIL — req.body is ${typeof req.body}`);
      return res.status(400).json({ error: 'Invalid request body' });
    }
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    email = String(email).trim().toLowerCase();
    console.log(`${tag} step1 OK — email=${maskEmail(email)}`);

    // Step 2: fetch user from Supabase
    const { data: user, error: fetchErr } = await supabase.from('users')
      .select('*').eq('email', email).maybeSingle();
    if (fetchErr) console.error(`${tag} step2 Supabase error — ${fetchErr.message}`);
    console.log(`${tag} step2 — user found=${!!user}, hasPassword=${!!user?.password}`);

    // Timing-safe rejection — always run bcrypt so response time doesn't
    // reveal whether the email exists in the database.
    if (!user || user.deleted_at) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Step 3: guard — user.password must be a non-empty bcrypt hash
    if (!user.password || typeof user.password !== 'string' || !user.password.startsWith('$2')) {
      console.error(`${tag} step3 FAIL — user ${user.id} has invalid password hash: ${String(user.password).slice(0, 10)}...`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.banned && user.role !== 'admin') return res.status(403).json({ error: 'Account restricted' });

    // Per-account lockout check (defense against distributed password spraying)
    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
      return res.status(429).json({
        error: 'Account temporarily locked — too many failed attempts. Try again later.',
        lockout_until: new Date(user.lockout_until).toISOString(),
      });
    }

    // Step 4: password comparison
    const passwordOk = await bcrypt.compare(password, user.password);
    console.log(`${tag} step4 — passwordOk=${passwordOk}`);

    if (!passwordOk) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const update = { failed_login_attempts: attempts };
      if (attempts >= LOGIN_LOCKOUT_THRESHOLD) {
        update.lockout_until = new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS).toISOString();
        update.failed_login_attempts = 0;
      }
      const { error: updateErr } = await supabase.from('users').update(update).eq('id', user.id);
      if (updateErr) console.warn(`${tag} lockout update error — ${updateErr.message}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Step 5: successful auth — reset lockout state + refresh scores
    const updates = { failed_login_attempts: 0, lockout_until: null };

    // Auto-grant admin if in ADMIN_EMAILS list (survives DB resets)
    if (ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== 'admin') {
      updates.role = 'admin';
      user.role = 'admin';
    }

    const ps = calcProfileScore(user);
    updates.profile_score       = ps;
    updates.is_profile_complete = ps >= 70;
    updates.trust_score         = calcTrust(user);

    const { error: updateSuccessErr } = await supabase.from('users').update(updates).eq('id', user.id);
    if (updateSuccessErr) console.warn(`${tag} step5 update error — ${updateSuccessErr.message}`);
    Object.assign(user, updates);

    // Step 6: sign JWT and respond
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`${tag} step6 OK — login successful for ${maskEmail(email)}`);
    res.cookie('byn_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000, path: '/' });
    // NOTE: OTP is NOT auto-sent on login. The client calls /api/auth/send-otp
    // explicitly when it detects email_verified === false, so the user sees a
    // proper "Sending code…" state rather than a silent background fire-and-forget.
    res.json({ token, user: clean(user), email_verified: !!user.email_verified });
  } catch(e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SEND / RESEND OTP ──
// otpSendLimiter (5/15min, in-memory, resets on restart) stays as a coarse
// first-line guard; otpIpBlockGate+otpIpLimiter add a combined per-IP cap
// (shared with /api/signup) so one attacker can't bypass the per-account
// limits below by rotating accounts. The precise, spec-matching
// 60s/3-per-hour/5-per-day enforcement is in issueAndSendOtp() (DB-backed,
// so it's authoritative and survives restarts/multiple instances) — which
// also enforces the global cross-account budget (claimGlobalOtpBudget()).
app.post('/api/auth/send-otp', otpIpBlockGate, otpIpLimiter, otpSendLimiter, auth, async (req, res) => {
  try {
    const { data: user, error: userErr } = await supabase.from('users')
      .select('id, email, name, email_verified, otp_last_sent_at, otp_hour_count, otp_hour_window_start, otp_day_count, otp_day_window_start, email_suppressed')
      .eq('id', req.user.id).maybeSingle();
    if (userErr) {
      // Most likely migrations/015_otp_rate_limiting.sql hasn't been applied
      // yet — the new columns above don't exist, so PostgREST rejects the
      // select outright. Surface the correct state instead of a misleading
      // 404 (the account does exist; email sending is what's unavailable).
      console.error('[OTP] send-otp user lookup failed — has migration 015 run?', userErr.message);
      return res.status(503).json({ error: 'Email service temporarily unavailable', code: 'EMAIL_SERVICE_DOWN' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    // NOTE: do NOT short-circuit for email_verified === true.
    // OTP is also used as per-device trust verification — the mobile apps
    // (NetworkApp/NetworkMobile) intentionally re-trigger this flow on a new
    // device even though email_verified is already true server-side (see
    // NetworkApp/src/context/AuthContext.js). Skipping the send here would
    // silently break that. verify-otp still validates a real code either
    // way, so this can't be used to bypass verification — and every call,
    // verified or not, is now bounded by issueAndSendOtp's cooldown/hour/day
    // caps regardless, so this can no longer be used to run up the Resend
    // quota the way an unbounded resend could. See
    // docs/email-verification-audit-2026-08-15.md for the full reasoning.

    const result = await issueAndSendOtp(user);
    if (!result.ok) {
      switch (result.code) {
        case 'COOLDOWN':
          return res.status(429).json({ error: 'Please wait before requesting another code', code: 'COOLDOWN' });
        case 'HOURLY_LIMIT':
        case 'DAILY_LIMIT':
          return res.status(429).json({ error: 'Too many attempts — please try again later', code: 'TOO_MANY_ATTEMPTS' });
        case 'EMAIL_SUPPRESSED':
          return res.status(422).json({ error: 'This email could not receive mail', code: 'EMAIL_UNREACHABLE' });
        case 'GLOBAL_BUDGET_EXHAUSTED':
          // Already logged with full budget numbers inside issueAndSendOtp() —
          // not a per-user delivery problem, so don't log it as one here.
          return res.status(503).json({ error: 'Email service temporarily unavailable', code: 'EMAIL_SERVICE_DOWN' });
        default:
          console.error(`[OTP] Delivery failed for ${maskEmail(user.email)} — check RESEND_API_KEY and RESEND_FROM env vars`);
          return res.status(503).json({ error: 'Email service temporarily unavailable', code: 'EMAIL_SERVICE_DOWN' });
      }
    }
    res.json({ ok: true, message: 'Email sent' });
  } catch(e) {
    console.error('Send OTP error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── VERIFY OTP ──
app.post('/api/auth/verify-otp', verifyLimiter, auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const { data: user } = await supabase.from('users')
      .select('otp_code, otp_expires_at, email_verified').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    // NOTE: do NOT short-circuit for email_verified === true.
    // Always validate the actual OTP code — even for already-verified accounts.
    // Bypassing here lets any 6-digit number pass on web, since send-otp also skipped sending
    // a real code when email_verified was true. Both gates must be enforced together.
    if (!user.otp_code) return res.status(400).json({ error: 'No verification code found — request a new one' });
    if (new Date() > new Date(user.otp_expires_at))
      return res.status(400).json({ error: 'Code expired — request a new one' });
    if (String(code).trim() !== String(user.otp_code))
      return res.status(400).json({ error: 'Incorrect code' });

    // Mark email_verified = true (idempotent — safe to re-apply even if already true)
    await supabase.from('users')
      .update({ email_verified: true, otp_code: null, otp_expires_at: null }).eq('id', req.user.id);

    res.json({ ok: true });
  } catch(e) {
    console.error('Verify OTP error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FORGOT PASSWORD ──
// Always returns 200 so callers cannot enumerate whether an email exists.
// Rate-limited per IP (3/hr) to prevent email flooding.
app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ ok: true }); // no enumeration

    const normalized = String(email).trim().toLowerCase();
    const { data: user } = await supabase.from('users')
      .select('id, name, email').eq('email', normalized).maybeSingle();

    if (user) {
      const rawCode = crypto.randomInt(100000, 1000000);
      const hash    = crypto.createHash('sha256').update(String(rawCode)).digest('hex');
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await supabase.from('users').update({
        reset_token_hash:       hash,
        reset_token_expires_at: expires,
      }).eq('id', user.id);

      // Send email (non-blocking — don't fail the request if email fails)
      if (ResendClient) {
        const FROM = process.env.RESEND_FROM || 'Build Your Network <onboarding@resend.dev>';
        console.log(`[Reset] Sending from="${FROM}" to="${maskEmail(user.email)}"`);
        ResendClient.emails.send({
          from:    FROM,
          to:      user.email,
          subject: `${rawCode} is your BYN password reset code`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px">
              <h2 style="color:#0F766E;margin-bottom:4px">Build Your Network</h2>
              <p style="color:#6B7280;font-size:13px;margin-top:0">connect · grow · thrive</p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
              <p style="font-size:16px;color:#111827">Hi ${user.name || 'there'},</p>
              <p style="font-size:15px;color:#374151">Your password reset code is:</p>
              <div style="background:#F0FDF4;border:2px solid #0F766E;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
                <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#0F766E">${rawCode}</span>
              </div>
              <p style="font-size:13px;color:#6B7280">This code expires in <strong>15 minutes</strong>. If you didn't request a reset, ignore this email — your password has not changed.</p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
              <p style="font-size:12px;color:#9CA3AF">Build Your Network · buildyournetwork.online</p>
            </div>
          `,
        }).catch(e => console.error('[Reset] Email send failed:', e.message, e.statusCode ?? '', JSON.stringify(e.response ?? {})));
      } else {
        console.error('[Reset] Resend client not initialised — RESEND_API_KEY missing');
      }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('Forgot password error:', e);
    res.json({ ok: true }); // never leak errors that reveal whether email exists
  }
});

// ── RESET PASSWORD ──
// resetPasswordLimiter: 10 attempts / 15 min / IP — caps brute-force window
// Attempt counter: token voided after 5 wrong codes regardless of IP
app.post('/api/auth/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const INVALID = 'Invalid or expired reset code';

    if (!email || !code || !newPassword)
      return res.status(400).json({ error: 'email, code, and newPassword are required' });
    if (String(newPassword).length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const normalized = String(email).trim().toLowerCase();
    const { data: user } = await supabase.from('users')
      .select('id, reset_token_hash, reset_token_expires_at, reset_token_attempts').eq('email', normalized).maybeSingle();

    if (!user || !user.reset_token_hash)
      return res.status(400).json({ error: INVALID });
    if (new Date() > new Date(user.reset_token_expires_at))
      return res.status(400).json({ error: INVALID });

    // SECURITY: timing-safe comparison — prevents hash timing side-channel
    const incomingBuf = Buffer.from(crypto.createHash('sha256').update(String(code).trim()).digest('hex'), 'hex');
    const storedBuf   = Buffer.from(user.reset_token_hash, 'hex');
    const match = crypto.timingSafeEqual(incomingBuf, storedBuf);

    if (!match) {
      const attempts = (user.reset_token_attempts || 0) + 1;
      if (attempts >= 5) {
        // Void token after 5 wrong attempts — force a fresh code request
        await supabase.from('users').update({
          reset_token_hash:       null,
          reset_token_expires_at: null,
          reset_token_attempts:   null,
        }).eq('id', user.id);
      } else {
        await supabase.from('users').update({ reset_token_attempts: attempts }).eq('id', user.id);
      }
      return res.status(400).json({ error: INVALID });
    }

    const hashed = await bcrypt.hash(String(newPassword), 12);
    await supabase.from('users').update({
      password:                hashed,
      reset_token_hash:        null,
      reset_token_expires_at:  null,
      reset_token_attempts:    null,
      password_changed_at:     new Date().toISOString(),
      otp_code:                null,
      otp_expires_at:          null,
      // Clear lockout — a successful password reset proves identity
      failed_login_attempts:   0,
      lockout_until:           null,
    }).eq('id', user.id);

    res.json({ ok: true });
  } catch(e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: 'Reset failed — please try again' });
  }
});

// ── GET ME ──
app.get('/api/me', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const ps = calcProfileScore(user);
    const isComplete = ps >= 70;
    const scoreChanged = user.profile_score !== ps || user.is_profile_complete !== isComplete;

    const [, { data: worksData }] = await Promise.all([
      scoreChanged
        ? supabase.from('users').update({ profile_score: ps, is_profile_complete: isComplete }).eq('id', user.id)
        : Promise.resolve(),
      supabase.from('works').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    user.profile_score       = ps;
    user.is_profile_complete = isComplete;

    const u = clean(user);
    u.trust_steps = trustSteps(user);
    u.works = worksData || [];

    // Silent token refresh — issue a fresh 24h token on every /api/me call
    // so active users never get logged out mid-session after the TTL was shortened from 30d
    const freshToken = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.cookie('byn_token', freshToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000, path: '/' });
    res.json(u);
  } catch(e) {
    console.error('Get me error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── LOGOUT ──
app.post('/api/logout', (_req, res) => {
  res.clearCookie('byn_token', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});

// ── DELETE MY ACCOUNT (GDPR Art. 17 right to erasure) ──
app.delete('/api/me', auth, async (req, res) => {
  try {
    const id = req.user.id;
    // Only the deleting user's own messages are removed -- connections and
    // the other party's messages are left intact (see anonymizeUser below).
    await supabase.from('messages').delete().eq('sender_id', id);
    await supabase.from('swipes').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('priority_msgs').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('reports').delete().or(`from_user.eq.${id},target_id.eq.${id}`);
    await supabase.from('blocks').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('works').delete().eq('user_id', id);
    await supabase.from('user_education').delete().eq('user_id', id);
    await supabase.from('user_work').delete().eq('user_id', id);
    await supabase.from('user_intents').delete().eq('user_id', id);
    await supabase.from('user_acquisition').delete().eq('user_id', id);
    await supabase.from('push_subscriptions').delete().eq('user_id', id);
    await supabase.from('payments').delete().eq('user_id', id);
    const { error: selfDelErr } = await supabase.from('users').update(anonymizeUser(id)).eq('id', id);
    if (selfDelErr) { console.error('Self-delete error:', selfDelErr); return res.status(500).json({ error: 'Failed to delete account' }); }
    await auditLog(id, 'self_delete', id);
    res.clearCookie('byn_token', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  } catch(e) {
    console.error('Self-delete error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── EXPORT MY DATA (GDPR Art. 20 data portability) ──
app.get('/api/me/export', auth, async (req, res) => {
  try {
    const id = req.user.id;
    const { data: user } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { data: conns } = await supabase.from('connections').select('*').or(`user1.eq.${id},user2.eq.${id}`);
    const exportConnIds = (conns || []).map(c => c.id);

    const [
      { data: sentMsgs },
      { data: receivedMsgs },
      { data: intents },
      { data: acquisition },
      { data: works },
    ] = await Promise.all([
      supabase.from('messages').select('id,text,created_at,connection_id').eq('sender_id', id).order('created_at'),
      exportConnIds.length > 0
        ? supabase.from('messages').select('id,text,created_at,connection_id,sender_id').neq('sender_id', id).in('connection_id', exportConnIds).order('created_at')
        : Promise.resolve({ data: [] }),
      supabase.from('user_intents').select('intent,created_at').eq('user_id', id),
      supabase.from('user_acquisition').select('source,referral,created_at').eq('user_id', id).maybeSingle(),
      supabase.from('works').select('title,description,url,created_at').eq('user_id', id),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        headline: user.headline,
        location: user.location,
        profession: user.profession,
        industry: user.industry,
        skills: user.skills,
        interests: user.interests,
        intent: user.intent,
        working_on: user.working_on,
        currently_exploring: user.currently_exploring,
        linkedin: user.linkedin,
        instagram: user.instagram,
        website: user.website,
        premium: user.premium,
        created_at: user.created_at,
        consent_given_at: user.consent_given_at,
        consent_version: user.consent_version,
        do_not_sell: user.do_not_sell,
      },
      intents: intents || [],
      acquisition: acquisition || null,
      connections: (conns || []).map(c => ({ id: c.id, created_at: c.created_at, status: c.status })),
      messages_sent: sentMsgs || [],
      messages_received: receivedMsgs || [],
      works: works || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="byn-data-export.json"');
    res.json(payload);
  } catch(e) {
    console.error('Export error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PRIVACY SETTINGS (Do Not Sell / CCPA) ──
app.post('/api/me/privacy', auth, async (req, res) => {
  try {
    const { do_not_sell } = req.body;
    if (typeof do_not_sell !== 'boolean') return res.status(400).json({ error: 'do_not_sell must be boolean' });
    await supabase.from('users').update({ do_not_sell }).eq('id', req.user.id);
    res.json({ ok: true, do_not_sell });
  } catch(e) {
    console.error('Privacy settings error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PROFILE STATUS ──
app.get('/api/profile-status', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const score    = calcProfileScore(user);
    const complete = score >= 70;
    await supabase.from('users').update({
      profile_score: score, is_profile_complete: complete
    }).eq('id', user.id);

    res.json({
      profile_score:       score,
      is_profile_complete: complete,
      checklist: {
        photos:    (user.photos    || []).length >= 4,
        interests: (user.interests || []).length >= 3,
        intent:    !!(user.intent && user.intent.length > 0),
        bio:       !!(user.bio && user.bio.length >= 10),
        name:      !!(user.name && user.name.length >= 2),
      },
    });
  } catch(e) {
    console.error('Profile status error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── UPDATE ME ──
app.put('/api/me', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    sanitizeObj(req.body, ['name','bio','instagram','linkedin','website','location',
      'currently_exploring','working_on','interested_in']);
    if (req.body.linkedin !== undefined) req.body.linkedin = sanitizeUrlField(req.body.linkedin);
    if (req.body.website !== undefined) req.body.website = sanitizeUrlField(req.body.website);

    if (req.body.lat != null) req.body.lat = Math.round(parseFloat(req.body.lat) * 100) / 100;
    if (req.body.lng != null) req.body.lng = Math.round(parseFloat(req.body.lng) * 100) / 100;

    const allowed = ['name','bio','instagram','linkedin','website','location','lat','lng','remote',
      'skills','interests','currently_exploring','working_on','interested_in','intent'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Merge for score calculation
    const merged = { ...user, ...updates };
    updates.trust_score         = calcTrust(merged);
    updates.profile_score       = calcProfileScore(merged);
    updates.is_profile_complete = updates.profile_score >= 70;

    const { data: updated } = await supabase.from('users')
      .update(updates).eq('id', user.id).select().single();

    const { data: worksData } = await supabase.from('works')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    const u = clean(updated);
    u.trust_steps = trustSteps(updated);
    u.works = worksData || [];
    res.json(u);
  } catch(e) {
    console.error('Update me error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── ADD PHOTO ──
app.post('/api/me/photos', uploadLimiter, auth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const photos = user.photos || [];
    if (photos.length >= 6) return res.status(400).json({ error: 'Max 6 photos' });

    const url = getFileUrl(req.file);
    const newPhotos = [...photos, url];

    const merged  = { ...user, photos: newPhotos };
    const ts      = calcTrust(merged);
    const ps      = calcProfileScore(merged);
    const complete = ps >= 70;

    await supabase.from('users').update({
      photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete
    }).eq('id', user.id);

    res.json({ url, photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete });
  } catch(e) {
    console.error('Add photo error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE PHOTO ──
// SECURITY: URL-based deletion eliminates the TOCTOU race condition
// that existed with index-based deletion (two concurrent requests on the
// same index could delete the wrong photo or corrupt the array).
app.delete('/api/me/photos', auth, async (req, res) => {
  try {
    const { url: photoUrl } = req.body;
    if (!photoUrl || typeof photoUrl !== 'string')
      return res.status(400).json({ error: 'photo url required in request body' });

    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const photos = user.photos || [];
    if (!photos.includes(photoUrl))
      return res.status(404).json({ error: 'Photo not found' });

    const newPhotos = photos.filter(p => p !== photoUrl);

    const merged  = { ...user, photos: newPhotos };
    const ts      = calcTrust(merged);
    const ps      = calcProfileScore(merged);
    const complete = ps >= 70;

    await supabase.from('users').update({
      photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete
    }).eq('id', user.id);

    deleteCloudinaryPhoto(photoUrl).catch(() => {});
    res.json({ photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete });
  } catch(e) {
    console.error('Delete photo error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── VERIFY ──
// SECURITY: confidence value is NEVER accepted from the client.
// Identity verification is admin-controlled via POST /api/admin/verify only.
// This endpoint exists for clients to CHECK their current verification status.
app.get('/api/me/verify', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('verification, trust_score').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({
      status:      user.verification?.status || 'none',
      trust_score: user.trust_score,
    });
  } catch(e) {
    console.error('Verify status error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUSH TOKEN ──
app.post('/api/me/push-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !Expo.isExpoPushToken(token))
      return res.status(400).json({ error: 'Invalid Expo push token' });
    const { error } = await supabase.from('users')
      .update({ push_token: token }).eq('id', req.user.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch(e) {
    console.error('Push token error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE PUSH TOKEN (P4 — data hygiene) ──
app.delete('/api/me/push-token', auth, async (req, res) => {
  try {
    await supabase.from('users').update({ push_token: null }).eq('id', req.user.id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Delete push token error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUBLIC PROFILE ──
// SECURITY: require auth + per-IP rate limit to prevent unauthenticated profile scraping
app.get('/api/profiles/:id', auth, profileViewLimiter, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const [{ data: worksData }, { data: userConns }, { data: reviews }] = await Promise.all([
      supabase.from('works').select('*').eq('user_id', user.id),
      supabase.from('connections').select('user1,user2').or(`user1.eq.${user.id},user2.eq.${user.id}`),
      supabase.from('user_reviews').select('rating,tags').eq('reviewed_id', user.id),
    ]);

    const u = cleanPublic(user);
    u.works            = worksData || [];
    u.connections_count = (userConns || []).length;
    u.review_summary   = buildReviewSummary(reviews || []);

    // Optional auth — mutual connections + is_connected + my_review
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        if (decoded?.id && decoded.id !== user.id) {
          const viewerId = decoded.id;
          const targetConnSet = new Set(
            (userConns || []).map(c => c.user1 === user.id ? c.user2 : c.user1)
          );
          const { data: viewerConns } = await supabase.from('connections')
            .select('user1,user2').or(`user1.eq.${viewerId},user2.eq.${viewerId}`);
          const viewerConnSet = new Set(
            (viewerConns || []).map(c => c.user1 === viewerId ? c.user2 : c.user1)
          );
          u.is_connected = viewerConnSet.has(user.id);
          let mutual = 0;
          viewerConnSet.forEach(id => { if (targetConnSet.has(id)) mutual++; });
          u.mutual_count = mutual;
          if (u.is_connected) {
            const { data: myReview } = await supabase.from('user_reviews')
              .select('*').eq('reviewer_id', viewerId).eq('reviewed_id', user.id).maybeSingle();
            u.my_review = myReview || null;
          }
        }
      } catch {} // invalid token — skip enrichment
    }

    res.json(u);
  } catch(e) {
    console.error('Public profile error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SUBMIT / UPDATE REVIEW ──
app.post('/api/users/:id/review', auth, async (req, res) => {
  try {
    const reviewedId = req.params.id;
    if (!isValidId(reviewedId)) return res.status(400).json({ error: 'Invalid user id' });
    if (reviewedId === req.user.id)
      return res.status(400).json({ error: 'Cannot review yourself' });

    const { rating, tags } = req.body;
    const r = parseInt(rating);
    if (!r || r < 1 || r > 5)
      return res.status(400).json({ error: 'Rating must be 1–5' });

    const validTags = (Array.isArray(tags) ? tags : [])
      .filter(t => REVIEW_TAGS.includes(t)).slice(0, 5);

    // Must be connected
    const { data: conn } = await supabase.from('connections')
      .select('id')
      .or(`and(user1.eq.${req.user.id},user2.eq.${reviewedId}),and(user1.eq.${reviewedId},user2.eq.${req.user.id})`)
      .maybeSingle();
    if (!conn) return res.status(403).json({ error: 'You must be connected to review this person' });

    const { data, error: upsertErr } = await supabase.from('user_reviews').upsert({
      reviewer_id: req.user.id,
      reviewed_id: reviewedId,
      rating: r,
      tags: validTags,
      created_at: new Date().toISOString(),
    }, { onConflict: 'reviewer_id,reviewed_id' }).select().single();
    if (upsertErr) throw new Error(upsertErr.message);

    // Update trust score of reviewed user to reflect new peer feedback
    const { data: allReviews } = await supabase.from('user_reviews')
      .select('rating').eq('reviewed_id', reviewedId);
    const avgRating = allReviews?.length
      ? allReviews.reduce((s, rv) => s + rv.rating, 0) / allReviews.length : 0;
    const peerBonus = (allReviews?.length >= 3 && avgRating >= 4) ? 20 : 0;
    const { data: reviewedUser } = await supabase.from('users')
      .select('*').eq('id', reviewedId).maybeSingle();
    if (reviewedUser) {
      const baseTrust = calcTrust(reviewedUser);
      await supabase.from('users')
        .update({ trust_score: Math.min(baseTrust + peerBonus, 120) })
        .eq('id', reviewedId);
    }

    res.json(data);
  } catch(e) {
    console.error('Review error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET REVIEW SUMMARY ──
// SECURITY: added auth + rate limit — was fully open, leaked avg_rating/tags for any user ID
app.get('/api/users/:id/reviews', auth, profileViewLimiter, async (req, res) => {
  try {
    const { data: reviews } = await supabase.from('user_reviews')
      .select('rating,tags,created_at')
      .eq('reviewed_id', req.params.id)
      .order('created_at', { ascending: false });
    res.json(buildReviewSummary(reviews || []));
  } catch(e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DISCOVER ──
app.get('/api/discover', auth, discoverGuard, async (req, res) => {
  try {
    const me = req.userData;
    if (!me) return res.status(404).json({ error: 'User not found' });
    if (me.banned) return res.status(403).json({ error: 'Account restricted' });
    if (!me.photos || me.photos.length < 1)
      return res.status(403).json({ error: 'Add at least one photo to start discovering people', code: 'NO_PHOTO' });

    const DAILY_LIMIT = me.premium ? 200 : 30;
    const swipedToday = await getTodaySwipeCountExact(req.user.id);
    if (swipedToday >= DAILY_LIMIT)
      return res.json({ limited: true, remaining: 0, profiles: [] });

    // Build exclusion sets — independent queries, run concurrently
    const [{ data: swipedData }, { data: connData }, { data: blockData }] = await Promise.all([
      supabase.from('swipes').select('to_user').eq('from_user', req.user.id),
      supabase.from('connections').select('user1, user2')
        .or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`),
      supabase.from('blocks').select('from_user, to_user')
        .or(`from_user.eq.${req.user.id},to_user.eq.${req.user.id}`),
    ]);
    const swiped = new Set((swipedData || []).map(s => s.to_user));
    const connected = new Set((connData || [])
      .map(c => c.user1 === req.user.id ? c.user2 : c.user1));
    const blocked = new Set((blockData || [])
      .map(b => b.from_user === req.user.id ? b.to_user : b.from_user));

    const excluded = new Set([req.user.id, ...swiped, ...connected, ...blocked]);

    const { skill, intent, location, remote, interest, sort = 'relevance', radius, worldwide } = req.query;

    // Location mode resolution: nearby(default)/remote/worldwide
    let radiusKm = null;
    if (worldwide !== 'true' && remote !== 'true' && me.lat != null && me.lng != null) {
      const _meLat = parseFloat(me.lat);
      const _meLng = parseFloat(me.lng);
      if (!isNaN(_meLat) && !isNaN(_meLng)) {
        if (radius) {
          const requested = parseInt(radius);
          if (!isNaN(requested) && requested < 200 && !me.premium) {
            return res.status(403).json({
              error: 'Exact location filter (under 200 km) requires Premium',
              code: 'PREMIUM_REQUIRED',
            });
          }
          radiusKm = !isNaN(requested) ? requested : 200;
        } else {
          radiusKm = 200;
        }
      }
    }

    // SECURITY: explicit field list — excludes email, password, otp_code, otp_expires_at, push_token
    // PII never enters application memory; cleanPublic() still applied before response
    const DISCOVER_FIELDS = [
      'id','name','bio','photos','location','lat','lng','remote',
      'intent','interests','skills','currently_exploring','working_on','interested_in',
      'trust_score','profile_score','is_profile_complete','premium',
      'banned','role','last_active','verification',
      'instagram','linkedin','website','created_at',
    ].join(',');
    const { data: allUsers } = await supabase.from('users')
      .select(DISCOVER_FIELDS)
      .or('banned.is.null,banned.eq.false')
      .is('deleted_at', null)
      .eq('email_verified', true)
      .gte('trust_score', 10)
      .neq('id', req.user.id)
      .order('last_active', { ascending: false })
      .limit(200);

    let candidates = (allUsers || []).filter(u => !excluded.has(u.id) && u.photos && u.photos.length > 0);

    // Apply filters
    if (skill)    candidates = candidates.filter(u => (u.skills||[]).some(s => s.toLowerCase().includes(skill.toLowerCase())));
    if (intent)   candidates = candidates.filter(u => u.intent === intent);
    if (location) candidates = candidates.filter(u => (u.location||'').toLowerCase().includes(location.toLowerCase()));
    if (interest) candidates = candidates.filter(u => (u.interests||[]).some(s => s.toLowerCase().includes(interest.toLowerCase())));

    // GPS / location filter (3-mode)
    if (remote === 'true') {
      candidates = candidates.filter(u => u.remote);
    } else if (radiusKm != null) {
      const meLat = parseFloat(me.lat);
      const meLng = parseFloat(me.lng);
      candidates = candidates.filter(u => {
        if (u.lat == null || u.lng == null) return true;
        const uLat = parseFloat(u.lat);
        const uLng = parseFloat(u.lng);
        if (isNaN(uLat) || isNaN(uLng)) return true;
        return haversine(meLat, meLng, uLat, uLng) <= radiusKm;
      });
    }
    // worldwide: no location filter

    // Batch-fetch works for all candidates
    const candidateIds = candidates.map(u => u.id);
    const worksMap = {};
    if (candidateIds.length > 0) {
      const { data: allWorks } = await supabase.from('works')
        .select('*').in('user_id', candidateIds);
      (allWorks || []).forEach(w => {
        if (!worksMap[w.user_id]) worksMap[w.user_id] = [];
        worksMap[w.user_id].push(w);
      });
    }

    const ACTIVE_BOOST = 8;
    const oneDayAgo    = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const remaining    = DAILY_LIMIT - swipedToday;

    let profiles = candidates.map(u => {
      const dist = (me.lat != null && u.lat != null && me.lng != null && u.lng != null)
        ? (() => {
            const a = parseFloat(me.lat), b = parseFloat(me.lng);
            const c = parseFloat(u.lat), d = parseFloat(u.lng);
            if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) return null;
            return Math.round(haversine(a, b, c, d));
          })()
        : null;
      const isActive = !!(u.last_active && u.last_active >= oneDayAgo);
      const base = matchScore(me, u);
      return Object.assign({}, cleanPublic(u), {
        matchScore:    Math.min(base + (isActive ? ACTIVE_BOOST : 0), 99),
        insight:       getInsight(me, u),
        matchReasons:  getMatchReasons(me, u),
        works:      worksMap[u.id] || [],
        distance:   dist,
      });
    }).filter(p => p.matchScore > 10);

    if (sort === 'recent')        profiles.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sort === 'distance') profiles.sort((a,b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    else                          profiles.sort((a,b) => b.matchScore - a.matchScore);

    profiles = profiles.slice(0, remaining);
    res.json({ limited: false, remaining, profiles, daily_limit: DAILY_LIMIT });
  } catch(e) {
    console.error('Discover error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DAILY SIGNAL ──
// Returns count of users active or created in the last 24h near the requesting user.
// Used by the Discover screen to show "X new founders in [city] today".
app.get('/api/discover/daily-signal', auth, async (req, res) => {
  try {
    const me = req.userData;
    if (!me) return res.status(404).json({ error: 'User not found' });

    const since24h = new Date(Date.now() - 24 * 3600000).toISOString();
    const city = (me.location || '').trim();

    // Fetch users active or created in the last 24h (excluding self)
    const { data: recentUsers } = await supabase.from('users')
      .select('id, location, lat, lng')
      .neq('id', me.id)
      .eq('email_verified', true)
      .or(`last_active.gte.${since24h},created_at.gte.${since24h}`);

    if (!recentUsers || recentUsers.length === 0) return res.json({ count: 0, city });

    // Filter: same city string OR within 200km if coordinates available
    let count = 0;
    const meLat = parseFloat(me.lat);
    const meLng = parseFloat(me.lng);
    const hasCoords = !isNaN(meLat) && !isNaN(meLng);

    for (const u of recentUsers) {
      if (city && u.location && u.location.toLowerCase().includes(city.toLowerCase())) {
        count++;
        continue;
      }
      if (hasCoords && u.lat != null && u.lng != null) {
        const uLat = parseFloat(u.lat);
        const uLng = parseFloat(u.lng);
        if (!isNaN(uLat) && !isNaN(uLng) && haversine(meLat, meLng, uLat, uLng) <= 200) {
          count++;
        }
      }
    }

    res.json({ count, city });
  } catch (e) {
    console.error('[DailySignal] Error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SEARCH ──
app.get('/api/search', auth, discoverGuard, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = q.trim().toLowerCase();
    // FIXED: Limit results to prevent memory issues
    const { data: allUsers } = await supabase.from('users')
      .select('*')
      .or('banned.is.null,banned.eq.false')
      .neq('id', req.user.id)
      .limit(200);

    const results = (allUsers || []).filter(u =>
      (u.name||'').toLowerCase().includes(term) ||
      (u.interests||[]).some(i => i.toLowerCase().includes(term)) ||
      (u.skills||[]).some(s => s.toLowerCase().includes(term))
    ).slice(0, 20).map(u => cleanPublic(u));

    res.json(results);
  } catch(e) {
    console.error('Search error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FIXED: SWIPE ──
// - Checks limit before insert
// - Handles duplicate swipes via manual check (add DB UNIQUE constraint for full safety)
// - Catches unique violation (23505) as fallback
app.post('/api/swipe', auth, profileGuard, trustGuard, async (req, res) => {
  try {
    const { targetId, direction } = req.body;
    if (!targetId || !['right','left'].includes(direction))
      return res.status(400).json({ error: 'Invalid swipe data' });
    if (targetId === req.user.id) return res.json({ ok: true });

    const swiper = req.userData;
    const SWIPE_LIMIT = swiper.premium ? 200 : 30;

    // Check daily limit
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount, error: countErr } = await supabase.from('swipes')
      .select('*', { count: 'exact', head: true })
      .eq('from_user', req.user.id)
      .gte('created_at', todayStart.toISOString());

    if (countErr) throw countErr;
    if ((todayCount || 0) >= SWIPE_LIMIT)
      return res.status(429).json({ error: 'Daily swipe limit reached', limit: SWIPE_LIMIT, code: 'SWIPE_LIMIT' });

    // Check for existing swipe
    const { data: dupSwipe } = await supabase.from('swipes')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (dupSwipe) return res.json({ match: false, duplicate: true });

    // Insert swipe
    const { error: insertErr } = await supabase.from('swipes').insert({
      from_user: req.user.id, to_user: targetId, direction, created_at: new Date().toISOString()
    });
    if (insertErr) {
      // Handle unique constraint violation if DB enforces UNIQUE(from_user, to_user)
      if (insertErr.code === '23505') {
        return res.json({ match: false, duplicate: true });
      }
      throw insertErr;
    }

    let match = false, connectionId = null;
    if (direction === 'right') {
      // Check if they already swiped right on me
      const { data: theirSwipe } = await supabase.from('swipes')
        .select('id').eq('from_user', targetId).eq('to_user', req.user.id).eq('direction', 'right').maybeSingle();
      if (theirSwipe) {
        const now = new Date();
        connectionId = uuidv4();
        const { error: connErr } = await supabase.from('connections').insert({
          id: connectionId, user1: req.user.id, user2: targetId,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 7*24*3600000).toISOString(),
          first_response_deadline: new Date(now.getTime() + 48*3600000).toISOString(),
          user1_responded: false, user2_responded: false,
          active: false, status: 'pending'
        });
        if (connErr) {
          // 23505 = unique_violation: other request won the race and already created
          // the connection. Fetch it so we can return the correct connectionId.
          if (connErr.code === '23505') {
            const { data: existing } = await supabase.from('connections')
              .select('id').or(`and(user1.eq.${req.user.id},user2.eq.${targetId}),and(user1.eq.${targetId},user2.eq.${req.user.id})`)
              .maybeSingle();
            if (existing) { connectionId = existing.id; } else throw connErr;
          } else throw connErr;
        }
        match = true;

        const [{ data: me2 }, { data: them }] = await Promise.all([
          supabase.from('users').select('name').eq('id', req.user.id).maybeSingle(),
          supabase.from('users').select('name').eq('id', targetId).maybeSingle(),
        ]);
        const myName    = me2   ? me2.name   : 'Someone';
        const theirName = them  ? them.name  : 'Someone';
        sendPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(()=>{});
        sendPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(()=>{});
        sendWebPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(()=>{});
        sendWebPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(()=>{});
      } else {
        sendLikeNotification(req.user.id, targetId).catch(() => {});
      }
    }
    res.json({ match, direction, connectionId });
  } catch(e) {
    console.error('Swipe error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SKIP (left-swipe — persisted to DB, does not consume daily connect limit) ──
app.post('/api/skip', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    if (targetId === req.user.id) return res.json({ ok: true });

    const { data: existing } = await supabase.from('swipes')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (existing) return res.json({ ok: true });

    await supabase.from('swipes').insert({
      from_user: req.user.id, to_user: targetId, direction: 'left',
      created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('Skip error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CONNECT (direct right-swipe from profile page or card button) ──
app.post('/api/connect', auth, profileGuard, trustGuard, async (req, res) => {
  try {
    const { userId: targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'userId required' });
    if (!isValidId(targetId)) return res.status(400).json({ error: 'Invalid user id' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot connect with yourself' });

    const swiper = req.userData;
    const SWIPE_LIMIT = swiper.premium ? 200 : 30;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount, error: countErr } = await supabase.from('swipes')
      .select('*', { count: 'exact', head: true })
      .eq('from_user', req.user.id)
      .gte('created_at', todayStart.toISOString());
    if (countErr) throw countErr;
    if ((todayCount || 0) >= SWIPE_LIMIT)
      return res.status(429).json({ error: 'Daily connection limit reached', limit: SWIPE_LIMIT, code: 'SWIPE_LIMIT' });

    // Check if already connected
    const { data: existingConn } = await supabase.from('connections')
      .select('id')
      .or(`and(user1.eq.${req.user.id},user2.eq.${targetId}),and(user1.eq.${targetId},user2.eq.${req.user.id})`)
      .maybeSingle();
    if (existingConn) return res.json({ ok: true, match: true, connectionId: existingConn.id, duplicate: true });

    // Check if already swiped
    const { data: dupSwipe } = await supabase.from('swipes')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (dupSwipe) return res.json({ ok: true, match: false, duplicate: true });

    const { error: insertErr } = await supabase.from('swipes').insert({
      from_user: req.user.id, to_user: targetId, direction: 'right',
      created_at: new Date().toISOString(),
    });
    if (insertErr) {
      if (insertErr.code === '23505') return res.json({ ok: true, match: false, duplicate: true });
      throw insertErr;
    }

    let match = false, connectionId = null;
    const { data: theirSwipe } = await supabase.from('swipes')
      .select('id').eq('from_user', targetId).eq('to_user', req.user.id).eq('direction', 'right').maybeSingle();
    if (theirSwipe) {
      const now = new Date();
      connectionId = uuidv4();
      const { error: connErr } = await supabase.from('connections').insert({
        id: connectionId, user1: req.user.id, user2: targetId,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 7 * 24 * 3600000).toISOString(),
        first_response_deadline: new Date(now.getTime() + 48 * 3600000).toISOString(),
        user1_responded: false, user2_responded: false,
        active: false, status: 'pending',
      });
      if (connErr) {
        if (connErr.code === '23505') {
          const { data: existing } = await supabase.from('connections')
            .select('id').or(`and(user1.eq.${req.user.id},user2.eq.${targetId}),and(user1.eq.${targetId},user2.eq.${req.user.id})`)
            .maybeSingle();
          if (existing) { connectionId = existing.id; } else throw connErr;
        } else throw connErr;
      }
      match = true;

      const [{ data: me2 }, { data: them }] = await Promise.all([
        supabase.from('users').select('name').eq('id', req.user.id).maybeSingle(),
        supabase.from('users').select('name').eq('id', targetId).maybeSingle(),
      ]);
      const myName    = me2  ? me2.name  : 'Someone';
      const theirName = them ? them.name : 'Someone';
      sendPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(() => {});
      sendPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(() => {});
      sendWebPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(() => {});
      sendWebPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(() => {});
    } else {
      sendLikeNotification(req.user.id, targetId).catch(() => {});
    }

    res.json({ ok: true, match, connectionId });
  } catch(e) {
    console.error('Connect error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CONNECTIONS ──
app.get('/api/connections', auth, async (req, res) => {
  try {
    const now = new Date();
    const { data: conns } = await supabase.from('connections')
      .select('*')
      .or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`);

    // Show connections that are active OR not yet expired
    const active = (conns || []).filter(c => c.active || new Date(c.expires_at) > now);
    if (!active.length) return res.json([]);

    // Batch fetch other users
    const otherIds = active.map(c => c.user1 === req.user.id ? c.user2 : c.user1);
    // `is_online` / `is_recently_active` are NOT real columns on `users` —
    // confirmed against supabase_schema.sql and every migration. They were
    // in this select list, which makes the query itself error (PostgREST
    // rejects unknown columns) — and since the result was never checked for
    // `error`, it silently degraded to an empty user list, so EVERY match's
    // partner lookup failed and got dropped from the chat list. `last_active`
    // is the real column; both flags are computed below the same way
    // cleanPublic() already does for is_recently_active elsewhere.
    const CONNECTION_USER_FIELDS = [
      'id','name','photos','location','headline',
      'intent','interests','skills','currently_exploring','working_on',
      'trust_score','profile_score','is_profile_complete','premium',
      'banned','role','last_active','verification',
      'instagram','linkedin','website','created_at',
    ].join(',');
    const { data: otherUsersRaw, error: otherUsersErr } = await supabase.from('users').select(CONNECTION_USER_FIELDS).in('id', otherIds);
    if (otherUsersErr) console.error('[connections] other-users lookup failed:', otherUsersErr);
    const otherUsers = (otherUsersRaw || []).map(u => ({
      ...u,
      is_online: !!(u.last_active && (Date.now() - new Date(u.last_active).getTime()) < 5 * 60 * 1000),
      is_recently_active: !!(u.last_active && (Date.now() - new Date(u.last_active).getTime()) < 30 * 60 * 1000),
    }));
    const userMap = Object.fromEntries(otherUsers.map(u => [u.id, u]));

    // Diagnostic only — previously a connection whose other-party lookup
    // came back empty was silently dropped from the response with zero
    // trace anywhere. If this ever fires, it tells us definitively whether
    // it's a missing/deleted user row vs. something else.
    const missingOtherIds = [...new Set(otherIds)].filter(id => !userMap[id]);
    if (missingOtherIds.length) {
      console.error('[connections] other-user lookup missing for id(s):', missingOtherIds, 'requested by', req.user.id);
    }

    // Fetch only the last message and count per connection (no full message history load)
    const connIds = active.map(c => c.id);
    const lastMsgMap    = {};
    const msgCountMap   = {};
    const unreadCountMap = {};
    const prioritySet   = new Set();
    if (connIds.length > 0) {
      // Real unread count per connection: messages from the other party sent
      // after MY last-read watermark on that connection (falls back to "since
      // forever" if the watermark column doesn't exist yet / was never set —
      // migrations/014_connection_read_state.sql). Previously `unread_count`
      // was always 0 or 1 ("is the last message not mine") and never cleared
      // on read, only on reply — see docs/matching-chat-audit-2026-08-14.md,
      // findings #1 and #3.
      const [lastMsgResults, { data: priMsgs }, unreadResults, ...countResults] = await Promise.all([
        Promise.all(connIds.map(cid =>
          supabase.from('messages')
            .select('*')
            .eq('connection_id', cid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(r => r.data)
        )),
        supabase.from('priority_msgs')
          .select('from_user')
          .eq('to_user', req.user.id)
          .in('from_user', otherIds)
          .eq('read', false),
        Promise.all(active.map(c => {
          const myReadAt = (c.user1 === req.user.id ? c.user1_last_read_at : c.user2_last_read_at) || '1970-01-01T00:00:00.000Z';
          return supabase.from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('connection_id', c.id)
            .neq('sender_id', req.user.id)
            .gt('created_at', myReadAt)
            .then(r => r.count || 0);
        })),
        ...connIds.map(cid =>
          supabase.from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('connection_id', cid)
        ),
      ]);

      lastMsgResults.forEach((m, i) => {
        if (m) lastMsgMap[connIds[i]] = m;
      });
      connIds.forEach((cid, i) => {
        msgCountMap[cid] = countResults[i]?.count || 0;
        unreadCountMap[cid] = unreadResults[i] || 0;
      });
      (priMsgs || []).forEach(p => prioritySet.add(p.from_user));
    }

    // No longer drops a connection just because the other-party lookup came
    // back empty — it's still returned, with user:null, so the frontend can
    // show it as "unavailable" instead of the connection disappearing with
    // no trace. See the diagnostic log above for why the lookup is empty.
    const result = active.map(c => {
      const otherId  = c.user1 === req.user.id ? c.user2 : c.user1;
      const other    = userMap[otherId];
      const lastMsg  = lastMsgMap[c.id] ? mapMessage(lastMsgMap[c.id]) : null;
      const hoursLeft = c.active ? null : Math.max(0, Math.round((new Date(c.expires_at) - now) / 3600000));
      return {
        connection: c, user: other ? cleanPublic(other) : null,
        lastMessage: lastMsg, hoursLeft, active: !!c.active,
        msgCount: msgCountMap[c.id] || 0,
        unread_count: unreadCountMap[c.id] || 0,
        is_priority: prioritySet.has(otherId),
      };
    });
    res.json(result);
  } catch(e) {
    console.error('Connections error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CONNECTION DETAIL ──
app.get('/api/connections/:connId', auth, async (req, res) => {
  try {
    const now = new Date();
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });

    const otherId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
    // Same real-count logic as GET /api/connections — see the comment there.
    const myReadAt = (conn.user1 === req.user.id ? conn.user1_last_read_at : conn.user2_last_read_at) || '1970-01-01T00:00:00.000Z';
    const [{ data: other }, { data: lastMsgRow }, { data: priMsgs }, { count: unreadCount }] = await Promise.all([
      supabase.from('users').select('*').eq('id', otherId).maybeSingle(),
      supabase.from('messages').select('*').eq('connection_id', conn.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('priority_msgs').select('from_user')
        .eq('to_user', req.user.id).eq('from_user', otherId).eq('read', false),
      supabase.from('messages').select('*', { count: 'exact', head: true })
        .eq('connection_id', conn.id).neq('sender_id', req.user.id).gt('created_at', myReadAt),
    ]);
    if (!other) return res.status(404).json({ error: 'User not found' });

    const lastMsg = lastMsgRow ? mapMessage(lastMsgRow) : null;
    const hoursLeft = conn.active ? null : Math.max(0, Math.round((new Date(conn.expires_at) - now) / 3600000));
    const unread_count = unreadCount || 0;
    res.json({
      connection: conn,
      user: cleanPublic(other),
      lastMessage: lastMsg,
      hoursLeft,
      active: !!conn.active,
      msgCount: 0,
      unread_count,
      is_priority: (priMsgs || []).length > 0,
    });
  } catch(e) {
    console.error('Connection detail error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET MESSAGES ──
app.get('/api/messages/:connId', auth, async (req, res) => {
  try {
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });

    const { data: msgs } = await supabase.from('messages')
      .select('*').eq('connection_id', req.params.connId).order('created_at', { ascending: true });

    // Viewing the thread clears its unread state for this user — previously
    // there was no "read" concept at all for regular messages, so the chat
    // list's unread indicator never cleared just from reading, only from
    // replying. See docs/matching-chat-audit-2026-08-14.md, finding #1.
    // Requires migrations/014_connection_read_state.sql; if not yet applied,
    // this update errors harmlessly (unknown column) and is only logged —
    // it never blocks the actual message fetch below.
    const readCol = conn.user1 === req.user.id ? 'user1_last_read_at' : 'user2_last_read_at';
    const { error: readErr } = await supabase.from('connections')
      .update({ [readCol]: new Date().toISOString() }).eq('id', conn.id);
    if (readErr) console.error('[messages] failed to update last_read_at (has migration 014 run?):', readErr.message);

    res.json((msgs || []).map(mapMessage));
  } catch(e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FIXED: SEND MESSAGE ──
// - Properly handles null avg_reply_minutes to prevent NaN
// - Better error handling in background tracking
app.post('/api/messages/:connId', msgLimiter, auth, async (req, res) => {
  try {
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });
    if (!conn.active && new Date(conn.expires_at) < new Date())
      return res.status(400).json({ error: 'Connection expired' });

    const { text } = req.body;
    // BUG FIX 5: Enforce max message length to prevent storage bloat and client crashes
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
    if (text.trim().length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 characters)' });

    // Track per-user responses; if both replied → mark active
    const connUpdates = {};
    if (req.user.id === conn.user1 && !conn.user1_responded) connUpdates.user1_responded = true;
    if (req.user.id === conn.user2 && !conn.user2_responded) connUpdates.user2_responded = true;
    const willBeActive = (conn.user1_responded || connUpdates.user1_responded) &&
                         (conn.user2_responded || connUpdates.user2_responded) && !conn.active;
    if (willBeActive) connUpdates.active = true;
    if (Object.keys(connUpdates).length > 0) {
      await supabase.from('connections').update(connUpdates).eq('id', conn.id);
    }

    // Insert message
    const msgId = uuidv4();
    const now   = new Date().toISOString();
    await supabase.from('messages').insert({
      id: msgId, connection_id: conn.id, sender_id: req.user.id,
      text: text.trim(), created_at: now
    });

    // FIXED: Non-blocking reply tracking with null-safety
    (async () => {
      try {
        const sender = req.userData;
        if (!sender) return;

        const recipientId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
        const { data: prevMsgs } = await supabase.from('messages')
          .select('created_at').eq('connection_id', conn.id).eq('sender_id', recipientId)
          .order('created_at', { ascending: false }).limit(1);

        const senderUpdates = {};
        if (prevMsgs && prevMsgs.length > 0) {
          const replyMs  = Date.now() - new Date(prevMsgs[0].created_at).getTime();
          const replyMin = Math.max(0, Math.round(replyMs / 60000));
          const prev  = sender.avg_reply_minutes || 0;
          const count = sender.reply_count || 0;
          senderUpdates.avg_reply_minutes = Math.round((prev * count + replyMin) / (count + 1));
          senderUpdates.reply_count = count + 1;
        }

        // Response rate
        const { data: senderConns } = await supabase.from('connections')
          .select('id').or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`);
        if (senderConns && senderConns.length > 0) {
          const { data: repliedMsgs } = await supabase.from('messages')
            .select('connection_id').in('connection_id', senderConns.map(c => c.id))
            .eq('sender_id', req.user.id);
          const repliedSet = new Set((repliedMsgs || []).map(m => m.connection_id));
          senderUpdates.response_rate = Math.round(repliedSet.size / senderConns.length * 100);
        }
        if (Object.keys(senderUpdates).length > 0) {
          await supabase.from('users').update(senderUpdates).eq('id', req.user.id);
        }
      } catch(e) {
        console.error('Reply tracking error:', e);
      }
    })();

    // Notify recipient
    const recipientId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
    const { data: senderUser } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    const senderName = senderUser ? senderUser.name : 'Someone';
    const preview    = text.trim().slice(0, 60) + (text.trim().length > 60 ? '…' : '');
    sendPush([recipientId], `💬 ${senderName}`, preview, { screen: 'ChatDetail', connectionId: conn.id }).catch(()=>{});
    sendWebPush([recipientId], `💬 ${senderName}`, preview, { screen: 'ChatDetail', connectionId: conn.id }).catch(()=>{});

    res.json(mapMessage({ id: msgId, connection_id: conn.id, sender_id: req.user.id, text: text.trim(), created_at: now }));
  } catch(e) {
    console.error('Send message error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FEEDBACK / SUPPORT ──
app.post('/api/feedback', auth, feedbackLimiter, async (req, res) => {
  try {
    const { category, message } = req.body;
    if (!message || message.trim().length < 5)
      return res.status(400).json({ error: 'Message too short' });
    await supabase.from('feedback').insert({
      user_id: req.user.id,
      category: category || 'General Feedback',
      message: message.trim().slice(0, 1000),
      created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('Feedback error:', e);
    res.status(500).json({ error: 'Could not save feedback' });
  }
});

// ── FIXED: PRIORITY MESSAGE ──
// Uses stricter URL regex to avoid false positives
app.post('/api/priority-message', auth, async (req, res) => {
  try {
    const { targetId, text } = req.body;
    if (!targetId || !text) return res.status(400).json({ error: 'targetId and text required' });
    // BUG FIX 6: Enforce max priority message length
    if (text.trim().length > 500) return res.status(400).json({ error: 'Priority message too long (max 500 characters)' });

    const { data: sender } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!sender) return res.status(404).json({ error: 'Not found' });

    const { data: target } = await supabase.from('users')
      .select('id').eq('id', targetId).maybeSingle();
    if (!target) return res.status(404).json({ error: 'Recipient not found' });

    const month = thisMonthKey();
    const { data: monthMsgs } = await supabase.from('priority_msgs')
      .select('id').eq('from_user', req.user.id).eq('month', month);
    const monthCount = (monthMsgs || []).length;
    const limit = sender.premium ? 20 : 3;
    if (monthCount >= limit)
      return res.status(429).json({ error: `Priority message limit reached (${limit}/month)` });

    // Prevent duplicate to same person this month
    const { data: dup } = await supabase.from('priority_msgs')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).eq('month', month).maybeSingle();
    if (dup) return res.status(400).json({ error: 'Already sent a priority message to this person' });

    // FIXED: Stricter URL regex
    const STRICT_URL_PATTERN = /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(\/[^\s]*)?/gi;
    const cleanText = text.trim().replace(STRICT_URL_PATTERN, '[link removed]');
    const pm = { id: uuidv4(), from_user: req.user.id, to_user: targetId,
      text: cleanText, month, read: false, created_at: new Date().toISOString() };
    await supabase.from('priority_msgs').insert(pm);

    sendPush([targetId], `⚡ Priority Message from ${sender.name}`, cleanText.slice(0, 80), { screen: 'PriorityMessages' }).catch(()=>{});
    sendWebPush([targetId], `⚡ Priority Message from ${sender.name}`, cleanText.slice(0, 80), { screen: 'PriorityMessages' }).catch(()=>{});
    res.json({ ok: true, remaining: limit - monthCount - 1 });
  } catch(e) {
    console.error('Priority message error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET PRIORITY MESSAGES ──
app.get('/api/priority-messages', auth, async (req, res) => {
  try {
    const { data: received } = await supabase.from('priority_msgs')
      .select('*').eq('to_user', req.user.id).order('created_at', { ascending: false });
    const { data: sent } = await supabase.from('priority_msgs')
      .select('*').eq('from_user', req.user.id).order('created_at', { ascending: false });

    // Attach sender details to received messages
    const senderIds = [...new Set((received || []).map(pm => pm.from_user))];
    const senderMap = {};
    if (senderIds.length > 0) {
      // Select only public-safe fields — never expose otp_code, push_token, lat/lng
      const { data: senders } = await supabase.from('users')
        .select('id,name,photos,bio,location,intent,trust_score,verification,premium')
        .in('id', senderIds);
      (senders || []).forEach(u => { senderMap[u.id] = u; });
    }

    const month = thisMonthKey();
    const { data: meRow } = await supabase.from('users')
      .select('premium').eq('id', req.user.id).maybeSingle();
    const limit = (meRow && meRow.premium) ? 20 : 3;
    const used  = (sent || []).filter(p => p.month === month).length;

    res.json({
      received: (received || []).map(pm => ({
        ...mapPriorityMsg(pm),
        sender: clean(senderMap[pm.from_user] || null)
      })),
      sent:      (sent || []).map(mapPriorityMsg),
      remaining: limit - used,
      limit
    });
  } catch(e) {
    console.error('Get priority messages error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── WHO LIKED YOU ──
app.get('/api/liked-me', auth, async (req, res) => {
  try {
    // 1. Everyone who swiped RIGHT on me
    const { data: likedSwipes } = await supabase.from('swipes')
      .select('from_user').eq('to_user', req.user.id).eq('direction', 'right');
    const likerIds = (likedSwipes || []).map(s => s.from_user);

    if (!likerIds.length) {
      return res.json({ count: 0, profiles: [], premium_required: false });
    }

    // 2. Exclude people I'm already connected with
    const { data: myConns } = await supabase.from('connections')
      .select('user1, user2')
      .or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`);
    const connectedIds = new Set();
    (myConns || []).forEach(c => { connectedIds.add(c.user1); connectedIds.add(c.user2); });

    // 3. Exclude people I've already swiped on (in any direction)
    const { data: mySwiped } = await supabase.from('swipes')
      .select('to_user').eq('from_user', req.user.id);
    const swipedIds = new Set((mySwiped || []).map(s => s.to_user));

    const filteredIds = likerIds.filter(
      id => id !== req.user.id && !connectedIds.has(id) && !swipedIds.has(id)
    );

    const count = filteredIds.length;

    // 4. Check premium status
    const { data: me } = await supabase.from('users')
      .select('premium').eq('id', req.user.id).maybeSingle();

    if (!me?.premium) {
      // Free users: return count + first photo only — NO id or identifying info.
      // Returning the id would let free users call GET /api/profiles/:id to bypass premium.
      const previewData = filteredIds.length > 0
        ? await supabase.from('users').select('photos').in('id', filteredIds.slice(0, 6))
        : { data: [] };
      return res.json({
        premium_required: true,
        count,
        previews: (previewData.data || []).map(u => ({
          photo: (u.photos || [])[0] || null,   // single photo, no id
        })),
      });
    }

    // 5. Premium users: return full profiles
    if (!filteredIds.length) {
      return res.json({ count: 0, profiles: [], premium_required: false });
    }
    const { data: likers } = await supabase.from('users').select('*').in('id', filteredIds);
    res.json({
      count,
      profiles: (likers || []).map(cleanPublic).filter(Boolean),
      premium_required: false,
    });
  } catch(e) {
    console.error('Liked me error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── REPORT ──
app.post('/api/report', auth, async (req, res) => {
  try {
    const { targetId, reason } = req.body;
    if (!targetId || !reason) return res.status(400).json({ error: 'Required fields missing' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot report yourself' });

    // Dedup: one report per (reporter, target) pair
    const { data: dup } = await supabase.from('reports')
      .select('id').eq('from_user', req.user.id).eq('target_id', targetId).maybeSingle();
    if (dup) return res.status(400).json({ error: 'You have already reported this user' });

    await supabase.from('reports').insert({
      id: uuidv4(), from_user: req.user.id, target_id: targetId,
      reason: String(reason).slice(0, 500),   // cap length
      created_at: new Date().toISOString()
    });

    // Penalize trust score once (idempotent because of dedup above)
    const { data: target } = await supabase.from('users')
      .select('trust_score').eq('id', targetId).maybeSingle();
    if (target) {
      await supabase.from('users').update({
        trust_score: Math.max(0, (target.trust_score || 0) - 10)
      }).eq('id', targetId);
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Report error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DSA ILLEGAL CONTENT REPORT (Art. 16 — separate channel from social reports) ──
const DSA_CATEGORIES = ['CSAM','Terrorism','Hate Speech','Fraud','Non-Consensual Intimate Images','Violence','Other'];
app.post('/api/report/illegal-content', auth, dsaReportLimiter, async (req, res) => {
  try {
    const { targetId, category, description } = req.body;
    if (!targetId || !category || !DSA_CATEGORIES.includes(category))
      return res.status(400).json({ error: 'targetId and valid category required', categories: DSA_CATEGORIES });
    const cleanDesc = description ? String(description).slice(0, 2000) : '';
    await supabase.from('reports').insert({
      id: uuidv4(), from_user: req.user.id, target_id: targetId,
      reason: `[DSA:${category}] ${cleanDesc}`,
      type: 'illegal_content',
      created_at: new Date().toISOString(),
    });
    // Temporarily ban target pending review if category is CSAM or Terrorism
    if (category === 'CSAM' || category === 'Terrorism') {
      await supabase.from('users').update({ banned: true }).eq('id', targetId);
      await auditLog(req.user.id, 'dsa_auto_ban', targetId);
    }
    console.log(`[DSA] report from=${req.user.id} target=${targetId} category=${category}`);
    res.json({ ok: true, message: 'Report received. Our team will review within 24 hours.' });
  } catch(e) {
    console.error('DSA report error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── BLOCK ──
app.post('/api/block', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    if (!isValidId(targetId)) return res.status(400).json({ error: 'Invalid user id' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });

    const { data: existing } = await supabase.from('blocks')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (!existing) {
      await supabase.from('blocks').insert({
        from_user: req.user.id, to_user: targetId, created_at: new Date().toISOString()
      });
    }

    // Remove any existing connection so the blocked user can no longer message
    const { data: conn } = await supabase.from('connections')
      .select('id')
      .or(`and(user1.eq.${req.user.id},user2.eq.${targetId}),and(user1.eq.${targetId},user2.eq.${req.user.id})`)
      .maybeSingle();
    if (conn) {
      await supabase.from('messages').delete().eq('connection_id', conn.id);
      await supabase.from('connections').delete().eq('id', conn.id);
    }

    // Remove swipes in both directions so they can't re-match
    await supabase.from('swipes').delete()
      .or(`and(from_user.eq.${req.user.id},to_user.eq.${targetId}),and(from_user.eq.${targetId},to_user.eq.${req.user.id})`);

    res.json({ ok: true });
  } catch(e) {
    console.error('Block error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── WORKS ──
// BUG FIX 3: Added worksLimiter + per-user cap (20) + sanitize all fields + URL validation
const SAFE_URL_REGEX = /^https?:\/\/[^\s<>"']+$/i;
app.post('/api/works', worksLimiter, auth, upload.single('image'), async (req, res) => {
  try {
    let { title, description, url } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    // Sanitize and cap all text fields
    title       = sanitize(String(title)).slice(0, 120);
    description = sanitize(String(description || '')).slice(0, 500);

    // URL must be http/https — reject javascript: and data: schemes
    if (url && url.trim()) {
      url = url.trim();
      if (!SAFE_URL_REGEX.test(url)) return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
      url = url.slice(0, 300);
    } else {
      url = '';
    }

    // Per-user cap: max 20 works
    const { count: workCount } = await supabase.from('works')
      .select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
    if ((workCount || 0) >= 20) return res.status(400).json({ error: 'Maximum 20 works allowed' });

    const work = {
      id: uuidv4(), user_id: req.user.id, title, description, url,
      image: req.file ? getFileUrl(req.file) : '',
      created_at: new Date().toISOString()
    };
    const { data: inserted } = await supabase.from('works').insert(work).select().single();
    res.json(inserted || work);
  } catch(e) {
    console.error('Create work error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/works/:id', auth, async (req, res) => {
  try {
    const { data: work } = await supabase.from('works')
      .select('id').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (!work) return res.status(404).json({ error: 'Not found' });
    await supabase.from('works').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Delete work error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CONVERSATION STARTERS ──
app.get('/api/conversation-starters/:connId', auth, async (req, res) => {
  try {
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });

    const otherId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
    const [{ data: me }, { data: other }] = await Promise.all([
      supabase.from('users').select('*').eq('id', req.user.id).maybeSingle(),
      supabase.from('users').select('*').eq('id', otherId).maybeSingle(),
    ]);
    if (!me || !other) return res.status(404).json({ error: 'Not found' });

    const prompts = [];
    const sharedInterests = (me.interests || []).filter(i =>
      (other.interests || []).map(x => x.toLowerCase()).includes(i.toLowerCase())
    );
    if (sharedInterests.length >= 1) prompts.push(`What got you into ${sharedInterests[0]}?`);
    if (sharedInterests.length >= 2)
      prompts.push(`Are you more focused on ${sharedInterests[0]} or ${sharedInterests[1]} these days?`);

    const intentPrompts = {
      'collaborate':         `What kind of projects are you looking to collaborate on right now?`,
      'learn-mentorship':    `What's the skill you're most focused on developing this year?`,
      'exchange-ideas':      `What idea have you been sitting on lately that you haven't had a chance to share?`,
      'explore-network':     `What kind of connections have been most valuable to you so far?`,
      'build-relationships': `What does a meaningful professional relationship look like to you?`,
    };
    if (other.intent && intentPrompts[other.intent]) prompts.push(intentPrompts[other.intent]);
    if (other.working_on && other.working_on.trim())
      prompts.push(`I saw you're working on "${other.working_on.trim().slice(0,60)}" — what's the biggest challenge right now?`);
    if (other.currently_exploring && other.currently_exploring.trim())
      prompts.push(`What sparked your interest in ${other.currently_exploring.trim().slice(0,50)}?`);

    const fallbacks = [
      "What's one thing you've learned recently that surprised you?",
      "What problem are you most excited to be working on?",
      "What does your ideal collaboration look like?",
      "What's the best conversation you've had in the last month?",
    ];
    let fi = 0;
    while (prompts.length < 3 && fi < fallbacks.length) prompts.push(fallbacks[fi++]);

    res.json({ prompts: prompts.slice(0, 5) });
  } catch(e) {
    console.error('Conversation starters error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FIXED: ADMIN ROUTES ──
app.use('/api/admin', adminLimiter);
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { data: allUsers } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(1000);
    res.json((allUsers || []).map(u => {
      const u2 = clean(u);
      u2.trust_steps = trustSteps(u);
      return u2;
    }));
  } catch(e) {
    console.error('Admin users error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { targetId, banned } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('id', targetId).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    await supabase.from('users').update({ banned: !!banned }).eq('id', targetId);
    await auditLog(req.user.id, banned ? 'ban' : 'unban', targetId);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin ban error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/verify', adminAuth, async (req, res) => {
  try {
    const { targetId } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', targetId).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    const verification = { status: 'verified', confidence: 100, verified_at: new Date().toISOString() };
    const merged = { ...user, verification };
    await supabase.from('users').update({
      verification, trust_score: calcTrust(merged)
    }).eq('id', targetId);
    await auditLog(req.user.id, 'verify', targetId);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin verify error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/upgrade', adminAuth, async (req, res) => {
  try {
    const { targetId, premium } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('id', targetId).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    await supabase.from('users').update({ premium: !!premium }).eq('id', targetId);
    await auditLog(req.user.id, premium ? 'grant_premium' : 'revoke_premium', targetId);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin upgrade error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FIXED: Full cascade delete including swipes, priority_msgs, and works
app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { data: user } = await supabase.from('users').select('id, role').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete another admin' });
    // Cascade: remove the target's own records. Connections and the other
    // party's messages are left intact (see anonymizeUser).
    await supabase.from('messages').delete().eq('sender_id', id);
    await supabase.from('swipes').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('priority_msgs').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('reports').delete().or(`from_user.eq.${id},target_id.eq.${id}`);
    await supabase.from('blocks').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('works').delete().eq('user_id', id);
    await supabase.from('user_education').delete().eq('user_id', id);
    await supabase.from('user_work').delete().eq('user_id', id);
    await supabase.from('user_intents').delete().eq('user_id', id);
    await supabase.from('user_acquisition').delete().eq('user_id', id);
    await supabase.from('push_subscriptions').delete().eq('user_id', id);
    await supabase.from('payments').delete().eq('user_id', id);
    const { error: adminDelErr } = await supabase.from('users').update(anonymizeUser(id)).eq('id', id);
    if (adminDelErr) { console.error('Admin delete error:', adminDelErr); return res.status(500).json({ error: 'Failed to delete user' }); }
    await auditLog(req.user.id, 'delete_user', id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin delete error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FIXED: Efficient analytics using DB count queries instead of loading all rows
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const now         = Date.now();
    const oneDayAgo   = new Date(now - 24 * 3600 * 1000).toISOString();
    const oneWeekAgo  = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: completedCount },
      { count: dau },
      { count: wau },
      { count: premiumCount },
      { count: verifiedCount }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_profile_complete', true),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active', oneDayAgo),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active', oneWeekAgo),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('premium', true),
      supabase.from('users').select('*', { count: 'exact', head: true }).contains('verification', { status: 'verified' }),
    ]);

    const { data: allConns } = await supabase.from('connections').select('id, active');
    const totalConns = (allConns || []).length;

    // For distinct connections with messages, query with a reasonable limit
    const { data: msgConnIds } = await supabase.from('messages')
      .select('connection_id')
      .limit(100000);
    const connsWithMsg = new Set((msgConnIds || []).map(m => m.connection_id)).size;

    const { count: msgCount }    = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: reportCount } = await supabase.from('reports').select('*', { count: 'exact', head: true });
    const { count: blockCount }  = await supabase.from('blocks').select('*', { count: 'exact', head: true });

    res.json({
      users:                    totalUsers || 0,
      dau: dau || 0,
      wau: wau || 0,
      premium:                  premiumCount || 0,
      verified:                 verifiedCount || 0,
      profile_completion_rate:  totalUsers ? Math.round((completedCount || 0) / totalUsers * 100) + '%' : '0%',
      connections:              totalConns,
      active_connections:       (allConns || []).filter(c => c.active).length,
      match_to_conversation_rate: totalConns ? Math.round(connsWithMsg / totalConns * 100) + '%' : '0%',
      messages:  msgCount    || 0,
      reports:   reportCount || 0,
      blocks:    blockCount  || 0,
    });
  } catch(e) {
    console.error('Admin analytics error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function normalizeSource(src) {
  const map = {
    'LinkedIn':        'linkedin',
    'Instagram':       'instagram',
    'Twitter/X':       'twitter',
    'WhatsApp':        'whatsapp',
    'Friend/Referral': 'referral',
    'Google Search':   'google',
    'Community/Event': 'community',
    'YouTube':         'youtube',
    'Other':           'unknown',
  };
  return src ? (map[src] || 'unknown') : 'unknown';
}

// ── DSA TRANSPARENCY REPORT (Art. 15) ──
app.get('/api/admin/dsa-report', adminAuth, async (req, res) => {
  try {
    const { data: illegal } = await supabase.from('reports')
      .select('reason,created_at,target_id').eq('type', 'illegal_content').order('created_at', { ascending: false });
    const { data: social } = await supabase.from('reports')
      .select('reason,created_at').not('type', 'eq', 'illegal_content').order('created_at', { ascending: false });
    const { count: bannedCount } = await supabase.from('users')
      .select('*', { count: 'exact', head: true }).eq('banned', true);

    const categoryCounts = {};
    (illegal || []).forEach(r => {
      const match = r.reason.match(/^\[DSA:([^\]]+)\]/);
      const cat = match ? match[1] : 'Unknown';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    res.json({
      generated_at: new Date().toISOString(),
      illegal_content_reports: (illegal || []).length,
      illegal_content_by_category: categoryCounts,
      social_reports: (social || []).length,
      total_banned_users: bannedCount || 0,
      report_log: (illegal || []).map(r => ({
        created_at: r.created_at,
        reason: r.reason,
        target_id: r.target_id,
      })),
    });
  } catch(e) {
    console.error('DSA report error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/onboarding/funnel', adminAuth, async (req, res) => {
  try {
    const now    = Date.now();
    const ago24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const ago7d  = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();

    const STAGES     = ['acquisition', 'intent', 'profile', 'complete'];
    const PRE_STAGES = ['acquisition', 'intent', 'profile'];

    const [
      stageCounts,
      { count: photosCount },
      stuck24h,
      stuck7d,
      { count: gateFail },
      { data: completedSample },
      { data: allAcq },
      { data: completedIds },
    ] = await Promise.all([
      // Users at each onboarding stage
      Promise.all(STAGES.map(s =>
        supabase.from('users').select('*', { count: 'exact', head: true })
          .eq('email_verified', true).eq('onboarding_stage', s)
      )),
      // Users who uploaded at least one photo (verified, any stage)
      supabase.from('users').select('*', { count: 'exact', head: true })
        .eq('email_verified', true)
        .not('photos', 'is', null)
        .filter('photos', 'neq', '[]'),
      // Stuck >24h at pre-complete stages
      Promise.all(PRE_STAGES.map(s =>
        supabase.from('users').select('*', { count: 'exact', head: true })
          .eq('email_verified', true).eq('onboarding_stage', s).lt('created_at', ago24h)
      )),
      // Stuck >7d (almost certainly abandoned)
      Promise.all(PRE_STAGES.map(s =>
        supabase.from('users').select('*', { count: 'exact', head: true })
          .eq('email_verified', true).eq('onboarding_stage', s).lt('created_at', ago7d)
      )),
      // Completed onboarding but blocked by profile_score < 70
      supabase.from('users').select('*', { count: 'exact', head: true })
        .eq('onboarding_stage', 'complete').eq('is_profile_complete', false),
      // Sample of completed users with timestamps for avg time calculation
      supabase.from('users')
        .select('onboarding_completed_at, created_at')
        .eq('is_profile_complete', true)
        .not('onboarding_completed_at', 'is', null)
        .limit(500),
      // Acquisition source for all users
      supabase.from('user_acquisition').select('user_id, source'),
      // IDs of profile-complete users for source attribution
      supabase.from('users').select('id').eq('is_profile_complete', true),
    ]);

    const byStage = {};
    STAGES.forEach((s, i) => { byStage[s] = stageCounts[i].count || 0; });

    const stuckDay  = {};
    const stuckWeek = {};
    PRE_STAGES.forEach((s, i) => {
      stuckDay[s]  = stuck24h[i].count || 0;
      stuckWeek[s] = stuck7d[i].count  || 0;
    });

    const totalVerified = STAGES.reduce((n, s) => n + byStage[s], 0);
    const completed     = byStage.complete || 0;

    // Cumulative "reached" counts for 5-stage funnel display
    const reached = {
      acquisition: totalVerified,
      intent:      byStage.intent  + byStage.profile + byStage.complete,
      profile:     byStage.profile + byStage.complete,
      photos:      photosCount || 0,
      complete:    completed,
    };

    // Avg completion time from onboarding_completed_at (requires migration 001)
    let avg_completion_seconds = null;
    if (completedSample && completedSample.length > 0) {
      const totalMs = completedSample.reduce((sum, u) => {
        const ms = new Date(u.onboarding_completed_at) - new Date(u.created_at);
        return sum + (ms > 0 ? ms : 0);
      }, 0);
      avg_completion_seconds = Math.round(totalMs / completedSample.length / 1000);
    }

    // Source attribution breakdown
    const source_breakdown = {};
    if (allAcq && completedIds) {
      const completedSet = new Set(completedIds.map(u => u.id));
      for (const row of allAcq) {
        const key = normalizeSource(row.source);
        if (!source_breakdown[key]) source_breakdown[key] = { total: 0, completed: 0, rate: 0 };
        source_breakdown[key].total++;
        if (completedSet.has(row.user_id)) source_breakdown[key].completed++;
      }
      for (const v of Object.values(source_breakdown)) {
        v.rate = v.total ? Math.round(v.completed / v.total * 100) : 0;
      }
    }

    // Best converting source (min 3 entries to be statistically meaningful)
    const best_source = Object.entries(source_breakdown)
      .filter(([, v]) => v.total >= 3)
      .sort((a, b) => b[1].rate - a[1].rate)[0]?.[0] || null;

    res.json({
      reached,
      by_stage:               byStage,
      stuck_over_24h:         stuckDay,
      stuck_over_7d:          stuckWeek,
      gate_failures:          gateFail || 0,
      total_verified:         totalVerified,
      funnel_completion_rate: totalVerified
        ? Math.round(completed / totalVerified * 100) + '%'
        : '0%',
      avg_completion_seconds,
      source_breakdown,
      best_source,
    });
  } catch(e) {
    console.error('Onboarding funnel error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/audit', adminAuth, async (req, res) => {
  // Return in-memory buffer (fast) + optionally fetch from DB for full history
  res.json(adminAuditLog.slice(-200).reverse());
});

// ── PHASE 10 — SEO Analytics Dashboard ────────────────────────────────────────
app.get('/api/admin/seo', adminAuth, (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
  const pages = SEO_PAGES.map(p => {
    const views   = seoPageViews.get(p.slug) || 0;
    const signups = seoSignups.get(p.slug)   || 0;
    return {
      url:      BASE + (p.slug ? '/' + p.slug : '/'),
      slug:     p.slug || '',
      label:    p.label,
      schema:   p.schema,
      priority: p.priority,
      views,
      signups,
      cvr: views > 0 ? Math.round(signups / views * 100) + '%' : '—',
    };
  }).sort((a, b) => b.views - a.views);

  const totalViews   = pages.reduce((s, p) => s + p.views,   0);
  const totalSignups = pages.reduce((s, p) => s + p.signups, 0);

  // ── City breakdown: aggregate views/signups across all pages for each city ──
  const cityData = {};
  const citySlugs = Object.keys(CITIES);
  citySlugs.forEach(cs => {
    const cityPages = pages.filter(p => p.slug.endsWith('-' + cs) || p.slug === 'networking-in-' + cs);
    const views = cityPages.reduce((s, p) => s + p.views, 0);
    const signups = cityPages.reduce((s, p) => s + p.signups, 0);
    cityData[cs] = { city: CITIES[cs].name, pages: cityPages.length, views, signups, cvr: views > 0 ? Math.round(signups / views * 100) + '%' : '—' };
  });
  const top_cities = Object.values(cityData).sort((a, b) => b.views - a.views).slice(0, 6);

  // ── Intent pattern breakdown ──
  const intentPatterns = ['networking-in-', 'founders-in-', 'startup-founders-', 'find-cofounders-', 'startup-networking-'];
  const top_intents = intentPatterns.map(pat => {
    const pp = pages.filter(p => p.slug.startsWith(pat));
    const v = pp.reduce((s, p) => s + p.views, 0);
    const sg = pp.reduce((s, p) => s + p.signups, 0);
    return { pattern: '/' + pat + ':city', page_count: pp.length, views: v, signups: sg, cvr: v > 0 ? Math.round(sg / v * 100) + '%' : '—' };
  }).sort((a, b) => b.views - a.views);

  // ── Blog performance ──
  const blogPages   = pages.filter(p => p.slug.startsWith('blog/'));
  const blogIndex   = pages.find(p => p.slug === 'blog');
  const top_blog    = blogPages.slice(0, 10);
  const blogViews   = blogPages.reduce((s, p) => s + p.views, 0) + (blogIndex?.views || 0);
  const blogSignups = blogPages.reduce((s, p) => s + p.signups, 0) + (blogIndex?.signups || 0);

  // ── Schema coverage count ──
  const schema_coverage = {};
  SEO_PAGES.forEach(p => {
    (p.schema || '').split('+').forEach(s => { schema_coverage[s] = (schema_coverage[s] || 0) + 1; });
  });

  // ── Segment summary ──
  const staticLandingPages = pages.filter(p => !p.slug.includes('/') && !p.slug.includes('-in-') && !p.slug.startsWith('networking-in-') && !p.slug.startsWith('founders-in-') && !p.slug.startsWith('startup-founders-') && !p.slug.startsWith('find-cofounders-') && !p.slug.startsWith('startup-networking-'));

  res.json({
    as_of:         new Date().toISOString(),
    note:          'View/signup counts reset on each deploy. Pair with Google Search Console for persistent data.',
    // Totals
    total_pages:   SEO_PAGES.length,
    total_views:   totalViews,
    total_signups: totalSignups,
    overall_cvr:   totalViews > 0 ? Math.round(totalSignups / totalViews * 100) + '%' : '—',
    // Infrastructure
    indexnow:      INDEXNOW_KEY ? 'configured ✓' : 'not configured',
    gsc:           process.env.GSC_VERIFICATION ? 'configured ✓' : 'not configured',
    bing:          process.env.BING_VERIFICATION ? 'configured ✓' : 'not configured',
    // Page segment counts
    segments: {
      static_landing_pages: staticLandingPages.length,
      city_pages:           Object.keys(CITIES).length,
      intent_pages:         6 * Object.keys(CITIES).length,
      category_pages:       CATEGORY_SLUGS.length * Object.keys(CITIES).length,
      blog_pages:           blogPages.length,
      blog_views:           blogViews,
      blog_signups:         blogSignups,
    },
    // Breakdowns
    top_10_pages:  pages.slice(0, 10),
    top_cities,
    top_intents,
    top_blog,
    schema_coverage,
    // Full sorted list
    pages,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI OPERATING SYSTEM — Admin Agent Routes
// ═══════════════════════════════════════════════════════════════════════════════

function requireAgents(res) {
  if (!agentOrchestrator) {
    res.status(503).json({ error: 'Agent system initializing. Retry in a few seconds.' });
    return false;
  }
  return true;
}

// List available agents, scheduler status, and workflow templates
app.get('/api/admin/agents', adminAuth, (req, res) => {
  if (!agentOrchestrator) return res.status(503).json({ error: 'Agent system initializing.' });
  const agents = Object.entries(agentOrchestrator.agents).map(([name, ag]) => ({
    name,
    prompt_preview: ag.systemPrompt.slice(0, 200),
    claude_ready: !!ag.client,
  }));
  res.json({
    agents,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    scheduler: agentScheduler ? agentScheduler.status() : null,
    workflow_templates: workflowEngine
      ? ['seo_audit', 'content_review', 'security_review', 'founder_acquisition', 'product_review']
      : [],
  });
});

// Create a queued task
app.post('/api/admin/agents/task', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    const { type, agent, payload, priority } = req.body;
    if (!type || !agent) return res.status(400).json({ error: 'type and agent required' });
    const task = await agentOrchestrator.createTask({
      type: String(type).trim(),
      agent: String(agent).trim(),
      payload: payload || {},
      priority: Number(priority) || 5,
      createdBy: req.user.id,
    });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Execute a pending/failed task now (sync — times out at 60s max via client)
app.post('/api/admin/agents/task/:id/execute', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    const result = await agentOrchestrator.executeTask(req.params.id);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry a failed task
app.post('/api/admin/agents/task/:id/retry', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    await agentOrchestrator.retryTask(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List tasks with optional filters
app.get('/api/admin/agents/tasks', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    const { status, agent, limit } = req.query;
    const tasks = await agentOrchestrator.listTasks({
      status: status || undefined,
      agent: agent || undefined,
      limit: Math.min(Number(limit) || 50, 200),
    });
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single task with full result and logs
app.get('/api/admin/agents/task/:id', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    const task = await agentOrchestrator.getTask(req.params.id);
    res.json(task);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Run agent directly (no task record created — for quick queries)
app.post('/api/admin/agents/run', adminAuth, async (req, res) => {
  if (!requireAgents(res)) return;
  try {
    const { agent, message, context } = req.body;
    if (!agent || !message) return res.status(400).json({ error: 'agent and message required' });
    const result = await agentOrchestrator.runDirect(
      String(agent).trim(),
      String(message),
      context || {}
    );
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List agent memory entries
app.get('/api/admin/agents/memory', adminAuth, async (req, res) => {
  if (!agentMemory) return res.status(503).json({ error: 'Agent memory initializing.' });
  try {
    const { agent, category, limit } = req.query;
    const entries = await agentMemory.list({
      agent: agent || undefined,
      category: category || undefined,
      limit: Math.min(Number(limit) || 100, 500),
    });
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a memory entry
app.delete('/api/admin/agents/memory/:id', adminAuth, async (req, res) => {
  if (!agentMemory) return res.status(503).json({ error: 'Agent memory initializing.' });
  try {
    await agentMemory.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── WORKFLOW ROUTES ──

function requireWorkflows(res) {
  if (!workflowEngine) { res.status(503).json({ error: 'Workflow engine initializing.' }); return false; }
  return true;
}

// List workflows
app.get('/api/admin/agents/workflows', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try {
    const { status, limit } = req.query;
    const workflows = await workflowEngine.list({ status: status || undefined, limit: Math.min(Number(limit) || 50, 200) });
    res.json({ workflows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Create and start a workflow from a template
app.post('/api/admin/agents/workflow', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try {
    const { template, context } = req.body;
    if (!template) return res.status(400).json({ error: 'template required' });
    const wf = await workflowEngine.create({ template, context: context || {}, createdBy: req.user.id });
    res.json({ ok: true, workflow: wf });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Get single workflow details
app.get('/api/admin/agents/workflow/:id', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try {
    const wf = await workflowEngine.get(req.params.id);
    res.json(wf);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// Advance one step
app.post('/api/admin/agents/workflow/:id/advance', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try {
    const wf = await workflowEngine.advance(req.params.id);
    res.json({ ok: true, workflow: wf });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Run all remaining steps (sync — may take 30-90s for multi-step workflows)
app.post('/api/admin/agents/workflow/:id/run-all', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try {
    const wf = await workflowEngine.runAll(req.params.id);
    res.json({ ok: true, workflow: wf });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Pause a running workflow
app.post('/api/admin/agents/workflow/:id/pause', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try { await workflowEngine.pause(req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Resume a paused workflow
app.post('/api/admin/agents/workflow/:id/resume', adminAuth, async (req, res) => {
  if (!requireWorkflows(res)) return;
  try { await workflowEngine.resume(req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Scheduler live status
app.get('/api/admin/agents/scheduler', adminAuth, (req, res) => {
  res.json(agentScheduler ? agentScheduler.status() : { active: false, reason: 'not initialized' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LANGGRAPH ORCHESTRATOR BRIDGE — proxies to services/ai-orchestrator (Python)
// Falls back gracefully if the LangGraph service is not running.
// ═══════════════════════════════════════════════════════════════════════════════

const LANGGRAPH_URL    = process.env.LANGGRAPH_URL    || 'http://localhost:8000';
const ORCH_SECRET      = process.env.ORCHESTRATOR_SECRET || '';
const LANGGRAPH_ENABLED = !!process.env.LANGGRAPH_URL;

async function lgFetch(path, opts = {}, { retries = 2, timeoutMs = 90_000 } = {}) {
  const { default: nodeFetch } = await import('node-fetch').catch(() => ({ default: null }));
  const fetchFn = nodeFetch || globalThis.fetch;
  if (!fetchFn) throw new Error('No fetch available');
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchFn(LANGGRAPH_URL + path, {
        ...opts,
        headers: {
          'Content-Type':          'application/json',
          'x-orchestrator-secret': ORCH_SECRET,
          ...(opts.headers || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.detail || `Orchestrator ${r.status}`);
      return body;
    } catch (err) {
      lastErr = err;
      // Don't retry on auth or bad-request errors
      if (err.message?.includes('401') || err.message?.includes('400')) throw err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// LangGraph service status
app.get('/api/admin/langgraph/status', adminAuth, async (req, res) => {
  if (!LANGGRAPH_ENABLED) return res.json({ enabled: false, message: 'Set LANGGRAPH_URL to enable' });
  try {
    const data = await lgFetch('/health');
    res.json({ enabled: true, ...data });
  } catch (e) {
    res.json({ enabled: true, reachable: false, error: e.message });
  }
});

// Graph topology
app.get('/api/admin/langgraph/topology', adminAuth, async (req, res) => {
  try { res.json(await lgFetch('/graph/topology')); }
  catch (e) { res.status(503).json({ error: 'Service unavailable' }); }
});

// Run workflow (sync)
app.post('/api/admin/langgraph/run', adminAuth, async (req, res) => {
  try {
    const { task_type, payload } = req.body;
    if (!task_type) return res.status(400).json({ error: 'task_type required' });
    const data = await lgFetch('/run', {
      method: 'POST',
      body: JSON.stringify({ task_type, payload: payload || {} }),
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// Queue async workflow
app.post('/api/admin/langgraph/run/async', adminAuth, async (req, res) => {
  try {
    const { task_type, payload } = req.body;
    if (!task_type) return res.status(400).json({ error: 'task_type required' });
    const data = await lgFetch('/run/async', {
      method: 'POST',
      body: JSON.stringify({ task_type, payload: payload || {} }),
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// List executions
app.get('/api/admin/langgraph/executions', adminAuth, async (req, res) => {
  try {
    const qs = new URLSearchParams({ limit: req.query.limit || 50, ...(req.query.status ? { status: req.query.status } : {}) });
    res.json(await lgFetch(`/executions?${qs}`));
  } catch (e) { res.status(503).json({ error: 'Service unavailable' }); }
});

// Get single execution + traces
app.get('/api/admin/langgraph/execution/:id', adminAuth, async (req, res) => {
  try { res.json(await lgFetch(`/execution/${req.params.id}`)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

// ── ADMIN BOOTSTRAP ──
// BUG FIX 2: bootstrapLimiter (10/hr) prevents brute-forcing ADMIN_SECRET
app.post('/api/admin/bootstrap', bootstrapLimiter, async (req, res) => {
  try {
    let { email, secret } = req.body;
    if (!timingSafeStringEqual(secret, ADMIN_SECRET)) return res.status(403).json({ error: 'Invalid secret' });
    if (!email) return res.status(400).json({ error: 'Email required' });
    email = String(email).trim().toLowerCase();
    const { data: user } = await supabase.from('users')
      .select('id').eq('email', email).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    await supabase.from('users').update({ role: 'admin' }).eq('id', user.id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin bootstrap error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS — Razorpay
// ═══════════════════════════════════════════════════════════════════════════════

// Plan definitions — amounts in smallest currency unit (paise for INR, cents for USD)
const PLANS = {
  monthly: {
    INR: { amount: 24900, label: '₹249/month', base: 249, gst: 0, currency: 'INR' },
    USD: { amount: 1900,  label: '$19/month',  base: 19,  gst: 0, currency: 'USD' },
    days: 30,
  },
  quarterly: {
    INR: { amount: 59900, label: '₹599/quarter', base: 599, gst: 0, currency: 'INR' },
    USD: { amount: 3900,  label: '$39/quarter',  base: 39,  gst: 0, currency: 'USD' },
    days: 90,
  },
};

// ── PAYMENT SESSION — issues a short-lived scoped token so the full JWT never touches a URL ──
// Mobile app calls this, gets payment_token (15 min), opens upgrade?s=payment_token
app.post('/api/payments/session', auth, (req, res) => {
  const paymentToken = jwt.sign(
    { id: req.user.id, scope: 'payment' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ payment_token: paymentToken });
});

// ── GET PAYMENT CONFIG (public — used by upgrade page before auth) ──
app.get('/api/payments/config', (req, res) => {
  res.json({
    key_id:  process.env.RAZORPAY_KEY_ID || '',
    enabled: !!razorpay,
    plans: {
      monthly:   { INR: PLANS.monthly.INR,   USD: PLANS.monthly.USD   },
      quarterly: { INR: PLANS.quarterly.INR, USD: PLANS.quarterly.USD },
    },
  });
});

// ── CREATE ORDER ──
app.post('/api/payments/create-order', auth, async (req, res) => {
  try {
    if (!razorpay) return res.status(503).json({ error: 'Payments not configured on this server' });
    // Must be called with a payment-scoped token (not the full auth JWT)
    if (req.user.scope !== 'payment') return res.status(403).json({ error: 'Use a payment session token — call POST /api/payments/session first' });

    const { plan, currency } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose monthly or quarterly' });
    const cur = (currency === 'USD') ? 'USD' : 'INR';
    const planDetails = PLANS[plan][cur];

    // Prevent duplicate orders: cancel any 'created' (unpaid) order for this user+plan
    const { data: existingOrder } = await supabase.from('payments')
      .select('id').eq('user_id', req.user.id).eq('plan', plan).eq('status', 'created')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()) // within 15 min
      .maybeSingle();
    if (existingOrder) return res.status(409).json({ error: 'A pending order already exists. Please complete or wait 15 minutes before creating a new one.', order_id: existingOrder.id });

    const receipt = `byn_${req.user.id}_${Date.now()}`.slice(0, 40);
    const order = await razorpay.orders.create({
      amount:   planDetails.amount,
      currency: cur,
      receipt,
      notes:    { userId: req.user.id, plan, currency: cur },
    });

    // Record pending payment in DB
    await supabase.from('payments').insert({
      id:                order.id,
      user_id:           req.user.id,
      razorpay_order_id: order.id,
      plan,
      currency:          cur,
      amount:            planDetails.amount,
      status:            'created',
      created_at:        new Date().toISOString(),
    });

    res.json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      plan,
      label:    planDetails.label,
    });
  } catch(e) {
    console.error('Create order error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── VERIFY PAYMENT + ACTIVATE PREMIUM ──
app.post('/api/payments/verify', auth, async (req, res) => {
  try {
    if (!razorpay) return res.status(503).json({ error: 'Payments not configured' });
    if (req.user.scope !== 'payment') return res.status(403).json({ error: 'Use a payment session token' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ error: 'Missing payment fields' });

    // Verify HMAC-SHA256 signature — this is the only trustworthy confirmation
    const body     = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ error: 'Invalid payment signature — possible tampering' });

    // SECURITY: Order-ownership check — a valid signature only proves the
    // {order_id, payment_id} pair was really paid, not that the caller is who
    // paid. Without this, anyone who captures another user's client-side
    // Razorpay callback (order_id/payment_id/signature are all visible in the
    // browser) could race their own /verify call in first and get premium
    // activated on their own account for someone else's payment.
    const { data: orderRec } = await supabase.from('payments')
      .select('user_id').eq('id', razorpay_order_id).maybeSingle();
    if (!orderRec) return res.status(404).json({ error: 'Order not found' });
    if (orderRec.user_id !== req.user.id)
      return res.status(403).json({ error: 'This order does not belong to you' });

    // BUG FIX 1: Replay-attack guard — reject any payment_id already consumed by a DIFFERENT user.
    // Without this, anyone holding a valid {order_id, payment_id, signature} tuple can
    // replay it on a different account and get free premium.
    // IMPORTANT: If the SAME user's payment was already recorded (e.g. webhook fired before
    // the client verify call), treat it as success — don't punish the legitimate buyer.
    const { data: existingPayment } = await supabase.from('payments')
      .select('id, user_id')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();
    if (existingPayment) {
      if (existingPayment.user_id === req.user.id) {
        // Same user — already activated (webhook was faster). Return success so the
        // client transitions to the premium success screen correctly.
        const { data: me } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
        return res.json({ ok: true, user: me ? clean(me) : null, alreadyActivated: true });
      }
      // Different user attempting to redeem someone else's payment — block it.
      return res.status(409).json({ error: 'Payment already redeemed — replay attack detected' });
    }

    // Look up plan to calculate expiry
    const planDef = PLANS[plan] || PLANS.monthly;
    const expiresAt = new Date(Date.now() + planDef.days * 24 * 3600 * 1000).toISOString();

    // Activate premium
    await supabase.from('users').update({
      premium:             true,
      premium_plan:        plan,
      premium_since:       new Date().toISOString(),
      premium_expires_at:  expiresAt,
    }).eq('id', req.user.id);

    // Update payment record
    await supabase.from('payments').update({
      razorpay_payment_id,
      status: 'paid',
    }).eq('razorpay_order_id', razorpay_order_id);

    // Send confirmation email (non-blocking)
    const { data: u } = await supabase.from('users')
      .select('email, name').eq('id', req.user.id).maybeSingle();
    if (u && ResendClient) {
      const planLabel = plan === 'quarterly' ? 'Quarterly' : 'Monthly';
      ResendClient.emails.send({
        from: process.env.RESEND_FROM || 'Build Your Network <onboarding@resend.dev>',
        to:   u.email,
        subject: '🎉 Welcome to BYN Premium!',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px">
            <h2 style="color:#0F766E">You're Premium! 🎉</h2>
            <p>Hi ${u.name},</p>
            <p>Your <strong>BYN ${planLabel} Premium</strong> is now active. Here's what you unlocked:</p>
            <ul style="color:#374151;line-height:2">
              <li>✅ 200 swipes/day (was 30)</li>
              <li>✅ See everyone who liked you</li>
              <li>✅ 20 priority messages/month</li>
              <li>✅ Priority badge on your profile</li>
            </ul>
            <p>Active until: <strong>${new Date(expiresAt).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</strong></p>
            <p style="color:#6B7280;font-size:13px">Build Your Network · buildyournetwork.online</p>
          </div>`,
      }).catch(() => {});
    }

    res.json({ ok: true, premium: true, expires_at: expiresAt });
  } catch(e) {
    console.error('Verify payment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── RAZORPAY WEBHOOK (server-to-server, Razorpay signs the body) ──
// Set webhook URL in Razorpay dashboard: https://buildyournetwork.online/api/payments/webhook
// Events to subscribe: payment.captured
app.post('/api/payments/webhook', async (req, res) => {
  try {
    // BUG FIX 10: Webhook secret must be its own env var — never fall back to key_secret
    // (they are different values; Razorpay signs webhooks with a separate secret)
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    const sig  = req.headers['x-razorpay-signature'];
    const body = req.rawBody; // raw Buffer captured by express.json verify callback
    const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

    if (!timingSafeStringEqual(sig, expected)) return res.status(400).json({ error: 'Invalid webhook signature' });

    const event = JSON.parse(body.toString());
    if (event.event === 'payment.captured') {
      const payment  = event.payload.payment.entity;
      const orderId  = payment.order_id;
      const payId    = payment.id;

      // Find the pending payment record
      const { data: payRec } = await supabase.from('payments')
        .select('*').eq('razorpay_order_id', orderId).maybeSingle();
      if (payRec && payRec.status !== 'paid') {
        const planDef  = PLANS[payRec.plan] || PLANS.monthly;
        const expiresAt = new Date(Date.now() + planDef.days * 24 * 3600 * 1000).toISOString();
        await supabase.from('users').update({
          premium:            true,
          premium_plan:       payRec.plan,
          premium_since:      new Date().toISOString(),
          premium_expires_at: expiresAt,
        }).eq('id', payRec.user_id);
        await supabase.from('payments').update({ razorpay_payment_id: payId, status: 'paid' })
          .eq('razorpay_order_id', orderId);
      }
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Webhook error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── RESEND WEBHOOK (proactive suppression tracking) ──
// Optional, additive hardening beyond the reactive suppression check in
// sendOtpEmail(): a bounce/complaint can happen on an address we haven't
// tried again yet (e.g. it just went bad at the provider's end), so this
// lets Resend tell us before our own next attempt instead of only finding
// out reactively. Not required for the core fix — issueAndSendOtp() already
// stops retrying an address the moment WE get a suppression-shaped rejection
// from our own send call, with or without this endpoint configured.
//
// To activate: in the Resend dashboard, add a webhook pointing at
// https://buildyournetwork.online/api/webhooks/resend, subscribed to
// email.bounced and email.complained, then set RESEND_WEBHOOK_SECRET to the
// "whsec_..." signing secret it gives you. Until that env var is set this
// route safely no-ops (503, does not crash, does not affect email sending).
// Resend signs webhooks using the Svix format: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{raw body}", secret is base64 after "whsec_",
// signature header holds one or more space-separated "v1,<base64>" values.
app.post('/api/webhooks/resend', async (req, res) => {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    const svixId        = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature  = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature || !req.rawBody) {
      return res.status(400).json({ error: 'Missing webhook signature headers' });
    }

    const secretKey = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
    const signedContent = `${svixId}.${svixTimestamp}.${req.rawBody.toString()}`;
    const expected = crypto.createHmac('sha256', secretKey).update(signedContent).digest('base64');

    const providedSigs = String(svixSignature).split(' ').map(s => s.split(',')[1]).filter(Boolean);
    const valid = providedSigs.some(sig => {
      try { return timingSafeStringEqual(sig, expected); } catch { return false; }
    });
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature' });

    const event = JSON.parse(req.rawBody.toString());
    if (event.type === 'email.bounced' || event.type === 'email.complained') {
      const recipients = [].concat(event.data?.to || []).filter(Boolean);
      for (const rawEmail of recipients) {
        const email = String(rawEmail).trim().toLowerCase();
        await supabase.from('users').update({
          email_suppressed: true,
          email_suppressed_reason: event.type === 'email.bounced' ? 'bounced' : 'complained',
          email_suppressed_at: new Date().toISOString(),
        }).eq('email', email);
        console.log(`[ResendWebhook] Marked suppressed: ${maskEmail(email)} (${event.type})`);
      }
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Resend webhook error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════

const onboardingLimiter = rateLimit({ windowMs: 60*1000, max: 20, message: { error: 'Slow down' } });

const ACQUISITION_SOURCES = [
  'LinkedIn','Instagram','Twitter/X','WhatsApp','Friend/Referral',
  'Google Search','Community/Event','YouTube','Other',
];
const VALID_INTENTS = [
  'Networking','Find Opportunities','Build Startup Connections','Find Co-founder',
  'Hiring','Find Clients','Mentorship','Learn from People','Community','Investment Opportunities',
];
// Maps display-intent to legacy intent key used by the match engine
const INTENT_LEGACY_MAP = {
  'Networking':                'explore-network',
  'Find Opportunities':        'explore-network',
  'Build Startup Connections': 'build-relationships',
  'Find Co-founder':           'collaborate',
  'Hiring':                    'build-relationships',
  'Find Clients':              'build-relationships',
  'Mentorship':                'learn-mentorship',
  'Learn from People':         'learn-mentorship',
  'Community':                 'build-relationships',
  'Investment Opportunities':  'explore-network',
};
const VALID_EXP_LEVELS    = ['Beginner','Intermediate','Advanced','Expert'];
const VALID_EMP_TYPES     = ['Full-time','Part-time','Freelancer','Founder','Self-employed','Student','Intern','Consultant','Open to Work','Other'];
const VALID_LINK_PLATFORMS = ['linkedin','twitter','portfolio','website','github','instagram'];
// Non-global URL test (avoids lastIndex stateful bug of /gi regex used with .test())
const URL_TEST_RE = /^https?:\/\/[^\s<>"']+$/i;

// GET /api/onboarding/stage
// Returns current stage from req.userData — no extra DB round-trip.
app.get('/api/onboarding/stage', auth, (req, res) => {
  res.json({ stage: req.userData.onboarding_stage || 'acquisition' });
});

// POST /api/onboarding/acquisition — Screen 1: "How did you hear about us?"
app.post('/api/onboarding/acquisition', onboardingLimiter, auth, async (req, res) => {
  try {
    const user  = req.userData;
    const stage = user.onboarding_stage || 'acquisition';
    if (stage !== 'acquisition') return res.status(409).json({ error: 'Wrong onboarding stage', stage });

    const { source, referral } = req.body;
    if (!source || !ACQUISITION_SOURCES.includes(source)) {
      return res.status(400).json({ error: 'Please select where you heard about us' });
    }
    const cleanReferral = (source === 'Friend/Referral' && referral)
      ? String(referral).trim().slice(0, 50) || null
      : null;

    // Upsert so retries after network timeout don't 500
    const { error: upsertErr } = await supabase.from('user_acquisition').upsert(
      { user_id: user.id, source, referral: cleanReferral },
      { onConflict: 'user_id' }
    );
    if (upsertErr) throw new Error(upsertErr.message);

    const { error: updateErr } = await supabase.from('users')
      .update({ onboarding_stage: 'intent' }).eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    const elapsedAcq = Math.round((Date.now() - new Date(user.created_at).getTime()) / 1000);
    console.log(`[Onboarding] userId=${user.id} stage=intent elapsed=${elapsedAcq}s source=${source}`);
    res.json({ stage: 'intent' });
  } catch(e) {
    console.error('Onboarding acquisition error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/onboarding/intent — Screen 2: "What brings you here?"
app.post('/api/onboarding/intent', onboardingLimiter, auth, async (req, res) => {
  try {
    const user  = req.userData;
    const stage = user.onboarding_stage || 'acquisition';
    if (stage !== 'intent') return res.status(409).json({ error: 'Wrong onboarding stage', stage });

    const { intents } = req.body;
    if (!Array.isArray(intents) || intents.length === 0) {
      return res.status(400).json({ error: 'Please select at least one intent' });
    }
    const invalid = intents.filter(i => !VALID_INTENTS.includes(i));
    if (invalid.length) return res.status(400).json({ error: 'Invalid intent values: ' + invalid.join(', ') });

    const deduped = [...new Set(intents)];
    const rows = deduped.map(intent => ({ id: uuidv4(), user_id: user.id, intent }));
    const { error: upsertErr } = await supabase.from('user_intents')
      .upsert(rows, { onConflict: 'user_id,intent', ignoreDuplicates: true });
    if (upsertErr) throw new Error(upsertErr.message);

    // Populate legacy `intent` field so match engine still works
    const legacyIntent = INTENT_LEGACY_MAP[deduped[0]] || 'explore-network';
    const { error: updateErr } = await supabase.from('users')
      .update({ onboarding_stage: 'profile', intent: legacyIntent }).eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    const elapsedInt = Math.round((Date.now() - new Date(user.created_at).getTime()) / 1000);
    console.log(`[Onboarding] userId=${user.id} stage=profile elapsed=${elapsedInt}s intents=${deduped.join(',')}`);
    res.json({ stage: 'profile' });
  } catch(e) {
    console.error('Onboarding intent error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/onboarding/profile — Screen 3: "Complete your profile"
// Every field is optional. An empty body is a valid submission.
app.post('/api/onboarding/profile', onboardingLimiter, auth, async (req, res) => {
  try {
    const user  = req.userData;
    const stage = user.onboarding_stage || 'acquisition';
    if (stage !== 'profile') return res.status(409).json({ error: 'Wrong onboarding stage', stage });

    const { headline, bio, profession, industry, experience_level, location, interests, working_on, skills, education, work, social_links } = req.body;

    // Validate
    const errors = [];
    let cleanHeadline = headline ? String(headline).trim().slice(0, 80) : undefined;
    if (cleanHeadline === '') cleanHeadline = undefined;

    let cleanBio = (bio !== undefined && bio !== null) ? String(bio).trim() : undefined;
    if (cleanBio === '') cleanBio = undefined;
    if (cleanBio !== undefined && cleanBio.length < 10) {
      errors.push({ field: 'bio', error: 'Bio must be at least 10 characters long.' });
    }
    if (cleanBio && cleanBio.length > 180) cleanBio = cleanBio.slice(0, 180);

    const cleanExp = (experience_level && VALID_EXP_LEVELS.includes(experience_level)) ? experience_level : undefined;
    if (experience_level && !cleanExp) errors.push({ field: 'experience_level', error: 'Invalid experience level' });

    if (errors.length) return res.status(400).json({ errors });

    // Build user updates
    const userUpdates = { onboarding_stage: 'complete', onboarding_completed_at: new Date().toISOString() };
    if (cleanHeadline !== undefined) userUpdates.headline  = sanitize(cleanHeadline);
    if (cleanBio      !== undefined) userUpdates.bio       = sanitize(cleanBio);
    if (profession) userUpdates.profession  = sanitize(String(profession).trim().slice(0, 100));
    if (industry)   userUpdates.industry    = sanitize(String(industry).trim().slice(0, 100));
    if (cleanExp)   userUpdates.experience_level = cleanExp;
    if (location)   userUpdates.location    = sanitize(String(location).trim().slice(0, 100));
    if (working_on) userUpdates.working_on  = sanitize(String(working_on).trim().slice(0, 200));

    // Skills — merge into existing skills[] array
    if (Array.isArray(skills) && skills.length) {
      const newSkills = [...new Set(skills.map(s => sanitize(String(s).trim())).filter(Boolean))].slice(0, 10);
      userUpdates.skills = [...new Set([...(user.skills || []), ...newSkills])];
    }

    // Interests — merge into existing interests[] array
    if (Array.isArray(interests) && interests.length) {
      const newInts = [...new Set(interests.map(i => sanitize(String(i).trim())).filter(Boolean))];
      userUpdates.interests = [...new Set([...(user.interests || []), ...newInts])];
    }

    // Social links — map platform names directly to user columns
    if (Array.isArray(social_links)) {
      for (const link of social_links) {
        if (!link || !VALID_LINK_PLATFORMS.includes(link.platform)) continue;
        const rawUrl = link.url ? String(link.url).trim() : '';
        if (!rawUrl || !URL_TEST_RE.test(rawUrl)) continue;
        userUpdates[link.platform] = sanitize(rawUrl.slice(0, 300));
      }
    }

    // Recalculate scores with updated values before writing
    const merged = { ...user, ...userUpdates };
    userUpdates.trust_score         = calcTrust(merged);
    userUpdates.profile_score       = calcProfileScore(merged);
    userUpdates.is_profile_complete = userUpdates.profile_score >= 70;

    const { error: updateErr } = await supabase.from('users')
      .update(userUpdates).eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    // Education entries
    if (Array.isArray(education) && education.length) {
      const seenEdu = new Set();
      for (const entry of education) {
        const school     = entry.school     ? sanitize(String(entry.school).trim().slice(0, 200))     : null;
        const university = entry.university ? sanitize(String(entry.university).trim().slice(0, 200)) : null;
        const degree     = entry.degree     ? sanitize(String(entry.degree).trim().slice(0, 100))     : null;
        const field      = entry.field      ? sanitize(String(entry.field).trim().slice(0, 100))      : null;
        if (!school && !university && !degree && !field) continue;
        const key = [school, university, degree, field].join('|');
        if (seenEdu.has(key)) continue;
        seenEdu.add(key);
        // DB duplicate check using exact field matching
        let q = supabase.from('user_education').select('id').eq('user_id', user.id);
        q = school     ? q.eq('school', school)         : q.is('school', null);
        q = university ? q.eq('university', university) : q.is('university', null);
        q = degree     ? q.eq('degree', degree)         : q.is('degree', null);
        q = field      ? q.eq('field', field)           : q.is('field', null);
        const { data: dup } = await q.maybeSingle();
        if (dup) continue;
        await supabase.from('user_education').insert({ id: uuidv4(), user_id: user.id, school, university, degree, field });
      }
    }

    // Work entries
    if (Array.isArray(work) && work.length) {
      const seenWork = new Set();
      for (const entry of work) {
        const company   = entry.company   ? sanitize(String(entry.company).trim().slice(0, 200))   : null;
        const job_title = entry.job_title ? sanitize(String(entry.job_title).trim().slice(0, 200)) : null;
        const work_ind  = entry.industry  ? sanitize(String(entry.industry).trim().slice(0, 100))  : null;
        const emp_type  = (entry.employment_type && VALID_EMP_TYPES.includes(entry.employment_type)) ? entry.employment_type : null;
        if (!company && !job_title) continue;
        const key = [company, job_title].join('|');
        if (seenWork.has(key)) continue;
        seenWork.add(key);
        let q = supabase.from('user_work').select('id').eq('user_id', user.id);
        q = company   ? q.eq('company', company)     : q.is('company', null);
        q = job_title ? q.eq('job_title', job_title) : q.is('job_title', null);
        const { data: dup } = await q.maybeSingle();
        if (dup) continue;
        await supabase.from('user_work').insert({ id: uuidv4(), user_id: user.id, company, job_title, industry: work_ind, employment_type: emp_type });
      }
    }

    const elapsedPro = Math.round((Date.now() - new Date(user.created_at).getTime()) / 1000);
    console.log(`[Onboarding] userId=${user.id} stage=complete elapsed=${elapsedPro}s score=${userUpdates.profile_score} gate=${userUpdates.is_profile_complete ? 'pass' : 'fail'}`);
    res.json({ stage: 'complete', trust_score: userUpdates.trust_score });
  } catch(e) {
    console.error('Onboarding profile error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PROFILE COMPLETION NUDGE ──
// Runs hourly. Targets users whose account is 24-48h old, onboarding is
// complete, but profile_score < 70 and they have a push token.
// The 24-48h window is self-expiring — no new DB column needed, each user
// can only fall inside it once.
async function sendProfileNudges() {
  try {
    const now   = Date.now();
    const lo    = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const hi    = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: users } = await supabase.from('users')
      .select('id, profile_score, push_token')
      .eq('onboarding_stage', 'complete')
      .eq('is_profile_complete', false)
      .not('push_token', 'is', null)
      .gt('created_at', lo)
      .lt('created_at', hi);
    if (!users || users.length === 0) return;
    for (const user of users) {
      const gap = 70 - (user.profile_score || 0);
      await sendPush(
        [user.id],
        'Complete your BYN profile',
        `You're ${gap} points from unlocking Discovery. Add photos or interests to get started.`,
        { screen: 'ProfileComplete' }
      );
    }
    console.log(`[NudgePush] Sent profile nudge to ${users.length} user(s)`);
  } catch(e) {
    console.error('[NudgePush] Error:', e.message);
  }
}

// ── PUBLIC STATS (cached, no auth) ──
let _pubStats = null, _pubStatsTs = 0;
app.get('/api/stats/public', async (req, res) => {
  if (_pubStats && Date.now() - _pubStatsTs < 300_000) return res.json(_pubStats);
  try {
    const [{ count: users }, { count: connections }] = await Promise.all([
      // Real total headcount, not just fully-discoverable profiles -- was
      // undercounting real signups (is_profile_complete=true only) by more
      // than half. Excludes soft-deleted and banned accounts, which aren't
      // real active professionals to claim publicly.
      supabase.from('users').select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .or('banned.is.null,banned.eq.false'),
      // A connections row only ever exists because a mutual match happened --
      // 'connected' is not a real status value anywhere in this codebase
      // (only 'pending' and legacy 'active' text are used), so this always
      // returned 0 regardless of actual matches made. Count every row: this
      // is a cumulative "matches made" stat, not a "currently active" one.
      supabase.from('connections').select('*', { count: 'exact', head: true }),
    ]);
    _pubStats = { users: users || 0, connections: connections || 0 };
    _pubStatsTs = Date.now();
    res.json(_pubStats);
  } catch(_) { res.json({ users: 0, connections: 0 }); }
});

// ── REFERRAL — short link redirect ──
app.get('/r/:code', (req, res) => {
  const code = String(req.params.code).replace(/[^a-f0-9]/gi, '').slice(0, 8);
  res.redirect(302, `/app?ref=${encodeURIComponent(code)}`);
});

// ── REFERRAL — user's own link + count ──
app.get('/api/profile/referral', auth, async (req, res) => {
  try {
    const code  = req.user.id.slice(0, 8);
    const { count } = await supabase.from('users')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', req.user.id);
    const base = (process.env.BASE_URL || 'https://buildyournetwork.online').replace(/\/$/, '');
    res.json({ code, link: `${base}/r/${code}`, count: count || 0 });
  } catch(e) { res.status(500).json({ error: 'Internal server error' }); }
});

// ── FRONTEND EVENT LOG ──
// Fire-and-forget from webapp.html. Logs to Railway console — no DB table needed.
const EVENT_ALLOWLIST = new Set([
  'cta_click', 'signup_opened', 'signup_completed',
  'profile_completed', 'upgrade_clicked',
]);
app.post('/api/events', eventsLimiter, (req, res) => {
  try {
    const { event, props = {} } = req.body || {};
    if (!event || !EVENT_ALLOWLIST.has(event)) {
      return res.status(400).json({ error: 'Unknown event' });
    }
    let userId = 'anon';
    try {
      const decoded = jwt.verify(
        (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
        JWT_SECRET,
      );
      if (decoded?.id) userId = decoded.id;
    } catch(_) {}
    const sanitize = (v) => String(v).slice(0, 50).replace(/[\r\n]/g, ' ');
    const parts = [`[Event] event=${event}`, `userId=${userId}`];
    if (props.source) parts.push(`source=${sanitize(props.source)}`);
    if (props.button) parts.push(`button=${sanitize(props.button)}`);
    if (props.screen) parts.push(`screen=${sanitize(props.screen)}`);
    console.log(parts.join(' '));
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Event log failed' });
  }
});

// ── WEB PUSH ──
app.get('/api/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
    await supabase.from('push_subscriptions').upsert({
      user_id:      req.user.id,
      endpoint:     subscription.endpoint,
      subscription: subscription,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.delete('/api/push/subscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await supabase.from('push_subscriptions').delete().eq('user_id', req.user.id).eq('endpoint', endpoint);
    } else {
      await supabase.from('push_subscriptions').delete().eq('user_id', req.user.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// ── INTENT CIRCLES ──────────────────────────────────────────────────────────
const CIRCLE_TAGS = [
  'Building','Learning','Solving','Seeking','Progress',
  'Launching','Hiring','Fundraising','Collab','Open Source'
];

// Exact fields ComposePost.tsx sends — nothing else is stored
const ALLOWED_META_KEYS = ['looking_for','building','current_goal','open_to','industry','skill_level','location','timeline'];
function sanitizeStructuredMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of ALLOWED_META_KEYS) {
    const val = raw[key];
    if (val && typeof val === 'string' && val.trim()) out[key] = val.trim().slice(0, 200);
  }
  return out;
}

function circleWordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&nbsp;/g, ' ').replace(/&copy;/g, '©').replace(/&trade;/g, '™')
    .replace(/&reg;/g, '®').replace(/&bull;/g, '•').replace(/&middot;/g, '·');
}

// In-memory link preview cache — max 200 entries, 5-min TTL
const lpCache = new Map();
const LP_TTL  = 5 * 60 * 1000;

// SSRF guard: resolve hostname and reject private/loopback/link-local IPs
function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return false;
  return p[0] === 127 || p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254) ||
    p[0] === 0;
}
async function isBlockedHost(hostname) {
  try {
    const addresses = await dns.promises.resolve(hostname);
    return addresses.some(ip => isPrivateIPv4(ip) || ip === '::1');
  } catch {
    return true; // unresolvable — block it
  }
}

// SSRF-safe fetch — re-checks isBlockedHost() on every redirect hop instead of
// only the initial URL. `fetch(url, {redirect:'follow'})` alone doesn't do this:
// a public URL that 302s to http://169.254.169.254/... or an internal hostname
// would sail through the one-time check and get fetched anyway.
async function safeFetchFollowingRedirects(startUrl, options = {}, maxRedirects = 5) {
  let currentUrl = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (await isBlockedHost(parsed.hostname)) return null;
    const res = await fetch(currentUrl, { ...options, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

async function fetchLinkPreview(url) {
  const cached = lpCache.get(url);
  if (cached && Date.now() - cached.ts < LP_TTL) return cached.data;

  // SSRF guard — block private/loopback/link-local IPs before any network call
  try {
    if (await isBlockedHost(new URL(url).hostname)) return null;
  } catch { return null; }

  // YouTube oEmbed — free, no auth, returns title + thumbnail
  const ytMatch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const oRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
      if (oRes.ok) {
        const d = await oRes.json();
        const preview = {
          url,
          title: d.title || null,
          description: null,
          image: d.thumbnail_url || `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
          domain: 'youtube.com',
        };
        if (lpCache.size >= 200) lpCache.delete(lpCache.keys().next().value);
        lpCache.set(url, { data: preview, ts: Date.now() });
        return preview;
      }
    } catch (e) {
      console.error('[link-preview] YouTube oEmbed error:', e.message);
    }
  }

  try {
    const res = await safeFetchFollowingRedirects(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res || !res.ok) {
      console.log(`[link-preview] ${res ? `HTTP ${res.status}` : 'blocked or unreachable'} for ${url}`);
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) {
      console.log(`[link-preview] non-HTML (${ct}) for ${url}`);
      return null;
    }
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > 512000) return null;
    const html = (await res.text()).slice(0, 512000);
    const getOg = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'));
      return decodeHtmlEntities(m?.[1]?.trim() || null);
    };
    const getTwitter = (name) => {
      const m = html.match(new RegExp(`<meta[^>]+name=["']twitter:${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:${name}["']`, 'i'));
      return decodeHtmlEntities(m?.[1]?.trim() || null);
    };
    const getMeta = (name) => {
      const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'));
      return decodeHtmlEntities(m?.[1]?.trim() || null);
    };
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const domain = new URL(url).hostname.replace(/^www\./, '');
    let image = getOg('image') || getTwitter('image');
    if (image && !image.startsWith('http')) {
      try { image = new URL(image, url).href; } catch { image = null; }
    }
    const preview = {
      url,
      title:       getOg('title')       || getTwitter('title')       || decodeHtmlEntities(titleMatch?.[1]?.trim()) || null,
      description: getOg('description') || getTwitter('description') || getMeta('description') || null,
      image,
      domain,
    };
    if (lpCache.size >= 200) lpCache.delete(lpCache.keys().next().value);
    lpCache.set(url, { data: preview, ts: Date.now() });
    return preview;
  } catch (e) {
    console.error(`[link-preview] error for ${url}:`, e.message);
    return null;
  }
}

app.post('/api/circles/link-preview', auth, linkPreviewLimiter, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
    let parsed;
    try { parsed = new URL(url.trim()); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Invalid URL' });
    const preview = await fetchLinkPreview(parsed.href);
    if (!preview) return res.status(502).json({ error: 'Could not fetch preview' });
    res.json(preview);
  } catch (e) {
    console.error('[link-preview]', e.message);
    res.status(502).json({ error: 'Preview fetch failed' });
  }
});

app.post('/api/circles/posts', auth, profileGuard, circlePostLimiter, async (req, res) => {
  try {
    const { text, tags, structured_meta, links, group_id } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text required' });
    if (circleWordCount(text) > 250) return res.status(400).json({ error: 'Post exceeds 250 words' });
    if (!Array.isArray(tags) || tags.length === 0) return res.status(400).json({ error: 'Select at least one tag' });
    if (tags.length > 3) return res.status(400).json({ error: 'Max 3 tags allowed' });
    const validTags = tags.filter(t => CIRCLE_TAGS.includes(t));
    if (validTags.length === 0) return res.status(400).json({ error: 'Invalid tags' });
    if (Array.isArray(links) && links.length > 3) return res.status(400).json({ error: 'Max 3 links' });

    let groupId = null;
    if (group_id) {
      const { data: membership } = await supabase.from('circle_group_members')
        .select('id').eq('group_id', group_id).eq('user_id', req.user.id).maybeSingle();
      if (!membership) return res.status(403).json({ error: 'Join this circle before posting to it' });
      groupId = group_id;
    }

    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { error } = await supabase.from('circle_posts').insert({
      id,
      user_id: req.user.id,
      text: text.trim(),
      tags: validTags,
      structured_meta: sanitizeStructuredMeta(structured_meta),
      links: Array.isArray(links) ? links.filter(l => typeof l === 'string' && /^https?:\/\//i.test(l)).slice(0, 3) : [],
      group_id: groupId,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error('[circles/posts POST]', e.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.delete('/api/circles/posts/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('circle_posts')
      .select('user_id').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Post not found' });
    if (data.user_id !== req.user.id && req.userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await supabase.from('circle_posts').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.patch('/api/circles/posts/:id', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text required' });
    if (circleWordCount(text) > 250) return res.status(400).json({ error: 'Post exceeds 250 words' });
    const { data, error } = await supabase.from('circle_posts')
      .select('user_id, created_at').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Post not found' });
    if (data.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const ageMin = (Date.now() - new Date(data.created_at).getTime()) / 60000;
    if (ageMin > 30) return res.status(403).json({ error: 'Edit window has closed (30 min limit)' });
    const { error: updateError } = await supabase.from('circle_posts')
      .update({ text: text.trim() }).eq('id', req.params.id);
    if (updateError) throw updateError;
    res.json({ ok: true });
  } catch (e) {
    console.error('[circles/posts PATCH]', e.message);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

function circleRelevanceScore(me, post) {
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
  const trust    = post.author?.trust_score || 0;
  const metaFill = Object.values(post.structured_meta || {}).filter(v => v && String(v).trim()).length;
  let score = trust * 0.3 + (1 / (ageHours + 1)) * 40 + metaFill * 2;
  if (!me) return score;

  const mySkills     = (me.skills    || []).map(s => s.toLowerCase());
  const authorSkills = (post.author?.skills    || []).map(s => s.toLowerCase());
  score += Math.min(mySkills.filter(s => authorSkills.includes(s)).length * 6, 18);

  const lookingFor = (post.structured_meta?.looking_for || '').toLowerCase();
  if (mySkills.length && mySkills.some(s => lookingFor.includes(s))) score += 22;

  const myInterests     = (me.interests    || []).map(s => s.toLowerCase());
  const authorInterests = (post.author?.interests || []).map(s => s.toLowerCase());
  score += Math.min(myInterests.filter(s => authorInterests.includes(s)).length * 5, 15);

  const meLat = parseFloat(me.lat);
  const meLng = parseFloat(me.lng);
  const aLat  = parseFloat(post.author?.lat);
  const aLng  = parseFloat(post.author?.lng);
  if (!isNaN(meLat) && !isNaN(meLng) && !isNaN(aLat) && !isNaN(aLng)) {
    const d = haversine(meLat, meLng, aLat, aLng);
    score += d < 10 ? 20 : d < 50 ? 15 : d < 200 ? 8 : 3;
  } else if (me.location && post.author?.location &&
             me.location.toLowerCase() === (post.author.location || '').toLowerCase()) {
    score += 20;
  }
  return score;
}

app.get('/api/circles/feed', auth, async (req, res) => {
  try {
    const { tags, offset = '0', limit = '20', mode = 'for-you', group_id } = req.query;
    const off = Math.max(0, parseInt(offset) || 0);
    const lim = Math.min(Math.max(1, parseInt(limit) || 20), 50);
    const me  = req.userData;

    if (group_id) {
      const { data: group } = await supabase.from('circle_groups').select('privacy').eq('id', group_id).maybeSingle();
      if (!group) return res.status(404).json({ error: 'Circle not found' });
      if (group.privacy === 'private') {
        const { data: membership } = await supabase.from('circle_group_members')
          .select('id').eq('group_id', group_id).eq('user_id', req.user.id).maybeSingle();
        if (!membership) return res.status(403).json({ error: 'This circle is private' });
      }
    }

    let query = supabase.from('circle_posts')
      .select(`id, text, tags, structured_meta, links, created_at, user_id, group_id,
        author:users!circle_posts_user_id_fkey(id, name, photos, intent, trust_score, verification, last_active, headline, skills, interests, lat, lng, location)`)
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    query = group_id ? query.eq('group_id', group_id) : query.is('group_id', null);

    if (tags) {
      const tagArr = String(tags).split(',').map(t => t.trim()).filter(t => CIRCLE_TAGS.includes(t));
      if (tagArr.length > 0) query = query.overlaps('tags', tagArr);
    }

    const { data, error } = await query;
    if (error) throw error;

    // author is a LEFT JOIN (no !inner) — filter out posts whose author
    // account no longer exists rather than shipping author: null to clients.
    let posts = (data || []).filter(p => p.author);

    // Near Me: filter by haversine proximity (150km) or city string
    if (mode === 'near-me') {
      const meLat = parseFloat(me?.lat);
      const meLng = parseFloat(me?.lng);
      if (!isNaN(meLat) && !isNaN(meLng)) {
        posts = posts.filter(p => {
          const aLat = parseFloat(p.author?.lat);
          const aLng = parseFloat(p.author?.lng);
          if (isNaN(aLat) || isNaN(aLng)) return false;
          return haversine(meLat, meLng, aLat, aLng) <= 150;
        });
      } else if (me?.location) {
        const myCity = me.location.toLowerCase();
        posts = posts.filter(p => (p.author?.location || '').toLowerCase() === myCity);
      } else {
        return res.json({ posts: [], hasMore: false, noLocation: true });
      }
    }

    // Batch-fetch like counts + whether the current user liked each post —
    // same pattern as /api/discover's batch works fetch, avoids N+1 queries.
    const postIds = posts.map(p => p.id);
    const likeCounts = {};
    const likedByMe = new Set();
    if (postIds.length > 0) {
      const { data: allLikes } = await supabase.from('circle_post_likes')
        .select('post_id, user_id').in('post_id', postIds);
      (allLikes || []).forEach(l => {
        likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
        if (l.user_id === req.user.id) likedByMe.add(l.post_id);
      });
    }

    // Group feeds stay chronological (members already opted in by joining) —
    // relevance ranking is for the open global feed, not a joined community.
    const ranked = (group_id ? posts.map(p => ({ ...p, _score: 0 })) : posts.map(p => {
      const s = mode === 'all'
        ? (() => {
            const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
            return (p.author?.trust_score || 0) * 0.3 + (1 / (ageHours + 1)) * 60
              + Object.values(p.structured_meta || {}).filter(v => v && String(v).trim()).length * 2;
          })()
        : circleRelevanceScore(me, p);
      return { ...p, _score: s };
    })).sort((a, b) => group_id ? 0 : b._score - a._score)
      .map(({ _score, ...p }) => {
        // Strip private author fields — never send lat/lng/skills/interests/location to client
        if (p.author) {
          // eslint-disable-next-line no-unused-vars
          const { lat, lng, skills, interests, location, last_active, ...authorPublic } = p.author;
          p = { ...p, author: authorPublic };
        }
        return { ...p, like_count: likeCounts[p.id] || 0, liked_by_me: likedByMe.has(p.id) };
      });

    res.json({ posts: ranked, hasMore: (data || []).length === lim });
  } catch (e) {
    console.error('[circles/feed]', e.message);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// ── CIRCLE GROUPS ────────────────────────────────────────────────────────────
// Joinable communities within Circles. A group has members with role
// 'admin'|'member'; the creator is auto-added as the first admin. Posts with
// group_id set live in that group's own feed (see /api/circles/feed above),
// not the global one.

async function attachMyRole(groups, userId) {
  if (groups.length === 0) return groups;
  const groupIds = groups.map(g => g.id);
  const [{ data: myMemberships }, { data: allMembers }] = await Promise.all([
    supabase.from('circle_group_members').select('group_id, role').eq('user_id', userId).in('group_id', groupIds),
    supabase.from('circle_group_members').select('group_id').in('group_id', groupIds),
  ]);
  const roleByGroup = Object.fromEntries((myMemberships || []).map(m => [m.group_id, m.role]));
  const countByGroup = {};
  (allMembers || []).forEach(m => { countByGroup[m.group_id] = (countByGroup[m.group_id] || 0) + 1; });
  return groups.map(g => ({ ...g, my_role: roleByGroup[g.id] || null, member_count: countByGroup[g.id] || 0 }));
}

app.post('/api/circle-groups', circleGroupCreateLimiter, auth, profileGuard, async (req, res) => {
  try {
    const { name, description, privacy } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
    if (name.trim().length > 60) return res.status(400).json({ error: 'Name too long (60 char max)' });
    if (description && String(description).length > 300) return res.status(400).json({ error: 'Description too long (300 char max)' });
    const priv = privacy === 'private' ? 'private' : 'public';

    const id = uuidv4();
    const { error: groupErr } = await supabase.from('circle_groups').insert({
      id, name: sanitize(name).slice(0, 60), description: description ? sanitize(String(description)).slice(0, 300) : null,
      privacy: priv, creator_id: req.user.id, created_at: new Date().toISOString(),
    });
    if (groupErr) throw groupErr;
    const { error: memberErr } = await supabase.from('circle_group_members').insert({
      id: uuidv4(), group_id: id, user_id: req.user.id, role: 'admin', joined_at: new Date().toISOString(),
    });
    if (memberErr) throw memberErr;
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error('[circle-groups POST]', e.message);
    res.status(500).json({ error: 'Failed to create circle' });
  }
});

app.get('/api/circle-groups', auth, async (req, res) => {
  try {
    const { mine } = req.query;
    if (mine === 'true') {
      const { data: memberships } = await supabase.from('circle_group_members')
        .select('group_id').eq('user_id', req.user.id);
      const groupIds = (memberships || []).map(m => m.group_id);
      if (groupIds.length === 0) return res.json({ groups: [] });
      const { data: groups, error } = await supabase.from('circle_groups')
        .select('id, name, description, photo_url, privacy, creator_id, created_at')
        .in('id', groupIds).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ groups: await attachMyRole(groups || [], req.user.id) });
    }
    // Discover: public groups only
    const { data: groups, error } = await supabase.from('circle_groups')
      .select('id, name, description, photo_url, privacy, creator_id, created_at')
      .eq('privacy', 'public').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ groups: await attachMyRole(groups || [], req.user.id) });
  } catch (e) {
    console.error('[circle-groups GET]', e.message);
    res.status(500).json({ error: 'Failed to fetch circles' });
  }
});

app.get('/api/circle-groups/:id', auth, async (req, res) => {
  try {
    const { data: group, error } = await supabase.from('circle_groups')
      .select('id, name, description, photo_url, privacy, creator_id, created_at')
      .eq('id', req.params.id).maybeSingle();
    if (error || !group) return res.status(404).json({ error: 'Circle not found' });
    const [withRole] = await attachMyRole([group], req.user.id);
    if (group.privacy === 'private' && !withRole.my_role) return res.status(403).json({ error: 'This circle is private' });
    res.json(withRole);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch circle' });
  }
});

app.get('/api/circle-groups/:id/members', auth, async (req, res) => {
  try {
    const { data: membership } = await supabase.from('circle_group_members')
      .select('id').eq('group_id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Join this circle to see its members' });
    const { data: members, error } = await supabase.from('circle_group_members')
      .select('user_id, role, joined_at, user:users!circle_group_members_user_id_fkey(id, name, photos, headline, trust_score)')
      .eq('group_id', req.params.id).order('joined_at', { ascending: true });
    if (error) throw error;
    res.json({ members: (members || []).filter(m => m.user) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.post('/api/circle-groups/:id/join', circleGroupActionLimiter, auth, profileGuard, async (req, res) => {
  try {
    const { data: group } = await supabase.from('circle_groups').select('privacy').eq('id', req.params.id).maybeSingle();
    if (!group) return res.status(404).json({ error: 'Circle not found' });
    if (group.privacy === 'private') return res.status(403).json({ error: 'This circle is invite-only' });
    const { data: existing } = await supabase.from('circle_group_members')
      .select('id').eq('group_id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (existing) return res.json({ ok: true });
    const { error } = await supabase.from('circle_group_members').insert({
      id: uuidv4(), group_id: req.params.id, user_id: req.user.id, role: 'member', joined_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to join circle' });
  }
});

app.post('/api/circle-groups/:id/leave', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    const { data: members, error } = await supabase.from('circle_group_members')
      .select('id, user_id, role').eq('group_id', req.params.id);
    if (error) throw error;
    const me = (members || []).find(m => m.user_id === req.user.id);
    if (!me) return res.status(404).json({ error: 'Not a member of this circle' });

    if ((members || []).length === 1) {
      // Last member leaving — delete the group entirely rather than orphan it.
      await supabase.from('circle_groups').delete().eq('id', req.params.id);
      return res.json({ ok: true, groupDeleted: true });
    }
    const admins = (members || []).filter(m => m.role === 'admin');
    if (me.role === 'admin' && admins.length === 1) {
      return res.status(400).json({ error: 'Promote another member to admin before leaving' });
    }
    await supabase.from('circle_group_members').delete().eq('id', me.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to leave circle' });
  }
});

async function requireGroupAdmin(groupId, userId) {
  const { data: membership } = await supabase.from('circle_group_members')
    .select('role').eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  return membership?.role === 'admin';
}

app.post('/api/circle-groups/:id/members/:userId/promote', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    if (!await requireGroupAdmin(req.params.id, req.user.id)) return res.status(403).json({ error: 'Admins only' });
    const { error } = await supabase.from('circle_group_members')
      .update({ role: 'admin' }).eq('group_id', req.params.id).eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to promote member' });
  }
});

app.post('/api/circle-groups/:id/members/:userId/demote', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    if (!await requireGroupAdmin(req.params.id, req.user.id)) return res.status(403).json({ error: 'Admins only' });
    const { data: members } = await supabase.from('circle_group_members')
      .select('user_id, role').eq('group_id', req.params.id);
    const admins = (members || []).filter(m => m.role === 'admin');
    if (admins.length === 1 && admins[0].user_id === req.params.userId) {
      return res.status(400).json({ error: 'A circle must have at least one admin' });
    }
    const { error } = await supabase.from('circle_group_members')
      .update({ role: 'member' }).eq('group_id', req.params.id).eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to demote member' });
  }
});

app.post('/api/circle-groups/:id/members/:userId/remove', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    if (!await requireGroupAdmin(req.params.id, req.user.id)) return res.status(403).json({ error: 'Admins only' });
    const { data: group } = await supabase.from('circle_groups').select('creator_id').eq('id', req.params.id).maybeSingle();
    if (group?.creator_id === req.params.userId) return res.status(400).json({ error: "Can't remove the circle's creator" });
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Use leave instead of remove for yourself' });
    const { error } = await supabase.from('circle_group_members')
      .delete().eq('group_id', req.params.id).eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

app.delete('/api/circle-groups/:id', auth, async (req, res) => {
  try {
    const { data: group } = await supabase.from('circle_groups').select('creator_id').eq('id', req.params.id).maybeSingle();
    if (!group) return res.status(404).json({ error: 'Circle not found' });
    if (group.creator_id !== req.user.id) return res.status(403).json({ error: "Only the circle's creator can delete it" });
    await supabase.from('circle_groups').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete circle' });
  }
});

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────

app.post('/api/circles/posts/:id/like', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    const { data: post, error: postErr } = await supabase
      .from('circle_posts').select('user_id, text').eq('id', req.params.id).single();
    if (postErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: existing } = await supabase.from('circle_post_likes')
      .select('id').eq('post_id', req.params.id).eq('user_id', req.user.id).maybeSingle();

    if (existing) {
      await supabase.from('circle_post_likes').delete().eq('id', existing.id);
    } else {
      await supabase.from('circle_post_likes').insert({
        id: uuidv4(), post_id: req.params.id, user_id: req.user.id,
        created_at: new Date().toISOString(),
      });
      if (post.user_id !== req.user.id) {
        // Dedupe — one notification per (actor, post), same as collaborate
        const { data: existingNotif } = await supabase.from('notifications')
          .select('id').eq('actor_id', req.user.id).eq('ref_id', req.params.id).eq('type', 'circle_like')
          .maybeSingle();
        if (!existingNotif) {
          const { data: actor } = await supabase
            .from('users').select('name, photos').eq('id', req.user.id).single();
          const actorName  = actor?.name  || 'Someone';
          const actorPhoto = actor?.photos?.[0] || null;
          await supabase.from('notifications').insert({
            id: uuidv4(),
            user_id: post.user_id,
            type: 'circle_like',
            actor_id: req.user.id,
            actor_name: actorName,
            actor_photo: actorPhoto,
            ref_id: req.params.id,
            ref_type: 'circle_post',
            ref_text: post.text.slice(0, 120),
            read: false,
            created_at: new Date().toISOString(),
          });
          const pushTitle = `❤️ ${actorName} liked your post`;
          const pushBody  = post.text.slice(0, 80);
          sendPush([post.user_id], pushTitle, pushBody, { screen: 'Circles' }).catch(() => {});
          sendWebPush([post.user_id], pushTitle, pushBody, { screen: 'Circles' }).catch(() => {});
        }
      }
    }

    const { count } = await supabase.from('circle_post_likes')
      .select('*', { count: 'exact', head: true }).eq('post_id', req.params.id);
    res.json({ liked: !existing, likeCount: count ?? 0 });
  } catch (e) {
    console.error('[circles/like]', e.message);
    res.status(500).json({ error: 'Failed to update like' });
  }
});

app.post('/api/circles/posts/:id/collaborate', circleGroupActionLimiter, auth, async (req, res) => {
  try {
    const { data: post, error: postErr } = await supabase
      .from('circle_posts').select('user_id, text').eq('id', req.params.id).single();
    if (postErr || !post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id === req.user.id) return res.status(400).json({ error: 'Cannot collaborate on own post' });

    // Deduplicate — one notification per (actor, post)
    const { data: existing } = await supabase.from('notifications')
      .select('id').eq('actor_id', req.user.id).eq('ref_id', req.params.id).eq('type', 'circle_collaborate')
      .maybeSingle();
    if (existing) return res.json({ ok: true });

    const { data: actor } = await supabase
      .from('users').select('name, photos').eq('id', req.user.id).single();
    const actorName  = actor?.name  || 'Someone';
    const actorPhoto = actor?.photos?.[0] || null;
    const notifId = uuidv4();
    await supabase.from('notifications').insert({
      id: notifId,
      user_id: post.user_id,
      type: 'circle_collaborate',
      actor_id: req.user.id,
      actor_name: actorName,
      actor_photo: actorPhoto,
      ref_id: req.params.id,
      ref_type: 'circle_post',
      ref_text: post.text.slice(0, 120),
      read: false,
      created_at: new Date().toISOString(),
    });
    const pushTitle = `🤝 ${actorName} wants to collaborate`;
    const pushBody  = post.text.slice(0, 80);
    sendPush([post.user_id], pushTitle, pushBody, { screen: 'Circles' }).catch(() => {});
    sendWebPush([post.user_id], pushTitle, pushBody, { screen: 'Circles' }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[circles/collaborate]', e.message);
    res.status(500).json({ error: 'Failed to record collaboration' });
  }
});

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ notifications: data || [] });
  } catch (e) {
    console.error('[notifications GET]', e.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.get('/api/notifications/unread-count', auth, async (req, res) => {
  try {
    const { count, error } = await supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('read', false);
    if (error) throw error;
    res.json({ count: count ?? 0 });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

app.patch('/api/notifications/read', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('read', false);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ── FALLBACK ──
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error('[Unhandled]', err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// ── 24H EXPIRY WARNING ──
// Runs hourly alongside sendProfileNudges.
// Finds pending connections expiring in 23–25h and sends one push to BOTH
// users. Tracks warned connection IDs in-memory — resets on redeploy (acceptable:
// worst case the notification is sent again after a restart, which is harmless).
const _expiryWarnedIds = new Set();
async function sendExpiryWarnings() {
  try {
    const now = Date.now();
    const lo  = new Date(now + 23 * 3600000).toISOString(); // expires > now+23h
    const hi  = new Date(now + 25 * 3600000).toISOString(); // expires < now+25h
    const { data: conns } = await supabase.from('connections')
      .select('id, user1, user2')
      .eq('status', 'pending')
      .eq('active', false)
      .gt('expires_at', lo)
      .lt('expires_at', hi);
    if (!conns || conns.length === 0) return;

    // Fetch names for all involved users
    const userIds = [...new Set(conns.flatMap(c => [c.user1, c.user2]))];
    const { data: usersData } = await supabase.from('users')
      .select('id, name').in('id', userIds);
    const nameMap = Object.fromEntries((usersData || []).map(u => [u.id, u.name || 'Someone']));

    let warned = 0;
    for (const conn of conns) {
      if (_expiryWarnedIds.has(conn.id)) continue;
      _expiryWarnedIds.add(conn.id);
      const name1 = nameMap[conn.user1] || 'Someone';
      const name2 = nameMap[conn.user2] || 'Someone';
      sendPush([conn.user1], '⏰ Connection expiring soon',
        `Your connection with ${name2} expires in 24 hours — start the conversation.`,
        { screen: 'Chat', connectionId: conn.id }).catch(() => {});
      sendPush([conn.user2], '⏰ Connection expiring soon',
        `Your connection with ${name1} expires in 24 hours — start the conversation.`,
        { screen: 'Chat', connectionId: conn.id }).catch(() => {});
      sendWebPush([conn.user1], '⏰ Connection expiring soon',
        `Your connection with ${name2} expires in 24 hours — start the conversation.`,
        { screen: 'Chat', connectionId: conn.id }).catch(() => {});
      sendWebPush([conn.user2], '⏰ Connection expiring soon',
        `Your connection with ${name1} expires in 24 hours — start the conversation.`,
        { screen: 'Chat', connectionId: conn.id }).catch(() => {});
      warned++;
    }
    if (warned) console.log(`[ExpiryWarn] Sent 24h warning to ${warned} connection(s)`);
  } catch (e) {
    console.error('[ExpiryWarn] Error:', e.message);
  }
}

// ── CONVERSATION NUDGE (48h silence) ──
// Runs daily. Finds active connections where the last message was sent >48h ago
// and the connection has at least 1 message. Sends one push to the user who sent
// the last message.
// Tracks nudged connections in-memory (Map of connectionId → lastNudgedAt).
// NOTE: This map resets on every redeploy — worst case a nudge is resent after
// restart, which is acceptable. Add a DB column (e.g. last_nudge_sent_at on
// connections) to make it fully persistent.
const _conversationNudgeMap = new Map(); // connectionId → timestamp of last nudge
const NUDGE_COOLDOWN_MS = 72 * 3600000; // 72h — don't nudge same connection again within 3 days
async function sendConversationNudges() {
  try {
    const now       = Date.now();
    const cutoff48h = new Date(now - 48 * 3600000).toISOString();

    // Find active connections that have at least 1 message
    const { data: activeConns } = await supabase.from('connections')
      .select('id, user1, user2')
      .eq('active', true);
    if (!activeConns || activeConns.length === 0) return;

    // Gather the last message for each active connection
    const connIds = activeConns.map(c => c.id);
    const { data: lastMsgs } = await supabase.from('messages')
      .select('connection_id, sender_id, created_at')
      .in('connection_id', connIds)
      .order('created_at', { ascending: false })
      .limit(connIds.length * 5); // one per connection is enough; oversample for safety

    // Build map: connectionId → most recent message
    const lastMsgMap = {};
    for (const m of (lastMsgs || [])) {
      if (!lastMsgMap[m.connection_id]) lastMsgMap[m.connection_id] = m;
    }

    // Collect sender names for all last-message senders
    const senderIds = [...new Set(Object.values(lastMsgMap).map(m => m.sender_id))];
    let nameMap = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase.from('users')
        .select('id, name').in('id', senderIds);
      nameMap = Object.fromEntries((senders || []).map(u => [u.id, u.name || 'Someone']));
    }

    // Also need the recipient name per connection
    const recipientIds = [];
    for (const conn of activeConns) {
      const last = lastMsgMap[conn.id];
      if (!last) continue;
      const recipientId = last.sender_id === conn.user1 ? conn.user2 : conn.user1;
      recipientIds.push(recipientId);
    }
    const uniqueRecipientIds = [...new Set(recipientIds)];
    let recipientNameMap = {};
    if (uniqueRecipientIds.length > 0) {
      const { data: recs } = await supabase.from('users')
        .select('id, name').in('id', uniqueRecipientIds);
      recipientNameMap = Object.fromEntries((recs || []).map(u => [u.id, u.name || 'Someone']));
    }

    let nudged = 0;
    for (const conn of activeConns) {
      const last = lastMsgMap[conn.id];
      if (!last) continue; // no messages at all — skip
      if (new Date(last.created_at).getTime() >= now - 48 * 3600000) continue; // active within 48h — skip
      if (new Date(last.created_at).getTime() < now - 14 * 24 * 3600000) continue; // >14 days stale — too cold, skip

      const lastNudge = _conversationNudgeMap.get(conn.id);
      if (lastNudge && (now - lastNudge) < NUDGE_COOLDOWN_MS) continue; // cooled down — skip

      const senderId    = last.sender_id;
      const recipientId = senderId === conn.user1 ? conn.user2 : conn.user1;
      const recipientName = recipientNameMap[recipientId] || 'your connection';

      _conversationNudgeMap.set(conn.id, now);
      sendPush([senderId],
        '💬 Don\'t let it go cold',
        `Continue your conversation with ${recipientName} — keep the momentum going.`,
        { screen: 'ChatDetail', connectionId: conn.id }).catch(() => {});
      sendWebPush([senderId],
        '💬 Don\'t let it go cold',
        `Continue your conversation with ${recipientName} — keep the momentum going.`,
        { screen: 'ChatDetail', connectionId: conn.id }).catch(() => {});
      nudged++;
    }
    if (nudged) console.log(`[ConvNudge] Sent conversation nudge to ${nudged} connection(s)`);
  } catch (e) {
    console.error('[ConvNudge] Error:', e.message);
  }
}

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'configured ✓' : 'MISSING ✗'}`);
  console.log(`Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured ✓' : 'MISSING ✗'}`);

  // Profile nudge: run immediately then every hour
  sendProfileNudges();
  setInterval(sendProfileNudges, 60 * 60 * 1000);

  // 24h expiry warning: run hourly alongside profile nudge
  sendExpiryWarnings();
  setInterval(sendExpiryWarnings, 60 * 60 * 1000);

  // Data retention: GDPR Art. 5(1)(e) storage limitation — runs every 24 hours
  async function runRetentionCycle() {
    try {
      const cutoff18m = new Date(Date.now() - 18 * 30 * 24 * 3600 * 1000).toISOString();
      const warnDeadline = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      // Step 1: schedule deletion for inactive accounts not yet warned
      const { data: toWarn } = await supabase.from('users')
        .select('id, email, name')
        .lt('last_active', cutoff18m)
        .is('deletion_scheduled_at', null)
        .neq('role', 'admin')
        .limit(100);

      for (const u of (toWarn || [])) {
        await supabase.from('users')
          .update({ deletion_scheduled_at: warnDeadline })
          .eq('id', u.id);
        if (ResendClient && u.email) {
          ResendClient.emails.send({
            from: process.env.RESEND_FROM || 'Build Your Network <onboarding@resend.dev>',
            to: u.email,
            subject: 'Your Build Your Network account will be deleted in 30 days',
            html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px"><h2 style="color:#0F766E">Account Deletion Notice</h2><p>Hi ${u.name || 'there'},</p><p>Your Build Your Network account has been inactive for over 18 months. To comply with our data retention policy, your account and all associated data will be permanently deleted in <strong>30 days</strong>.</p><p>To keep your account, simply <a href="https://app.buildyournetwork.online" style="color:#0F766E">log in</a> before then.</p><p style="font-size:12px;color:#9CA3AF">Build Your Network · buildyournetwork.online</p></div>`,
          }).catch(() => {});
        }
      }

      // Step 2: hard-delete accounts past their deletion_scheduled_at
      const now = new Date().toISOString();
      const { data: toDelete } = await supabase.from('users')
        .select('id')
        .lt('deletion_scheduled_at', now)
        .neq('role', 'admin')
        .limit(50);

      for (const u of (toDelete || [])) {
        const id = u.id;
        // Only this user's own messages are removed -- connections and the
        // other party's messages are left intact (see anonymizeUser).
        await supabase.from('messages').delete().eq('sender_id', id);
        await supabase.from('swipes').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
        await supabase.from('priority_msgs').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
        await supabase.from('reports').delete().or(`from_user.eq.${id},target_id.eq.${id}`);
        await supabase.from('blocks').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
        await supabase.from('works').delete().eq('user_id', id);
        await supabase.from('user_education').delete().eq('user_id', id);
        await supabase.from('user_work').delete().eq('user_id', id);
        await supabase.from('user_intents').delete().eq('user_id', id);
        await supabase.from('user_acquisition').delete().eq('user_id', id);
        await supabase.from('push_subscriptions').delete().eq('user_id', id);
        await supabase.from('payments').delete().eq('user_id', id);
        await supabase.from('users').update(anonymizeUser(id)).eq('id', id);
        console.log(`[Retention] Deleted inactive account ${id}`);
      }

      if ((toWarn || []).length || (toDelete || []).length) {
        console.log(`[Retention] Warned: ${(toWarn||[]).length}, Deleted: ${(toDelete||[]).length}`);
      }
    } catch(e) {
      console.error('[Retention] Cycle error:', e.message);
    }
  }
  runRetentionCycle();
  setInterval(runRetentionCycle, 24 * 60 * 60 * 1000);

  // Conversation nudge: run daily
  sendConversationNudges();
  setInterval(sendConversationNudges, 24 * 60 * 60 * 1000);

  // IndexNow — submit all indexable URLs to Bing/Yandex/Seznam on every deploy
  if (INDEXNOW_KEY) {
    setImmediate(() => {
      const BASE = process.env.BASE_URL || 'https://buildyournetwork.online';
      const host = BASE.replace(/^https?:\/\//, '');
      const citySlugUrls    = Object.keys(CITIES).map(s => BASE + '/networking-in-' + s);
      const intentSlugUrls  = ['founders-in-','startup-founders-','find-cofounders-','startup-networking-','professional-networking-']
                                .flatMap(p => Object.keys(CITIES).map(s => BASE + '/' + p + s));
      const globalCityUrls  = [...Object.keys(US_CITIES), ...Object.keys(EU_CITIES)].map(s => BASE + '/networking-in-' + s);
      const blogUrls        = ARTICLES.map(a => BASE + '/blog/' + a.slug);
      const indexNowUrls = [
        BASE + '/',
        BASE + '/what-is-byn',
        BASE + '/networking-for-founders',
        BASE + '/linkedin-alternative',
        BASE + '/linkedin-vs-byn',
        BASE + '/meetup-alternative',
        BASE + '/best-networking-platform-for-founders',
        BASE + '/networking-for-entrepreneurs',
        BASE + '/networking-for-creators',
        BASE + '/networking-for-freelancers',
        BASE + '/startup-community-india',
        BASE + '/business-networking-app',
        BASE + '/networking-for-investors',
        BASE + '/find-cofounders',
        BASE + '/startup-founders-india',
        BASE + '/professional-networking',
        BASE + '/build-professional-network',
        BASE + '/find-startup-mentor',
        BASE + '/angel-investors-india',
        BASE + '/startup-networking-events',
        BASE + '/startup-networking-us',
        BASE + '/startup-networking-europe',
        BASE + '/startup-networking-uk',
        BASE + '/startup-networking-dubai',
        BASE + '/startup-networking-turkey',
        BASE + '/startup-networking-kenya',
        BASE + '/startup-networking-south-africa',
        BASE + '/startup-networking-australia',
        BASE + '/startup-networking-singapore',
        BASE + '/blog',
        ...blogUrls,
        ...citySlugUrls,
        ...intentSlugUrls,
        ...globalCityUrls,
      ];
      const body = JSON.stringify({ host, key: INDEXNOW_KEY, urlList: indexNowUrls });
      const inReq = https.request({
        hostname: 'api.indexnow.org',
        path: '/IndexNow',
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
      }, (inRes) => {
        console.log('[SEO] IndexNow submission status:', inRes.statusCode);
      });
      inReq.on('error', (e) => console.warn('[SEO] IndexNow error:', e.message));
      inReq.write(body);
      inReq.end();
    });
  }

  // One-time idempotent migration: set all existing verified users to complete
  // so they skip onboarding on next login. Safe to run on every startup.
  setImmediate(async () => {
    try {
      const { count } = await supabase.from('users')
        .update({ onboarding_stage: 'complete' })
        .eq('email_verified', true)
        .eq('onboarding_stage', 'acquisition')
        .select('*', { count: 'exact', head: true });
      if (count) console.log(`Onboarding migration: ${count} existing verified user(s) set to complete`);
    } catch(e) {
      console.error('Onboarding startup migration error:', e.message);
    }
  });
});