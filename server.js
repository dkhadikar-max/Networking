const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const express   = require('express');
const Loki      = require('lokijs');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'networkapp_secret_2024';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'adminpass2024';

fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

const db = new Loki(path.join(__dirname, 'network.db.json'), {
  autoload: true, autoloadCallback: dbReady,
  autosave: true, autosaveInterval: 2000, serializationMethod: 'pretty'
});

let users, works, swipes, connections, messages, reports, blocks, dailyViews, priorityMsgs;

function dbReady() {
  users        = db.getCollection('users')        || db.addCollection('users', { unique: ['email'] });
  works        = db.getCollection('works')        || db.addCollection('works');
  swipes       = db.getCollection('swipes')       || db.addCollection('swipes');
  connections  = db.getCollection('connections')  || db.addCollection('connections');
  messages     = db.getCollection('messages')     || db.addCollection('messages');
  reports      = db.getCollection('reports')      || db.addCollection('reports');
  blocks       = db.getCollection('blocks')       || db.addCollection('blocks');
  dailyViews   = db.getCollection('dailyViews')   || db.addCollection('dailyViews');
  priorityMsgs = db.getCollection('priorityMsgs') || db.addCollection('priorityMsgs');
  app.listen(PORT, () => console.log('Server on port ' + PORT));
}

// ── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 60*1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, slow down' } });
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Too many login attempts' } });
const uploadLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'Upload limit reached' } });
const verifyLimiter = rateLimit({ windowMs: 24*60*60*1000, max: 3, message: { error: 'Max 3 verification attempts per day' } });
const msgLimiter    = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'Message rate limit reached' } });

