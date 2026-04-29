const express = require('express');
const Loki = require('lokijs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'networkapp_secret_2024';

const db = new Loki(path.join(__dirname, 'network.db.json'), {
  autoload: true, autoloadCallback: dbReady,
  autosave: true, autosaveInterval: 2000, serializationMethod: 'pretty'
});

let users, works, swipes, connections, messages;

function dbReady() {
  users = db.getCollection('users') || db.addCollection('users', { unique: ['email'] });
  works = db.getCollection('works') || db.addCollection('works');
  swipes = db.getCollection('swipes') || db.addCollection('swipes');
  connections = db.getCollection('connections') || db.addCollection('connections');
  messages = db.getCollection('messages') || db.addCollection('messages');
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
  delete r.password; delete r.$loki; delete r.meta;
  return r;
}

function cleanDoc(d) {
  const r = Object.assign({}, d); delete r.$loki; delete r.meta; return r;
}

function matchScore(a, b) {
  let score = 0;
  const aSkills = (a.skills || []).map(s => s.toLowerCase());
  const bSkills = (b.skills || []).map(s => s.toLowerCase());
  const overlap = aSkills.filter(s => bSkills.includes(s)).length;
  score += Math.min(overlap * 15, 40);
  if (a.intent_needed && b.intent_building) {
    const needed = a.intent_needed.toLowerCase();
    const building = b.intent_building.toLowerCase();
    const words = needed.split(' ').filter(w => w.length > 3);
    if (words.some(w => building.includes(w))) score += 35;
  }
  if (a.location && b.location && a.location.toLowerCase() === b.location.toLowerCase()) score += 15;
  if (a.remote && b.remote) score += 10;
  return Math.min(score + 20, 99);
}

function getInsight(a, b) {
  const aSkills = (a.skills || []).map(s => s.toLowerCase());
  const bSkills = (b.skills || []).map(s => s.toLowerCase());
  const overlap = aSkills.filter(s => bSkills.includes(s));
  if (overlap.length) return 'Shares expertise in ' + overlap.slice(0,2).join(' & ');
  if (b.intent_building) return 'Building: ' + b.intent_building.slice(0, 60);
  if (b.location) return 'Based in ' + b.location;
  return 'New member — make the first move';
}

// ── AUTH ─────────────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
  if (users.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });
  const id = uuidv4();
  users.insert({ id, email, password: await bcrypt.hash(password, 10), name,
    bio: '', photo: '', instagram: '', website: '', location: '', remote: false,
    skills: [], intent_building: '', intent_needed: '', created_at: new Date().toISOString() });
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
  const userWorks = works.find({ user_id: user.id }).map(cleanDoc);
  res.json(Object.assign({}, clean(user), { works: userWorks }));
});

app.put('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const fields = ['name','bio','instagram','website','location','remote','skills','intent_building','intent_needed','photo'];
  fields.forEach(f => { if (req.body[f] !== undefined) user[f] = req.body[f]; });
  users.update(user);
  res.json(Object.assign({}, clean(user), { works: works.find({ user_id: user.id }).map(cleanDoc) }));
});

app.post('/api/me/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = users.findOne({ id: req.user.id });
  const url = '/uploads/' + req.file.filename;
  user.photo = url; users.update(user);
  res.json({ url });
});

// ── DISCOVERY ─────────────────────────────────────────────

app.get('/api/discover', auth, (req, res) => {
  const me = users.findOne({ id: req.user.id });
  const swiped = swipes.find({ from: req.user.id }).map(s => s.to);
  const connectedIds = connections.find({
    $or: [{ user1: req.user.id }, { user2: req.user.id }]
  }).map(c => c.user1 === req.user.id ? c.user2 : c.user1);

  const excluded = new Set([req.user.id, ...swiped, ...connectedIds]);
  const { skill, intent, location, remote } = req.query;

  let candidates = users.find().filter(u => !excluded.has(u.id));
  if (skill) candidates = candidates.filter(u => (u.skills || []).some(s => s.toLowerCase().includes(skill.toLowerCase())));
  if (intent) candidates = candidates.filter(u => (u.intent_building || '').toLowerCase().includes(intent.toLowerCase()));
  if (location) candidates = candidates.filter(u => (u.location || '').toLowerCase().includes(location.toLowerCase()));
  if (remote === 'true') candidates = candidates.filter(u => u.remote);

  const result = candidates.map(u => {
    const score = matchScore(me, u);
    const insight = getInsight(me, u);
    const userWorks = works.find({ user_id: u.id }).map(cleanDoc);
    return Object.assign({}, clean(u), { matchScore: score, insight, works: userWorks });
  }).sort((a, b) => b.matchScore - a.matchScore);

  res.json(result);
});

