// Hook event types
export interface HookEvent {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  prompt?: string;
  timestamp: string;
}

// Transcript entry types
export interface BaseTranscriptEntry {
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'progress' | 'agent_progress';
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  cwd: string;
  version: string;
  gitBranch?: string;
  isSidechain?: boolean;
}

export interface UserEntry extends BaseTranscriptEntry {
  type: 'user';
  userType: 'external' | 'internal';
  message: {
    role: 'user';
    content: string | ToolResultContent[];
  };
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

export interface AssistantEntry extends BaseTranscriptEntry {
  type: 'assistant';
  requestId: string;
  message: {
    model: string;
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    stop_reason: string | null;
    usage: TokenUsage;
  };
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

export type TranscriptEntry = UserEntry | AssistantEntry | BaseTranscriptEntry;

// Database models
export interface Session {
  id: string;
  project_path: string;
  git_branch: string | null;
  started_at: string;
  ended_at: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  version: string | null;
}

export interface Event {
  id: number;
  session_id: string;
  event_type: 'hook' | 'transcript';
  hook_event_name: string | null;
  entry_type: string | null;
  tool_name: string | null;
  tool_input: string | null;
  tool_response: string | null;
  content: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost?: number | null;
  model: string | null;
  timestamp: string;
  uuid: string | null;
  parent_uuid: string | null;
  raw_data: string | null;
}

export interface McpTool {
  id: number;
  session_id: string;
  tool_name: string;
  server_name: string | null;
  invocation_count: number;
  success_count: number;
  error_count: number;
  total_duration_ms: number;
  last_used_at: string;
}

// API response types
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

// WebSocket message types
export interface WsMessage {
  type: 'event' | 'session_start' | 'session_end' | 'stats_update';
  payload: EventItem | SessionSummary | McpToolStats[] | Stats;
}
