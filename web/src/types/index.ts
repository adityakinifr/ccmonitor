export interface SessionSummary {
  id: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
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
  cacheTokens: number;
  costUsd: number;
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
  totalCostUsd: number;
  version: string | null;
}
