import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions } from '@/utils/api';
import { formatDateTime, formatTokens, formatCost } from '@/utils/formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SessionSummary } from '@/types';

export function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sessions</h2>
          <p className="text-muted-foreground">Browse your Claude Code sessions</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-destructive">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sessions</h2>
        <p className="text-muted-foreground">Browse your Claude Code sessions</p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-muted-foreground">No sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sessions will appear as you use Claude Code
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Tools</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link
                      to={`/sessions/${session.id}`}
                      className="text-blue-400 hover:text-blue-300 font-mono text-sm hover:underline"
                    >
                      {session.id.slice(0, 12)}...
                    </Link>
                  </TableCell>
                  <TableCell>
                    {session.projectPath ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {session.projectPath.split('/').pop()}
                        </span>
                        {session.gitBranch && (
                          <Badge variant="secondary" className="text-xs">
                            {session.gitBranch}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(session.startedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.eventCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.toolCallCount}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatTokens(session.totalInputTokens + session.totalOutputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-green-500">
                    {formatCost(session.totalCostUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
