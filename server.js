const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Expo } = require('expo-server-sdk');
// ── ENVIRONMENT VALIDATION ─────────────────────────────────────────────────
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('CRITICAL: Missing environment variables: ' + missingEnvVars.join(', '));
}

// ── SUPABASE CLIENT ──────────────────────────────────────────────────────────
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
  { auth: { persistSession: false } }
);

// ── CLOUDINARY CONFIG ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key:    process.env.CLOUDINARY_API_KEY    || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});
const USE_CLOUDINARY = !!(process.env.CLOUDINARY_CLOUD_NAME);

// ── EXPO PUSH ─────────────────────────────────────────────────────────────────
const expo = new Expo();

// ── APP SETUP ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET   = process.env.JWT_SECRET   || 'networkapp_secret_2024';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'adminpass2024';
// Comma-separated emails that are always admin regardless of DB state
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'dkhadikar@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

// ── SECURITY HEADERS ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 60*1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, slow down' } });
// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://buildyournetwork.online',
  'https://www.buildyournetwork.online',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://buildyournetwork.up.railway.app',
];

if (process.env.ALLOWED_ORIGIN && process.env.ALLOWED_ORIGIN !== '*') {
  allowedOrigins.push(process.env.ALLOWED_ORIGIN);
}
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    console.warn('CORS blocked origin: ' + origin);
    return callback(new Error('Origin ' + origin + ' not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
}));

