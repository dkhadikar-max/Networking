import { AgentOrchestrator } from '../../agents/orchestrator.js';
import { routeIntent } from './router.js';
import { PermissionPolicy } from './permissions.js';

export class JarvisV1 {
  constructor({ supabase, autoExecute = false, toolAdapters = {} }) {
    this.orchestrator = new AgentOrchestrator(supabase);
    this.permissions = new PermissionPolicy({ autoExecute });
    this.tools = toolAdapters;
  }

  async handle(message, context = {}) {
    if (!message?.trim()) throw new Error('JARVIS requires a command');

    const route = routeIntent(message);
    const action = context.action || 'analyze';
    const permission = this.permissions.check(action);

    if (!permission.allowed) {
      return {
        status: 'approval_required',
        agent: route.agent,
        confidence: route.confidence,
        action,
        reason: permission.reason,
      };
    }

    const task = await this.orchestrator.createTask({
      type: context.type || 'jarvis_command',
      agent: route.agent,
      priority: context.priority || 5,
      createdBy: context.createdBy || 'jarvis',
      payload: { message, ...context, route },
    });

    const result = await this.orchestrator.executeTask(task.id);

    return {
      status: 'completed',
      taskId: task.id,
      agent: route.agent,
      confidence: route.confidence,
      output: result.output,
      model: result.model,
      duration_ms: result.duration_ms,
    };
  }

  async status({ status, agent, limit = 20 } = {}) {
    return this.orchestrator.listTasks({ status, agent, limit });
  }

  async task(taskId) {
    return this.orchestrator.getTask(taskId);
  }
}
