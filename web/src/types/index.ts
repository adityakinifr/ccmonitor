export interface SessionSummary {
  id: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number;
  eventCount: number;
  toolCallCount: number;
}

export interface EventItem {
  id: number;
  sessionId: string;
  eventType: 'hook' | 'transcript';
  hookEventName?: string;
  entryType?: string;
  toolName?: string;
  content?: string;
  tokensInput?: number;
  tokensOutput?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
  model?: string;
  timestamp: string;
}

export interface McpToolStats {
  toolName: string;
  serverName: string | null;
  invocationCount: number;
  // Calls whose tool_result has been seen; successRate is null until one has.
  resolvedCount: number;
  errorCount: number;
  successRate: number | null;
  avgDurationMs: number;
}

export interface CostSummary {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  costWithoutCache: number;
  cacheSavings: number;
}

export interface Stats {
  totalSessions: number;
  totalEvents: number;
  totalTokens: number;
  totalCost: number;
  mcpToolsUsed: number;
}


export interface WsMessage {
  type: 'event' | 'session_start' | 'session_end' | 'stats_update';
  payload: EventItem | SessionSummary | McpToolStats[] | Stats;
}

export interface SessionDetail {
  id: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number;
  version: string | null;
}

// WhatsApp types
export interface WhatsAppConfig {
  enabled: boolean;
  targetNumber: string | null;
  timeoutMs: number;
}

export interface WhatsAppStatus {
  initialized: boolean;
  ready: boolean;
  qrCode: string | null;
  pendingCount: number;
  config: WhatsAppConfig;
}

export interface WhatsAppPendingApproval {
  id: string;
  taskId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  projectPath: string;
  normalizedText: string;
  createdAt: number;
  timeoutMs: number;
}

// WhatsApp Business API types
export interface WhatsAppBusinessConfig {
  enabled: boolean;
  phoneNumberId: string | null;
  targetNumber: string | null;
  timeoutMs: number;
  hasAccessToken: boolean;
}

export interface WhatsAppBusinessStatus {
  configured: boolean;
  enabled: boolean;
  pendingCount: number;
  config: WhatsAppBusinessConfig;
}

export interface WhatsAppBusinessSetup {
  instructions: string[];
  webhookUrl: string;
  verifyToken: string;
  fields: string[];
  notes?: string[];
}

export interface ContextHealth {
  summary: {
    avgContextTokens: number;
    callsOverThreshold: number;
    totalCalls: number;
    rebuildCalls: number;
    rebuildCost: number;
    totalCost: number;
    oversizedResults: number;
  };
  distribution: { bucket: string; calls: number; cost: number }[];
  rebuildsByCause: { cause: string; calls: number; cost: number }[];
  rebuildSessions: {
    sessionId: string;
    projectName: string | null;
    calls: number;
    cost: number;
    unexplained: number;
  }[];
  byTool: {
    toolName: string;
    results: number;
    totalBytes: number;
    avgBytes: number;
    maxBytes: number;
    oversized: number;
  }[];
  worstResults: {
    id: number;
    sessionId: string;
    toolName: string | null;
    bytes: number;
    timestamp: string;
  }[];
}