app.options('*', cors());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now()-start}ms`);
  });
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ── MULTER / STORAGE ─────────────────────────────────────────────────────────
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

// ── FILE URL HELPER ───────────────────────────────────────────────────────────
function getFileUrl(file) {
  if (USE_CLOUDINARY && file.path) return file.path;
  return '/uploads/' + file.filename;
}

async function deleteCloudinaryPhoto(url) {
  if (!USE_CLOUDINARY || !url) return;
  try {
    const match = url.match(/\/networkapp\/([^/.]+)/);
    if (match) await cloudinary.uploader.destroy('networkapp/' + match[1]);
  } catch(e) { console.error('Cloudinary delete error:', e.message); }
}

// ── SANITIZATION ──────────────────────────────────────────────────────────────
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/<[^>]*>/g, '').replace(/[<>"]/g, '').trim().slice(0, 1000);
}
function sanitizeObj(obj, fields) {
  fields.forEach(f => { if (obj[f] !== undefined) obj[f] = sanitize(String(obj[f])); });
  return obj;
}
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

// ── CLEAN HELPERS ─────────────────────────────────────────────────────────────
function cleanPublic(u) {
  if (!u) return null;
  const r = { ...u };
  delete r.password;
  delete r.email;
  delete r.lat; delete r.lng;
  delete r.banned;
  r.is_recently_active = !!(u.last_active &&
    (Date.now() - new Date(u.last_active).getTime()) < 30 * 60 * 1000);
  return r;
}

function clean(u) {
  if (!u) return null;
  const r = { ...u };
  delete r.password;
  return r;
}

// Map DB message (sender_id) → API message (from)
function mapMessage(m) {
  if (!m) return null;
  const r = { ...m };
  r.from = r.sender_id;
  delete r.sender_id;
  return r;
}

// Map DB priority msg (from_user / to_user) → API (from / to)
function mapPriorityMsg(pm) {
  if (!pm) return null;
  const r = { ...pm };
  r.from = r.from_user;
  r.to   = r.to_user;
  delete r.from_user; delete r.to_user;
  return r;
}

// ── TRUST SCORE (7 steps, max 100) ───────────────────────────────────────────
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

// ── PROFILE COMPLETION SCORE ──────────────────────────────────────────────────
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

// ── MATCH ENGINE ──────────────────────────────────────────────────────────────
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
  if (a.lat && b.lat && a.lng && b.lng) {
    const d = haversine(parseFloat(a.lat),parseFloat(a.lng),parseFloat(b.lat),parseFloat(b.lng));
    location = d<10?20:d<50?15:d<200?8:3;
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

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function todayKey()     { return new Date().toISOString().slice(0,10); }
function thisMonthKey() { return new Date().toISOString().slice(0,7);  }

// ── DAILY SWIPE COUNT (based on actual swipes, not profile views) ─────────────
async function getTodaySwipeCount(userId) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data } = await supabase.from('swipes')
    .select('id', { count: 'exact', head: true })
    .eq('from_user', userId)
    .gte('created_at', todayStart.toISOString());
  return data ? (data.length || 0) : 0;
}

async function getTodaySwipeCountExact(userId) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count } = await supabase.from('swipes')
    .select('*', { count: 'exact', head: true })
    .eq('from_user', userId)
    .gte('created_at', todayStart.toISOString());
  return count || 0;
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
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

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // Update last_active non-blocking after every authenticated request
    setImmediate(async () => {
      try {
        await supabase.from('users')
          .update({ last_active: new Date().toISOString() })
          .eq('id', req.user.id);
      } catch(e) { /* non-critical */ }
    });
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

async function adminAuth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase.from('users')
      .select('role').eq('id', decoded.id).maybeSingle();
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = decoded;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

async function profileGuard(req, res, next) {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    const score = user ? calcProfileScore(user) : 0;
    if (!user || score < 70) {
      return res.status(403).json({
        error: 'Complete your profile to continue',
        code:  'PROFILE_INCOMPLETE',
      });
    }
    next();
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
}

async function trustGuard(req, res, next) {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
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
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
}

// ── ADMIN AUDIT LOG (in-memory, last 1000 entries) ───────────────────────────
const adminAuditLog = [];
function auditLog(adminId, action, targetId) {
  adminAuditLog.push({ adminId, action, targetId, at: new Date().toISOString() });
  if (adminAuditLog.length > 1000) adminAuditLog.shift();
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, service: 'buildyournetwork', timestamp: new Date().toISOString() });
});
// ── SIGNUP ────────────────────────────────────────────────────────────────────
app.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    // Check email uniqueness
    const { data: existing } = await supabase.from('users')
      .select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const id   = uuidv4();
    const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';
    const newUser = {
      id, email, password: await bcrypt.hash(password, 12), name,
      bio: '', photos: [], instagram: '', linkedin: '', website: '',
      location: '', lat: null, lng: null, remote: false,
      skills: [], interests: [],
      currently_exploring: '', working_on: '', interested_in: '',
      intent: 'explore-network', role, premium: false,
      trust_score: 0, profile_score: 0, is_profile_complete: false,
      verification: { status: 'none', confidence: 0 },
      banned: false, created_at: new Date().toISOString()
    };

    // Calculate initial scores
    newUser.trust_score         = calcTrust(newUser);
    newUser.profile_score       = calcProfileScore(newUser);
    newUser.is_profile_complete = newUser.profile_score >= 70;

    const { data: inserted, error: insertErr } = await supabase.from('users')
      .insert(newUser).select().single();
    if (insertErr) throw new Error(insertErr.message);

    const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: clean(inserted) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
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
    res.json({ token, user: clean(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET ME ────────────────────────────────────────────────────────────────────
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PROFILE STATUS ────────────────────────────────────────────────────────────
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── UPDATE ME ─────────────────────────────────────────────────────────────────
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADD PHOTO ─────────────────────────────────────────────────────────────────
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE PHOTO ──────────────────────────────────────────────────────────────
app.delete('/api/me/photos/:idx', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const idx = parseInt(req.params.idx);
    const photos = user.photos || [];
    if (isNaN(idx) || idx < 0 || idx >= photos.length)
      return res.status(400).json({ error: 'Invalid index' });

    const removedUrl = photos[idx];
    const newPhotos  = photos.filter((_, i) => i !== idx);

    const merged  = { ...user, photos: newPhotos };
    const ts      = calcTrust(merged);
    const ps      = calcProfileScore(merged);
    const complete = ps >= 70;

    await supabase.from('users').update({
      photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete
    }).eq('id', user.id);

    deleteCloudinaryPhoto(removedUrl).catch(() => {});
    res.json({ photos: newPhotos, trust_score: ts, profile_score: ps, is_profile_complete: complete });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY ────────────────────────────────────────────────────────────────────
app.post('/api/me/verify', verifyLimiter, auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { confidence } = req.body;
    const status = confidence >= 70 ? 'verified' : 'failed';
    const verification = { status, confidence: confidence || 0, verified_at: new Date().toISOString() };
    const merged = { ...user, verification };
    const ts = calcTrust(merged);

    await supabase.from('users').update({ verification, trust_score: ts }).eq('id', user.id);
    res.json({ status, confidence, trust_score: ts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUSH TOKEN ────────────────────────────────────────────────────────────────
app.post('/api/me/push-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !Expo.isExpoPushToken(token))
      return res.status(400).json({ error: 'Invalid Expo push token' });
    const { error } = await supabase.from('users')
      .update({ push_token: token }).eq('id', req.user.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUBLIC PROFILE ────────────────────────────────────────────────────────────
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { data: worksData } = await supabase.from('works')
      .select('*').eq('user_id', user.id);

    const u = cleanPublic(user);
    u.works = worksData || [];
    res.json(u);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DISCOVER ──────────────────────────────────────────────────────────────────
app.get('/api/discover', auth, profileGuard, trustGuard, async (req, res) => {
  try {
    const { data: me } = await supabase.from('users')
      .select('*').eq('id', req.user.id).maybeSingle();
    if (!me) return res.status(404).json({ error: 'User not found' });
    if (me.banned) return res.status(403).json({ error: 'Account restricted' });

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

    const { skill, intent, location, remote, interest, sort = 'relevance', radius } = req.query;
    const radiusKm = radius ? parseInt(radius) : null;

    // Fetch candidates with basic quality gate
    const { data: allUsers } = await supabase.from('users')
      .select('*')
      .or('banned.is.null,banned.eq.false')
      .gte('trust_score', 10)
      .neq('id', req.user.id);

    let candidates = (allUsers || []).filter(u => !excluded.has(u.id));

    // Apply filters
    if (skill)    candidates = candidates.filter(u => (u.skills||[]).some(s => s.toLowerCase().includes(skill.toLowerCase())));
    if (intent)   candidates = candidates.filter(u => u.intent === intent);
    if (location) candidates = candidates.filter(u => (u.location||'').toLowerCase().includes(location.toLowerCase()));
    if (remote === 'true') candidates = candidates.filter(u => u.remote);
    if (interest) candidates = candidates.filter(u => (u.interests||[]).some(s => s.toLowerCase().includes(interest.toLowerCase())));

    if (radiusKm && me.lat && me.lng) {
      candidates = candidates.filter(u => {
        if (!u.lat || !u.lng) return true;
        return haversine(parseFloat(me.lat), parseFloat(me.lng), parseFloat(u.lat), parseFloat(u.lng)) <= radiusKm;
      });
    }

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
      const dist = (me.lat && u.lat && me.lng && u.lng)
        ? Math.round(haversine(parseFloat(me.lat), parseFloat(me.lng), parseFloat(u.lat), parseFloat(u.lng)))
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
app.get('/api/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = q.trim().toLowerCase();
    const { data: allUsers } = await supabase.from('users')
      .select('*')
      .or('banned.is.null,banned.eq.false')
      .neq('id', req.user.id);

    const results = (allUsers || []).filter(u =>
      (u.name||'').toLowerCase().includes(term) ||
      (u.interests||[]).some(i => i.toLowerCase().includes(term)) ||
      (u.skills||[]).some(s => s.toLowerCase().includes(term))
    ).slice(0, 20).map(u => cleanPublic(u));

    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SWIPE ─────────────────────────────────────────────────────────────────────
app.post('/api/swipe', auth, profileGuard, trustGuard, async (req, res) => {
  try {
    const { targetId, direction } = req.body;
    if (!targetId || !['right','left'].includes(direction))
      return res.status(400).json({ error: 'Invalid' });

    // Check for duplicate swipe
    const { data: dupSwipe } = await supabase.from('swipes')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (dupSwipe) return res.json({ match: false, duplicate: true });

    // Daily swipe cap
    const { data: swiper } = await supabase.from('users')
      .select('premium').eq('id', req.user.id).maybeSingle();
    const SWIPE_LIMIT = (swiper && swiper.premium) ? 200 : 30;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: todaySwipes } = await supabase.from('swipes')
      .select('created_at').eq('from_user', req.user.id).gte('created_at', todayStart.toISOString());
    if ((todaySwipes || []).length >= SWIPE_LIMIT)
      return res.status(429).json({ error: 'Daily swipe limit reached', limit: SWIPE_LIMIT, code: 'SWIPE_LIMIT' });

    // Insert swipe
    await supabase.from('swipes').insert({
      from_user: req.user.id, to_user: targetId, direction, created_at: new Date().toISOString()
    });

    let match = false, connectionId = null;
    if (direction === 'right') {
      // Check if they already swiped right on me
      const { data: theirSwipe } = await supabase.from('swipes')
        .select('id').eq('from_user', targetId).eq('to_user', req.user.id).eq('direction', 'right').maybeSingle();
      if (theirSwipe) {
        const now = new Date();
        connectionId = uuidv4();
        await supabase.from('connections').insert({
          id: connectionId, user1: req.user.id, user2: targetId,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 5*24*3600000).toISOString(),
          first_response_deadline: new Date(now.getTime() + 48*3600000).toISOString(),
          user1_responded: false, user2_responded: false,
          active: false, status: 'active'
        });
        match = true;

        // Notify both users
        const { data: me2 } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
        const { data: them } = await supabase.from('users').select('name').eq('id', targetId).maybeSingle();
        const myName    = me2   ? me2.name   : 'Someone';
        const theirName = them  ? them.name  : 'Someone';
        sendPush([targetId],    '🎉 New Match!', `You matched with ${myName}! Say hello.`,    { screen: 'Chat', connectionId }).catch(()=>{});
        sendPush([req.user.id], '🎉 New Match!', `You matched with ${theirName}! Say hello.`, { screen: 'Chat', connectionId }).catch(()=>{});
      }
    }
    res.json({ match, direction, connectionId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CONNECTIONS ───────────────────────────────────────────────────────────────
app.get('/api/connections', auth, profileGuard, async (req, res) => {
  try {
    const now = new Date();
    const { data: conns } = await supabase.from('connections')
      .select('*')
      .or(`user1.eq.${req.user.id},user2.eq.${req.user.id}`);

    const active = (conns || []).filter(c => c.active || new Date(c.expires_at) > now);
    if (!active.length) return res.json([]);

    // Batch fetch other users
    const otherIds = active.map(c => c.user1 === req.user.id ? c.user2 : c.user1);
    const { data: otherUsers } = await supabase.from('users').select('*').in('id', otherIds);
    const userMap = Object.fromEntries((otherUsers || []).map(u => [u.id, u]));

    // Batch fetch messages for all these connections
    const connIds = active.map(c => c.id);
    const { data: allMsgs } = await supabase.from('messages')
      .select('*').in('connection_id', connIds).order('created_at', { ascending: true });

    // Group messages by connection
    const lastMsgMap  = {};
    const msgCountMap = {};
    (allMsgs || []).forEach(m => {
      lastMsgMap[m.connection_id]  = m; // will end up as last since ordered asc
      msgCountMap[m.connection_id] = (msgCountMap[m.connection_id] || 0) + 1;
    });

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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET MESSAGES ──────────────────────────────────────────────────────────────
app.get('/api/messages/:connId', auth, profileGuard, async (req, res) => {
  try {
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });

    const { data: msgs } = await supabase.from('messages')
      .select('*').eq('connection_id', req.params.connId).order('created_at', { ascending: true });
    res.json((msgs || []).map(mapMessage));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEND MESSAGE ──────────────────────────────────────────────────────────────
app.post('/api/messages/:connId', msgLimiter, auth, profileGuard, async (req, res) => {
  try {
    const { data: conn } = await supabase.from('connections')
      .select('*').eq('id', req.params.connId).maybeSingle();
    if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
      return res.status(403).json({ error: 'Access denied' });
    if (!conn.active && new Date(conn.expires_at) < new Date())
      return res.status(400).json({ error: 'Connection expired' });

    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

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

    // Non-blocking reply tracking
    ;(async () => {
      try {
        const { data: sender } = await supabase.from('users')
          .select('*').eq('id', req.user.id).maybeSingle();
        if (!sender) return;

        const recipientId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
        const { data: prevMsgs } = await supabase.from('messages')
          .select('created_at').eq('connection_id', conn.id).eq('sender_id', recipientId)
          .order('created_at', { ascending: false }).limit(1);

        const senderUpdates = {};
        if (prevMsgs && prevMsgs.length > 0) {
          const replyMs  = Date.now() - new Date(prevMsgs[0].created_at).getTime();
          const replyMin = Math.round(replyMs / 60000);
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
      } catch(e) { /* non-critical */ }
    })();

    // Notify recipient
    const recipientId = conn.user1 === req.user.id ? conn.user2 : conn.user1;
    const { data: senderUser } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    const senderName = senderUser ? senderUser.name : 'Someone';
    const preview    = text.trim().slice(0, 60) + (text.trim().length > 60 ? '…' : '');
    sendPush([recipientId], `💬 ${senderName}`, preview, { screen: 'ChatDetail', connectionId: conn.id }).catch(()=>{});

    res.json(mapMessage({ id: msgId, connection_id: conn.id, sender_id: req.user.id, text: text.trim(), created_at: now }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PRIORITY MESSAGE ──────────────────────────────────────────────────────────
app.post('/api/priority-message', auth, profileGuard, async (req, res) => {
  try {
    const { targetId, text } = req.body;
    if (!targetId || !text) return res.status(400).json({ error: 'targetId and text required' });

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

    const cleanText = text.trim().replace(URL_PATTERN, '[link removed]');
    const pm = { id: uuidv4(), from_user: req.user.id, to_user: targetId,
      text: cleanText, month, read: false, created_at: new Date().toISOString() };
    await supabase.from('priority_msgs').insert(pm);

    sendPush([targetId], `⚡ Priority Message from ${sender.name}`, cleanText.slice(0, 80), { screen: 'PriorityMessages' }).catch(()=>{});
    res.json({ ok: true, remaining: limit - monthCount - 1 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET PRIORITY MESSAGES ─────────────────────────────────────────────────────
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
      const { data: senders } = await supabase.from('users').select('*').in('id', senderIds);
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WHO LIKED YOU ─────────────────────────────────────────────────────────────
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
      // Free users: return count + blurred photo previews (no identifying info)
      const previewData = filteredIds.length > 0
        ? await supabase.from('users').select('id, photos').in('id', filteredIds.slice(0, 6))
        : { data: [] };
      return res.json({
        premium_required: true,
        count,
        previews: (previewData.data || []).map(u => ({ id: u.id, photos: u.photos || [] })),
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── REPORT ────────────────────────────────────────────────────────────────────
app.post('/api/report', auth, async (req, res) => {
  try {
    const { targetId, reason } = req.body;
    if (!targetId || !reason) return res.status(400).json({ error: 'Required fields missing' });

    await supabase.from('reports').insert({
      id: uuidv4(), from_user: req.user.id, target_id: targetId, reason,
      created_at: new Date().toISOString()
    });

    // Penalize trust score (non-critical)
    const { data: target } = await supabase.from('users')
      .select('trust_score').eq('id', targetId).maybeSingle();
    if (target) {
      await supabase.from('users').update({
        trust_score: Math.max(0, (target.trust_score || 0) - 10)
      }).eq('id', targetId);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BLOCK ─────────────────────────────────────────────────────────────────────
app.post('/api/block', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    const { data: existing } = await supabase.from('blocks')
      .select('id').eq('from_user', req.user.id).eq('to_user', targetId).maybeSingle();
    if (!existing) {
      await supabase.from('blocks').insert({
        from_user: req.user.id, to_user: targetId, created_at: new Date().toISOString()
      });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WORKS ─────────────────────────────────────────────────────────────────────
app.post('/api/works', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description, url } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const work = {
      id: uuidv4(), user_id: req.user.id, title,
      description: description || '', url: url || '',
      image: req.file ? getFileUrl(req.file) : '',
      created_at: new Date().toISOString()
    };
    const { data: inserted } = await supabase.from('works').insert(work).select().single();
    res.json(inserted || work);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/works/:id', auth, async (req, res) => {
  try {
    const { data: work } = await supabase.from('works')
      .select('id').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (!work) return res.status(404).json({ error: 'Not found' });
    await supabase.from('works').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CONVERSATION STARTERS ─────────────────────────────────────────────────────
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { data: allUsers } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    res.json((allUsers || []).map(u => {
      const u2 = clean(u);
      u2.trust_steps = trustSteps(u);
      return u2;
    }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { targetId, banned } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('id', targetId).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    await supabase.from('users').update({ banned: !!banned }).eq('id', targetId);
    auditLog(req.user.id, banned ? 'ban' : 'unban', targetId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    auditLog(req.user.id, 'verify', targetId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/upgrade', adminAuth, async (req, res) => {
  try {
    const { targetId, premium } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('id', targetId).maybeSingle();
    if (!user) return res.status(404).json({ error: 'Not found' });
    await supabase.from('users').update({ premium: !!premium }).eq('id', targetId);
    auditLog(req.user.id, premium ? 'grant_premium' : 'revoke_premium', targetId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { data: user } = await supabase.from('users').select('id, role').eq('id', id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete another admin' });
    // Cascade: remove all related records first
    await supabase.from('connections').delete().or(`from_user.eq.${id},to_user.eq.${id}`);
    await supabase.from('messages').delete().eq('sender_id', id);
    await supabase.from('reports').delete().or(`reporter_id.eq.${id},reported_id.eq.${id}`);
    await supabase.from('blocks').delete().or(`blocker_id.eq.${id},blocked_id.eq.${id}`);
    await supabase.from('users').delete().eq('id', id);
    auditLog(req.user.id, 'delete_user', id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const now         = Date.now();
    const oneDayAgo   = new Date(now - 24 * 3600 * 1000).toISOString();
    const oneWeekAgo  = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const { data: allUsers } = await supabase.from('users').select('*');
    const users = allUsers || [];
    const totalUsers     = users.length;
    const completedCount = users.filter(u => u.is_profile_complete).length;
    const dau = users.filter(u => u.last_active && u.last_active >= oneDayAgo).length;
    const wau = users.filter(u => u.last_active && u.last_active >= oneWeekAgo).length;

    const { data: allConns } = await supabase.from('connections').select('id, active');
    const totalConns = (allConns || []).length;

    const { data: msgConnIds } = await supabase.from('messages').select('connection_id');
    const connsWithMsg = new Set((msgConnIds || []).map(m => m.connection_id)).size;

    const { count: msgCount }    = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: reportCount } = await supabase.from('reports').select('*', { count: 'exact', head: true });
    const { count: blockCount }  = await supabase.from('blocks').select('*', { count: 'exact', head: true });

    res.json({
      users:                    totalUsers,
      dau, wau,
      premium:                  users.filter(u => u.premium).length,
      verified:                 users.filter(u => u.verification && u.verification.status === 'verified').length,
      profile_completion_rate:  totalUsers ? Math.round(completedCount / totalUsers * 100) + '%' : '0%',
      connections:              totalConns,
      active_connections:       (allConns || []).filter(c => c.active).length,
      match_to_conversation_rate: totalConns ? Math.round(connsWithMsg / totalConns * 100) + '%' : '0%',
      messages:  msgCount    || 0,
      reports:   reportCount || 0,
      blocks:    blockCount  || 0,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/audit', adminAuth, (req, res) => {
  res.json(adminAuditLog.slice(-200).reverse());
});

// ── ADMIN BOOTSTRAP ───────────────────────────────────────────────────────────
app.post('/api/admin/bootstrap', async (req, res) => {
  try {
    const { email, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Invalid secret' });
    const { data: user } = await supabase.from('users')
      .select('id').eq('email', email).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });
    await supabase.from('users').update({ role: 'admin' }).eq('id', user.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── FALLBACK ──────────────────────────────────────────────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'configured ✓' : 'MISSING ✗'}`);
  console.log(`Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured ✓' : 'MISSING ✗'}`);
});