app.use(globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const ALLOWED_MIMETYPES = ['image/jpeg','image/png','image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

// ── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────

function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

function adminAuth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const u = jwt.verify(token, JWT_SECRET);
    const user = users.findOne({ id: u.id });
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = u; next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ── PROFILE GUARD MIDDLEWARE ─────────────────────────────────────────────────

function profileGuard(req, res, next) {
  const user = users.findOne({ id: req.user.id });
  const score = user ? calcProfileScore(user) : 0;
  if (!user || score < 70) {
    return res.status(403).json({
      error: 'Complete your profile to continue',
      code:  'PROFILE_INCOMPLETE',
    });
  }
  next();
}

// ── TRUST GUARD MIDDLEWARE ───────────────────────────────────────────────────

function trustGuard(req, res, next) {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const score = calcTrust(user);
  if (score < 60) {
    return res.status(403).json({
      error: 'Build your trust score to 60+ to unlock Discovery',
      code: 'TRUST_TOO_LOW',
      trust_score: score,
      required: 60,
      trust_steps: trustSteps(user),
    });
  }
  next();
}

// ── INPUT SANITIZATION ───────────────────────────────────────────────────────
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/<[^>]*>/g, '').replace(/[<>"]/g, '').trim().slice(0, 1000);
}
function sanitizeObj(obj, fields) {
  fields.forEach(f => { if (obj[f] !== undefined) obj[f] = sanitize(String(obj[f])); });
  return obj;
}
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

// ── PUBLIC CLEAN (strips sensitive fields) ────────────────────────────────────
function cleanPublic(u) {
  if (!u) return null;
  const r = Object.assign({}, u);
  delete r.password; delete r.$loki; delete r.meta;
  delete r.email;          // don't expose email to other users
  delete r.lat; delete r.lng; // don't expose exact GPS
  delete r.banned;
  return r;
}

function clean(u) {
  if (!u) return null;
  const r = Object.assign({}, u);
  delete r.password; delete r.$loki; delete r.meta; return r;
}
function cleanDoc(d) { const r = Object.assign({}, d); delete r.$loki; delete r.meta; return r; }

// ── TRUST SCORE (7 steps, max 100) ──────────────────────────────────────────

// Trust score: 7 steps = 100 points total
// 20 + 10 + 10 + 10 + 10 + 10 + 30 = 100
function calcTrust(u) {
  let score = 0;
  if ((u.photos || []).length >= 4)                           score += 20; // 1. 4+ photos
  if ((u.interests || []).length >= 1)                        score += 10; // 2. Interests
  if (u.intent && u.intent.length > 0)                       score += 10; // 3. Intent / goal
  if (u.bio && u.bio.trim().length >= 10)                    score += 10; // 4. Bio (10+ chars)
  if (u.location && u.location.trim().length > 0)            score += 10; // 5. Location
  if (u.linkedin || u.website || u.instagram)                score += 10; // 6. External link
  if (u.verification && u.verification.status === 'verified') score += 30; // 7. Verified
  return score; // max 100
}

// ── PROFILE COMPLETION SCORE ─────────────────────────────────────────────────

function calcProfileScore(u) {
  let score = 0;
  const photos    = u.photos    || [];
  const interests = u.interests || [];
  if (photos.length >= 4)        score += 30;
  else if (photos.length >= 1)   score += 10;
  if (interests.length >= 3)     score += 20;
  else if (interests.length >= 1) score += 8;
  if (u.intent && u.intent.length > 0)       score += 20;
  if (u.bio && u.bio.length >= 10)            score += 10;
  if (u.name && u.name.length >= 2)           score += 10;
  if (u.location && u.location.length > 0)   score += 10;
  return Math.min(score, 100);
}

function syncProfileScore(user) {
  const score    = calcProfileScore(user);
  const complete = score >= 70;
  user.profile_score       = score;
  user.is_profile_complete = complete;
  users.update(user);
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

// ── MATCH ENGINE ────────────────────────────────────────────────────────────

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
    if (w.some(x=>b.working_on.toLowerCase().includes(x))) return 'Their work connects with what you\'re exploring';
  }
  return b.intent ? 'Looking to ' + b.intent.replace(/-/g,' ') : 'Could be worth a conversation';
}

function todayKey() { return new Date().toISOString().slice(0,10); }
function thisMonthKey() { return new Date().toISOString().slice(0,7); }

function getViewed(userId) {
  const r = dailyViews.findOne({ userId, date: todayKey() });
  return r ? r.count : 0;
}
function incrementViewed(userId, add) {
  const key = todayKey(), r = dailyViews.findOne({ userId, date: key });
  if (r) { r.count += add; dailyViews.update(r); }
  else dailyViews.insert({ userId, date: key, count: add });
}

// ── AUTH ────────────────────────────────────────────────────────────────────

app.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    if (users.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });
    const id = uuidv4();
    users.insert({
      id, email, password: await bcrypt.hash(password, 12), name,
      bio: '', photos: [], instagram: '', linkedin: '', website: '',
      location: '', lat: null, lng: null, remote: false,
      skills: [], interests: [],
      currently_exploring: '', working_on: '', interested_in: '',
      intent: 'explore-network', role: 'user', premium: false,
      trust_score: 0, verification: { status: 'none', confidence: 0 },
      banned: false, created_at: new Date().toISOString()
    });
    const user = users.findOne({ id });
    user.trust_score       = calcTrust(user);
    user.profile_score     = calcProfileScore(user);
    user.is_profile_complete = user.profile_score >= 70;
    users.update(user);
    const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: clean(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login',  authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (user.banned) return res.status(403).json({ error: 'Account restricted' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    // Ensure profile score is current on login
    const ps = calcProfileScore(user);
    user.profile_score       = ps;
    user.is_profile_complete = ps >= 70;
    users.update(user);
    res.json({ token, user: clean(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PROFILE ─────────────────────────────────────────────────────────────────

app.get('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Always recompute profile score so it stays current
  user.profile_score       = calcProfileScore(user);
  user.is_profile_complete = user.profile_score >= 70;
  users.update(user);
  const u = clean(user);
  u.trust_steps = trustSteps(user);
  u.works = works.find({ user_id: user.id }).map(cleanDoc);
  res.json(u);
});

app.get('/api/profile-status', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const score    = calcProfileScore(user);
  const complete = score >= 70;
  user.profile_score       = score;
  user.is_profile_complete = complete;
  users.update(user);
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
});

app.put('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Sanitize text fields
  sanitizeObj(req.body, ['name','bio','instagram','linkedin','website','location',
    'currently_exploring','working_on','interested_in']);
  // Round GPS to 2 decimal places (~1.1km precision) for privacy
  if (req.body.lat != null) req.body.lat = Math.round(parseFloat(req.body.lat) * 100) / 100;
  if (req.body.lng != null) req.body.lng = Math.round(parseFloat(req.body.lng) * 100) / 100;
  ['name','bio','instagram','linkedin','website','location','lat','lng','remote',
   'skills','interests','currently_exploring','working_on','interested_in','intent']
    .forEach(f => { if (req.body[f] !== undefined) user[f] = req.body[f]; });
  user.trust_score         = calcTrust(user);
  user.profile_score       = calcProfileScore(user);
  user.is_profile_complete = user.profile_score >= 70;
  users.update(user);
  const u = clean(user); u.trust_steps = trustSteps(user);
  u.works = works.find({ user_id: user.id }).map(cleanDoc);
  res.json(u);
});

// Multiple photos: add
app.post('/api/me/photos', uploadLimiter, auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (!user.photos) user.photos = [];
  if (user.photos.length >= 6) return res.status(400).json({ error: 'Max 6 photos' });
  const url = '/uploads/' + req.file.filename;
  user.photos.push(url);
  user.trust_score         = calcTrust(user);
  user.profile_score       = calcProfileScore(user);
  user.is_profile_complete = user.profile_score >= 70;
  users.update(user);
  res.json({ url, photos: user.photos, trust_score: user.trust_score, profile_score: user.profile_score, is_profile_complete: user.is_profile_complete });
});

