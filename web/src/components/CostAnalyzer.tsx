import { useEffect, useState } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getCostAnalysis, type CostAnalysis } from '@/utils/api';
import { formatCost, formatTokens } from '@/utils/formatters';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function CostAnalyzer() {
  const [analysis, setAnalysis] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCostAnalysis()
      .then(setAnalysis)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cost Analyzer</h2>
          <p className="text-muted-foreground">Analyzing your spending patterns...</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-destructive">Error: {error || 'Failed to load analysis'}</p>
        </CardContent>
      </Card>
    );
  }

  const { byTool, byModel, byEntryType, expensiveEvents, textResponsePatterns, contentLengthCost, summary } = analysis;

  // Prepare pie chart data for tools
  const toolPieData = byTool.slice(0, 8).map((t, i) => ({
    name: t.toolName.replace('mcp__', '').slice(0, 20),
    value: t.totalCost,
    color: COLORS[i % COLORS.length],
  }));

  // Prepare bar chart data for models
  const modelBarData = byModel.map((m) => ({
    name: m.model.replace('claude-', '').slice(0, 15),
    cost: m.totalCost,
    count: m.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cost Analyzer</h2>
          <p className="text-muted-foreground">Understand what's driving your costs</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            Total: {formatCost(summary.totalCost)}
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Cost Driver</p>
            <p className="text-lg font-bold text-blue-500 mt-1 truncate">
              {byTool[0]?.toolName.replace('mcp__', '') || 'N/A'}
            </p>
            <p className="text-2xl font-bold mt-1">{formatCost(byTool[0]?.totalCost || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {((byTool[0]?.totalCost || 0) / summary.totalCost * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Most Used Model</p>
            <p className="text-lg font-bold text-green-500 mt-1 truncate">
              {byModel[0]?.model.replace('claude-', '') || 'N/A'}
            </p>
            <p className="text-2xl font-bold mt-1">{formatCost(byModel[0]?.totalCost || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {byModel[0]?.count || 0} requests
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Cost per Request</p>
            <p className="text-2xl font-bold text-purple-500 mt-1">
              {formatCost(summary.totalCost / summary.totalEvents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalEvents.toLocaleString()} total requests
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cost per 1K Tokens</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">
              {formatCost((summary.totalCost / summary.totalTokens) * 1000)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatTokens(summary.totalTokens)} total tokens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cost by Tool - Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Tool</CardTitle>
            <CardDescription>Which tools are consuming the most budget</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 flex">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie
                    data={toolPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {toolPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [formatCost(value), 'Cost']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 flex flex-col justify-center gap-1">
                {toolPieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate flex-1">{entry.name}</span>
                    <span className="text-muted-foreground">{formatCost(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost by Model - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
            <CardDescription>Spending across different Claude models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'cost' ? formatCost(value) : value,
                      name === 'cost' ? 'Cost' : 'Requests'
                    ]}
                  />
                  <Bar dataKey="cost" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost by Tool Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Tool Cost Breakdown</CardTitle>
          <CardDescription>Complete breakdown of costs by tool with statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
                <TableHead className="text-right">Invocations</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTool.map((tool, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      {tool.toolName.replace('mcp__', '')}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-500">
                    {formatCost(tool.totalCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">
                      {((tool.totalCost / summary.totalCost) * 100).toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{tool.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCost(tool.avgCost)}
                  </TableCell>
                  <TableCell className="text-right">{formatTokens(tool.totalTokens)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Most Expensive Requests */}
      <Card className="border-orange-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            Most Expensive Requests
          </CardTitle>
          <CardDescription>Individual requests that cost the most</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Content Preview</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensiveEvents.map((event, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {event.toolName?.replace('mcp__', '').slice(0, 15) || 'Text'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.model?.replace('claude-', '').slice(0, 15) || 'N/A'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {event.content?.slice(0, 60) || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-500 font-bold">
                      {formatCost(event.cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatTokens(event.tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Text Response Breakdown - The key insight! */}
      <Card className="border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            Text Response Breakdown
          </CardTitle>
          <CardDescription>
            Understanding what types of text responses cost the most (non-tool responses)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Pattern breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-3">By Content Pattern</h4>
              <div className="space-y-3">
                {textResponsePatterns.map((pattern, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="font-medium text-sm">{pattern.category}</span>
                      </div>
                      <span className="font-mono text-green-500 font-bold">
                        {formatCost(pattern.totalCost)}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{pattern.count} responses</span>
                      <span>~{formatCost(pattern.avgCost)}/response</span>
                      <span>~{formatTokens(pattern.avgTokens)} tokens/resp</span>
                    </div>
                    {pattern.examples.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground italic border-t pt-2">
                        Example: "{pattern.examples[0].slice(0, 80)}..."
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content length breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-3">By Response Length</h4>
              <div className="space-y-2">
                {contentLengthCost.map((item, i) => {
                  const percentage = (item.totalCost / summary.totalCost) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm w-28">{item.lengthBucket}</span>
                      <div className="flex-1 h-8 bg-muted rounded overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                          style={{ width: `${Math.min(percentage * 2, 100)}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-2">
                          <span className="text-xs font-medium">{formatCost(item.totalCost)}</span>
                          <span className="text-xs text-muted-foreground">{item.count} responses</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <h5 className="text-sm font-medium text-blue-400 mb-2">Key Insight</h5>
                <p className="text-xs text-muted-foreground">
                  {textResponsePatterns[0]?.category === 'Thinking/Reasoning'
                    ? `"Thinking/Reasoning" responses account for ${formatCost(textResponsePatterns[0].totalCost)} (${((textResponsePatterns[0].totalCost / summary.totalCost) * 100).toFixed(1)}% of total). These are internal reasoning blocks before actions.`
                    : `"${textResponsePatterns[0]?.category}" responses are your top text cost driver at ${formatCost(textResponsePatterns[0]?.totalCost || 0)}.`
                  }
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost by Request Type</CardTitle>
          <CardDescription>Breakdown by entry type (assistant responses, tool results, etc.)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {byEntryType.map((entry, i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium capitalize">{entry.entryType}</p>
                <p className="text-2xl font-bold mt-1">{formatCost(entry.totalCost)}</p>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{entry.count} requests</span>
                  <span>~{formatCost(entry.avgCost)}/req</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
