const LEVELS = Object.freeze({ READ: 'read', EXECUTE: 'execute', APPROVE: 'approve' });

const RULES = [
  { action: 'read', level: LEVELS.READ },
  { action: 'research', level: LEVELS.READ },
  { action: 'analyze', level: LEVELS.READ },
  { action: 'draft', level: LEVELS.READ },
  { action: 'code', level: LEVELS.EXECUTE },
  { action: 'test', level: LEVELS.EXECUTE },
  { action: 'browser', level: LEVELS.EXECUTE },
  { action: 'send', level: LEVELS.APPROVE },
  { action: 'deploy-production', level: LEVELS.APPROVE },
  { action: 'delete', level: LEVELS.APPROVE },
  { action: 'purchase', level: LEVELS.APPROVE },
];

export class PermissionPolicy {
  constructor({ autoExecute = false } = {}) {
    this.autoExecute = autoExecute;
  }

  check(action) {
    const rule = RULES.find(r => action === r.action);
    if (!rule) return { allowed: false, level: LEVELS.APPROVE, reason: 'Unknown action' };
    if (rule.level === LEVELS.READ) return { allowed: true, level: rule.level };
    if (rule.level === LEVELS.EXECUTE && this.autoExecute) return { allowed: true, level: rule.level };
    return { allowed: false, level: rule.level, reason: 'Approval required' };
  }
}

export { LEVELS };
