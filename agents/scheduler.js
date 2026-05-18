// Background scheduler — polls Supabase every 60s for pending tasks, runs them with retry backoff
// No Redis or external daemon required — runs inside the Express process

const POLL_MS     = 60_000;
const MAX_CONC    = 2;   // max tasks running in parallel per tick
const MAX_RETRIES = 3;
const BACKOFF_MS  = [60_000, 300_000, 900_000]; // 1min → 5min → 15min

export class AgentScheduler {
  constructor(supabase, orchestrator) {
    this.supabase     = supabase;
    this.orchestrator = orchestrator;
    this._interval    = null;
    this._ticking     = false;
    this.lastTick     = null;
    this.tasksDone    = 0;
    this.tasksFailed  = 0;
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), POLL_MS);
    setImmediate(() => this._tick()); // run once immediately on startup
    console.log('[Scheduler] Started — polling every 60s');
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  status() {
    return {
      active: !!this._interval,
      ticking: this._ticking,
      poll_interval_ms: POLL_MS,
      last_tick: this.lastTick,
      tasks_done: this.tasksDone,
      tasks_failed: this.tasksFailed,
    };
  }

  async _tick() {
    if (this._ticking) return;
    this._ticking = true;
    this.lastTick = new Date().toISOString();
    try {
      await this._processTasks();
    } catch (e) {
      console.error('[Scheduler] Tick error:', e.message);
    } finally {
      this._ticking = false;
    }
  }

  async _processTasks() {
    const now = new Date().toISOString();
    const { data: tasks, error } = await this.supabase
      .from('agent_tasks')
      .select('id,agent,type,retry_count')
      .eq('status', 'pending')
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(MAX_CONC);

    if (error) { console.error('[Scheduler] Query error:', error.message); return; }
    if (!tasks?.length) return;

    console.log(`[Scheduler] Processing ${tasks.length} task(s)`);
    await Promise.allSettled(tasks.map(t => this._runTask(t)));
  }

  async _runTask(task) {
    try {
      await this.orchestrator.executeTask(task.id);
      this.tasksDone++;
      console.log(`[Scheduler] ✓ ${task.id} (${task.agent}/${task.type})`);
    } catch (e) {
      const attempts = (task.retry_count || 0) + 1;
      if (attempts <= MAX_RETRIES) {
        const backoff = BACKOFF_MS[attempts - 1] ?? 900_000;
        const retryAt = new Date(Date.now() + backoff).toISOString();
        await this.supabase.from('agent_tasks').update({
          status: 'pending', retry_count: attempts, next_retry_at: retryAt,
        }).eq('id', task.id);
        console.warn(`[Scheduler] ✗ ${task.id} attempt ${attempts}/${MAX_RETRIES}, retry at ${retryAt}`);
      } else {
        this.tasksFailed++;
        console.error(`[Scheduler] ✗ ${task.id} permanently failed after ${MAX_RETRIES} attempts`);
      }
    }
  }
}
