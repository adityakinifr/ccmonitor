import type { FastifyInstance } from 'fastify';
import type { Repository } from '../db/repository.js';

export function registerSessionsRoutes(app: FastifyInstance, repo: Repository): void {
  // Get all sessions
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/api/sessions', async (request, reply) => {
    const { limit = '50', offset = '0' } = request.query;
    const sessions = repo.getSessions(parseInt(limit, 10), parseInt(offset, 10));
    return reply.send({ sessions });
  });

  // Get single session with events
  app.get<{
    Params: { id: string };
  }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const session = repo.getSession(id);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const events = repo.getSessionEvents(id);

    return reply.send({
      session: {
        id: session.id,
        projectPath: session.project_path,
        gitBranch: session.git_branch,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        totalInputTokens: session.total_input_tokens,
        totalOutputTokens: session.total_output_tokens,
        totalCostUsd: session.total_cost_usd,
        version: session.version,
      },
      events,
    });
  });
}
