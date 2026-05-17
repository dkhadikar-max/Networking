// AI Agent base class — wraps Anthropic Claude, loads system prompt from agents/<name>.md
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dir = path.dirname(fileURLToPath(import.meta.url));

export const AGENT_NAMES = ['ceo', 'backend', 'frontend', 'growth', 'security', 'qa', 'pm', 'research', 'devops'];

function loadPrompt(name) {
  try {
    return fs.readFileSync(path.join(__dir, `${name}.md`), 'utf8').trim();
  } catch {
    return `You are the ${name} agent. Be precise, concise, and output structured JSON where possible.`;
  }
}

export class BaseAgent {
  constructor(name, supabase) {
    this.name = name;
    this.supabase = supabase;
    this.systemPrompt = loadPrompt(name);
    this.client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  // Run the agent against a task. taskId may be null for direct (non-queued) runs.
  async run(taskId, userMessage, context = {}) {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY not configured');

    const t0 = Date.now();
    const content = Object.keys(context).length
      ? `Context:\n${JSON.stringify(context, null, 2)}\n\nTask:\n${userMessage}`
      : userMessage;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: 'user', content }],
    });

    const duration_ms = Date.now() - t0;
    const output = response.content[0]?.text ?? '';

    await this._log(taskId, 'info', 'run completed', {
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
      duration_ms,
    });

    return {
      output,
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
      duration_ms,
      model: response.model,
      stop_reason: response.stop_reason,
    };
  }

  async _log(taskId, level, message, metadata = {}) {
    if (!taskId || !this.supabase) return;
    await this.supabase.from('agent_logs').insert({
      task_id: taskId, agent: this.name, level, message, metadata,
    }).catch(e => console.warn(`[${this.name}] log error:`, e.message));
  }
}
