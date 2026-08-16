import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { JarvisV1 } from './core/jarvis.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: true, credentials: true }));

const PORT = Number(process.env.JARVIS_PORT || 4100);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const jarvis = new JarvisV1({
  supabase,
  autoExecute: process.env.JARVIS_AUTO_EXECUTE === 'true',
});

app.get('/health', (_req, res) => {
  res.json({ service: 'jarvis-v1', status: 'ok', version: '1.0.0' });
});

app.post('/api/jarvis/command', async (req, res) => {
  try {
    const { message, context = {} } = req.body || {};
    const result = await jarvis.handle(message, context);
    res.json(result);
  } catch (error) {
    console.error('[jarvis]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jarvis/tasks', async (req, res) => {
  try {
    const result = await jarvis.status({
      status: req.query.status,
      agent: req.query.agent,
      limit: Math.min(Number(req.query.limit || 20), 100),
    });
    res.json({ tasks: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jarvis/tasks/:id', async (req, res) => {
  try {
    res.json(await jarvis.task(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`JARVIS V1 listening on ${PORT}`));
