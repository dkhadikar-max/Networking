// Agent memory layer — persistent key/value store backed by Supabase agent_memory table
export class AgentMemory {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async set(agent, key, value, category = 'general', confidence = 1.0, expiresAt = null) {
    const payload = {
      agent, key,
      value: typeof value === 'object' && value !== null ? value : { value },
      category, confidence,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.supabase.from('agent_memory')
      .upsert(payload, { onConflict: 'agent,key' })
      .select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async get(agent, key) {
    const { data, error } = await this.supabase.from('agent_memory')
      .select('*').eq('agent', agent).eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    return data;
  }

  async list({ agent, category, limit = 100 } = {}) {
    let q = this.supabase.from('agent_memory')
      .select('*').order('updated_at', { ascending: false }).limit(limit);
    if (agent) q = q.eq('agent', agent);
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const now = new Date();
    return (data || []).filter(m => !m.expires_at || new Date(m.expires_at) > now);
  }

  async delete(id) {
    const { error } = await this.supabase.from('agent_memory').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}
