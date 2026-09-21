import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getApprovalRules,
  createApprovalRule,
  deleteApprovalRule,
  promoteRuleToGlobal,
  getRecentToolCalls,
  getProjectStats,
  getAdaptiveHealth,
} from '@/utils/api';
import type { ApprovalRule, RecentToolCall, ToolCallPart } from '@/types';
import { WhatsAppSettings } from './WhatsAppSettings';

// Tool icons
const ToolIcon = ({ tool, className = "w-4 h-4" }: { tool: string; className?: string }) => {
  switch (tool) {
    case 'Bash':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'Edit':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case 'Write':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
  }
};

// Tool color classes
const getToolColors = (tool: string) => {
  switch (tool) {
    case 'Bash':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-500',
        badge: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
      };
    case 'Edit':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-500',
        badge: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
      };
    case 'Write':
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-500',
        badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
      };
    default:
      return {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        text: 'text-purple-500',
        badge: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
      };
  }
};

// Rule card component
function RuleCard({
  rule,
  onDelete,
  onPromote,
}: {
  rule: ApprovalRule;
  onDelete: (id: number) => void;
  onPromote?: (id: number) => void;
}) {
  const colors = getToolColors(rule.toolName);

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded ${colors.bg} ${colors.text}`}>
              <ToolIcon tool={rule.toolName} className="w-3.5 h-3.5" />
            </div>
            <span className={`text-xs font-medium ${colors.text}`}>{rule.toolName}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 ${
                rule.ruleType === 'allow'
                  ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-600 border-red-500/30'
              }`}
            >
              {rule.ruleType}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              {rule.patternType}
            </Badge>
            {rule.projectPath === null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
                Global
              </Badge>
            )}
          </div>
          <p className="text-sm font-mono text-foreground/80 break-all leading-relaxed">
            {rule.pattern}
          </p>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {rule.matchCount} matches
            </span>
            {rule.lastMatchedAt && (
              <span>Last: {new Date(rule.lastMatchedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {rule.projectPath !== null && onPromote && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-indigo-500 hover:bg-indigo-500/10"
              onClick={() => onPromote(rule.id)}
              title="Promote to global"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16V8M8 12l4-4 4 4" />
              </svg>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(rule.id)}
            title="Delete rule"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}

// Tool call card with selectable parts for rule creation
function ToolCallCard({
  toolCall,
  onCreateRule,
  onCreateSuggestedRule,
  onDismiss,
}: {
  toolCall: RecentToolCall;
  onCreateRule: (toolCall: RecentToolCall, selectedParts: ToolCallPart[], ruleType: 'allow' | 'deny') => void;
  onCreateSuggestedRule?: (toolCall: RecentToolCall, ruleType: 'allow' | 'deny') => void;
  onDismiss?: (toolCall: RecentToolCall) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const colors = getToolColors(toolCall.toolName);

  const togglePart = (index: number) => {
    if (index === 0) return;

    if (!selectedRange) {
      setSelectedRange({ start: index, end: index });
    } else if (index === selectedRange.start && index === selectedRange.end) {
      setSelectedRange(null);
    } else if (index < selectedRange.start) {
      setSelectedRange({ start: index, end: selectedRange.end });
    } else if (index > selectedRange.end) {
      setSelectedRange({ start: selectedRange.start, end: index });
    } else {
      setSelectedRange({ start: selectedRange.start, end: index });
    }
  };

  const isSelected = (index: number) => {
    if (!selectedRange) return false;
    return index >= selectedRange.start && index <= selectedRange.end;
  };

  const handleCreate = (ruleType: 'allow' | 'deny') => {
    if (!selectedRange) return;
    const selected = toolCall.parts.slice(selectedRange.start, selectedRange.end + 1);
    onCreateRule(toolCall, selected, ruleType);
    setExpanded(false);
    setSelectedRange(null);
  };

  const buildPatternPreview = (): { pattern: string; type: string } => {
    if (!selectedRange) return { pattern: '*', type: 'any' };

    const selected = toolCall.parts.slice(selectedRange.start, selectedRange.end + 1);
    const pattern = selected.map(p => p.value).join('/');
    const lastPart = selected[selected.length - 1];

    if (toolCall.toolName === 'Bash') {
      return {
        pattern: pattern + (selectedRange.end < toolCall.parts.length - 1 ? ' *' : ''),
        type: selectedRange.end < toolCall.parts.length - 1 ? 'prefix' : 'exact'
      };
    }

    return {
      pattern: (selectedRange.start > 1 ? '**/' : '') + pattern + (lastPart.type === 'directory' ? '/*' : ''),
      type: lastPart.type === 'directory' ? 'directory' : 'contains'
    };
  };

  const hasSuggestion = toolCall.suggestedPattern && onCreateSuggestedRule;

  return (
    <div className={`rounded-lg border transition-all ${
      expanded
        ? `${colors.border} ${colors.bg}`
        : 'border-border/50 hover:border-border bg-card/30 hover:bg-card/50'
    }`}>
      {/* Header - always visible */}
      <div
        className="p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          {/* Tool icon */}
          <div className={`p-2 rounded-lg ${colors.bg} ${colors.text} shrink-0 mt-0.5`}>
            <ToolIcon tool={toolCall.toolName} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium ${colors.text}`}>{toolCall.toolName}</span>
              <span className="text-xs text-muted-foreground">{toolCall.count}x</span>
              {toolCall.similarCount > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-blue-500/10 text-blue-500 border-blue-500/30">
                  +{toolCall.similarCount} similar
                </Badge>
              )}
            </div>

            {/* Pattern text */}
            <p className="text-sm font-mono text-muted-foreground truncate pr-4">
              {toolCall.normalizedText.replace(`${toolCall.toolName} `, '')}
            </p>

            {/* Suggested action - inline quick buttons */}
            {hasSuggestion && !expanded && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Suggest:</span>
                <span className="text-xs font-mono text-foreground/80 px-1.5 py-0.5 rounded bg-muted/50">
                  {toolCall.suggestedPattern}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSuggestedRule!(toolCall, 'allow');
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors"
                  >
                    Allow
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSuggestedRule!(toolCall, 'deny');
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 hover:bg-red-500/25 transition-colors"
                  >
                    Deny
                  </button>
                </div>
                {onDismiss && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(toolCall);
                    }}
                    className="text-[11px] px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Dismiss this suggestion"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Expand indicator */}
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Select parts to build a custom pattern:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {toolCall.parts.map((part, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePart(index);
                  }}
                  className={`px-2 py-1 text-xs rounded-md font-mono transition-all ${
                    isSelected(index)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : index === 0
                        ? 'bg-muted/30 text-muted-foreground cursor-default'
                        : 'bg-muted/70 text-foreground/80 hover:bg-muted cursor-pointer'
                  }`}
                >
                  {part.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern preview */}
          {selectedRange && (
            <div className={`rounded-lg p-2.5 ${colors.bg} border ${colors.border}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Pattern preview</p>
                  <p className="text-sm font-mono text-foreground">
                    {buildPatternPreview().pattern}
                    <span className="text-xs text-muted-foreground ml-2">({buildPatternPreview().type})</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreate('allow');
                    }}
                  >
                    Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreate('deny');
                    }}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick suggestion in expanded mode */}
          {hasSuggestion && (
            <div className="rounded-lg p-2.5 bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Suggested pattern</p>
                  <p className="text-sm font-mono text-foreground">
                    {toolCall.suggestedPattern}
                    <span className="text-xs text-muted-foreground ml-2">({toolCall.suggestedPatternType})</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSuggestedRule!(toolCall, 'allow');
                    }}
                  >
                    Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSuggestedRule!(toolCall, 'deny');
                    }}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Filter tabs
