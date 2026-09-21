import type { FastifyInstance } from 'fastify';
import { whatsappService } from '../services/whatsapp.js';

interface ConfigBody {
  enabled?: boolean;
  targetNumber?: string;
  timeoutMs?: number;
}

export function registerWhatsAppRoutes(app: FastifyInstance): void {
  // Get WhatsApp status
  app.get('/api/whatsapp/status', async (_request, reply) => {
    const status = whatsappService.getStatus();
    return reply.send(status);
  });

  // Initialize WhatsApp client (starts QR code flow)
  app.post('/api/whatsapp/init', async (_request, reply) => {
    try {
      await whatsappService.initialize();
      return reply.send({ success: true, message: 'WhatsApp client initializing' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // Update configuration
  app.post<{ Body: ConfigBody }>('/api/whatsapp/config', async (request, reply) => {
    const { enabled, targetNumber, timeoutMs } = request.body;

    const updates: Partial<ConfigBody> = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof targetNumber === 'string') updates.targetNumber = targetNumber;
    if (typeof timeoutMs === 'number') updates.timeoutMs = timeoutMs;

    whatsappService.setConfig(updates);

    return reply.send({
      success: true,
      config: whatsappService.getConfig(),
    });
  });

  // Get pending approvals
  app.get('/api/whatsapp/pending', async (_request, reply) => {
    const pending = whatsappService.getPendingApprovals();
    return reply.send({ pending });
  });

  // Manually approve/deny from UI
  app.post<{ Params: { id: string }; Body: { decision: 'allow' | 'deny' } }>(
    '/api/whatsapp/pending/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { decision } = request.body;

      if (!decision || !['allow', 'deny'].includes(decision)) {
        return reply.status(400).send({ error: 'decision must be allow or deny' });
      }

      const resolved = whatsappService.manualResolve(id, decision);

      if (!resolved) {
        return reply.status(404).send({ error: 'Pending approval not found or already resolved' });
      }

      return reply.send({
        success: true,
        message: `Approval ${id} ${decision}ed`,
      });
    }
  );

  // Test send a message (for debugging)
  app.post<{ Body: { message: string } }>('/api/whatsapp/test', async (request, reply) => {
    const { message } = request.body;
    const status = whatsappService.getStatus();

    if (!status.ready) {
      return reply.status(400).send({ error: 'WhatsApp not ready' });
    }

    if (!status.config.targetNumber) {
      return reply.status(400).send({ error: 'No target number configured' });
    }

    // For testing, we'd need to expose a send method
    return reply.send({
      success: true,
      message: 'Test message endpoint - use WhatsApp directly',
    });
  });
}
