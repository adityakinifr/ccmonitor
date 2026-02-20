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

// Tool category helpers
const FILE_TOOLS = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'NotebookEdit'];
const TASK_TOOLS = ['Task', 'TaskOutput', 'TaskUpdate', 'TaskCreate', 'TaskStop', 'TaskList', 'TodoWrite', 'KillShell', 'Skill', 'EnterPlanMode', 'ExitPlanMode'];
const SHELL_TOOLS = ['Bash'];
const WEB_TOOLS = ['WebFetch', 'WebSearch'];
const OTHER_BUILTIN = ['AskUserQuestion'];

function categorizeTools(byTool: { toolName: string; totalCost: number; count: number; avgCost: number; totalTokens: number }[]) {
  const mcpTools: typeof byTool = [];
  const fileTools: typeof byTool = [];
  const taskTools: typeof byTool = [];
  const shellTools: typeof byTool = [];
  const webTools: typeof byTool = [];
  const textCategories: typeof byTool = [];
  const otherTools: typeof byTool = [];

  for (const tool of byTool) {
    if (tool.toolName.startsWith('Text:')) {
      textCategories.push(tool);
    } else if (tool.toolName.startsWith('mcp__')) {
      mcpTools.push(tool);
    } else if (FILE_TOOLS.includes(tool.toolName)) {
      fileTools.push(tool);
    } else if (TASK_TOOLS.includes(tool.toolName)) {
      taskTools.push(tool);
    } else if (SHELL_TOOLS.includes(tool.toolName)) {
      shellTools.push(tool);
    } else if (WEB_TOOLS.includes(tool.toolName)) {
      webTools.push(tool);
    } else {
      otherTools.push(tool);
    }
  }

  return { mcpTools, fileTools, taskTools, shellTools, webTools, textCategories, otherTools };
}

function sumCategory(tools: { totalCost: number; count: number; totalTokens: number }[]) {
  return tools.reduce(
    (acc, t) => ({
      cost: acc.cost + t.totalCost,
      count: acc.count + t.count,
      tokens: acc.tokens + t.totalTokens,
    }),
    { cost: 0, count: 0, tokens: 0 }
  );
}

