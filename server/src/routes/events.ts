import type { FastifyInstance } from 'fastify';
import type { HookEvent } from '../types/index.js';
import { EventProcessor } from '../services/event-processor.js';
import type { Repository } from '../db/repository.js';

export function registerEventsRoutes(app: FastifyInstance, repo: Repository): void {
  const processor = new EventProcessor(repo);

  // Receive hook events
  app.post<{ Body: HookEvent }>('/api/events', async (request, reply) => {
    try {
      const event = request.body;

      if (!event.session_id || !event.hook_event_name) {
        return reply.status(400).send({ error: 'Missing session_id or hook_event_name' });
      }

      // Ensure timestamp
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      const processedEvent = processor.processHookEvent(event);
      return reply.send({ success: true, event: processedEvent });
    } catch (error) {
      console.error('[Events] Error processing event:', error);
      return reply.status(500).send({ error: 'Failed to process event' });
    }
  });

  // Get recent events
  app.get<{
    Querystring: { session_id?: string; limit?: string; offset?: string };
  }>('/api/events', async (request, reply) => {
    const { session_id, limit = '100', offset = '0' } = request.query;
    const events = repo.getEvents(session_id, parseInt(limit, 10), parseInt(offset, 10));
    return reply.send({ events });
  });

  // Search events
  app.get<{
    Querystring: { q: string; limit?: string };
  }>('/api/events/search', async (request, reply) => {
    const { q, limit = '50' } = request.query;
    if (!q) {
      return reply.status(400).send({ error: 'Missing query parameter q' });
    }
    const events = repo.searchEvents(q, parseInt(limit, 10));
    return reply.send({ events });
  });
}
