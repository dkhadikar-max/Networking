import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

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
const cors      = require('cors');
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
const { createClient } = require('@supabase/supabase-js');
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
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  console.log('Supabase client initialized');
} catch (e) {
  console.error('Failed to initialize Supabase:', e.message);
  supabase = { from: () => ({ select: () => Promise.resolve({ data: null, error: e }) }) };
}

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
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──
const ALLOWED_ORIGINS = [
  'https://buildyournetwork.online',
  'https://www.buildyournetwork.online',
  // Expo / Metro dev origins
  'http://localhost:8081',
  'http://localhost:19000',
  'http://localhost:19006',
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

// ── RATE LIMITERS ──
const globalLimiter     = rateLimit({ windowMs: 60*1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, slow down' } });
const authLimiter       = rateLimit({ windowMs: 15*60*1000, max: 50, skipSuccessfulRequests: true, message: { error: 'Too many login attempts, please wait 15 minutes' } });
const uploadLimiter     = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'Upload limit reached' } });
const verifyLimiter     = rateLimit({ windowMs: 15*60*1000, max: 5, message: { error: 'Too many verification attempts — wait 15 minutes' } });
const msgLimiter        = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'Message rate limit reached' } });
// BUG FIX 2: Bootstrap brute-force — strict limiter, independent of auth limiter
const bootstrapLimiter  = rateLimit({ windowMs: 60*60*1000, max: 10, message: { error: 'Too many bootstrap attempts' } });
// BUG FIX 4: OTP send — own strict limiter so it can't share quota with login
const otpSendLimiter    = rateLimit({ windowMs: 15*60*1000, max: 5, message: { error: 'Too many OTP requests — wait 15 minutes' } });
// BUG FIX 3: Works creation — prevent spam
const worksLimiter      = rateLimit({ windowMs: 60*1000, max: 5, message: { error: 'Works creation rate limit reached' } });
// BUG FIX 9: Public profile scraping — per-IP cap
const profileViewLimiter = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'Too many profile requests' } });

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
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Named HTML routes (express.static only serves /upgrade.html, not /upgrade)
app.get('/upgrade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upgrade.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/app',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'webapp.html')));

// SEO routes
app.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.in';
  const urls = [
    { loc: BASE + '/',        priority: '1.0', freq: 'weekly'  },
    { loc: BASE + '/terms',   priority: '0.4', freq: 'monthly' },
    { loc: BASE + '/privacy', priority: '0.4', freq: 'monthly' },
    { loc: BASE + '/support', priority: '0.5', freq: 'monthly' },
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url>\n    <loc>' + u.loc + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>' + u.freq + '</changefreq>\n    <priority>' + u.priority + '</priority>\n  </url>').join('\n') +
    '\n</urlset>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});
app.get('/robots.txt', (req, res) => {
  const BASE = process.env.BASE_URL || 'https://buildyournetwork.in';
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send('User-agent: *\nAllow: /\nAllow: /terms\nAllow: /privacy\nAllow: /support\nAllow: /sitemap.xml\nDisallow: /api/\nDisallow: /app\nDisallow: /admin\nDisallow: /upgrade\nSitemap: ' + BASE + '/sitemap.xml\n');
});


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
  res.status(404).send(`
    <!DOCTYPE html><html><head><title>Coming Soon</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:80px;background:#f9f9f9}
    h2{color:#0F766E}p{color:#555}</style></head><body>
    <h2>Android APK — Coming Soon</h2>
    <p>The app is being prepared for download. Check back shortly.</p>
    <a href="/" style="color:#0F766E">Back to home</a>
    </body></html>
  `);
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

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});

