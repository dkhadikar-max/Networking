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
  autoload: true,
  autoloadCallback: dbReady,
  autosave: true,
  autosaveInterval: 2000,
  serializationMethod: 'pretty'
});

let users, works;

function dbReady() {
  users = db.getCollection('users') || db.addCollection('users', { unique: ['email'] });
  works = db.getCollection('works') || db.addCollection('works');
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
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function safeUser(u) {
  if (!u) return null;
  const { password, $loki, meta, ...rest } = u;
  return rest;
}

app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (users.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });
  const hashed = await bcrypt.hash(password, 10);
  const id = uuidv4();
  users.insert({ id, email, password: hashed, name, bio: '', photo: '', instagram: '', website: '', created_at: new Date().toISOString() });
  const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, email, name, bio: '', photo: '', instagram: '', website: '' } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/profiles', (req, res) => {
  const all = users.find().map(u => ({
    ...safeUser(u),
    works: works.find({ user_id: u.id }).map(function(w) { var r = Object.assign({}, w); delete r.$loki; delete r.meta; return r; })
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(all);
});

app.get('/api/profiles/:id', (req, res) => {
  const user = users.findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const userWorks = works.find({ user_id: user.id }).map(function(w) { var r = Object.assign({}, w); delete r.$loki; delete r.meta; return r; });
  res.json(Object.assign({}, safeUser(user), { works: userWorks }));
});

app.put('/api/me', auth, (req, res) => {
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, bio, instagram, website, photo } = req.body;
  if (name) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (instagram !== undefined) user.instagram = instagram;
  if (website !== undefined) user.website = website;
  if (photo !== undefined) user.photo = photo;
  users.update(user);
  const userWorks = works.find({ user_id: user.id }).map(function(w) { var r = Object.assign({}, w); delete r.$loki; delete r.meta; return r; });
  res.json(Object.assign({}, safeUser(user), { works: userWorks }));
});

app.post('/api/me/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = users.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const url = '/uploads/' + req.file.filename;
  user.photo = url;
  users.update(user);
  res.json({ url });
});

app.post('/api/works', auth, upload.single('image'), (req, res) => {
  const { title, description, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const image = req.file ? '/uploads/' + req.file.filename : '';
  const id = uuidv4();
  const work = { id, user_id: req.user.id, title, description: description || '', url: url || '', image, created_at: new Date().toISOString() };
  works.insert(work);
  res.json(work);
});

app.put('/api/works/:id', auth, upload.single('image'), (req, res) => {
  const work = works.findOne({ id: req.params.id, user_id: req.user.id });
  if (!work) return res.status(404).json({ error: 'Not found' });
  const { title, description, url } = req.body;
  if (title) work.title = title;
  if (description !== undefined) work.description = description;
  if (url !== undefined) work.url = url;
  if (req.file) work.image = '/uploads/' + req.file.filename;
  works.update(work);
  var r = Object.assign({}, work); delete r.$loki; delete r.meta;
  res.json(r);
});

app.delete('/api/works/:id', auth, (req, res) => {
  const work = works.findOne({ id: req.params.id, user_id: req.user.id });
  if (!work) return res.status(404).json({ error: 'Not found' });
  works.remove(work);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
