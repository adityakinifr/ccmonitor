import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSession } from '@/utils/api';
import { formatDateTime, formatTokens, formatCost, truncate } from '@/utils/formatters';
import { getEntryIcon, getEntryTypeLabel } from '@/utils/entryIcons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { SessionDetail as SessionDetailType, EventItem } from '@/types';

function getEventBadgeVariant(hookEventName?: string, entryType?: string, content?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (hookEventName === 'UserPromptSubmit' || entryType === 'user') return 'default';
  if (hookEventName === 'PreToolUse' || hookEventName === 'PostToolUse' || entryType === 'tool_result') return 'secondary';
  if (content?.includes('[Thinking]')) return 'outline';
  if (content?.includes('[Tool:')) return 'secondary';
  if (entryType === 'assistant') return 'outline';
  return 'outline';
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetailType | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;

    getSession(id)
      .then((data) => {
        setSession(data.session);
        setEvents(data.events);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleExpand = (eventId: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link to="/sessions">
          <Button variant="ghost" size="sm" className="gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sessions
          </Button>
        </Link>
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-destructive">{error || 'Session not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/sessions">
        <Button variant="ghost" size="sm" className="gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Sessions
        </Button>
      </Link>

      {/* Session header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-mono text-lg">{session.id}</CardTitle>
              {session.projectPath && (
                <p className="text-sm text-muted-foreground mt-1">
                  {session.projectPath}
                  {session.gitBranch && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {session.gitBranch}
                    </Badge>
                  )}
                </p>
              )}
            </div>
            <Badge variant={session.endedAt ? 'secondary' : 'default'}>
              {session.endedAt ? 'Ended' : 'Active'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Started</p>
              <p className="text-sm font-medium mt-1">{formatDateTime(session.startedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Input Tokens</p>
              <p className="text-sm font-medium font-mono mt-1">
                {formatTokens(session.totalInputTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Output Tokens</p>
              <p className="text-sm font-medium font-mono mt-1">
                {formatTokens(session.totalOutputTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Cost</p>
              <p className="text-sm font-medium font-mono text-green-500 mt-1">
                {formatCost(session.totalCostUsd)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events timeline */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Events</h3>
          <Badge variant="outline">{events.length} events</Badge>
        </div>

        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="space-y-2 pr-4">
            {events.map((event) => {
              const isExpanded = expandedEvents.has(event.id);
              const label = getEntryTypeLabel(event.entryType, event.hookEventName, event.toolName, event.content);
              const variant = getEventBadgeVariant(event.hookEventName, event.entryType, event.content);
              const Icon = getEntryIcon(event.entryType, event.toolName, event.content);

              return (
                <Collapsible
                  key={event.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpand(event.id)}
                >
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className={`p-1 rounded ${
                          variant === 'default' ? 'bg-primary/10 text-primary' :
                          variant === 'secondary' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
                          variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono w-20">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant={variant} className="text-xs">
                          {label}
                        </Badge>
                        {event.toolName && !event.toolName.startsWith('mcp__') && (
                          <code className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                            {event.toolName}
                          </code>
                        )}
                        {event.content && (
                          <span className="text-sm text-muted-foreground truncate flex-1">
                            {truncate(event.content, 60)}
                          </span>
                        )}
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      {event.content && (
                        <div className="px-4 py-3 bg-muted/30 border-t">
                          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                            {event.content}
                          </pre>
                          {event.tokensInput !== undefined && (
                            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Tokens: {event.tokensInput} in / {event.tokensOutput || 0} out</span>
                              {event.cost !== undefined && event.cost > 0 && (
                                <span className="text-green-500 font-mono">
                                  {formatCost(event.cost)}
                                </span>
                              )}
                              {event.model && (
                                <Badge variant="outline" className="text-xs">
                                  {event.model.replace('claude-', '')}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