export function CostAnalyzer() {
  const [analysis, setAnalysis] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [hiddenSegments, setHiddenSegments] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleSegment = (name: string) => {
    setHiddenSegments(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

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

  // Categorize tools
  const { mcpTools, fileTools, taskTools, shellTools, webTools, textCategories, otherTools } = categorizeTools(byTool);
  const mcpTotals = sumCategory(mcpTools);
  const fileTotals = sumCategory(fileTools);
  const taskTotals = sumCategory(taskTools);
  const shellTotals = sumCategory(shellTools);
  const webTotals = sumCategory(webTools);
  const textTotals = sumCategory(textCategories);

  // Prepare grouped pie chart data
  const groupedPieData = [
    ...(fileTotals.cost > 0 ? [{ name: 'File Tools', value: fileTotals.cost, color: '#22c55e', category: 'file' }] : []),
    ...(taskTotals.cost > 0 ? [{ name: 'Task/Agent Tools', value: taskTotals.cost, color: '#f59e0b', category: 'task' }] : []),
    ...(shellTotals.cost > 0 ? [{ name: 'Shell (Bash)', value: shellTotals.cost, color: '#ef4444', category: 'shell' }] : []),
    ...(webTotals.cost > 0 ? [{ name: 'Web Tools', value: webTotals.cost, color: '#06b6d4', category: 'web' }] : []),
    ...(mcpTotals.cost > 0 ? [{ name: 'MCP Tools', value: mcpTotals.cost, color: '#8b5cf6', category: 'mcp' }] : []),
    ...(textTotals.cost > 0 ? [{ name: 'Text Responses', value: textTotals.cost, color: '#3b82f6', category: 'text' }] : []),
    ...otherTools.map((t, i) => ({
      name: t.toolName.slice(0, 20),
      value: t.totalCost,
      color: COLORS[(i + 6) % COLORS.length],
      category: 'other',
    })),
  ].sort((a, b) => b.value - a.value);

  // Filter out hidden segments for pie chart
  const visiblePieData = groupedPieData.filter(d => !hiddenSegments.has(d.name));

  // Prepare bar chart data for models
  const modelBarData = byModel
    .filter(m => !hiddenSegments.has(m.model))
    .map((m) => ({
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
        {/* Cost by Category - Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Category</CardTitle>
            <CardDescription>Click legend items to show/hide segments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 flex">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie
                    data={visiblePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {visiblePieData.map((entry, index) => (
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
              <div className="flex-1 flex flex-col justify-center gap-1 overflow-y-auto max-h-72">
                {groupedPieData.map((entry, i) => {
                  const isHidden = hiddenSegments.has(entry.name);
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-all ${
                        isHidden ? 'opacity-40' : ''
                      }`}
                      onClick={() => toggleSegment(entry.name)}
                    >
                      <div
                        className={`w-3 h-3 rounded ${isHidden ? 'bg-muted' : ''}`}
                        style={{ backgroundColor: isHidden ? undefined : entry.color }}
                      />
                      <span className={`truncate flex-1 ${isHidden ? 'line-through' : ''}`}>
                        {entry.name}
                      </span>
                      <span className="text-muted-foreground">{formatCost(entry.value)}</span>
                    </div>
                  );
                })}
                {hiddenSegments.size > 0 && (
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                    onClick={() => setHiddenSegments(new Set())}
                  >
                    Show all
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost by Model - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
            <CardDescription>Click model names to show/hide</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3 flex-wrap">
              {byModel.map((m, i) => {
                const isHidden = hiddenSegments.has(m.model);
                return (
                  <button
                    key={i}
                    className={`text-xs px-2 py-1 rounded border transition-all ${
                      isHidden
                        ? 'opacity-40 bg-muted border-muted line-through'
                        : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                    }`}
                    onClick={() => toggleSegment(m.model)}
                  >
                    {m.model.replace('claude-', '').slice(0, 15)}
                  </button>
                );
              })}
            </div>
            <div className="h-64">
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
              {(() => {
                type RowType = 'category-parent' | 'category-child' | 'other';
                type CategoryKey = 'mcp' | 'file' | 'task' | 'shell' | 'web' | 'text';

                const categoryConfig: Record<CategoryKey, { name: string; color: string }> = {
                  file: { name: 'File Tools', color: '#22c55e' },
                  task: { name: 'Task/Agent Tools', color: '#f59e0b' },
                  shell: { name: 'Shell (Bash)', color: '#ef4444' },
                  web: { name: 'Web Tools', color: '#06b6d4' },
                  mcp: { name: 'MCP Tools', color: '#8b5cf6' },
                  text: { name: 'Text Responses', color: '#3b82f6' },
                };

                // Build rows with categories
                const rows: { type: RowType; category?: CategoryKey; data: typeof byTool[0]; children?: typeof byTool }[] = [];

                // Add File Tools parent if exists
                if (fileTools.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'file',
                    data: {
                      toolName: 'File Tools',
                      totalCost: fileTotals.cost,
                      count: fileTotals.count,
                      avgCost: fileTotals.cost / fileTotals.count,
                      totalTokens: fileTotals.tokens,
                    },
                    children: fileTools,
                  });
                }

                // Add Task/Agent Tools parent if exists
                if (taskTools.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'task',
                    data: {
                      toolName: 'Task/Agent Tools',
                      totalCost: taskTotals.cost,
                      count: taskTotals.count,
                      avgCost: taskTotals.cost / taskTotals.count,
                      totalTokens: taskTotals.tokens,
                    },
                    children: taskTools,
                  });
                }

                // Add Shell parent if exists
                if (shellTools.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'shell',
                    data: {
                      toolName: 'Shell (Bash)',
                      totalCost: shellTotals.cost,
                      count: shellTotals.count,
                      avgCost: shellTotals.cost / shellTotals.count,
                      totalTokens: shellTotals.tokens,
                    },
                    children: shellTools,
                  });
                }

                // Add Web Tools parent if exists
                if (webTools.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'web',
                    data: {
                      toolName: 'Web Tools',
                      totalCost: webTotals.cost,
                      count: webTotals.count,
                      avgCost: webTotals.cost / webTotals.count,
                      totalTokens: webTotals.tokens,
                    },
                    children: webTools,
                  });
                }

                // Add MCP parent if exists
                if (mcpTools.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'mcp',
                    data: {
                      toolName: 'MCP Tools',
                      totalCost: mcpTotals.cost,
                      count: mcpTotals.count,
                      avgCost: mcpTotals.cost / mcpTotals.count,
                      totalTokens: mcpTotals.tokens,
                    },
                    children: mcpTools,
                  });
                }

                // Add Text parent if exists
                if (textCategories.length > 0) {
                  rows.push({
                    type: 'category-parent',
                    category: 'text',
                    data: {
                      toolName: 'Text Responses',
                      totalCost: textTotals.cost,
                      count: textTotals.count,
                      avgCost: textTotals.cost / textTotals.count,
                      totalTokens: textTotals.tokens,
                    },
                    children: textCategories,
                  });
                }

                // Add other tools
                otherTools.forEach(tool => {
                  rows.push({ type: 'other', data: tool });
                });

                // Sort by cost
                rows.sort((a, b) => b.data.totalCost - a.data.totalCost);

                // Flatten with children
                const flatRows: { type: RowType; category?: CategoryKey; data: typeof byTool[0]; isChild?: boolean; parentCategory?: CategoryKey }[] = [];
                for (const row of rows) {
                  flatRows.push(row);
                  if (row.type === 'category-parent' && row.category && expandedCategories.has(row.category) && row.children) {
                    const sortedChildren = [...row.children].sort((a, b) => b.totalCost - a.totalCost);
                    for (const child of sortedChildren) {
                      flatRows.push({ type: 'category-child', data: child, isChild: true, parentCategory: row.category });
                    }
                  }
                }

                return flatRows.map((row, i) => {
                  if (row.type === 'category-parent' && row.category) {
                    const config = categoryConfig[row.category];
                    const isExpanded = expandedCategories.has(row.category);
                    return (
                      <TableRow
                        key={`${row.category}-parent`}
                        className={`cursor-pointer hover:opacity-80`}
                        style={{ backgroundColor: `${config.color}15` }}
                        onClick={() => toggleCategory(row.category!)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 transition-transform`}
                              style={{ color: config.color }}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d={isExpanded ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"}
                              />
                            </svg>
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                            <span className="font-semibold" style={{ color: config.color }}>{row.data.toolName}</span>
                            <Badge variant="secondary" className="text-xs ml-2">
                              {row.children?.length} tools
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-500 font-semibold">
                          {formatCost(row.data.totalCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" style={{ backgroundColor: `${config.color}20` }}>
                            {((row.data.totalCost / summary.totalCost) * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{row.data.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{formatCost(row.data.avgCost)}</TableCell>
                        <TableCell className="text-right">{formatTokens(row.data.totalTokens)}</TableCell>
                      </TableRow>
                    );
                  }

                  if (row.type === 'category-child' && row.parentCategory) {
                    const config = categoryConfig[row.parentCategory];
                    return (
                      <TableRow key={`${row.parentCategory}-${i}`} style={{ backgroundColor: `${config.color}08` }}>
                        <TableCell className="font-medium pl-10">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color, opacity: 0.6 }} />
                            <span className="text-sm opacity-80">
                              {row.data.toolName.replace('mcp__', '').replace('Text: ', '')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-500/80 text-sm">
                          {formatCost(row.data.totalCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs text-muted-foreground">
                            {((row.data.totalCost / summary.totalCost) * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">{row.data.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCost(row.data.avgCost)}</TableCell>
                        <TableCell className="text-right text-sm">{formatTokens(row.data.totalTokens)}</TableCell>
                      </TableRow>
                    );
                  }

                  // Other tools (not in any category)
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {row.data.toolName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-500">{formatCost(row.data.totalCost)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{((row.data.totalCost / summary.totalCost) * 100).toFixed(1)}%</Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.data.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{formatCost(row.data.avgCost)}</TableCell>
                      <TableCell className="text-right">{formatTokens(row.data.totalTokens)}</TableCell>
                    </TableRow>
                  );
                });
              })()}
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