// Multiple photos: remove
app.delete('/api/me/photos/:idx', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const idx = parseInt(req.params.idx);
  if (isNaN(idx) || idx < 0 || idx >= (user.photos||[]).length)
    return res.status(400).json({ error: 'Invalid index' });
  user.photos.splice(idx, 1);
  user.trust_score         = calcTrust(user);
  user.profile_score       = calcProfileScore(user);
  user.is_profile_complete = user.profile_score >= 70;
  users.update(user);
  res.json({ photos: user.photos, trust_score: user.trust_score, profile_score: user.profile_score, is_profile_complete: user.is_profile_complete });
});

// Photo verification (self-reported; plug in ML API later)
app.post('/api/me/verify', verifyLimiter, auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { confidence } = req.body; // 0-100 sent from frontend challenge
  const status = confidence >= 70 ? 'verified' : 'failed';
  user.verification = { status, confidence: confidence || 0, verified_at: new Date().toISOString() };
  user.trust_score = calcTrust(user);
  users.update(user);
  res.json({ status, confidence, trust_score: user.trust_score });
});

app.get('/api/profiles/:id', (req, res) => {
  const user = users.findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const u = cleanPublic(user); u.works = works.find({ user_id: user.id }).map(cleanDoc);
  res.json(u);
});

// ── DISCOVERY ───────────────────────────────────────────────────────────────