// ── SWIPE ─────────────────────────────────────────────────

app.post('/api/swipe', auth, (req, res) => {
  const { targetId, direction } = req.body;
  if (!targetId || !['right','left'].includes(direction)) return res.status(400).json({ error: 'Invalid' });
  if (swipes.findOne({ from: req.user.id, to: targetId })) return res.json({ match: false });

  swipes.insert({ from: req.user.id, to: targetId, direction, created_at: new Date().toISOString() });

  let match = false;
  if (direction === 'right') {
    const theirSwipe = swipes.findOne({ from: targetId, to: req.user.id, direction: 'right' });
    if (theirSwipe) {
      const expires = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const connId = uuidv4();
      connections.insert({ id: connId, user1: req.user.id, user2: targetId,
        created_at: new Date().toISOString(), expires_at: expires, status: 'active' });
      match = true;
    }
  }
  res.json({ match, direction });
});

// ── CONNECTIONS ───────────────────────────────────────────

app.get('/api/connections', auth, (req, res) => {
  const now = new Date();
  const myConns = connections.find({
    $or: [{ user1: req.user.id }, { user2: req.user.id }]
  }).filter(c => new Date(c.expires_at) > now);

  const result = myConns.map(c => {
    const otherId = c.user1 === req.user.id ? c.user2 : c.user1;
    const other = users.findOne({ id: otherId });
    const lastMsg = messages.find({ connection_id: c.id }).pop();
    const hoursLeft = Math.max(0, Math.round((new Date(c.expires_at) - now) / 3600000));
    return { connection: cleanDoc(c), user: clean(other), lastMessage: lastMsg ? cleanDoc(lastMsg) : null, hoursLeft };
  });
  res.json(result);
});

// ── MESSAGES ──────────────────────────────────────────────

app.get('/api/messages/:connId', auth, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
    return res.status(403).json({ error: 'Not your connection' });
  res.json(messages.find({ connection_id: req.params.connId }).map(cleanDoc));
});

app.post('/api/messages/:connId', auth, (req, res) => {
  const conn = connections.findOne({ id: req.params.connId });
  if (!conn || (conn.user1 !== req.user.id && conn.user2 !== req.user.id))
    return res.status(403).json({ error: 'Not your connection' });
  if (new Date(conn.expires_at) < new Date()) return res.status(400).json({ error: 'Connection expired' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  const msg = { id: uuidv4(), connection_id: conn.id, from: req.user.id, text, created_at: new Date().toISOString() };
  messages.insert(msg);
  res.json(msg);
});

// ── WORKS ─────────────────────────────────────────────────

app.post('/api/works', auth, upload.single('image'), (req, res) => {
  const { title, description, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const work = { id: uuidv4(), user_id: req.user.id, title, description: description||'', url: url||'',
    image: req.file ? '/uploads/'+req.file.filename : '', created_at: new Date().toISOString() };
  works.insert(work);
  res.json(work);
});

app.delete('/api/works/:id', auth, (req, res) => {
  const work = works.findOne({ id: req.params.id, user_id: req.user.id });
  if (!work) return res.status(404).json({ error: 'Not found' });
  works.remove(work);
  res.json({ ok: true });
});

app.get('/api/profiles/:id', (req, res) => {
  const user = users.findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(Object.assign({}, clean(user), { works: works.find({ user_id: user.id }).map(cleanDoc) }));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
