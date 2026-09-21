import whatsapp, { type Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';

// Use runtime values from default export (CommonJS module)
const WAClient = whatsapp.Client;
const WALocalAuth = whatsapp.LocalAuth;

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

export interface WhatsAppConfig {
  enabled: boolean;
  targetNumber: string | null; // Phone number to send approvals to
  timeoutMs: number; // Default timeout (5 minutes)
}

class WhatsAppService extends EventEmitter {
  private client: InstanceType<typeof WAClient> | null = null;
  private ready = false;
  private qrCode: string | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalCounter = 0;
  private config: WhatsAppConfig = {
    enabled: false,
    targetNumber: null,
    timeoutMs: 5 * 60 * 1000, // 5 minutes default
  };

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.client) {
      console.log('[WhatsApp] Already initialized');
      return;
    }

    console.log('[WhatsApp] Initializing client...');

    this.client = new WAClient({
      authStrategy: new WALocalAuth({
        dataPath: './data/whatsapp-session',
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', (qr) => {
      console.log('[WhatsApp] QR Code received. Scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
      this.qrCode = qr;
      this.emit('qr', qr);
    });

    this.client.on('ready', () => {
      console.log('[WhatsApp] Client is ready!');
      this.ready = true;
      this.qrCode = null;
      this.emit('ready');
    });

    this.client.on('authenticated', () => {
      console.log('[WhatsApp] Authenticated successfully');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('[WhatsApp] Authentication failed:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('[WhatsApp] Disconnected:', reason);
      this.ready = false;
      this.emit('disconnected', reason);
    });

    this.client.on('message', (message) => {
      this.handleIncomingMessage(message);
    });

    try {
      await this.client.initialize();
    } catch (error) {
      console.error('[WhatsApp] Failed to initialize:', error);
      throw error;
    }
  }

  private handleIncomingMessage(message: Message): void {
    const body = message.body.trim().toLowerCase();
    const from = message.from;

    // Only process messages from the configured target number
    if (this.config.targetNumber) {
      const expectedFrom = this.config.targetNumber.includes('@')
        ? this.config.targetNumber
        : `${this.config.targetNumber.replace(/[^0-9]/g, '')}@c.us`;

      if (from !== expectedFrom) {
        console.log(`[WhatsApp] Ignoring message from ${from} (expected ${expectedFrom})`);
        return;
      }
    }

    console.log(`[WhatsApp] Message from ${from}: "${body}"`);
    console.log(`[WhatsApp] Pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`);

    // Check if it's a reply to a pending approval
    // Format: "1 allow" or "1 deny" or just "1" (defaults to allow) or "1 y" / "1 n"
    const match = body.match(/^(\d+)\s*(allow|deny|y|n|yes|no)?$/i);
    console.log(`[WhatsApp] Pattern match: ${match ? JSON.stringify(match) : 'no match'}`);

    if (match) {
      const approvalId = match[1];
      const action = match[2]?.toLowerCase();

      const pending = this.pendingApprovals.get(approvalId);
      if (pending) {
        let decision: 'allow' | 'deny';

        if (!action || action === 'allow' || action === 'y' || action === 'yes') {
          decision = 'allow';
        } else {
          decision = 'deny';
        }

        console.log(`[WhatsApp] Approval ${approvalId} -> ${decision}`);
        this.resolveApproval(approvalId, decision);

        // Send confirmation
        message.reply(`Approved: ${decision.toUpperCase()} for ${pending.toolName}`);
      } else {
        message.reply(`No pending approval with ID ${approvalId}`);
      }
    } else if (body === 'list' || body === 'pending') {
      // List all pending approvals
      this.sendPendingList(from);
    } else if (body === 'help') {
      this.sendHelp(from);
    }
  }

  private async sendHelp(to: string): Promise<void> {
    if (!this.client || !this.ready) return;

    const help = `*Claude Code Approval Bot*

Commands:
- Reply with approval ID to allow (e.g., "1" or "1 allow")
- Reply with "ID deny" to deny (e.g., "1 deny")
- "list" or "pending" - Show all pending approvals
- "help" - Show this message

Shortcuts:
- "1 y" = allow
- "1 n" = deny`;

    await this.client.sendMessage(to, help);
  }

  private async sendPendingList(to: string): Promise<void> {
    if (!this.client || !this.ready) return;

    if (this.pendingApprovals.size === 0) {
      await this.client.sendMessage(to, 'No pending approvals');
      return;
    }

    let message = `*Pending Approvals (${this.pendingApprovals.size}):*\n\n`;

    for (const [id, approval] of this.pendingApprovals) {
      const elapsed = Math.floor((Date.now() - approval.createdAt) / 1000);
      const remaining = Math.floor((approval.timeoutMs - (Date.now() - approval.createdAt)) / 1000);

      message += `*[${id}]* ${approval.toolName}\n`;
      message += `${approval.normalizedText.slice(0, 100)}...\n`;
      message += `_Timeout in ${remaining}s_\n\n`;
    }

    message += 'Reply with ID to allow, or "ID deny" to deny';

    await this.client.sendMessage(to, message);
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
    if (!this.config.enabled || !this.config.targetNumber) {
      console.log('[WhatsApp] Not enabled or no target number configured');
      return 'deny'; // Default to deny if not configured
    }

    if (!this.client || !this.ready) {
      console.log('[WhatsApp] Client not ready');
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

      // Send WhatsApp message
      this.sendApprovalRequest(approval);

      // Set timeout
      setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          console.log(`[WhatsApp] Approval ${id} timed out`);
          this.resolveApproval(id, 'timeout');
        }
      }, timeoutMs);
    });
  }

  private async sendApprovalRequest(approval: PendingApproval): Promise<void> {
    if (!this.client || !this.ready || !this.config.targetNumber) return;

    const timeoutMins = Math.floor(approval.timeoutMs / 60000);
    const projectName = approval.projectPath.split('/').pop() || approval.projectPath;

    const message = `🔔 *#${approval.id} - ${approval.toolName}*
📁 ${projectName}

${approval.normalizedText.slice(0, 300)}

━━━━━━━━━━━━━━━
✅ *${approval.id}* = Allow
❌ *${approval.id} n* = Deny
⏱ Auto-deny in ${timeoutMins}m`;

    try {
      // Format number for WhatsApp (add @c.us suffix)
      const chatId = this.config.targetNumber.includes('@')
        ? this.config.targetNumber
        : `${this.config.targetNumber.replace(/[^0-9]/g, '')}@c.us`;

      await this.client.sendMessage(chatId, message);
      console.log(`[WhatsApp] Sent approval request ${approval.id} to ${chatId}`);
    } catch (error) {
      console.error('[WhatsApp] Failed to send message:', error);
      // Resolve as timeout on send failure
      this.resolveApproval(approval.id, 'timeout');
    }
  }

  private resolveApproval(id: string, decision: 'allow' | 'deny' | 'timeout'): void {
    const approval = this.pendingApprovals.get(id);
    if (approval) {
      this.pendingApprovals.delete(id);
      approval.resolve(decision);
      this.emit('decision', { id, decision, approval });
    }
  }

  // Public method to resolve approval from UI
  manualResolve(id: string, decision: 'allow' | 'deny'): boolean {
    const approval = this.pendingApprovals.get(id);
    if (approval) {
      console.log(`[WhatsApp] Manual resolution for ${id}: ${decision}`);
      this.resolveApproval(id, decision);
      return true;
    }
    return false;
  }

  // Configuration methods
  setConfig(config: Partial<WhatsAppConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[WhatsApp] Config updated:', this.config);
  }

  getConfig(): WhatsAppConfig {
    return { ...this.config };
  }

  // Status methods
  getStatus(): {
    initialized: boolean;
    ready: boolean;
    qrCode: string | null;
    pendingCount: number;
    config: WhatsAppConfig;
  } {
    return {
      initialized: this.client !== null,
      ready: this.ready,
      qrCode: this.qrCode,
      pendingCount: this.pendingApprovals.size,
      config: this.getConfig(),
    };
  }

  getPendingApprovals(): Omit<PendingApproval, 'resolve'>[] {
    return Array.from(this.pendingApprovals.values()).map(({ resolve, ...rest }) => rest);
  }

  isReady(): boolean {
    return this.ready && this.config.enabled && !!this.config.targetNumber;
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.ready = false;
    }
  }
}

// Singleton instance
export const whatsappService = new WhatsAppService();