app.get('/api/discover', auth, profileGuard, trustGuard, (req, res) => {
  const me = users.findOne({ id: req.user.id });
  if (!me) return res.status(404).json({ error: 'User not found' });
  if (me.banned) return res.status(403).json({ error: 'Account restricted' });

  const DAILY_LIMIT = me.premium ? 200 : 30;
  const viewed = getViewed(req.user.id);
  if (viewed >= DAILY_LIMIT)
    return res.json({ limited: true, remaining: 0, profiles: [] });

  const swiped    = new Set(swipes.find({ from: req.user.id }).map(s=>s.to));
  const connected = new Set(connections.find({ $or:[{user1:req.user.id},{user2:req.user.id}] })
    .map(c=>c.user1===req.user.id?c.user2:c.user1));
  const blocked   = new Set(blocks.find({ $or:[{from:req.user.id},{to:req.user.id}] })
    .map(b=>b.from===req.user.id?b.to:b.from));
  const excluded  = new Set([req.user.id, ...swiped, ...connected, ...blocked]);

  const { skill, intent, location, remote, interest, sort='relevance' } = req.query;
  let candidates = users.find({ banned: { $ne: true } }).filter(u=>!excluded.has(u.id));
  if (skill)    candidates = candidates.filter(u=>(u.skills||[]).some(s=>s.toLowerCase().includes(skill.toLowerCase())));
  if (intent)   candidates = candidates.filter(u=>u.intent===intent);
  if (location) candidates = candidates.filter(u=>(u.location||'').toLowerCase().includes(location.toLowerCase()));
  if (remote==='true') candidates = candidates.filter(u=>u.remote);
  if (interest) candidates = candidates.filter(u=>(u.interests||[]).some(s=>s.toLowerCase().includes(interest.toLowerCase())));

  const remaining = DAILY_LIMIT - viewed;
  let profiles = candidates.map(u=>Object.assign({},clean(u),{
    matchScore: matchScore(me,u), insight: getInsight(me,u),
    works: works.find({ user_id: u.id }).map(cleanDoc),
    distance: (me.lat&&u.lat&&me.lng&&u.lng) ? Math.round(haversine(parseFloat(me.lat),parseFloat(me.lng),parseFloat(u.lat),parseFloat(u.lng))) : null
  })).filter(p=>p.matchScore>10);

  if (sort==='recent')   profiles.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else if (sort==='distance') profiles.sort((a,b)=>(a.distance??9999)-(b.distance??9999));
  else                   profiles.sort((a,b)=>b.matchScore-a.matchScore); // relevance default

  profiles = profiles.slice(0, remaining);
  incrementViewed(req.user.id, profiles.length);
  res.json({ limited: false, remaining: remaining-profiles.length, profiles, daily_limit: DAILY_LIMIT });
});

// ── SEARCH ──────────────────────────────────────────────────────────────────

app.get('/api/search', auth, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const term = q.trim().toLowerCase();
  const results = users.find({ banned: { $ne: true } })
    .filter(u => u.id !== req.user.id && (
      (u.name||'').toLowerCase().includes(term) ||
      (u.interests||[]).some(i=>i.toLowerCase().includes(term)) ||
      (u.skills||[]).some(s=>s.toLowerCase().includes(term))
    ))
    .slice(0,20)
    .map(u=>clean(u));
  res.json(results);
});

// ── SWIPE ────────────────────────────────────────────────────────────────────

app.post('/api/swipe', auth, profileGuard, trustGuard, (req, res) => {
  const { targetId, direction } = req.body;
  if (!targetId || !['right','left'].includes(direction))
    return res.status(400).json({ error: 'Invalid' });
  if (swipes.findOne({ from: req.user.id, to: targetId }))
    return res.json({ match: false });

  swipes.insert({ from: req.user.id, to: targetId, direction, created_at: new Date().toISOString() });

  let match = false, connectionId = null;
  if (direction === 'right') {
    const their = swipes.findOne({ from: targetId, to: req.user.id, direction: 'right' });
    if (their) {
      const now = new Date();
      connectionId = uuidv4();
      connections.insert({
        id: connectionId, user1: req.user.id, user2: targetId,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime()+5*24*3600000).toISOString(),
        first_response_deadline: new Date(now.getTime()+48*3600000).toISOString(),
        user1_responded: false, user2_responded: false,
        active: false, status: 'active'
      });
      match = true;
    }
  }
  res.json({ match, direction, connectionId });
});

// ── CONNECTIONS ──────────────────────────────────────────────────────────────

app.get('/api/connections', auth, profileGuard, (req, res) => {
  const now = new Date();
  const result = connections
    .find({ $or:[{user1:req.user.id},{user2:req.user.id}] })
    .filter(c => c.active || new Date(c.expires_at) > now)
    .map(c => {
      const otherId = c.user1===req.user.id?c.user2:c.user1;
      const other = users.findOne({ id: otherId });
      const msgs = messages.find({ connection_id: c.id });
      const lastMsg = msgs.length ? msgs[msgs.length-1] : null;
      const hoursLeft = c.active ? null : Math.max(0, Math.round((new Date(c.expires_at)-now)/3600000));
      return {
        connection: cleanDoc(c), user: cleanPublic(other),
        lastMessage: lastMsg?cleanDoc(lastMsg):null,
        hoursLeft, active: !!c.active, msgCount: msgs.length
      };
    });
  res.json(result);
});

