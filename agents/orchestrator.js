// Agent Orchestrator — Supabase-backed task queue and agent dispatcher
import { BaseAgent, AGENT_NAMES } from './base.js';

export class AgentOrchestrator {
  constructor(supabase) {
    this.supabase = supabase;
    // Instantiate all agents upfront so prompts are loaded once
    this.agents = Object.fromEntries(
      AGENT_NAMES.map(name => [name, new BaseAgent(name, supabase)])
    );
  }

  async createTask({ type, agent, payload = {}, priority = 5, createdBy = 'admin' }) {
    if (!AGENT_NAMES.includes(agent)) throw new Error(`Unknown agent: ${agent}`);
    const { data, error } = await this.supabase.from('agent_tasks').insert({
      type, agent, payload, priority, status: 'pending', created_by: createdBy,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async executeTask(taskId) {
    await this.supabase.from('agent_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', taskId);

    const { data: task, error } = await this.supabase.from('agent_tasks')
      .select('*').eq('id', taskId).single();
    if (error || !task) throw new Error('Task not found: ' + taskId);

    const agent = this.agents[task.agent];
    if (!agent) {
      await this._failTask(taskId, `No agent registered for: ${task.agent}`);
      throw new Error(`No agent: ${task.agent}`);
    }

    try {
      const message = task.payload.message || task.payload.prompt || JSON.stringify(task.payload);
      const ctx = { ...task.payload, task_type: task.type };
      delete ctx.message;
      delete ctx.prompt;

      const result = await agent.run(taskId, message, ctx);

      await this.supabase.from('agent_tasks').update({
        status: 'completed',
        result: { output: result.output, model: result.model, stop_reason: result.stop_reason },
        tokens_used: result.tokens_in + result.tokens_out,
        duration_ms: result.duration_ms,
        completed_at: new Date().toISOString(),
      }).eq('id', taskId);

      return result;
    } catch (e) {
      await this._failTask(taskId, e.message);
      throw e;
    }
  }

  async listTasks({ status, agent, limit = 50 } = {}) {
    let q = this.supabase.from('agent_tasks')
      .select('id,type,agent,status,priority,tokens_used,duration_ms,error,created_at,started_at,completed_at,created_by')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    if (agent) q = q.eq('agent', agent);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getTask(taskId) {
    const [taskRes, logsRes] = await Promise.all([
      this.supabase.from('agent_tasks').select('*').eq('id', taskId).single(),
      this.supabase.from('agent_logs').select('*').eq('task_id', taskId).order('created_at'),
    ]);
    if (taskRes.error) throw new Error('Task not found: ' + taskId);
    return { ...taskRes.data, logs: logsRes.data || [] };
  }

  async retryTask(taskId) {
    const { error } = await this.supabase.from('agent_tasks').update({
      status: 'pending', error: null, result: null, started_at: null, completed_at: null,
    }).eq('id', taskId).eq('status', 'failed');
    if (error) throw new Error(error.message);
  }

  // Run an agent directly without creating a persistent task (for quick queries)
  async runDirect(agentName, message, context = {}) {
    if (!AGENT_NAMES.includes(agentName)) throw new Error(`Unknown agent: ${agentName}`);
    return this.agents[agentName].run(null, message, context);
  }

  async _failTask(taskId, errorMsg) {
    await this.supabase.from('agent_tasks').update({
      status: 'failed', error: errorMsg, completed_at: new Date().toISOString(),
    }).eq('id', taskId);
  }
}
