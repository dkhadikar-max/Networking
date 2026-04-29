const express = require('express');
const Loki = require('lokijs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
fs.mkdirSync(require('path').join(__dirname, 'public', 'uploads'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'networkapp_secret_2024';
const DAILY_LIMIT = 30;

const db = new Loki(path.join(__dirname, 'network.db.json'), {
  autoload: true, autoloadCallback: dbReady,
  autosave: true, autosaveInterval: 2000, serializationMethod: 'pretty'
});

let users, works, swipes, connections, messages, reports, blocks, dailyViews;

function dbReady() {
  users       = db.getCollection('users')       || db.addCollection('users', { unique: ['email'] });
  works       = db.getCollection('works')       || db.addCollection('works');
  swipes      = db.getCollection('swipes')      || db.addCollection('swipes');
  connections = db.getCollection('connections') || db.addCollection('connections');
  messages    = db.getCollection('messages')    || db.addCollection('messages');
  reports     = db.getCollection('reports')     || db.addCollection('reports');
  blocks      = db.getCollection('blocks')      || db.addCollection('blocks');
  dailyViews  = db.getCollection('dailyViews')  || db.addCollection('dailyViews');
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Invalid token' }); }
}

function clean(u) {
  if (!u) return null;
  const r = Object.assign({}, u);
  delete r.password; delete r.$loki; delete r.meta; return r;
}
function cleanDoc(d) { const r = Object.assign({}, d); delete r.$loki; delete r.meta; return r; }

// ── MATCH ENGINE (Weights: Interest 35, Intent 25, Context 20, Location 20) ──

const INTENT_COMPAT = {
  'explore-network':    ['explore-network','exchange-ideas','build-relationships','collaborate'],
  'exchange-ideas':     ['exchange-ideas','explore-network','learn-mentorship','collaborate'],
  'learn-mentorship':   ['exchange-ideas','explore-network','build-relationships'],
  'build-relationships':['build-relationships','explore-network','exchange-ideas','collaborate'],
  'collaborate':        ['collaborate','exchange-ideas','build-relationships']
};


function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function matchScore(a, b) {
  let interest = 0, intent = 0, context = 0, location = 0;

  // Interest alignment (35%) — shared curiosity
  const aInt = (a.interests || []).map(s => s.toLowerCase());
  const bInt = (b.interests || []).map(s => s.toLowerCase());
  if (aInt.length && bInt.length) {
    const overlap = aInt.filter(s => bInt.includes(s)).length;
    interest = Math.round((overlap / Math.min(Math.max(aInt.length, bInt.length), 6)) * 35);
  }
  // Bonus: interested_in text alignment
  if (a.interested_in && b.interested_in) {
    const aWords = a.interested_in.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const bWords = b.interested_in.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const textOverlap = aWords.filter(w => bWords.includes(w)).length;
    interest = Math.min(interest + textOverlap * 4, 35);
  }

  // Intent alignment (25%) — complementary > similar
  if (a.intent && b.intent) {
    const compat = INTENT_COMPAT[a.intent] || [];
    if (compat.includes(b.intent)) intent = 25;
    else intent = 8;
  }

  // Contextual relevance (20%) — skills + working_on
  const aSkills = (a.skills || []).map(s => s.toLowerCase());
  const bSkills = (b.skills || []).map(s => s.toLowerCase());
  const skillOverlap = aSkills.filter(s => bSkills.includes(s)).length;
  context = Math.min(skillOverlap * 5, 12);
  if (a.currently_exploring && b.working_on) {
    const expWords = a.currently_exploring.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (expWords.some(w => b.working_on.toLowerCase().includes(w))) context = Math.min(context + 8, 20);
  }

  // Location (20%) — Haversine distance if lat/lng available
  if (a.lat && b.lat && a.lng && b.lng) {
    const dist = haversine(parseFloat(a.lat), parseFloat(a.lng), parseFloat(b.lat), parseFloat(b.lng));
    if (dist < 10) location = 20;
    else if (dist < 50) location = 15;
    else if (dist < 200) location = 8;
    else location = 3;
  } else if (a.location && b.location && a.location.toLowerCase() === b.location.toLowerCase()) {
    location = 20;
  } else if (a.remote && b.remote) {
    location = 10;
  }

  return Math.min(Math.max(interest + intent + context + location + 5, 1), 99);
}

function getInsight(a, b) {
  const aInt = (a.interests || []).map(s => s.toLowerCase());
  const bInt = (b.interests || []).map(s => s.toLowerCase());
  const shared = aInt.filter(s => bInt.includes(s));
  if (shared.length) return 'Shared curiosity in ' + shared.slice(0, 2).join(' & ');
  if (a.currently_exploring && b.working_on) {
    const words = a.currently_exploring.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (words.some(w => b.working_on.toLowerCase().includes(w)))
      return 'Their work connects with what you\'re exploring';
  }
  if (b.intent) return 'Looking to ' + b.intent.replace(/-/g, ' ');
  return 'Could be worth a conversation';
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function getViewed(userId) {
  const rec = dailyViews.findOne({ userId, date: todayKey() });
  return rec ? rec.count : 0;
}
function incrementViewed(userId, add) {
  const key = todayKey();
  const rec = dailyViews.findOne({ userId, date: key });
  if (rec) { rec.count += add; dailyViews.update(rec); }
  else dailyViews.insert({ userId, date: key, count: add });
}

// ── AUTH ──────────────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
  if (users.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });
  const id = uuidv4();
  users.insert({
    id, email, password: await bcrypt.hash(password, 10), name,
    bio: '', photo: '', instagram: '', linkedin: '', website: '',
    location: '', lat: null, lng: null, remote: false,
    skills: [], interests: [],
    currently_exploring: '', working_on: '', interested_in: '',
    intent: 'explore-network',
    trust_score: 50, verified: false,
    created_at: new Date().toISOString()
  });
  const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: clean(users.findOne({ id })) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: clean(user) });
});