// ── MESSAGES ─────────────────────────────────────────────────────────────────

app.get('/api/messages/:connId', auth, profileGuard, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn||(conn.user1!==req.user.id&&conn.user2!==req.user.id))
    return res.status(403).json({ error: 'Access denied' });
  res.json(messages.find({ connection_id: req.params.connId }).map(cleanDoc));
});

app.post('/api/messages/:connId', msgLimiter, auth, profileGuard, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn||(conn.user1!==req.user.id&&conn.user2!==req.user.id))
    return res.status(403).json({ error: 'Access denied' });
  if (!conn.active && new Date(conn.expires_at)<new Date())
    return res.status(400).json({ error: 'Connection expired' });
  const { text } = req.body;
  if (!text||!text.trim()) return res.status(400).json({ error: 'Text required' });

  // Track per-user responses; if both replied → mark active (remove expiry)
  if (req.user.id===conn.user1 && !conn.user1_responded) {
    conn.user1_responded = true;
  } else if (req.user.id===conn.user2 && !conn.user2_responded) {
    conn.user2_responded = true;
  }
  if (conn.user1_responded && conn.user2_responded && !conn.active) {
    conn.active = true; // permanent connection
  }
  connections.update(conn);

  const msg = { id: uuidv4(), connection_id: conn.id, from: req.user.id,
    text: text.trim(), created_at: new Date().toISOString() };
  messages.insert(msg);
  res.json(msg);
});

// ── PRIORITY CONNECT (1 msg without match, 20/month) ─────────────────────────

app.post('/api/priority-message', auth, profileGuard, (req, res) => {
  const { targetId, text } = req.body;
  if (!targetId||!text) return res.status(400).json({ error: 'targetId and text required' });

  const sender = users.findOne({ id: req.user.id });
  if (!sender) return res.status(404).json({ error: 'Not found' });

  const month = thisMonthKey();
  const monthCount = priorityMsgs.find({ from: req.user.id, month }).length;
  const limit = sender.premium ? 20 : 3; // free users get 3 to try feature
  if (monthCount >= limit)
    return res.status(429).json({ error: `Priority message limit reached (${limit}/month)` });

  // Prevent duplicate priority message to same person this month
  if (priorityMsgs.findOne({ from: req.user.id, to: targetId, month }))
    return res.status(400).json({ error: 'Already sent a priority message to this person' });

  // Strip URLs from priority messages (anti-spam)
  const cleanText = text.trim().replace(URL_PATTERN, '[link removed]');
  const pm = { id: uuidv4(), from: req.user.id, to: targetId,
    text: cleanText, month, read: false, created_at: new Date().toISOString() };
  priorityMsgs.insert(pm);
  res.json({ ok: true, remaining: limit - monthCount - 1 });
});

app.get('/api/priority-messages', auth, (req, res) => {
  const received = priorityMsgs.find({ to: req.user.id }).map(pm => {
    const sender = users.findOne({ id: pm.from });
    return Object.assign({}, cleanDoc(pm), { sender: clean(sender) });
  });
  const sent = priorityMsgs.find({ from: req.user.id });
  const month = thisMonthKey();
  const me = users.findOne({ id: req.user.id });
  const limit = (me&&me.premium) ? 20 : 3;
  const used = sent.filter(p=>p.month===month).length;
  res.json({ received, sent: sent.map(cleanDoc), remaining: limit-used, limit });
});

// ── WHO LIKED YOU (premium) ───────────────────────────────────────────────────