const upload = multer({
  storage: cloudinaryStorage || diskStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
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
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim()
    .slice(0, 1000);
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
  r.is_recently_active = !!(u.last_active &&
    (Date.now() - new Date(u.last_active).getTime()) < 30 * 60 * 1000);
  return r;
}

function clean(u) {
  if (!u) return null;
  const r = { ...u };
  delete r.password;
  delete r.otp_code;
  delete r.otp_expires_at;
  delete r.push_token;
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

function getInsight(a, b) {
  const shared = (a.interests||[]).filter(s=>(b.interests||[]).map(x=>x.toLowerCase()).includes(s.toLowerCase()));
  if (shared.length) return 'Shared curiosity in ' + shared.slice(0,2).join(' & ');
  if (a.currently_exploring && b.working_on) {
    const w = a.currently_exploring.toLowerCase().split(/\W+/).filter(x=>x.length>3);
    if (w.some(x=>b.working_on.toLowerCase().includes(x))) return "Their work connects with what you're exploring";
  }
  return b.intent ? 'Looking to ' + b.intent.replace(/-/g,' ') : 'Could be worth a conversation';
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

// ── FIXED: AUTH MIDDLEWARE ──
// Verifies token, checks user exists in DB, checks banned status,
// and attaches full user data to avoid duplicate DB queries in guards.
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
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
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { data: user, error } = await supabase.from('users')
      .select('role,banned').eq('id', decoded.id).maybeSingle();
    if (error) return res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
    if (!user || user.banned) return res.status(403).json({ error: 'Access denied' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, service: 'buildyournetwork', timestamp: new Date().toISOString() });
});

// ── FIXED: SIGNUP with email validation ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── OTP HELPER ──
function generateOtp() {
  // crypto is imported at the top — randomInt is cryptographically secure
  return String(crypto.randomInt(100000, 1000000));
}

async function sendOtpEmail(toEmail, otp, name) {
  if (!ResendClient) {
    console.error('[OTP] Resend client not created — RESEND_API_KEY env var is missing or empty in Railway');
    return false;
  }
  // onboarding@resend.dev is a Resend sandbox sender that ONLY delivers to the
  // Resend account owner's email. For production, set RESEND_FROM to an address
  // on a verified domain (e.g. noreply@buildyournetwork.online).
  const FROM = process.env.RESEND_FROM || 'Build Your Network <onboarding@resend.dev>';
  console.log(`[OTP] Sending from="${FROM}" to="${toEmail}"`);
  try {
    await ResendClient.emails.send({
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
    return true;
  } catch(e) {
    // Log full error so Railway shows exactly what Resend rejected (e.g. 403 domain not verified)
    console.error('[OTP] Email send failed:', e.message, e.statusCode ?? '', JSON.stringify(e.response ?? {}));
    return false;
  }
}

app.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    // Check email uniqueness
    const { data: existing } = await supabase.from('users')
      .select('id').eq('email', normalizedEmail).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const id   = uuidv4();
    const role = ADMIN_EMAILS.includes(normalizedEmail) ? 'admin' : 'user';
    const newUser = {
      id, email: normalizedEmail, password: await bcrypt.hash(password, 12), name: sanitize(name).slice(0, 120),
      bio: '', photos: [], instagram: '', linkedin: '', website: '',
      location: '', lat: null, lng: null, remote: false,
      skills: [], interests: [],
      currently_exploring: '', working_on: '', interested_in: '',
      intent: 'explore-network', role, premium: false,
      trust_score: 0, profile_score: 0, is_profile_complete: false,
      verification: { status: 'none', confidence: 0 },
      banned: false, created_at: new Date().toISOString()
    };

    newUser.trust_score         = calcTrust(newUser);
    newUser.profile_score       = calcProfileScore(newUser);
    newUser.is_profile_complete = newUser.profile_score >= 70;

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    newUser.otp_code       = otp;
    newUser.otp_expires_at = otpExpiry;
    newUser.email_verified = false;

    const { data: inserted, error: insertErr } = await supabase.from('users')
      .insert(newUser).select().single();
    if (insertErr) throw new Error(insertErr.message);

    // Send OTP email (non-blocking — don't fail signup if email fails)
    sendOtpEmail(normalizedEmail, otp, newUser.name).catch(() => {});

    const token = jwt.sign({ id, email: normalizedEmail, name: newUser.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: clean(inserted), email_verified: false });
  } catch(e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── LOGIN ──
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    email = String(email).trim().toLowerCase();
    const { data: user } = await supabase.from('users')
      .select('*').eq('email', email).maybeSingle();
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (user.banned) return res.status(403).json({ error: 'Account restricted' });

    // Auto-grant admin if in ADMIN_EMAILS list (survives DB resets)
    const updates = {};
    if (ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== 'admin') {
      updates.role = 'admin';
      user.role = 'admin';
    }

    // Refresh scores
    const ps = calcProfileScore(user);
    updates.profile_score       = ps;
    updates.is_profile_complete = ps >= 70;
    updates.trust_score         = calcTrust(user);

    await supabase.from('users').update(updates).eq('id', user.id);
    Object.assign(user, updates);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    // NOTE: OTP is NOT auto-sent on login. The client calls /api/auth/send-otp
    // explicitly when it detects email_verified === false, so the user sees a
    // proper "Sending code…" state rather than a silent background fire-and-forget.
    res.json({ token, user: clean(user), email_verified: !!user.email_verified });
  } catch(e) {
    console.error('Login error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── SEND / RESEND OTP ──
// BUG FIX 4: Use dedicated otpSendLimiter (5/15min) not authLimiter (50/15min shared with login)
app.post('/api/auth/send-otp', otpSendLimiter, auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('email, name, email_verified').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    // NOTE: do NOT short-circuit for email_verified === true.
    // OTP is also used as per-device trust verification — a user who verified on the
    // Android app still needs to verify on the web browser (new device).
    // Bypassing here means ANY 6-digit code would be accepted on verify-otp too.

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('users')
      .update({ otp_code: otp, otp_expires_at: otpExpiry }).eq('id', req.user.id);

    const sent = await sendOtpEmail(user.email, otp, user.name);
    if (!sent) {
      // Email delivery failed — surface a real error so the client shows it to the user
      console.error(`[OTP] Delivery failed for ${user.email} — check RESEND_API_KEY and RESEND_FROM env vars`);
      return res.status(503).json({
        error: 'Could not send verification email. Please check your email address or try again shortly.',
      });
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Send OTP error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// ── GET ME ──
app.get('/api/me', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const ps = calcProfileScore(user);
    await supabase.from('users').update({
      profile_score: ps, is_profile_complete: ps >= 70
    }).eq('id', user.id);
    user.profile_score       = ps;
    user.is_profile_complete = ps >= 70;

    const { data: worksData } = await supabase.from('works')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    const u = clean(user);
    u.trust_steps = trustSteps(user);
    u.works = worksData || [];
    res.json(u);
  } catch(e) {
    console.error('Get me error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// ── PUBLIC PROFILE ──
// BUG FIX 9: Added per-IP rate limit to prevent scraping all user profiles
app.get('/api/profiles/:id', profileViewLimiter, async (req, res) => {
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
    res.status(500).json({ error: e.message });
  }
});

// ── SUBMIT / UPDATE REVIEW ──
app.post('/api/users/:id/review', auth, async (req, res) => {
  try {
    const reviewedId = req.params.id;
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
    res.status(500).json({ error: e.message });
  }
});

// ── GET REVIEW SUMMARY ──
app.get('/api/users/:id/reviews', async (req, res) => {
  try {
    const { data: reviews } = await supabase.from('user_reviews')
      .select('rating,tags,created_at')
      .eq('reviewed_id', req.params.id)
      .order('created_at', { ascending: false });
    res.json(buildReviewSummary(reviews || []));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DISCOVER ──
app.get('/api/discover', auth, profileGuard, trustGuard, async (req, res) => {
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

    // Build exclusion sets
    const { data: swipedData } = await supabase.from('swipes')
      .select('to_user').eq('from_user', req.user.id);
    const swiped = new Set((swipedData || []).map(s => s.to_user));

    const { data: connData } = await supabase.from('connections')
      .select('user1, user2')
      .or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`);
    const connected = new Set((connData || [])
      .map(c => c.user1 === req.user.id ? c.user2 : c.user1));

    const { data: blockData } = await supabase.from('blocks')
      .select('from_user, to_user')
      .or(`from_user.eq.${req.user.id},to_user.eq.${req.user.id}`);
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

    // FIXED: Limit candidates to prevent loading entire DB into memory
    const { data: allUsers } = await supabase.from('users')
      .select('*')
      .or('banned.is.null,banned.eq.false')
      .gte('trust_score', 10)
      .neq('id', req.user.id)
      .limit(500);

    let candidates = (allUsers || []).filter(u => !excluded.has(u.id));

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
        matchScore: Math.min(base + (isActive ? ACTIVE_BOOST : 0), 99),
        insight:    getInsight(me, u),
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
    res.status(500).json({ error: e.message });
  }
});

// ── SEARCH ──
// BUG FIX 8: Added profileGuard + trustGuard — search was bypassing discovery restrictions
app.get('/api/search', auth, profileGuard, trustGuard, async (req, res) => {
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
    res.status(500).json({ error: e.message });
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
          expires_at: new Date(now.getTime() + 5*24*3600000).toISOString(),
          first_response_deadline: new Date(now.getTime() + 48*3600000).toISOString(),
          user1_responded: false, user2_responded: false,
          active: false, status: 'active'
        });
        if (connErr) throw connErr;
        match = true;

        const [{ data: me2 }, { data: them }] = await Promise.all([
          supabase.from('users').select('name').eq('id', req.user.id).maybeSingle(),
          supabase.from('users').select('name').eq('id', targetId).maybeSingle(),
        ]);
        const myName    = me2   ? me2.name   : 'Someone';
        const theirName = them  ? them.name  : 'Someone';
        sendPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(()=>{});
        sendPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(()=>{});
      }
    }
    res.json({ match, direction, connectionId });
  } catch(e) {
    console.error('Swipe error:', e);
    res.status(500).json({ error: e.message });
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
    const { data: otherUsers } = await supabase.from('users').select('*').in('id', otherIds);
    const userMap = Object.fromEntries((otherUsers || []).map(u => [u.id, u]));

    // Fetch only the last message and count per connection (no full message history load)
    const connIds = active.map(c => c.id);
    const lastMsgMap  = {};
    const msgCountMap = {};
    if (connIds.length > 0) {
      // Get last message per connection — order DESC, limit 1 per group via in-memory grouping
      const { data: recentMsgs } = await supabase.from('messages')
        .select('*').in('connection_id', connIds)
        .order('created_at', { ascending: false })
        .limit(connIds.length * 2); // at most 2 per conn to reliably get last; much less than all

      const { data: msgCounts } = await supabase.from('messages')
        .select('connection_id', { count: 'exact' })
        .in('connection_id', connIds);

      // Build last-message map (first occurrence of each connId = most recent)
      (recentMsgs || []).forEach(m => {
        if (!lastMsgMap[m.connection_id]) lastMsgMap[m.connection_id] = m;
      });
      // Build count map
      const seenIds = new Set();
      (recentMsgs || []).forEach(m => {
        msgCountMap[m.connection_id] = (msgCountMap[m.connection_id] || 0) + 1;
        seenIds.add(m.connection_id);
      });
    }

    const result = active.map(c => {
      const otherId  = c.user1 === req.user.id ? c.user2 : c.user1;
      const other    = userMap[otherId];
      const lastMsg  = lastMsgMap[c.id] ? mapMessage(lastMsgMap[c.id]) : null;
      const hoursLeft = c.active ? null : Math.max(0, Math.round((new Date(c.expires_at) - now) / 3600000));
      return {
        connection: c, user: cleanPublic(other),
        lastMessage: lastMsg, hoursLeft, active: !!c.active,
        msgCount: msgCountMap[c.id] || 0
      };
    });
    res.json(result);
  } catch(e) {
    console.error('Connections error:', e);
    res.status(500).json({ error: e.message });
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
    res.json((msgs || []).map(mapMessage));
  } catch(e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: e.message });
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

    res.json(mapMessage({ id: msgId, connection_id: conn.id, sender_id: req.user.id, text: text.trim(), created_at: now }));
  } catch(e) {
    console.error('Send message error:', e);
    res.status(500).json({ error: e.message });
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
    res.json({ ok: true, remaining: limit - monthCount - 1 });
  } catch(e) {
    console.error('Priority message error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// ── BLOCK ──
app.post('/api/block', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/works/:id', auth, async (req, res) => {
  try {
    const { data: work } = await supabase.from('works')
      .select('id').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (!work) return res.status(404).json({ error: 'Not found' });
    await supabase.from('works').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Delete work error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// ── FIXED: ADMIN ROUTES ──
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// FIXED: Full cascade delete including swipes, priority_msgs, and works
app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { data: user } = await supabase.from('users').select('id, role').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete another admin' });
    // Cascade: remove all related records first
    await supabase.from('connections').delete().or(`user1.eq.${id},user2.eq.${id}`);
    await supabase.from('messages').delete().eq('sender_id', id);
    await supabase.from('swipes').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('priority_msgs').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('reports').delete().or(`from_user.eq.${id},target_id.eq.${id}`);
    await supabase.from('blocks').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('works').delete().eq('user_id', id);
    await supabase.from('users').delete().eq('id', id);
    await auditLog(req.user.id, 'delete_user', id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin delete error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/audit', adminAuth, async (req, res) => {
  // Return in-memory buffer (fast) + optionally fetch from DB for full history
  res.json(adminAuditLog.slice(-200).reverse());
});

// ── ADMIN BOOTSTRAP ──
// BUG FIX 2: bootstrapLimiter (10/hr) prevents brute-forcing ADMIN_SECRET
app.post('/api/admin/bootstrap', bootstrapLimiter, async (req, res) => {
  try {
    let { email, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Invalid secret' });
    if (!email) return res.status(400).json({ error: 'Email required' });
    email = String(email).trim().toLowerCase();
    const { data: user } = await supabase.from('users')
      .select('id').eq('email', email).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    await supabase.from('users').update({ role: 'admin' }).eq('id', user.id);
    res.json({ ok: true });
  } catch(e) {
    console.error('Admin bootstrap error:', e);
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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

    if (sig !== expected) return res.status(400).json({ error: 'Invalid webhook signature' });

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
    res.status(500).json({ error: e.message });
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

    res.json({ stage: 'intent' });
  } catch(e) {
    console.error('Onboarding acquisition error:', e);
    res.status(500).json({ error: e.message });
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

    res.json({ stage: 'profile' });
  } catch(e) {
    console.error('Onboarding intent error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/onboarding/profile — Screen 3: "Complete your profile"
// Every field is optional. An empty body is a valid submission.
app.post('/api/onboarding/profile', onboardingLimiter, auth, async (req, res) => {
  try {
    const user  = req.userData;
    const stage = user.onboarding_stage || 'acquisition';
    if (stage !== 'profile') return res.status(409).json({ error: 'Wrong onboarding stage', stage });

    const { headline, bio, profession, industry, experience_level, location, interests, education, work, social_links } = req.body;

    // Validate
    const errors = [];
    let cleanHeadline = headline ? String(headline).trim().slice(0, 80) : undefined;
    if (cleanHeadline === '') cleanHeadline = undefined;

    let cleanBio = (bio !== undefined && bio !== null) ? String(bio).trim() : undefined;
    if (cleanBio === '') cleanBio = undefined;
    if (cleanBio !== undefined && cleanBio.length < 30) {
      errors.push({ field: 'bio', error: 'Bio must be at least 30 characters long.' });
    }
    if (cleanBio && cleanBio.length > 180) cleanBio = cleanBio.slice(0, 180);

    const cleanExp = (experience_level && VALID_EXP_LEVELS.includes(experience_level)) ? experience_level : undefined;
    if (experience_level && !cleanExp) errors.push({ field: 'experience_level', error: 'Invalid experience level' });

    if (errors.length) return res.status(400).json({ errors });

    // Build user updates
    const userUpdates = { onboarding_stage: 'complete' };
    if (cleanHeadline !== undefined) userUpdates.headline  = sanitize(cleanHeadline);
    if (cleanBio      !== undefined) userUpdates.bio       = sanitize(cleanBio);
    if (profession) userUpdates.profession  = sanitize(String(profession).trim().slice(0, 100));
    if (industry)   userUpdates.industry    = sanitize(String(industry).trim().slice(0, 100));
    if (cleanExp)   userUpdates.experience_level = cleanExp;
    if (location)   userUpdates.location    = sanitize(String(location).trim().slice(0, 100));

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

    res.json({ stage: 'complete', trust_score: userUpdates.trust_score });
  } catch(e) {
    console.error('Onboarding profile error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── FALLBACK ──
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'configured ✓' : 'MISSING ✗'}`);
  console.log(`Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured ✓' : 'MISSING ✗'}`);

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