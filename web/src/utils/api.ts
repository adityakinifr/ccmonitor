import type { SessionSummary, EventItem, McpToolStats, CostSummary, Stats, SessionDetail, TaskItem } from '@/types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function getSessions(limit = 50, offset = 0): Promise<SessionSummary[]> {
  const data = await fetchJson<{ sessions: SessionSummary[] }>(
    `/sessions?limit=${limit}&offset=${offset}`
  );
  return data.sessions;
}

export async function getSession(id: string): Promise<{ session: SessionDetail; events: EventItem[] }> {
  return fetchJson(`/sessions/${encodeURIComponent(id)}`);
}

export async function getEvents(sessionId?: string, limit = 100, offset = 0): Promise<EventItem[]> {
  let url = `/events?limit=${limit}&offset=${offset}`;
  if (sessionId) {
    url += `&session_id=${encodeURIComponent(sessionId)}`;
  }
  const data = await fetchJson<{ events: EventItem[] }>(url);
  return data.events;
}

export async function searchEvents(query: string, limit = 50): Promise<EventItem[]> {
  const data = await fetchJson<{ events: EventItem[] }>(
    `/events/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return data.events;
}

export async function getStats(): Promise<Stats> {
  return fetchJson('/stats');
}

export async function getMcpStats(): Promise<McpToolStats[]> {
  const data = await fetchJson<{ tools: McpToolStats[] }>('/stats/mcp');
  return data.tools;
}

export async function getCosts(days = 30): Promise<CostSummary[]> {
  const data = await fetchJson<{ costs: CostSummary[] }>(`/stats/costs?days=${days}`);
  return data.costs;
}

export interface TodayCostPoint {
  timestamp: string;
  cost: number;
  tokens: number;
  runningCost: number;
  runningTokens: number;
}

export async function getTodayCosts(): Promise<{ costs: TodayCostPoint[]; totalCost: number; totalTokens: number }> {
  return fetchJson('/stats/costs/today');
}

export interface RecentCostEvent {
  timestamp: string;
  cost: number;
  tokens: number;
  model: string | null;
}

export async function getRecentCosts(minutes = 60): Promise<RecentCostEvent[]> {
  const data = await fetchJson<{ events: RecentCostEvent[] }>(`/stats/costs/recent?minutes=${minutes}`);
  return data.events;
}

export interface CostByTool {
  toolName: string;
  totalCost: number;
  count: number;
  avgCost: number;
  totalTokens: number;
}

export interface CostByModel {
  model: string;
  totalCost: number;
  count: number;
  avgCost: number;
  totalTokens: number;
}

export interface CostByEntryType {
  entryType: string;
  totalCost: number;
  count: number;
  avgCost: number;
  totalTokens: number;
}

export interface CostByHour {
  hour: string;
  totalCost: number;
  count: number;
  totalTokens: number;
}

export interface ExpensiveEvent {
  id: number;
  sessionId: string;
  toolName: string | null;
  content: string | null;
  cost: number;
  tokens: number;
  model: string | null;
  timestamp: string;
}

export interface TextResponsePattern {
  category: string;
  totalCost: number;
  count: number;
  avgCost: number;
  totalTokens: number;
  avgTokens: number;
  examples: string[];
}

export interface ContentLengthCost {
  lengthBucket: string;
  totalCost: number;
  count: number;
  avgCost: number;
}

export interface CostAnalysis {
  byTool: CostByTool[];
  byModel: CostByModel[];
  byEntryType: CostByEntryType[];
  byHour: CostByHour[];
  expensiveEvents: ExpensiveEvent[];
  textResponsePatterns: TextResponsePattern[];
  contentLengthCost: ContentLengthCost[];
  summary: {
    totalCost: number;
    totalTokens: number;
    totalEvents: number;
  };
}

export async function getCostAnalysis(): Promise<CostAnalysis> {
  return fetchJson('/stats/costs/analyze');
}

export interface AIRecommendation {
  title: string;
  description: string;
  potentialSavings: string;
  priority: 'high' | 'medium' | 'low';
  claudeCodeTip: string;
}

export interface ClaudeCodeSetting {
  setting: string;
  value: string;
  explanation: string;
}

export interface ExpensiveQueryAnalysis {
  query: string;
  cost: string;
  issue: string;
  recommendation: string;
}

export interface TaskModelRecommendation {
  taskType: string;
  description: string;
  recommendedModel: 'opus' | 'sonnet' | 'haiku';
  reasoning: string;
  claudeCodeCommand: string;
}

export interface PromptRewriteRecommendation {
  category: string;
  inefficientExample: string;
  efficientExample: string;
  explanation: string;
  estimatedSavings: string;
}

export interface SpecificPromptAnalysis {
  originalPrompt: string;
  cost: string;
  tokensUsed: string;
  model: string;
  whatWasExpensive: string;
  betterApproach: string;
  rewrittenPrompt: string;
  estimatedNewCost: string;
  keySavingsTips: string[];
}

export interface AIAnalysisResult {
  summary: string;
  recommendations: AIRecommendation[];
  expensiveQueryAnalysis: ExpensiveQueryAnalysis[];
  specificPromptAnalysis: SpecificPromptAnalysis[];
  insights: string[];
  modelRecommendation: string;
  taskModelRecommendations: TaskModelRecommendation[];
  promptRewriteRecommendations: PromptRewriteRecommendation[];
  claudeCodeSettings: ClaudeCodeSetting[];
  estimatedMonthlySavings: string;
}

export async function getAIAnalysis(apiKey: string): Promise<AIAnalysisResult> {
  const response = await fetch(`${API_BASE}/stats/ai-analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.analysis;
}

// Project Analysis
export interface ProjectStats {
  projectPath: string;
  projectName: string;
  gitBranches: string[];
  totalCost: number;
  totalSessions: number;
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  firstSessionAt: string;
  lastSessionAt: string;
}

export interface ProjectCostByDay {
  date: string;
  costUsd: number;
  sessions: number;
  events: number;
}

export interface ProjectToolBreakdown {
  toolName: string;
  totalCost: number;
  count: number;
}

export async function getProjectStats(): Promise<ProjectStats[]> {
  const data = await fetchJson<{ projects: ProjectStats[] }>('/stats/projects');
  return data.projects;
}

export async function getProjectCosts(projectPath: string, days = 30): Promise<{
  costs: ProjectCostByDay[];
  tools: ProjectToolBreakdown[];
}> {
  return fetchJson(`/stats/projects/costs?projectPath=${encodeURIComponent(projectPath)}&days=${days}`);
}

// Tasks API
export async function getTasks(): Promise<TaskItem[]> {
  const data = await fetchJson<{ tasks: TaskItem[] }>('/tasks');
  return data.tasks;
}

export async function createManualTask(title: string): Promise<TaskItem> {
  const response = await fetch(`${API_BASE}/tasks/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function updateTask(
  id: string,
  updates: {
    autopilot?: boolean;
    adaptiveMode?: boolean;
    tier?: 'routine' | 'important' | 'urgent';
    title?: string;
    status?: 'queued' | 'working' | 'done';
  }
): Promise<TaskItem> {
  const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

// Adaptive Mode API
import type { ApprovalPattern, AdaptiveStats } from '@/types';

export async function getAdaptivePatterns(projectPath?: string): Promise<{
  patterns: ApprovalPattern[];
  globalPatterns: ApprovalPattern[];
}> {
  const url = projectPath
    ? `/adaptive/patterns?projectPath=${encodeURIComponent(projectPath)}`
    : '/adaptive/patterns';
  return fetchJson(url);
}

export async function deleteAdaptivePattern(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/adaptive/patterns/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

export async function importGlobalPatterns(projectPath: string, threshold = 3): Promise<{
  success: boolean;
  imported: number;
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/adaptive/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, threshold }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getAdaptiveStats(): Promise<AdaptiveStats> {
  return fetchJson('/adaptive/stats');
}

export async function getAdaptiveHealth(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  return fetchJson('/adaptive/health');
}

export async function backfillAdaptivePatterns(projectPath: string, limit = 100): Promise<{
  success: boolean;
  processed: number;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/adaptive/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, limit }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function voteOnPattern(id: number, vote: 'agree' | 'disagree'): Promise<void> {
  const response = await fetch(`${API_BASE}/adaptive/patterns/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

import type { SessionDecisions } from '@/types';

export async function getSessionDecisions(sessionId: string, limit = 50): Promise<SessionDecisions> {
  return fetchJson(`/adaptive/decisions/${encodeURIComponent(sessionId)}?limit=${limit}`);
}

export async function getProjectPatternCount(projectPath: string): Promise<{ count: number; projectPath: string }> {
  return fetchJson(`/adaptive/pattern-count?projectPath=${encodeURIComponent(projectPath)}`);
}

export async function promotePatternToGlobal(id: number): Promise<{ success: boolean; message: string; globalPatternId?: number }> {
  const response = await fetch(`${API_BASE}/adaptive/patterns/${id}/promote`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Rules API
import type { ApprovalRule, RecentToolCall } from '@/types';

export async function getApprovalRules(projectPath?: string): Promise<{
  rules: ApprovalRule[];
  globalRules: ApprovalRule[];
}> {
  const url = projectPath
    ? `/adaptive/rules?projectPath=${encodeURIComponent(projectPath)}`
    : '/adaptive/rules';
  return fetchJson(url);
}

export async function createApprovalRule(data: {
  projectPath: string | null;
  toolName: string;
  pattern: string;
  patternType: 'exact' | 'prefix' | 'glob' | 'directory' | 'contains';
  ruleType: 'allow' | 'deny';
  description?: string;
}): Promise<{ success: boolean; id: number }> {
  const response = await fetch(`${API_BASE}/adaptive/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function deleteApprovalRule(id: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/adaptive/rules/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function promoteRuleToGlobal(id: number): Promise<{ success: boolean; globalRuleId: number }> {
  const response = await fetch(`${API_BASE}/adaptive/rules/${id}/promote`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getRecentToolCalls(projectPath: string, limit = 50): Promise<{ toolCalls: RecentToolCall[] }> {
  return fetchJson(`/adaptive/tool-calls?projectPath=${encodeURIComponent(projectPath)}&limit=${limit}`);
}

// WhatsApp API
import type { WhatsAppStatus, WhatsAppPendingApproval, WhatsAppConfig } from '@/types';

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return fetchJson('/whatsapp/status');
}

export async function initWhatsApp(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${API_BASE}/whatsapp/init`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function updateWhatsAppConfig(config: Partial<WhatsAppConfig>): Promise<{
  success: boolean;
  config: WhatsAppConfig;
}> {
  const response = await fetch(`${API_BASE}/whatsapp/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getWhatsAppPending(): Promise<{ pending: WhatsAppPendingApproval[] }> {
  return fetchJson('/whatsapp/pending');
}

export async function resolveWhatsAppApproval(id: string, decision: 'allow' | 'deny'): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(`${API_BASE}/whatsapp/pending/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// WhatsApp Business API
import type { WhatsAppBusinessStatus, WhatsAppBusinessSetup, WhatsAppPendingApproval } from '@/types';

export async function getWhatsAppBusinessStatus(): Promise<WhatsAppBusinessStatus> {
  return fetchJson('/whatsapp-business/status');
}

export async function updateWhatsAppBusinessConfig(config: {
  enabled?: boolean;
  accessToken?: string;
  phoneNumberId?: string;
  targetNumber?: string;
  timeoutMs?: number;
}): Promise<{ success: boolean; status: WhatsAppBusinessStatus }> {
  const response = await fetch(`${API_BASE}/whatsapp-business/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getWhatsAppBusinessPending(): Promise<{ pending: WhatsAppPendingApproval[] }> {
  return fetchJson('/whatsapp-business/pending');
}

export async function resolveWhatsAppBusinessApproval(id: string, decision: 'allow' | 'deny'): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(`${API_BASE}/whatsapp-business/pending/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function getWhatsAppBusinessSetup(): Promise<WhatsAppBusinessSetup> {
  return fetchJson('/whatsapp-business/setup');
}
