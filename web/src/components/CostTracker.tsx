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
      // Data comes from API in ascending order (oldest first) with gaps filled
      setCosts(costsData);
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

  // Calculate running totals and cache savings
  let runningCost = 0;
  let runningTokens = 0;
  let runningSavings = 0;
  const chartData = costs.map((c) => {
    runningCost += c.costUsd;
    runningTokens += c.inputTokens + c.outputTokens;
    runningSavings += c.cacheSavings || 0;
    const cacheRead = c.cacheReadTokens || 0;
    const cacheWrite = c.cacheWriteTokens || 0;
    // Uncached tokens = input tokens minus cache reads (the fresh tokens we paid full price for)
    const uncachedInput = Math.max(0, c.inputTokens - cacheRead);
    return {
      date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cost: c.costUsd,
      costWithoutCache: c.costWithoutCache || c.costUsd,
      cacheSavings: c.cacheSavings || 0,
      tokens: c.inputTokens + c.outputTokens,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      uncachedInput,
      runningCost,
      runningTokens,
      runningSavings,
    };
  });

  const totalCost = costs.reduce((sum, c) => sum + c.costUsd, 0);
  const totalTokens = costs.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);
  const totalCacheSavings = costs.reduce((sum, c) => sum + (c.cacheSavings || 0), 0);
  const totalCacheReadTokens = costs.reduce((sum, c) => sum + (c.cacheReadTokens || 0), 0);
  const totalCacheWriteTokens = costs.reduce((sum, c) => sum + (c.cacheWriteTokens || 0), 0);

  // Calculate daily average
  const avgDailyCost = costs.length > 0 ? totalCost / costs.length : 0;
  const projectedMonthlyCost = avgDailyCost * 30;

  // Cache efficiency percentage
  const cacheEfficiency = totalCost > 0 ? (totalCacheSavings / (totalCost + totalCacheSavings)) * 100 : 0;

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
      <div className="grid grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Running Total</p>
            <p className="text-3xl font-bold text-green-500 mt-1">{formatCost(stats?.totalCost || totalCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">All time usage</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cache Savings</p>
            <p className="text-3xl font-bold text-cyan-500 mt-1">{formatCost(totalCacheSavings)}</p>
            <p className="text-xs text-cyan-400 mt-1">{cacheEfficiency.toFixed(0)}% efficiency</p>
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
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cache Read Tokens</p>
            <p className="text-2xl font-bold text-blue-500 mt-1">{formatTokens(totalCacheReadTokens)}</p>
            <p className="text-xs text-muted-foreground mt-1">Served from cache</p>
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
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[160px]">
                          <p className="font-medium text-sm border-b pb-2 mb-2">{label}</p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                                <span className="text-xs text-muted-foreground">This Minute</span>
                              </div>
                              <span className="text-xs font-mono font-medium">{formatCost(data.cost)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                                <span className="text-xs text-muted-foreground">Cumulative</span>
                              </div>
                              <span className="text-xs font-mono font-medium">{formatCost(data.runningCost)}</span>
                            </div>
                          </div>
                        </div>
                      );
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
          {/* Combined Cost chart - Daily bars + Cumulative line + Cache Savings */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Cost Analysis with Cache Savings
              </CardTitle>
              <CardDescription>
                <span className="inline-flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-blue-500"></span> Actual Cost
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-cyan-500/50"></span> Cache Savings
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
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload;
                        if (!data) return null;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[180px]">
                            <p className="font-medium text-sm border-b pb-2 mb-2">{label}</p>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                                  <span className="text-xs text-muted-foreground">Actual Cost</span>
                                </div>
                                <span className="text-xs font-mono font-medium">{formatCost(data.cost)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                                  <span className="text-xs text-muted-foreground">Cache Savings</span>
                                </div>
                                <span className="text-xs font-mono font-medium text-emerald-500">+{formatCost(data.cacheSavings)}</span>
                              </div>
                            </div>
                            <div className="border-t mt-2 pt-2 space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-muted-foreground">Would have cost</span>
                                <span className="text-xs font-mono">{formatCost(data.cost + data.cacheSavings)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs font-medium">Running Total</span>
                                <span className="text-sm font-mono font-bold">{formatCost(data.runningCost)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {/* Stacked bar: actual cost + cache savings = what it would have cost */}
                    <Bar
                      yAxisId="daily"
                      dataKey="cost"
                      stackId="cost"
                      fill="#3b82f6"
                      name="cost"
                    />
                    <Bar
                      yAxisId="daily"
                      dataKey="cacheSavings"
                      stackId="cost"
                      fill="#06b6d4"
                      fillOpacity={0.5}
                      name="cacheSavings"
                    />
                    <Line
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey="runningCost"
                      stroke="#22c55e"
                      strokeWidth={3}
                      dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Token Usage Over Time</CardTitle>
                  <CardDescription>Daily token consumption (cached vs. uncached)</CardDescription>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8b5cf6' }} />
                    <span>Output</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }} />
                    <span>Uncached Input</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
                    <span>Cache Read</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
                    <span>Cache Write</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="uncachedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="cacheReadGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="cacheWriteGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
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
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload;
                        if (!data) return null;
                        const total = data.outputTokens + data.uncachedInput + data.cacheReadTokens + data.cacheWriteTokens;
                        const items = [
                          { label: 'Output', value: data.outputTokens, color: '#8b5cf6' },
                          { label: 'Uncached Input', value: data.uncachedInput, color: '#3b82f6' },
                          { label: 'Cache Read', value: data.cacheReadTokens, color: '#22c55e' },
                          { label: 'Cache Write', value: data.cacheWriteTokens, color: '#f59e0b' },
                        ];
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[180px]">
                            <p className="font-medium text-sm border-b pb-2 mb-2">{label}</p>
                            <div className="space-y-1.5">
                              {items.map((item) => (
                                <div key={item.label} className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs text-muted-foreground">{item.label}</span>
                                  </div>
                                  <span className="text-xs font-mono font-medium">{formatTokens(item.value)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t mt-2 pt-2">
                              <span className="text-xs font-medium">Total</span>
                              <span className="text-sm font-mono font-bold">{formatTokens(total)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="outputTokens"
                      stackId="tokens"
                      stroke="#8b5cf6"
                      strokeWidth={1}
                      fill="url(#outputGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="uncachedInput"
                      stackId="tokens"
                      stroke="#3b82f6"
                      strokeWidth={1}
                      fill="url(#uncachedGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="cacheReadTokens"
                      stackId="tokens"
                      stroke="#22c55e"
                      strokeWidth={1}
                      fill="url(#cacheReadGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="cacheWriteTokens"
                      stackId="tokens"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      fill="url(#cacheWriteGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* Token breakdown stats */}
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Output Tokens</p>
                  <p className="text-lg font-semibold text-purple-500">
                    {formatTokens(costs.reduce((sum, c) => sum + c.outputTokens, 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Uncached Input</p>
                  <p className="text-lg font-semibold text-blue-500">
                    {formatTokens(chartData.reduce((sum, c) => sum + c.uncachedInput, 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Cache Read</p>
                  <p className="text-lg font-semibold text-green-500">
                    {formatTokens(totalCacheReadTokens)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Cache Write</p>
                  <p className="text-lg font-semibold text-amber-500">
                    {formatTokens(totalCacheWriteTokens)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