// ── PROFILE ───────────────────────────────────────────────

app.get('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(Object.assign({}, clean(user), { works: works.find({ user_id: user.id }).map(cleanDoc) }));
});

app.put('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  ['name','bio','instagram','linkedin','website','location','lat','lng','remote',
   'skills','interests','currently_exploring','working_on','interested_in','intent','photo']
    .forEach(f => { if (req.body[f] !== undefined) user[f] = req.body[f]; });
  users.update(user);
  res.json(Object.assign({}, clean(user), { works: works.find({ user_id: user.id }).map(cleanDoc) }));
});

app.post('/api/me/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const url = '/uploads/' + req.file.filename;
  user.photo = url; users.update(user);
  res.json({ url });
});

app.get('/api/profiles/:id', (req, res) => {
  const user = users.findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(Object.assign({}, clean(user), { works: works.find({ user_id: user.id }).map(cleanDoc) }));
});

// ── DISCOVERY ─────────────────────────────────────────────

app.get('/api/discover', auth, (req, res) => {
  const viewed = getViewed(req.user.id);
  if (viewed >= DAILY_LIMIT)
    return res.json({ limited: true, remaining: 0, profiles: [] });

  const me = users.findOne({ id: req.user.id });
  if (!me) return res.status(404).json({ error: 'User not found' });
  const swiped = new Set(swipes.find({ from: req.user.id }).map(s => s.to));
  const connected = new Set(connections.find({ $or: [{ user1: req.user.id }, { user2: req.user.id }] })
    .map(c => c.user1 === req.user.id ? c.user2 : c.user1));
  const blocked = new Set(blocks.find({ $or: [{ from: req.user.id }, { to: req.user.id }] })
    .map(b => b.from === req.user.id ? b.to : b.from));
  const excluded = new Set([req.user.id, ...swiped, ...connected, ...blocked]);

  const { skill, intent, location, remote, interest } = req.query;
  let candidates = users.find().filter(u => !excluded.has(u.id));
  if (skill) candidates = candidates.filter(u => (u.skills||[]).some(s => s.toLowerCase().includes(skill.toLowerCase())));
  if (intent) candidates = candidates.filter(u => u.intent === intent);
  if (location) candidates = candidates.filter(u => (u.location||'').toLowerCase().includes(location.toLowerCase()));
  if (remote === 'true') candidates = candidates.filter(u => u.remote);
  if (interest) candidates = candidates.filter(u => (u.interests||[]).some(s => s.toLowerCase().includes(interest.toLowerCase())));

  const remaining = DAILY_LIMIT - viewed;
  const profiles = candidates
    .map(u => Object.assign({}, clean(u), {
      matchScore: matchScore(me, u),
      insight: getInsight(me, u),
      works: works.find({ user_id: u.id }).map(cleanDoc)
    }))
    .filter(p => p.matchScore > 10)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, remaining);

  incrementViewed(req.user.id, profiles.length);
  res.json({ limited: false, remaining: remaining - profiles.length, profiles });
});

