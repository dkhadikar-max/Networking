const ROUTES = [
  { agent: 'research', words: ['research', 'investigate', 'find', 'compare', 'market', 'competitor'] },
  { agent: 'ceo', words: ['strategy', 'priority', 'decision', 'what should i', 'plan'] },
  { agent: 'frontend', words: ['ui', 'ux', 'frontend', 'screen', 'design', 'interface'] },
  { agent: 'backend', words: ['api', 'backend', 'database', 'endpoint', 'server'] },
  { agent: 'qa', words: ['test', 'bug', 'audit', 'qa', 'quality', 'verify'] },
  { agent: 'devops', words: ['deploy', 'railway', 'production', 'build', 'ci', 'deployment'] },
  { agent: 'growth', words: ['growth', 'marketing', 'acquisition', 'content', 'funnel'] },
  { agent: 'security', words: ['security', 'permission', 'secret', 'vulnerability'] },
  { agent: 'pm', words: ['task', 'roadmap', 'milestone', 'feature', 'project'] },
];

export function routeIntent(message) {
  const text = String(message || '').toLowerCase();
  let best = { agent: 'ceo', score: 0 };
  for (const route of ROUTES) {
    const score = route.words.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0);
    if (score > best.score) best = { agent: route.agent, score };
  }
  return { agent: best.agent, confidence: Math.min(0.95, best.score ? 0.55 + best.score * 0.1 : 0.35) };
}