type ToolFilter = 'all' | 'Bash' | 'Edit' | 'Write';

export function AdaptivePatterns() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [globalRules, setGlobalRules] = useState<ApprovalRule[]>([]);
  const [toolCalls, setToolCalls] = useState<RecentToolCall[]>([]);
  const [dismissedCalls, setDismissedCalls] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<{ projectPath: string; projectName: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(searchParams.get('project') || '');
  const [health, setHealth] = useState<{ available: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');

  const handleProjectChange = (projectPath: string) => {
    setSelectedProject(projectPath);
    setDismissedCalls(new Set());
    if (projectPath) {
      setSearchParams({ project: projectPath });
    } else {
      setSearchParams({});
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [rulesData, projectsData, healthData] = await Promise.all([
        getApprovalRules(selectedProject || undefined),
        getProjectStats(),
        getAdaptiveHealth(),
      ]);

      setRules(rulesData.rules);
      setGlobalRules(rulesData.globalRules);
      setProjects(projectsData.map(p => ({ projectPath: p.projectPath, projectName: p.projectName })));
      setHealth(healthData);

      if (selectedProject) {
        const toolCallsData = await getRecentToolCalls(selectedProject);
        setToolCalls(toolCallsData.toolCalls);
      } else {
        setToolCalls([]);
      }
    } catch (error) {
      console.error('Failed to load adaptive data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRule = async (
    toolCall: RecentToolCall,
    selectedParts: ToolCallPart[],
    ruleType: 'allow' | 'deny'
  ) => {
    if (selectedParts.length < 1) return;

    const pattern = selectedParts.map(p => p.value).join('/');
    const lastPart = selectedParts[selectedParts.length - 1];

    let patternType: 'exact' | 'prefix' | 'glob' | 'directory' | 'contains' = 'exact';

    if (toolCall.toolName === 'Bash') {
      patternType = selectedParts.length < toolCall.parts.length - 1 ? 'prefix' : 'exact';
    } else {
      if (lastPart.type === 'directory') {
        patternType = 'directory';
      } else if (lastPart.type === 'file') {
        patternType = selectedParts.length < toolCall.parts.length - 1 ? 'contains' : 'exact';
      } else {
        patternType = 'contains';
      }
    }

    try {
      await createApprovalRule({
        projectPath: selectedProject || null,
        toolName: toolCall.toolName,
        pattern,
        patternType: patternType as 'exact' | 'prefix' | 'glob' | 'directory',
        ruleType,
      });
      await loadData();
    } catch (error) {
      console.error('Failed to create rule:', error);
    }
  };

  const handleCreateSuggestedRule = async (
    toolCall: RecentToolCall,
    ruleType: 'allow' | 'deny'
  ) => {
    if (!toolCall.suggestedPattern || !toolCall.suggestedPatternType) return;

    try {
      await createApprovalRule({
        projectPath: selectedProject || null,
        toolName: toolCall.toolName,
        pattern: toolCall.suggestedPattern,
        patternType: toolCall.suggestedPatternType as 'exact' | 'prefix' | 'glob' | 'directory',
        ruleType,
      });
      await loadData();
    } catch (error) {
      console.error('Failed to create rule:', error);
    }
  };

  const handleDismiss = (toolCall: RecentToolCall) => {
    setDismissedCalls(prev => new Set([...prev, toolCall.normalizedText]));
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteApprovalRule(id);
      await loadData();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handlePromoteRule = async (id: number) => {
    try {
      await promoteRuleToGlobal(id);
      await loadData();
    } catch (error) {
      console.error('Failed to promote rule:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  const displayRules = selectedProject ? rules : globalRules;

  // Filter tool calls
  const filteredToolCalls = toolCalls
    .filter(tc => !dismissedCalls.has(tc.normalizedText))
    .filter(tc => toolFilter === 'all' || tc.toolName === toolFilter);

  // Count by tool type
  const toolCounts = {
    all: toolCalls.filter(tc => !dismissedCalls.has(tc.normalizedText)).length,
    Bash: toolCalls.filter(tc => tc.toolName === 'Bash' && !dismissedCalls.has(tc.normalizedText)).length,
    Edit: toolCalls.filter(tc => tc.toolName === 'Edit' && !dismissedCalls.has(tc.normalizedText)).length,
    Write: toolCalls.filter(tc => tc.toolName === 'Write' && !dismissedCalls.has(tc.normalizedText)).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Adaptive Rules</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create rules to auto-approve or block tool calls
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
          health?.available
            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
            : 'bg-muted text-muted-foreground border border-border'
        }`}>
          <span className={`w-2 h-2 rounded-full ${health?.available ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
          {health?.available ? 'Ready' : 'Offline'}
        </div>
      </div>

      {/* WhatsApp Settings + Project Filter */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {/* Project Filter */}
          <Card className="border-border/50 h-full">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <select
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedProject}
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="">Global Rules (apply to all projects)</option>
                  {projects.map(p => (
                    <option key={p.projectPath} value={p.projectPath}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        </div>
        <WhatsAppSettings />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Tool Calls */}
        {selectedProject && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Recent Tool Calls</CardTitle>
                <Badge variant="secondary" className="font-normal">{filteredToolCalls.length}</Badge>
              </div>
              {/* Filter tabs */}
              <div className="flex gap-1 pt-2">
                {(['all', 'Bash', 'Edit', 'Write'] as const).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setToolFilter(filter)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      toolFilter === filter
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter}
                    {toolCounts[filter] > 0 && (
                      <span className="ml-1 opacity-70">({toolCounts[filter]})</span>
                    )}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-420px)]">
                <div className="space-y-2 pr-4">
                  {filteredToolCalls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <p className="text-sm">No tool calls found</p>
                      <p className="text-xs mt-1">Use Claude Code in this project to see suggestions</p>
                    </div>
                  ) : (
                    filteredToolCalls.map((tc, i) => (
                      <ToolCallCard
                        key={`${tc.toolName}-${i}`}
                        toolCall={tc}
                        onCreateRule={handleCreateRule}
                        onCreateSuggestedRule={tc.suggestedPattern ? handleCreateSuggestedRule : undefined}
                        onDismiss={handleDismiss}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Rules List */}
        <Card className={`border-border/50 ${selectedProject ? '' : 'col-span-2'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">
                  {selectedProject ? 'Project Rules' : 'Global Rules'}
                </CardTitle>
                {!selectedProject && (
                  <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
                    All Projects
                  </Badge>
                )}
              </div>
              <Badge variant="secondary" className="font-normal">{displayRules.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-420px)]">
              <div className="space-y-2 pr-4">
                {displayRules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M12 2a10 10 0 1 0 10 10" />
                    </svg>
                    <p className="text-sm">No rules yet</p>
                    <p className="text-xs mt-1">
                      {selectedProject
                        ? 'Select a tool call to create a rule'
                        : 'Select a project to create rules'}
                    </p>
                  </div>
                ) : (
                  displayRules.map(rule => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onDelete={handleDeleteRule}
                      onPromote={selectedProject ? handlePromoteRule : undefined}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
