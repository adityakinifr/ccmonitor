import type { SessionSummary, EventItem, McpToolStats, CostSummary, Stats, SessionDetail } from '@/types';

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
