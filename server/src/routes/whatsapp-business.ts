import type { FastifyInstance } from 'fastify';
import { whatsappBusinessService } from '../services/whatsapp-business.js';

interface ConfigBody {
  enabled?: boolean;
  accessToken?: string;
  phoneNumberId?: string;
  targetNumber?: string;
  timeoutMs?: number;
}

interface WebhookQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export function registerWhatsAppBusinessRoutes(app: FastifyInstance): void {
  // Get WhatsApp Business status
  app.get('/api/whatsapp-business/status', async (_request, reply) => {
    const status = whatsappBusinessService.getStatus();
    return reply.send(status);
  });

  // Update configuration
  app.post<{ Body: ConfigBody }>('/api/whatsapp-business/config', async (request, reply) => {
    const { enabled, accessToken, phoneNumberId, targetNumber, timeoutMs } = request.body;

    const updates: Partial<ConfigBody> = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof accessToken === 'string') updates.accessToken = accessToken;
    if (typeof phoneNumberId === 'string') updates.phoneNumberId = phoneNumberId;
    if (typeof targetNumber === 'string') updates.targetNumber = targetNumber;
    if (typeof timeoutMs === 'number') updates.timeoutMs = timeoutMs;

    whatsappBusinessService.setConfig(updates);

    return reply.send({
      success: true,
      status: whatsappBusinessService.getStatus(),
    });
  });

  // Get pending approvals
  app.get('/api/whatsapp-business/pending', async (_request, reply) => {
    const pending = whatsappBusinessService.getPendingApprovals();
    return reply.send({ pending });
  });

  // Manual approve/deny from UI
  app.post<{ Params: { id: string }; Body: { decision: 'allow' | 'deny' } }>(
    '/api/whatsapp-business/pending/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { decision } = request.body;

      if (!decision || !['allow', 'deny'].includes(decision)) {
        return reply.status(400).send({ error: 'decision must be allow or deny' });
      }

      const resolved = whatsappBusinessService.manualResolve(id, decision);

      if (!resolved) {
        return reply.status(404).send({ error: 'Pending approval not found or already resolved' });
      }

      return reply.send({
        success: true,
        message: `Approval ${id} ${decision}ed`,
      });
    }
  );

  // Meta Webhook Verification (GET)
  // Meta sends this to verify your webhook URL
  app.get<{ Querystring: WebhookQuery }>('/api/whatsapp-business/webhook', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const verifyToken = whatsappBusinessService.getVerifyToken();

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Business] Webhook verified');
      return reply.send(challenge);
    }

    console.log('[WhatsApp Business] Webhook verification failed');
    return reply.status(403).send('Verification failed');
  });

  // Meta Webhook (POST)
  // Receives messages and button clicks from WhatsApp
  app.post('/api/whatsapp-business/webhook', async (request, reply) => {
    try {
      whatsappBusinessService.handleWebhook(request.body);
      return reply.send('OK');
    } catch (error) {
      console.error('[WhatsApp Business] Webhook error:', error);
      return reply.send('OK'); // Always return 200 to Meta
    }
  });

  // Get setup instructions
  app.get('/api/whatsapp-business/setup', async (_request, reply) => {
    const verifyToken = whatsappBusinessService.getVerifyToken();

    return reply.send({
      instructions: [
        '1. Go to developers.facebook.com and log in',
        '2. Click "Create App" → Select "Other" → Then "Business"',
        '3. Or: Select use case "Connect with customers through WhatsApp"',
        '4. Select/create a Business Portfolio and finish creating the app',
        '5. Go to WhatsApp → API Setup in the left menu',
        '6. Click "Generate access token" (temporary, 24hr) or create a System User token',
        '7. Copy the Phone Number ID shown on that page',
        '8. Add a test recipient phone number (your number)',
        '9. Go to WhatsApp → Configuration → Edit webhook',
        '10. Enter webhook URL and verify token below, subscribe to "messages"',
      ],
      webhookUrl: `YOUR_PUBLIC_URL/api/whatsapp-business/webhook`,
      verifyToken,
      fields: ['messages'],
      notes: [
        'Your server must be publicly accessible (use ngrok for local testing)',
        'Temporary tokens expire in 24 hours - create a System User for permanent token',
        'Go to Business Settings → System Users → Add Assets → Select your app',
      ],
    });
  });
}
