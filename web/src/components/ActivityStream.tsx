import { useEffect } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getEvents } from '@/utils/api';
import { formatRelativeTime, truncate, formatCost } from '@/utils/formatters';
import { getEntryIcon, getEntryTypeLabel } from '@/utils/entryIcons';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EventItem } from '@/types';

function getEventBadgeVariant(hookEventName?: string, entryType?: string, content?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (hookEventName) {
    switch (hookEventName) {
      case 'UserPromptSubmit':
        return 'default';
      case 'PreToolUse':
      case 'PostToolUse':
        return 'secondary';
      case 'SessionEnd':
        return 'destructive';
      default:
        return 'outline';
    }
  }

  // Check content patterns
  if (content?.includes('[Thinking]')) return 'outline';
  if (content?.includes('[Tool:')) return 'secondary';

  switch (entryType) {
    case 'user':
      return 'default';
    case 'tool_result':
      return 'secondary';
    case 'assistant':
      return 'outline';
    default:
      return 'outline';
  }
}

function EventCard({ event }: { event: EventItem }) {
  const label = getEntryTypeLabel(event.entryType, event.hookEventName, event.toolName, event.content);
  const variant = getEventBadgeVariant(event.hookEventName, event.entryType, event.content);
  const Icon = getEntryIcon(event.entryType, event.toolName, event.content);

  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`p-1.5 rounded ${
              variant === 'default' ? 'bg-primary/10 text-primary' :
              variant === 'secondary' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
              variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            }`}>
              <Icon className="w-4 h-4" />
            </div>
            <Badge variant={variant}>{label}</Badge>
            {event.toolName && !event.toolName.startsWith('mcp__') && (
              <code className="text-sm text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                {event.toolName}
              </code>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(event.timestamp)}
          </span>
        </div>

        {event.content && (
          <p className="mt-3 text-sm text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
            {truncate(event.content, 300)}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-mono">
            Session: {event.sessionId.slice(0, 8)}...
          </span>
          {event.tokensInput !== undefined && (
            <span>
              Tokens: {event.tokensInput} in / {event.tokensOutput || 0} out
            </span>
          )}
          {event.cost !== undefined && event.cost > 0 && (
            <span className="text-green-500 font-mono">
              {formatCost(event.cost)}
            </span>
          )}
          {event.model && (
            <Badge variant="outline" className="text-xs">
              {event.model.replace('claude-', '').slice(0, 12)}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityStream() {
  useWebSocket();
  const { events, setEvents } = useEventStore();

  useEffect(() => {
    getEvents(undefined, 100).then(setEvents).catch(console.error);
  }, [setEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Live Activity</h2>
          <p className="text-muted-foreground">Real-time event stream from Claude Code</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {events.length} events
        </Badge>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-3 pr-4">
          {events.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-4">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-muted-foreground">No events yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Events will appear here as you use Claude Code
                </p>
              </CardContent>
            </Card>
          ) : (
            events.map((event) => <EventCard key={event.id} event={event} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
