import { EventEmitter } from 'events';

export interface PendingApproval {
  id: string;
  taskId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  projectPath: string;
  normalizedText: string;
  createdAt: number;
  timeoutMs: number;
  resolve: (decision: 'allow' | 'deny' | 'timeout') => void;
}

export interface WhatsAppBusinessConfig {
  enabled: boolean;
  accessToken: string | null;
  phoneNumberId: string | null; // Your business phone number ID
  targetNumber: string | null; // User's phone number to send to
  timeoutMs: number;
}

interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

class WhatsAppBusinessService extends EventEmitter {
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalCounter = 0;
  private webhookVerifyToken: string;
  private config: WhatsAppBusinessConfig = {
    enabled: false,
    accessToken: null,
    phoneNumberId: null,
    targetNumber: null,
    timeoutMs: 5 * 60 * 1000, // 5 minutes default
  };

  constructor() {
    super();
    // Generate a random verify token for webhook
    this.webhookVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'ccmonitor_verify_' + Math.random().toString(36).slice(2);

    // Load config from env if available
    if (process.env.WHATSAPP_ACCESS_TOKEN) {
      this.config.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    }
    if (process.env.WHATSAPP_PHONE_NUMBER_ID) {
      this.config.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
    if (process.env.WHATSAPP_TARGET_NUMBER) {
      this.config.targetNumber = process.env.WHATSAPP_TARGET_NUMBER;
    }
  }

  getVerifyToken(): string {
    return this.webhookVerifyToken;
  }

  // Handle incoming webhook from Meta
  handleWebhook(body: unknown): void {
    const data = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from: string;
              type: string;
              interactive?: {
                type: string;
                button_reply?: { id: string; title: string };
              };
              text?: { body: string };
            }>;
          };
        }>;
      }>;
    };

    const entry = data.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return;

    console.log('[WhatsApp Business] Received message:', JSON.stringify(message));

    // Handle interactive button reply
    if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
      const buttonId = message.interactive.button_reply?.id;
      // Button ID format: "approve_5" or "deny_5"
      const match = buttonId?.match(/^(approve|deny)_(\d+)$/);

      if (match) {
        const [, action, approvalId] = match;
        const decision = action === 'approve' ? 'allow' : 'deny';
        this.resolveApproval(approvalId, decision);
      }
    }
    // Handle text message fallback
    else if (message.type === 'text' && message.text?.body) {
      const body = message.text.body.trim().toLowerCase();
      const match = body.match(/^(\d+)\s*(y|n|yes|no|allow|deny)?$/i);

      if (match) {
        const approvalId = match[1];
        const action = match[2]?.toLowerCase();
        let decision: 'allow' | 'deny' = 'allow';

        if (action === 'n' || action === 'no' || action === 'deny') {
          decision = 'deny';
        }

        this.resolveApproval(approvalId, decision);
      }
    }
  }

  async requestApproval(params: {
    taskId: string;
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    projectPath: string;
    normalizedText: string;
    timeoutMs?: number;
  }): Promise<'allow' | 'deny' | 'timeout'> {
    if (!this.isReady()) {
      console.log('[WhatsApp Business] Not configured');
      return 'deny';
    }

    const id = String(++this.approvalCounter);
    const timeoutMs = params.timeoutMs || this.config.timeoutMs;

    return new Promise((resolve) => {
      const approval: PendingApproval = {
        id,
        taskId: params.taskId,
        sessionId: params.sessionId,
        toolName: params.toolName,
        toolInput: params.toolInput,
        projectPath: params.projectPath,
        normalizedText: params.normalizedText,
        createdAt: Date.now(),
        timeoutMs,
        resolve,
      };

      this.pendingApprovals.set(id, approval);

      // Send WhatsApp message with buttons
      this.sendApprovalRequest(approval);

      // Set timeout
      setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          console.log(`[WhatsApp Business] Approval ${id} timed out`);
          this.resolveApproval(id, 'timeout');
        }
      }, timeoutMs);
    });
  }

  private async sendApprovalRequest(approval: PendingApproval): Promise<void> {
    if (!this.config.accessToken || !this.config.phoneNumberId || !this.config.targetNumber) {
      console.error('[WhatsApp Business] Missing configuration');
      return;
    }

    const timeoutMins = Math.floor(approval.timeoutMs / 60000);
    const projectName = approval.projectPath.split('/').pop() || approval.projectPath;

    // Interactive message with buttons
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.config.targetNumber.replace(/[^0-9]/g, ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: `🔔 Approval #${approval.id}`,
        },
        body: {
          text: `*${approval.toolName}*\n📁 ${projectName}\n\n\`\`\`\n${approval.normalizedText.slice(0, 300)}\n\`\`\`\n\n⏱ Auto-deny in ${timeoutMins} min`,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `approve_${approval.id}`,
                title: '✅ Allow',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `deny_${approval.id}`,
                title: '❌ Deny',
              },
            },
          ],
        },
      },
    };

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${this.config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messagePayload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('[WhatsApp Business] API error:', response.status, error);
        return;
      }

      const result = await response.json() as WhatsAppMessageResponse;
      console.log(`[WhatsApp Business] Sent approval #${approval.id}:`, result.messages?.[0]?.id);
    } catch (error) {
      console.error('[WhatsApp Business] Failed to send:', error);
      this.resolveApproval(approval.id, 'timeout');
    }
  }

  private resolveApproval(id: string, decision: 'allow' | 'deny' | 'timeout'): void {
    const approval = this.pendingApprovals.get(id);
    if (approval) {
      console.log(`[WhatsApp Business] Resolving #${id}: ${decision}`);
      this.pendingApprovals.delete(id);
      approval.resolve(decision);
      this.emit('decision', { id, decision, approval });
    }
  }

  manualResolve(id: string, decision: 'allow' | 'deny'): boolean {
    const approval = this.pendingApprovals.get(id);
    if (approval) {
      console.log(`[WhatsApp Business] Manual resolution for ${id}: ${decision}`);
      this.resolveApproval(id, decision);
      return true;
    }
    return false;
  }

  setConfig(config: Partial<WhatsAppBusinessConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[WhatsApp Business] Config updated');
  }

  getConfig(): WhatsAppBusinessConfig {
    return { ...this.config };
  }

  getStatus(): {
    configured: boolean;
    enabled: boolean;
    pendingCount: number;
    config: Omit<WhatsAppBusinessConfig, 'accessToken'> & { hasAccessToken: boolean };
  } {
    return {
      configured: !!(this.config.accessToken && this.config.phoneNumberId && this.config.targetNumber),
      enabled: this.config.enabled,
      pendingCount: this.pendingApprovals.size,
      config: {
        enabled: this.config.enabled,
        phoneNumberId: this.config.phoneNumberId,
        targetNumber: this.config.targetNumber,
        timeoutMs: this.config.timeoutMs,
        hasAccessToken: !!this.config.accessToken,
      },
    };
  }

  getPendingApprovals(): Omit<PendingApproval, 'resolve'>[] {
    return Array.from(this.pendingApprovals.values()).map(({ resolve, ...rest }) => rest);
  }

  isReady(): boolean {
    return (
      this.config.enabled &&
      !!this.config.accessToken &&
      !!this.config.phoneNumberId &&
      !!this.config.targetNumber
    );
  }
}

// Singleton instance
export const whatsappBusinessService = new WhatsAppBusinessService();
