import { useEffect, useState, useCallback } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
  Line,
} from 'recharts';
import { getCosts, getStats, getTodayCosts, type TodayCostPoint } from '@/utils/api';
import { formatCost, formatTokens } from '@/utils/formatters';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { CostSummary, Stats } from '@/types';

export function CostTracker() {
  const [costs, setCosts] = useState<CostSummary[]>([]);
  const [todayCosts, setTodayCosts] = useState<TodayCostPoint[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [costsData, statsData, todayData] = await Promise.all([
        getCosts(days),
        getStats(),
        getTodayCosts(),
      ]);
      setCosts(costsData.reverse());
      setStats(statsData);
      setTodayCosts(todayData.costs);
      setLastUpdated(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cost Tracker</h2>
          <p className="text-muted-foreground">Monitor your token usage and costs</p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
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

  // Calculate running totals
  let runningCost = 0;
  let runningTokens = 0;
  const chartData = costs.map((c) => {
    runningCost += c.costUsd;
    runningTokens += c.inputTokens + c.outputTokens;
    return {
      date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cost: c.costUsd,
      tokens: c.inputTokens + c.outputTokens,
      runningCost,
      runningTokens,
    };
  });

  const totalCost = costs.reduce((sum, c) => sum + c.costUsd, 0);
  const totalTokens = costs.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);

  // Calculate daily average
  const avgDailyCost = costs.length > 0 ? totalCost / costs.length : 0;
  const projectedMonthlyCost = avgDailyCost * 30;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cost Tracker</h2>
          <p className="text-muted-foreground">Monitor your token usage and costs</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Running Total</p>
            <p className="text-3xl font-bold text-green-500 mt-1">{formatCost(stats?.totalCost || totalCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">All time usage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Period Cost</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCost(totalCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">Last {days} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected Monthly</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">{formatCost(projectedMonthlyCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">Based on avg/day</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tokens</p>
            <p className="text-2xl font-bold text-blue-500 mt-1">{formatTokens(stats?.totalTokens || totalTokens)}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sessions</p>
            <p className="text-2xl font-bold text-purple-500 mt-1">{stats?.totalSessions || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Real-time Trending */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Today's Cost Trend
              </CardTitle>
              <CardDescription>
                Cost by minute - auto-refreshes every 10 seconds
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {todayCosts.length} data points
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Updated: {lastUpdated.toLocaleTimeString()}
              </Badge>
              <Button variant="outline" size="sm" onClick={fetchData}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {todayCosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">No cost data for today yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Costs will appear as you use Claude Code
              </p>
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={todayCosts.map(c => ({
                  ...c,
                  time: new Date(c.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  }),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="cost"
                    orientation="left"
                    stroke="#3b82f6"
                    fontSize={12}
                    tickFormatter={(value) => `$${value.toFixed(2)}`}
                    label={{ value: 'Per Minute', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#3b82f6' }}
                  />
                  <YAxis
                    yAxisId="running"
                    orientation="right"
                    stroke="#22c55e"
                    fontSize={12}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                    label={{ value: 'Cumulative', angle: 90, position: 'insideRight', fontSize: 10, fill: '#22c55e' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'runningCost') return [`$${value.toFixed(2)}`, 'Cumulative'];
                      if (name === 'cost') return [`$${value.toFixed(4)}`, 'This Minute'];
                      return [value, name];
                    }}
                  />
                  <Bar
                    yAxisId="cost"
                    dataKey="cost"
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                    name="cost"
                  />
                  <Line
                    yAxisId="running"
                    type="monotone"
                    dataKey="runningCost"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 3 }}
                    name="runningCost"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {todayCosts.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Today's Total</p>
                <p className="text-xl font-bold text-green-500">
                  {formatCost(todayCosts[todayCosts.length - 1]?.runningCost || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Avg per Minute</p>
                <p className="text-xl font-bold text-blue-500">
                  {formatCost(todayCosts.reduce((a, b) => a + b.cost, 0) / todayCosts.length)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Today's Tokens</p>
                <p className="text-xl font-bold text-purple-500">
                  {formatTokens(todayCosts[todayCosts.length - 1]?.runningTokens || 0)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {costs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-muted-foreground">No cost data for this period</p>
            <p className="text-sm text-muted-foreground mt-1">
              Cost data will appear as you use Claude Code
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Combined Cost chart - Daily bars + Cumulative line */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Cost Analysis
              </CardTitle>
              <CardDescription>
                <span className="inline-flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-blue-500"></span> Daily Cost
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span> Running Total
                  </span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      yAxisId="daily"
                      orientation="left"
                      stroke="#3b82f6"
                      fontSize={12}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <YAxis
                      yAxisId="cumulative"
                      orientation="right"
                      stroke="#22c55e"
                      fontSize={12}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number, name: string) => [
                        `$${value.toFixed(2)}`,
                        name === 'runningCost' ? 'Running Total' : 'Daily Cost'
                      ]}
                    />
                    <Bar
                      yAxisId="daily"
                      dataKey="cost"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      name="cost"
                    />
                    <Line
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey="runningCost"
                      stroke="#22c55e"
                      strokeWidth={3}
                      dot={{ fill: '#22c55e', strokeWidth: 2, r: 5 }}
                      name="runningCost"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Token chart */}
          <Card>
            <CardHeader>
              <CardTitle>Token Usage Over Time</CardTitle>
              <CardDescription>Daily token consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(value) => formatTokens(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number) => [formatTokens(value), 'Tokens']}
                    />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      fill="url(#tokenGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
