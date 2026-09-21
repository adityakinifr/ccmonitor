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
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
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
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
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
  costWithoutCache: number;  // What it would have cost without caching
  cacheSavings: number;      // Amount saved by caching
}

export interface Stats {
  totalSessions: number;
  totalEvents: number;
  totalTokens: number;
  totalCost: number;
  mcpToolsUsed: number;
}

// Task types (Executive functionality)
export interface Task {
  id: string;
  session_id: string | null;
  title: string;
  tier: 'routine' | 'important' | 'urgent';
  status: 'queued' | 'working' | 'done';
  autopilot: boolean;
  adaptive_mode: boolean;
  machine: string | null;
  cwd: string | null;
  manual: boolean;
  created_at: string;
  completed_at: string | null;
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
export interface ApprovalEmbedding {
  id: number;
  project_path: string | null;
  tool_name: string;
  tool_input_text: string;
  embedding: Buffer;
  approval_count: number;
  denial_count: number;
  last_approved_at: string | null;
  last_denied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalEmbeddingItem {
  id: number;
  projectPath: string | null;
  toolName: string;
  toolInputText: string;
  approvalCount: number;
  denialCount: number;
  lastApprovedAt: string | null;
  lastDeniedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  id: number;
  session_id: string;
  task_id: string | null;
  project_path: string | null;
  tool_name: string;
  tool_input_text: string | null;
  decision: 'approved' | 'denied' | 'auto_approved';
  decision_source: 'user' | 'adaptive' | 'autopilot' | 'dangerous';
  similarity_score: number | null;
  matched_embedding_id: number | null;
  created_at: string;
}

export interface AdaptiveCheckResult {
  decision: 'allow' | 'deny' | 'ask';
  reason: string;
  matchedPattern?: {
    id: number;
    similarity: number;
    text: string;
  };
  isDangerous?: boolean;
  dangerReason?: string;
}

// WebSocket message types
export interface WsMessage {
  type: 'event' | 'session_start' | 'session_end' | 'stats_update' | 'task_created' | 'task_updated' | 'task_deleted';
  payload: EventItem | SessionSummary | McpToolStats[] | Stats | TaskItem | { id: string };
}
