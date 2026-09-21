import type { FastifyInstance } from 'fastify';
import type { Repository } from '../db/repository.js';
import { wsBroadcaster } from '../services/websocket.js';
import { randomUUID } from 'crypto';
import { basename } from 'path';

interface RegisterBody {
  sessionId: string;
  machine?: string;
  cwd?: string;
}

interface CompleteBody {
  taskId: string;
}

interface ResumeBody {
  taskId: string;
}

interface AutopilotBody {
  taskId: string;
  check: string;
}

interface ManualTaskBody {
  title: string;
}

interface UpdateTaskBody {
  autopilot?: boolean;
  adaptiveMode?: boolean;
  tier?: 'routine' | 'important' | 'urgent';
  title?: string;
  status?: 'queued' | 'working' | 'done';
}

export function registerTasksRoutes(app: FastifyInstance, repo: Repository): void {
  // List all tasks
  app.get('/api/tasks', async (_request, reply) => {
    const tasks = repo.getTasks();
    return reply.send({ tasks });
  });

  // Register a session as a task (called by hooks)
  app.post<{ Body: RegisterBody }>('/api/tasks/register', async (request, reply) => {
    const { sessionId, machine, cwd } = request.body;

    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId required' });
    }

    // Check if task already exists for this session
    const existing = repo.getTaskBySessionId(sessionId);
    if (existing) {
      return reply.send({ taskId: existing.id, resumed: true });
    }

    // Create new task
    const task = repo.createTask({
      id: randomUUID(),
      session_id: sessionId,
      title: cwd ? basename(cwd) : 'unknown',
      tier: 'routine',
      status: 'working',
      autopilot: false,
      machine: machine || 'unknown',
      cwd: cwd || null,
      manual: false,
      created_at: new Date().toISOString(),
      completed_at: null,
    });

    wsBroadcaster.broadcastTaskCreated(task);
    return reply.send({ taskId: task.id, resumed: false });
  });

  // Mark task as complete (called by Stop hook)
  app.post<{ Body: CompleteBody }>('/api/tasks/complete', async (request, reply) => {
    const { taskId } = request.body;

    if (!taskId) {
      return reply.status(400).send({ error: 'taskId required' });
    }

    const task = repo.completeTask(taskId);
    if (!task) {
      return reply.status(404).send({ error: 'not found' });
    }

    wsBroadcaster.broadcastTaskUpdated(task);
    return reply.send({ success: true });
  });

  // Check autopilot status (called by PreToolUse hook)
  app.post<{ Body: AutopilotBody }>('/api/tasks/autopilot', async (request, reply) => {
    const { taskId, check } = request.body;

    if (check !== '1') {
      return reply.send({ allow: false });
    }

    if (!taskId) {
      return reply.send({ allow: false });
    }

    const allowed = repo.checkAutopilot(taskId);
    return reply.send({ allow: allowed });
  });

  // Resume task (called by UserPromptSubmit hook)
  app.post<{ Body: ResumeBody }>('/api/tasks/resume', async (request, reply) => {
    const { taskId } = request.body;

    if (!taskId) {
      return reply.status(400).send({ error: 'taskId required' });
    }

    const task = repo.resumeTask(taskId);
    if (!task) {
      return reply.status(404).send({ error: 'not found' });
    }

    wsBroadcaster.broadcastTaskUpdated(task);
    return reply.send({ success: true });
  });

  // Create manual task
  app.post<{ Body: ManualTaskBody }>('/api/tasks/manual', async (request, reply) => {
    const { title } = request.body;

    if (!title || !title.trim()) {
      return reply.status(400).send({ error: 'title required' });
    }

    const task = repo.createTask({
      id: randomUUID(),
      session_id: null,
      title: title.trim(),
      tier: 'routine',
      status: 'queued',
      autopilot: false,
      machine: null,
      cwd: null,
      manual: true,
      created_at: new Date().toISOString(),
      completed_at: null,
    });

    wsBroadcaster.broadcastTaskCreated(task);
    return reply.send(task);
  });

  // Update task (toggle autopilot, adaptive mode, change tier, edit title, change status)
  app.patch<{ Params: { id: string }; Body: UpdateTaskBody }>('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const { autopilot, adaptiveMode, tier, title, status } = request.body;

    const existingTask = repo.getTask(id);
    if (!existingTask) {
      return reply.status(404).send({ error: 'not found' });
    }

    const updates: Parameters<typeof repo.updateTask>[1] = {};

    if (autopilot !== undefined) {
      updates.autopilot = autopilot;
    }
    if (adaptiveMode !== undefined) {
      updates.adaptive_mode = adaptiveMode;
    }
    if (tier !== undefined) {
      updates.tier = tier;
    }
    if (title !== undefined) {
      updates.title = title;
    }
    if (status !== undefined && existingTask.manual) {
      const validStatuses = ['queued', 'working', 'done'];
      if (validStatuses.includes(status)) {
        updates.status = status;
        updates.completed_at = status === 'done' ? new Date().toISOString() : null;
      }
    }

    const task = repo.updateTask(id, updates);
    if (task) {
      wsBroadcaster.broadcastTaskUpdated(task);
    }

    return reply.send(task);
  });

  // Delete task (called by SessionEnd hook)
  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const deleted = repo.deleteTask(id);
    if (deleted) {
      wsBroadcaster.broadcastTaskDeleted(id);
    }

    return reply.send({ success: true });
  });
}
