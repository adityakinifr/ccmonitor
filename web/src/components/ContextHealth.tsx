import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getContextHealth } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { formatCost } from '@/utils/formatters';
import type { ContextHealth as ContextHealthData } from '@/types';

const OVERSIZED_BYTES = 200_000;

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}

// Larger contexts are re-read on every turn, so the cost scale runs warm.
const BUCKET_COLORS: Record<string, string> = {
  '<50k': 'hsl(142 71% 45%)',
  '50-150k': 'hsl(160 60% 45%)',
  '150-400k': 'hsl(43 96% 56%)',
  '400-800k': 'hsl(25 95% 53%)',
  '>800k': 'hsl(0 84% 60%)',
};

function causeTone(cause: string): 'default' | 'secondary' | 'destructive' {
  if (cause.startsWith('unexplained')) return 'destructive';
  if (cause.startsWith('cache TTL')) return 'secondary';
  return 'default';
}

export function ContextHealth() {
  const [data, setData] = useState<ContextHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getContextHealth()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const header = (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Context Health</h2>
      <p className="text-muted-foreground">What fills the context window, and what it costs</p>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="p-6 text-destructive">
            Failed to load context health: {error ?? 'no data'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, distribution, rebuildsByCause, rebuildSessions, byTool, worstResults } = data;
  const pctOverThreshold =
    summary.totalCalls > 0 ? (summary.callsOverThreshold / summary.totalCalls) * 100 : 0;
  const pctRebuild =
    summary.totalCost > 0 ? (summary.rebuildCost / summary.totalCost) * 100 : 0;
  const maxToolBytes = byTool.length > 0 ? byTool[0].totalBytes : 0;

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Context</p>
            <p className="text-3xl font-bold text-orange-400 mt-1">
              {formatTokenCount(summary.avgContextTokens)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">read per API call</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Calls Over 800k</p>
            <p className="text-3xl font-bold text-rose-500 mt-1">{pctOverThreshold.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.callsOverThreshold.toLocaleString()} of{' '}
              {summary.totalCalls.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cache Rebuilds</p>
            <p className="text-3xl font-bold text-amber-500 mt-1">
              {formatCost(summary.rebuildCost)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.rebuildCalls} calls &middot; {pctRebuild.toFixed(1)}% of spend
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Oversized Results
            </p>
            <p className="text-3xl font-bold text-purple-400 mt-1">{summary.oversizedResults}</p>
            <p className="text-xs text-muted-foreground mt-1">over 200 KB each</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost by Context Size</CardTitle>
          <CardDescription>
            Context is re-read on every turn, so cost scales with how full the window is
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, _name, entry) => [
                    `${formatCost(value)} across ${entry.payload.calls.toLocaleString()} calls`,
                    'Cost',
                  ]}
                />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                  {distribution.map((d) => (
                    <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket] ?? 'hsl(var(--chart-1))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What Fills the Context</CardTitle>
          <CardDescription>
            Tool results by total payload. A single oversized result is carried in every
            subsequent turn of the session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Results</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Largest</TableHead>
                <TableHead className="text-right">Oversized</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTool.map((tool) => (
                <TableRow key={tool.toolName}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded bg-muted overflow-hidden shrink-0">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${maxToolBytes > 0 ? (tool.totalBytes / maxToolBytes) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="truncate">{tool.toolName.replace('mcp__', '')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tool.results.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(tool.totalBytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatBytes(tool.avgBytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(tool.maxBytes)}
                  </TableCell>
                  <TableCell className="text-right">
                    {tool.oversized > 0 ? (
                      <Badge variant="destructive" className="font-mono">
                        {tool.oversized}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cache Rebuilds</CardTitle>
            <CardDescription>
              Turns that rewrote the whole prefix instead of reading it back
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cause</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rebuildsByCause.map((r) => (
                  <TableRow key={r.cause}>
                    <TableCell>
                      <Badge variant={causeTone(r.cause)} className="font-normal">
                        {r.cause}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(r.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Expiry after an idle hour is normal. Rebuilds inside the cache window are not.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions With Rebuilds</CardTitle>
            <CardDescription>Highest rebuild cost first</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead className="text-right">Rebuilds</TableHead>
                  <TableHead className="text-right">Unexplained</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rebuildSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No cache rebuilds recorded
                    </TableCell>
                  </TableRow>
                ) : (
                  rebuildSessions.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell className="font-mono text-xs">
                        {s.projectName ?? s.sessionId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.calls}</TableCell>
                      <TableCell className="text-right">
                        {s.unexplained > 0 ? (
                          <Badge variant="destructive" className="font-mono">
                            {s.unexplained}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(s.cost)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Largest Single Results</CardTitle>
          <CardDescription>
            The individual tool results that injected the most context at once
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {worstResults.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {(r.toolName ?? 'unknown').replace('mcp__', '')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.sessionId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge
                      variant={r.bytes > OVERSIZED_BYTES ? 'destructive' : 'secondary'}
                      className="font-mono"
                    >
                      {formatBytes(r.bytes)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