// ── SWIPE ─────────────────────────────────────────────────

app.post('/api/swipe', auth, (req, res) => {
  const { targetId, direction } = req.body;
  if (!targetId || !['right','left'].includes(direction))
    return res.status(400).json({ error: 'Invalid' });
  if (swipes.findOne({ from: req.user.id, to: targetId }))
    return res.json({ match: false });

  swipes.insert({ from: req.user.id, to: targetId, direction, created_at: new Date().toISOString() });

  let match = false, connectionId = null;
  if (direction === 'right') {
    const theirSwipe = swipes.findOne({ from: targetId, to: req.user.id, direction: 'right' });
    if (theirSwipe) {
      const now = new Date();
      connectionId = uuidv4();
      connections.insert({
        id: connectionId, user1: req.user.id, user2: targetId,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 5 * 24 * 3600000).toISOString(),
        first_response_deadline: new Date(now.getTime() + 48 * 3600000).toISOString(),
        responded: false, status: 'active'
      });
      match = true;
    }
  }
  res.json({ match, direction, connectionId });
});

// ── CONNECTIONS ───────────────────────────────────────────

app.get('/api/connections', auth, (req, res) => {
  const now = new Date();
  const result = connections
    .find({ $or: [{ user1: req.user.id }, { user2: req.user.id }] })
    .filter(c => new Date(c.expires_at) > now)
    .map(c => {
      const otherId = c.user1 === req.user.id ? c.user2 : c.user1;
      const other = users.findOne({ id: otherId });
      const msgs = messages.find({ connection_id: c.id });
      const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
      const hoursLeft = Math.max(0, Math.round((new Date(c.expires_at) - now) / 3600000));
      const responseHours = Math.max(0, Math.round((new Date(c.first_response_deadline) - now) / 3600000));
      return {
        connection: cleanDoc(c), user: clean(other),
        lastMessage: lastMsg ? cleanDoc(lastMsg) : null,
        hoursLeft, responseHours, needsResponse: !c.responded && responseHours > 0,
        msgCount: msgs.length
      };
    });
  res.json(result);
});

// ── MESSAGES ──────────────────────────────────────────────

app.get('/api/messages/:connId', auth, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
    return res.status(403).json({ error: 'Access denied' });
  res.json(messages.find({ connection_id: req.params.connId }).map(cleanDoc));
});

app.post('/api/messages/:connId', auth, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
    return res.status(403).json({ error: 'Access denied' });
  if (new Date(conn.expires_at) < new Date())
    return res.status(400).json({ error: 'Connection expired' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  if (!conn.responded) { conn.responded = true; connections.update(conn); }
  const msg = { id: uuidv4(), connection_id: conn.id, from: req.user.id, text: text.trim(), created_at: new Date().toISOString() };
  messages.insert(msg);
  res.json(msg);
});

// ── REPORT & BLOCK ────────────────────────────────────────

app.post('/api/report', auth, (req, res) => {
  const { targetId, reason } = req.body;
  if (!targetId || !reason) return res.status(400).json({ error: 'Required fields missing' });
  reports.insert({ id: uuidv4(), from: req.user.id, target: targetId, reason, created_at: new Date().toISOString() });
  const target = users.findOne({ id: targetId });
  if (target) { target.trust_score = Math.max(0, (target.trust_score || 50) - 10); users.update(target); }
  res.json({ ok: true });
});

app.post('/api/block', auth, (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });
  if (!blocks.findOne({ from: req.user.id, to: targetId }))
    blocks.insert({ from: req.user.id, to: targetId, created_at: new Date().toISOString() });
  res.json({ ok: true });
});

// ── WORKS ─────────────────────────────────────────────────

app.post('/api/works', auth, upload.single('image'), (req, res) => {
  const { title, description, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const work = { id: uuidv4(), user_id: req.user.id, title,
    description: description||'', url: url||'',
    image: req.file ? '/uploads/'+req.file.filename : '',
    created_at: new Date().toISOString() };
  works.insert(work); res.json(work);
});

app.delete('/api/works/:id', auth, (req, res) => {
  const work = works.findOne({ id: req.params.id, user_id: req.user.id });
  if (!work) return res.status(404).json({ error: 'Not found' });
  works.remove(work); res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