app.get('/api/liked-me', auth, (req, res) => {
  const me = users.findOne({ id: req.user.id });
  if (!me || !me.premium) return res.status(403).json({ error: 'Premium only' });
  const likedMe = swipes.find({ to: req.user.id, direction: 'right' }).map(s=>{
    const u = users.findOne({ id: s.from });
    return clean(u);
  }).filter(Boolean);
  res.json(likedMe);
});

// ── REPORT & BLOCK ────────────────────────────────────────────────────────────

app.post('/api/report', auth, (req, res) => {
  const { targetId, reason } = req.body;
  if (!targetId||!reason) return res.status(400).json({ error: 'Required fields missing' });
  reports.insert({ id: uuidv4(), from: req.user.id, target: targetId, reason, created_at: new Date().toISOString() });
  const target = users.findOne({ id: targetId });
  if (target) { target.trust_score = Math.max(0, target.trust_score-10); users.update(target); }
  res.json({ ok: true });
});

app.post('/api/block', auth, (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });
  if (!blocks.findOne({ from: req.user.id, to: targetId }))
    blocks.insert({ from: req.user.id, to: targetId, created_at: new Date().toISOString() });
  res.json({ ok: true });
});

// ── WORKS ─────────────────────────────────────────────────────────────────────

app.post('/api/works', auth, upload.single('image'), (req, res) => {
  const { title, description, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const work = { id: uuidv4(), user_id: req.user.id, title,
    description: description||'', url: url||'',
    image: req.file?'/uploads/'+req.file.filename:'',
    created_at: new Date().toISOString() };
  works.insert(work); res.json(work);
});

app.delete('/api/works/:id', auth, (req, res) => {
  const work = works.findOne({ id: req.params.id, user_id: req.user.id });
  if (!work) return res.status(404).json({ error: 'Not found' });
  works.remove(work); res.json({ ok: true });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/users', adminAuth, (req, res) => {
  const all = users.find().map(u=>{
    const u2=clean(u); u2.trust_steps=trustSteps(u); return u2;
  });
  res.json(all);
});

app.post('/api/admin/ban', adminAuth, (req, res) => {
  const { targetId, banned } = req.body;
  const user = users.findOne({ id: targetId });
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.banned = !!banned; users.update(user);
  auditLog(req.user.id, banned?'ban':'unban', targetId);
  res.json({ ok: true });
});

app.post('/api/admin/verify', adminAuth, (req, res) => {
  const { targetId } = req.body;
  const user = users.findOne({ id: targetId });
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.verification = { status: 'verified', confidence: 100, verified_at: new Date().toISOString() };
  user.trust_score = calcTrust(user);
  users.update(user);
  auditLog(req.user.id, 'verify', targetId);
  res.json({ ok: true });
});

app.post('/api/admin/upgrade', adminAuth, (req, res) => {
  const { targetId, premium } = req.body;
  const user = users.findOne({ id: targetId });
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.premium = !!premium; users.update(user);
  auditLog(req.user.id, premium?'grant_premium':'revoke_premium', targetId);
  res.json({ ok: true });
});

app.get('/api/admin/analytics', adminAuth, (req, res) => {
  res.json({
    users: users.count(),
    premium: users.find({ premium: true }).length,
    verified: users.find({ 'verification.status': 'verified' }).length,
    connections: connections.count(),
    active_connections: connections.find({ active: true }).length,
    messages: messages.count(),
    reports: reports.count(),
    blocks: blocks.count(),
  });
});

// ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────────
const adminAuditLog = [];
function auditLog(adminId, action, targetId) {
  adminAuditLog.push({ adminId, action, targetId, at: new Date().toISOString() });
  if (adminAuditLog.length > 1000) adminAuditLog.shift(); // keep last 1000
}

app.get('/api/admin/audit', adminAuth, (req, res) => {
  res.json(adminAuditLog.slice(-200).reverse());
});

// ── ADMIN BOOTSTRAP (create first admin via secret) ────────────────────────────

app.post('/api/admin/bootstrap', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Invalid secret' });
  const user = users.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = 'admin'; users.update(user);
  res.json({ ok: true });
});

// ── FALLBACK ──────────────────────────────────────────────────────────────────

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
