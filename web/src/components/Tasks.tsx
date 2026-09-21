import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTaskStore } from '@/stores/taskStore';
import {
  getTasks,
  createManualTask,
  updateTask,
  deleteTask as apiDeleteTask,
  backfillAdaptivePatterns,
  getAdaptiveHealth,
  getSessionDecisions,
  getProjectPatternCount,
} from '@/utils/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TaskItem, ApprovalDecision, DecisionCounts } from '@/types';

// Auto-mode type: off, adaptive, or all (autopilot)
type AutoMode = 'off' | 'adaptive' | 'all';

function getAutoMode(task: TaskItem): AutoMode {
  if (task.autopilot) return 'all';
  if (task.adaptiveMode) return 'adaptive';
  return 'off';
}

const autoModeConfig = {
  off: {
    label: 'Off',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border/50',
  },
  adaptive: {
    label: 'Adaptive',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  all: {
    label: 'All',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
  },
};

// Tier configuration
const tierConfig = {
  routine: {
    label: 'Routine',
    color: 'bg-slate-500/80 hover:bg-slate-500',
    ring: 'ring-slate-500/30',
  },
  important: {
    label: 'Important',
    color: 'bg-amber-500/80 hover:bg-amber-500',
    ring: 'ring-amber-500/30',
  },
  urgent: {
    label: 'Urgent',
    color: 'bg-rose-500/80 hover:bg-rose-500',
    ring: 'ring-rose-500/30',
  },
};

// Status configuration
const statusConfig = {
  working: {
    label: 'Working',
    color: 'text-rose-500',
    bg: 'bg-rose-500',
    gradient: 'from-rose-500/10 to-transparent',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
  },
  queued: {
    label: 'Queued',
    color: 'text-amber-500',
    bg: 'bg-amber-500',
    gradient: 'from-amber-500/10 to-transparent',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  done: {
    label: 'Done',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500',
    gradient: 'from-emerald-500/10 to-transparent',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22,4 12,14.01 9,11.01" />
      </svg>
    ),
  },
};

function formatElapsedTime(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function TaskRow({
  task,
  onChangeAutoMode,
  onCycleTier,
  onUpdateStatus,
  onDelete,
  onEditTitle,
  onBackfill,
  backfillLoading,
  ollamaAvailable,
}: {
  task: TaskItem;
  onChangeAutoMode: (id: string, mode: AutoMode) => void;
  onCycleTier: (id: string, currentTier: string) => void;
  onUpdateStatus: (id: string, status: 'queued' | 'working' | 'done') => void;
  onDelete: (id: string) => void;
  onEditTitle: (id: string, newTitle: string) => void;
  onBackfill: (cwd: string) => void;
  backfillLoading: string | null;
  ollamaAvailable: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(task.createdAt));
  const [showDecisions, setShowDecisions] = useState(false);
  const [decisions, setDecisions] = useState<ApprovalDecision[]>([]);
  const [decisionCounts, setDecisionCounts] = useState<DecisionCounts | null>(null);
  const [patternCount, setPatternCount] = useState<number | null>(null);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load decisions when expanded
  useEffect(() => {
    if (showDecisions && task.sessionId && decisions.length === 0) {
      setLoadingDecisions(true);
      getSessionDecisions(task.sessionId, 20)
        .then((data) => {
          setDecisions(data.decisions);
          setDecisionCounts(data.counts);
        })
        .catch(console.error)
        .finally(() => setLoadingDecisions(false));
    }
  }, [showDecisions, task.sessionId, decisions.length]);

  // Load pattern count for adaptive mode
  useEffect(() => {
    if (task.adaptiveMode && task.cwd && !task.autopilot && patternCount === null) {
      getProjectPatternCount(task.cwd)
        .then((data) => setPatternCount(data.count))
        .catch(() => setPatternCount(0));
    }
  }, [task.adaptiveMode, task.cwd, task.autopilot, patternCount]);

  // Load decision counts on mount if session exists
  useEffect(() => {
    if (task.sessionId && decisionCounts === null) {
      getSessionDecisions(task.sessionId, 1)
        .then((data) => setDecisionCounts(data.counts))
        .catch(console.error);
    }
  }, [task.sessionId, decisionCounts]);

  // Update elapsed time every second for working tasks
  useEffect(() => {
    if (task.status !== 'working') return;

    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(task.createdAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [task.status, task.createdAt]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleSubmit = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      onEditTitle(task.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditedTitle(task.title);
      setIsEditing(false);
    }
  };

  const tier = tierConfig[task.tier];

  return (
    <div className="group relative rounded-lg bg-card/50 hover:bg-card border border-border/50 hover:border-border transition-all duration-200 px-4 py-3">
      <div className="flex items-center gap-4">
      {/* Tier Badge */}
      <button
        onClick={() => onCycleTier(task.id, task.tier)}
        className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold text-white transition-all duration-200 ring-2 ring-offset-2 ring-offset-background ${tier.color} ${tier.ring}`}
        title="Click to change priority"
      >
        {tier.label}
      </button>

      {/* Title & Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleKeyDown}
              className="h-7 text-sm font-medium"
            />
          ) : (
            <span
              className="font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors"
              onDoubleClick={() => setIsEditing(true)}
              title="Double-click to edit"
            >
              {task.title}
            </span>
          )}
          {task.manual && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/50">
              Manual
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {task.machine && task.machine !== 'unknown' && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              {task.machine}
            </span>
          )}
          {task.cwd && (
            <span className="truncate max-w-[200px] font-mono text-[10px]" title={task.cwd}>
              {task.cwd.split('/').slice(-2).join('/')}
            </span>
          )}
          {task.status === 'working' && (
            <span className="flex items-center gap-1 text-rose-500 font-mono tabular-nums">
              <svg className="w-3 h-3 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4" />
              </svg>
              {elapsedTime}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Auto Mode Selector */}
        {(() => {
          const currentMode = getAutoMode(task);
          const config = autoModeConfig[currentMode];
          return (
            <div className={`flex items-center gap-2 px-2 py-1 rounded-full ${config.bgColor} border ${config.borderColor}`}>
              <svg
                className={`w-3.5 h-3.5 ${config.color}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {currentMode === 'off' && (
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                )}
                {currentMode === 'adaptive' && (
                  <>
                    <path d="M12 2a10 10 0 1 0 10 10" />
                    <path d="M12 12l4-4" />
                    <path d="M16 8h-4v4" />
                  </>
                )}
                {currentMode === 'all' && (
                  <>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </>
                )}
              </svg>
              <select
                value={currentMode}
                onChange={(e) => onChangeAutoMode(task.id, e.target.value as AutoMode)}
                className={`bg-transparent text-xs font-medium ${config.color} border-0 outline-none cursor-pointer pr-1`}
              >
                <option value="off" className="text-foreground bg-background">Off</option>
                <option value="adaptive" className="text-foreground bg-background">Adaptive</option>
                <option value="all" className="text-foreground bg-background">All (Autopilot)</option>
              </select>
            </div>
          );
        })()}

        {/* Backfill Button - shows when adaptive mode enabled, no patterns exist, and task has cwd */}
        {task.adaptiveMode && task.cwd && !task.autopilot && patternCount !== null && patternCount === 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
            onClick={() => onBackfill(task.cwd!)}
            disabled={!ollamaAvailable || backfillLoading === task.cwd}
            title="Learn from last 100 tool calls in this project"
          >
            {backfillLoading === task.cwd ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                Learning...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Backfill
              </>
            )}
          </Button>
        )}

        {/* Decision Counts & Expand Button */}
        {decisionCounts && (decisionCounts.approved > 0 || decisionCounts.autoApproved > 0 || decisionCounts.denied > 0) && (
          <button
            onClick={() => setShowDecisions(!showDecisions)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 hover:bg-muted transition-colors"
            title="Click to view decisions"
          >
            {decisionCounts.autoApproved > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                {decisionCounts.autoApproved} auto
              </Badge>
            )}
            {decisionCounts.approved > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-500 border-blue-500/30">
                {decisionCounts.approved} ok
              </Badge>
            )}
            {decisionCounts.denied > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-rose-500/10 text-rose-500 border-rose-500/30">
                {decisionCounts.denied} denied
              </Badge>
            )}
            <svg
              className={`w-3 h-3 text-muted-foreground transition-transform ${showDecisions ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </button>
        )}

        {/* Link to Adaptive Page */}
        {task.cwd && (task.adaptiveMode || patternCount !== null && patternCount > 0) && (
          <Link
            to={`/adaptive?project=${encodeURIComponent(task.cwd)}`}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="View patterns for this project"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 12l4-4" />
              <path d="M16 8h-4v4" />
            </svg>
            {patternCount !== null && patternCount > 0 && (
              <span className="text-[10px]">{patternCount}</span>
            )}
          </Link>
        )}

        {/* Manual Task Controls */}
        {task.manual && (
          <div className="flex items-center gap-1">
            {task.status === 'queued' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onUpdateStatus(task.id, 'working')}
              >
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Start
              </Button>
            )}
            {task.status === 'working' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                onClick={() => onUpdateStatus(task.id, 'done')}
              >
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                Done
              </Button>
            )}
            {task.status === 'done' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onUpdateStatus(task.id, 'working')}
              >
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Resume
              </Button>
            )}
          </div>
        )}

        {/* Delete Button */}
        {(task.manual || task.status === 'done') && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
            onClick={() => onDelete(task.id)}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </Button>
        )}
      </div>
      </div>

      {/* Collapsible Decision Log */}
      {showDecisions && (
        <div className="mt-3 pt-3 border-t border-border/50">
          {loadingDecisions ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
              Loading decisions...
            </div>
          ) : decisions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No decisions recorded yet
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-xs"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 ${
                      decision.decision === 'auto_approved'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                        : decision.decision === 'approved'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                    }`}
                  >
                    {decision.decision === 'auto_approved' ? 'auto' : decision.decision}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                    {decision.toolName}
                  </Badge>
                  <span
                    className="text-muted-foreground flex-1 font-mono text-[10px] break-all line-clamp-2"
                    title={decision.toolInputText || undefined}
                  >
                    {decision.toolInputText || 'N/A'}
                  </span>
                  <span className="text-muted-foreground/60 text-[10px]">
                    via {decision.decisionSource}
                  </span>
                  {decision.similarityScore && (
                    <span className="text-muted-foreground/60 text-[10px]">
                      ({(decision.similarityScore * 100).toFixed(0)}%)
                    </span>
                  )}
                  <span className="text-muted-foreground/60 text-[10px]">
                    {new Date(decision.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskSection({
  status,
  tasks,
  onChangeAutoMode,
  onCycleTier,
  onUpdateStatus,
  onDelete,
  onEditTitle,
  onBackfill,
  backfillLoading,
  ollamaAvailable,
  defaultCollapsed = false,
}: {
  status: 'working' | 'queued' | 'done';
  tasks: TaskItem[];
  onChangeAutoMode: (id: string, mode: AutoMode) => void;
  onCycleTier: (id: string, currentTier: string) => void;
  onUpdateStatus: (id: string, status: 'queued' | 'working' | 'done') => void;
  onDelete: (id: string) => void;
  onEditTitle: (id: string, newTitle: string) => void;
  onBackfill: (cwd: string) => void;
  backfillLoading: string | null;
  ollamaAvailable: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const config = statusConfig[status];

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r ${config.gradient} border border-border/50 hover:border-border transition-all`}
      >
        <div className={`p-1.5 rounded-md ${config.bg}/10 ${config.color}`}>
          {config.icon}
        </div>
        <span className={`font-semibold ${config.color}`}>{config.label}</span>
        <Badge variant="secondary" className="ml-1 text-xs">
          {tasks.length}
        </Badge>
        {status === 'working' && tasks.length > 0 && (
          <span className="flex items-center gap-1 ml-2">
            <span className={`w-2 h-2 rounded-full ${config.bg} animate-pulse`} />
          </span>
        )}
        <svg
          className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {!collapsed && (
        <div className="space-y-2 pl-2">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <svg className="w-5 h-5 mr-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              No {status} tasks
            </div>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onChangeAutoMode={onChangeAutoMode}
                onCycleTier={onCycleTier}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDelete}
                onEditTitle={onEditTitle}
                onBackfill={onBackfill}
                backfillLoading={backfillLoading}
                ollamaAvailable={ollamaAvailable}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Tasks() {
  useWebSocket();
  const { tasks, setTasks } = useTaskStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [backfillLoading, setBackfillLoading] = useState<string | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const fetchedTasks = await getTasks();
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [setTasks]);

  const checkOllama = useCallback(async () => {
    try {
      const health = await getAdaptiveHealth();
      setOllamaAvailable(health.available);
    } catch {
      setOllamaAvailable(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    checkOllama();
  }, [loadTasks, checkOllama]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      await createManualTask(newTaskTitle.trim());
      setNewTaskTitle('');
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleChangeAutoMode = async (id: string, mode: AutoMode) => {
    try {
      // Set both values based on the selected mode
      const autopilot = mode === 'all';
      const adaptiveMode = mode === 'adaptive';
      await updateTask(id, { autopilot, adaptiveMode });
    } catch (error) {
      console.error('Failed to change auto mode:', error);
    }
  };

  const handleBackfill = async (cwd: string) => {
    if (!cwd || backfillLoading) return;

    setBackfillLoading(cwd);
    try {
      const result = await backfillAdaptivePatterns(cwd, 100);
      // Show a brief notification (could be improved with a toast)
      console.log(`Backfill complete: ${result.message}`);
    } catch (error) {
      console.error('Failed to backfill:', error);
    } finally {
      setBackfillLoading(null);
    }
  };

  const handleCycleTier = async (id: string, currentTier: string) => {
    const tiers: ('routine' | 'important' | 'urgent')[] = ['routine', 'important', 'urgent'];
    const currentIndex = tiers.indexOf(currentTier as 'routine' | 'important' | 'urgent');
    const nextTier = tiers[(currentIndex + 1) % tiers.length];

    try {
      await updateTask(id, { tier: nextTier });
    } catch (error) {
      console.error('Failed to update tier:', error);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'queued' | 'working' | 'done') => {
    try {
      await updateTask(id, { status });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteTask(id);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleEditTitle = async (id: string, newTitle: string) => {
    try {
      await updateTask(id, { title: newTitle });
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  // Sort tasks by tier (urgent > important > routine), then by creation time
  const sortByTierAndTime = (a: TaskItem, b: TaskItem) => {
    const tierOrder = { urgent: 0, important: 1, routine: 2 };
    if (tierOrder[a.tier] !== tierOrder[b.tier]) {
      return tierOrder[a.tier] - tierOrder[b.tier];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const workingTasks = tasks.filter((t) => t.status === 'working').sort(sortByTierAndTime);
  const queuedTasks = tasks.filter((t) => t.status === 'queued').sort(sortByTierAndTime);
  const doneTasks = tasks.filter((t) => t.status === 'done').sort(sortByTierAndTime);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Task Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage Claude Code sessions and manual tasks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              placeholder="Add a task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              className="w-64 pr-10"
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={handleAddTask}
              disabled={!newTaskTitle.trim()}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-muted-foreground">Working:</span>
                <span className="font-semibold text-rose-500">{workingTasks.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Queued:</span>
                <span className="font-semibold text-amber-500">{queuedTasks.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Done:</span>
                <span className="font-semibold text-emerald-500">{doneTasks.length}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${ollamaAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-xs">
                  Ollama: {ollamaAvailable ? 'Connected' : 'Offline'}
                </span>
              </div>
              <span className="text-xs">
                <strong>Off</strong> asks every time · <strong>Adaptive</strong> auto-approves similar past actions · <strong>All</strong> approves everything
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Sections */}
      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="space-y-4 pr-4">
          <TaskSection
            status="working"
            tasks={workingTasks}
            onChangeAutoMode={handleChangeAutoMode}
            onCycleTier={handleCycleTier}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDelete}
            onEditTitle={handleEditTitle}
            onBackfill={handleBackfill}
            backfillLoading={backfillLoading}
            ollamaAvailable={ollamaAvailable}
          />

          <TaskSection
            status="queued"
            tasks={queuedTasks}
            onChangeAutoMode={handleChangeAutoMode}
            onCycleTier={handleCycleTier}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDelete}
            onEditTitle={handleEditTitle}
            onBackfill={handleBackfill}
            backfillLoading={backfillLoading}
            ollamaAvailable={ollamaAvailable}
          />

          <TaskSection
            status="done"
            tasks={doneTasks}
            onChangeAutoMode={handleChangeAutoMode}
            onCycleTier={handleCycleTier}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDelete}
            onEditTitle={handleEditTitle}
            onBackfill={handleBackfill}
            backfillLoading={backfillLoading}
            ollamaAvailable={ollamaAvailable}
            defaultCollapsed={doneTasks.length > 5}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
