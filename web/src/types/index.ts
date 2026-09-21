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
  successRate: number;
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

export interface TaskItem {
  id: string;
  sessionId: string | null;
  title: string;
  tier: 'routine' | 'important' | 'urgent';
  status: 'queued' | 'working' | 'done';
  autopilot: boolean;
  adaptiveMode: boolean;
  machine: string | null;
  cwd: string | null;
  manual: boolean;
  createdAt: string;
  completedAt: string | null;
}

// Adaptive mode types
export interface ApprovalPattern {
  id: number;
  projectPath: string | null;
  toolName: string;
  toolInputText: string;
  approvalCount: number;
  denialCount: number;
  lastApprovedAt: string | null;
  lastDeniedAt: string | null;
}

export interface AdaptiveStats {
  totalGlobalPatterns: number;
  recentDecisions: ApprovalDecision[];
  topTools: {
    tool: string;
    approved: number;
    denied: number;
  }[];
}

export interface ApprovalDecision {
  id: number;
  sessionId?: string;
  taskId?: string | null;
  toolName: string;
  toolInputText?: string | null;
  decision: string;
  decisionSource: string;
  similarityScore: number | null;
  createdAt: string;
}

export interface DecisionCounts {
  approved: number;
  denied: number;
  autoApproved: number;
}

export interface SessionDecisions {
  decisions: ApprovalDecision[];
  counts: DecisionCounts;
}

export interface WsMessage {
  type: 'event' | 'session_start' | 'session_end' | 'stats_update' | 'task_created' | 'task_updated' | 'task_deleted';
  payload: EventItem | SessionSummary | McpToolStats[] | Stats | TaskItem | { id: string };
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

// Approval Rules (new approach)
export interface ApprovalRule {
  id: number;
  projectPath: string | null;
  toolName: string;
  pattern: string;
  patternType: 'exact' | 'prefix' | 'glob' | 'directory' | 'contains';
  ruleType: 'allow' | 'deny';
  description: string | null;
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
}

export interface ToolCallPart {
  type: 'tool' | 'directory' | 'file' | 'command' | 'value';
  value: string;
  label: string;
}

export interface RecentToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  count: number;
  lastUsed: string;
  parts: ToolCallPart[];
  normalizedText: string;
  similarCount: number;
  suggestedPattern?: string;
  suggestedPatternType?: string;
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
