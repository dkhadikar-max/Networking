// Workflow Engine — multi-step agent pipelines backed by Supabase
// Each workflow runs agents sequentially, passing output forward as context

export const WORKFLOW_TEMPLATES = {
  seo_audit: {
    description: 'SEO Audit Pipeline',
    steps: [
      { agent: 'research', type: 'seo_research',   msg: 'Audit the SEO strategy for BYN (buildyournetwork.online). Context: {context}' },
      { agent: 'growth',   type: 'seo_strategy',   msg: 'Based on this SEO research, produce a ranked growth strategy:\n\n{prev}' },
      { agent: 'pm',       type: 'prioritization', msg: 'Prioritize these growth initiatives by impact-to-effort ratio:\n\n{prev}' },
    ],
  },
  content_review: {
    description: 'Content Review Pipeline',
    steps: [
      { agent: 'growth',   type: 'content_draft',   msg: 'Draft content for BYN targeting: {context}' },
      { agent: 'qa',       type: 'content_review',  msg: 'Review this content for quality, accuracy, and brand alignment:\n\n{prev}' },
      { agent: 'ceo',      type: 'final_approval',  msg: 'Approve or reject with specific feedback:\n\n{prev}' },
    ],
  },
  security_review: {
    description: 'Security Review Pipeline',
    steps: [
      { agent: 'security', type: 'vulnerability_scan', msg: 'Security audit for BYN. Focus area: {context}' },
      { agent: 'backend',  type: 'fix_planning',       msg: 'Plan concrete fixes for these vulnerabilities:\n\n{prev}' },
      { agent: 'qa',       type: 'fix_verification',   msg: 'Verify these fixes fully close each vulnerability:\n\n{prev}' },
    ],
  },
  founder_acquisition: {
    description: 'Founder Acquisition Pipeline',
    steps: [
      { agent: 'research', type: 'market_research',   msg: 'Research Indian founder communities and acquisition channels. Context: {context}' },
      { agent: 'growth',   type: 'outreach_strategy', msg: 'Build a concrete outreach strategy from this research:\n\n{prev}' },
      { agent: 'pm',       type: 'execution_plan',    msg: 'Create a 30-day execution plan with weekly milestones:\n\n{prev}' },
    ],
  },
  product_review: {
    description: 'Product Review Pipeline',
    steps: [
      { agent: 'research',  type: 'user_research',    msg: 'Analyze BYN product-market fit for founders in India. Context: {context}' },
      { agent: 'frontend',  type: 'ux_review',        msg: 'UX review based on this user research:\n\n{prev}' },
      { agent: 'backend',   type: 'tech_review',      msg: 'Technical feasibility of these UX improvements:\n\n{prev}' },
      { agent: 'ceo',       type: 'roadmap_decision', msg: 'Prioritize into product roadmap:\n\n{prev}' },
    ],
  },
};

export class WorkflowEngine {
  constructor(supabase, orchestrator) {
    this.supabase = supabase;
    this.orchestrator = orchestrator;
  }

  async create({ template, context = {}, createdBy = 'admin' }) {
    const def = WORKFLOW_TEMPLATES[template];
    if (!def) {
      const available = Object.keys(WORKFLOW_TEMPLATES).join(', ');
      throw new Error(`Unknown template: ${template}. Available: ${available}`);
    }
    const steps = def.steps.map((s, i) => ({
      index: i, agent: s.agent, type: s.type, msg: s.msg,
      status: 'pending', task_id: null, output: null, error: null,
    }));
    const { data, error } = await this.supabase.from('agent_workflows').insert({
      name: def.description, template, status: 'running',
      steps, current_step: 0, context, created_by: createdBy,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  // Run a single next step; returns updated workflow
  async advance(workflowId) {
    const { data: wf, error } = await this.supabase.from('agent_workflows')
      .select('*').eq('id', workflowId).single();
    if (error || !wf) throw new Error('Workflow not found: ' + workflowId);
    if (wf.status !== 'running') throw new Error(`Workflow is ${wf.status} — cannot advance`);

    const steps = wf.steps;
    if (wf.current_step >= steps.length) return this._markDone(wf);

    const step = steps[wf.current_step];
    const prevOutput = wf.current_step > 0 ? (steps[wf.current_step - 1].output || '') : '';
    const message = step.msg
      .replace('{context}', JSON.stringify(wf.context))
      .replace('{prev}', prevOutput);

    try {
      const result = await this.orchestrator.runDirect(step.agent, message, wf.context);
      steps[wf.current_step] = { ...step, status: 'completed', output: result.output };

      const nextIdx = wf.current_step + 1;
      const done = nextIdx >= steps.length;
      await this.supabase.from('agent_workflows').update({
        steps,
        current_step: nextIdx,
        status: done ? 'completed' : 'running',
        completed_at: done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', workflowId);

      return { ...wf, steps, current_step: nextIdx, status: done ? 'completed' : 'running' };
    } catch (e) {
      steps[wf.current_step] = { ...step, status: 'failed', error: e.message };
      await this.supabase.from('agent_workflows').update({
        steps, status: 'failed', error: e.message, updated_at: new Date().toISOString(),
      }).eq('id', workflowId);
      throw e;
    }
  }

  // Run all remaining steps sequentially (blocks until complete or failure)
  async runAll(workflowId) {
    let wf = await this.get(workflowId);
    while (wf.status === 'running' && wf.current_step < wf.steps.length) {
      wf = await this.advance(workflowId);
    }
    return wf;
  }

  async list({ status, limit = 50 } = {}) {
    let q = this.supabase.from('agent_workflows')
      .select('id,name,template,status,current_step,steps,error,created_by,created_at,updated_at,completed_at')
      .order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async get(id) {
    const { data, error } = await this.supabase.from('agent_workflows').select('*').eq('id', id).single();
    if (error) throw new Error('Workflow not found: ' + id);
    return data;
  }

  async pause(id) {
    await this.supabase.from('agent_workflows')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'running');
  }

  async resume(id) {
    await this.supabase.from('agent_workflows')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'paused');
  }

  async _markDone(wf) {
    await this.supabase.from('agent_workflows').update({
      status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', wf.id);
    return { ...wf, status: 'completed' };
  }
}
