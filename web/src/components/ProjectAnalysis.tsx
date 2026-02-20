import { useEffect, useState } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getProjectStats, getProjectCosts, type ProjectStats, type ProjectCostByDay, type ProjectToolBreakdown } from '@/utils/api';
import { formatCost, formatTokens, formatDateTime } from '@/utils/formatters';
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

export function ProjectAnalysis() {
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectStats | null>(null);
  const [projectCosts, setProjectCosts] = useState<ProjectCostByDay[]>([]);
  const [projectTools, setProjectTools] = useState<ProjectToolBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProjectStats()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setDetailLoading(true);
      getProjectCosts(selectedProject.projectPath)
        .then(({ costs, tools }) => {
          setProjectCosts(costs);
          setProjectTools(tools);
        })
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    }
  }, [selectedProject]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Analysis</h2>
          <p className="text-muted-foreground">Loading project data...</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
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

  const totalCost = projects.reduce((sum, p) => sum + p.totalCost, 0);
  const totalSessions = projects.reduce((sum, p) => sum + p.totalSessions, 0);

  // Prepare pie data for project distribution
  const pieData = projects.slice(0, 8).map((p, i) => ({
    name: p.projectName,
    value: p.totalCost,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Analysis</h2>
          <p className="text-muted-foreground">Cost breakdown by GitHub project</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            {projects.length} projects
          </Badge>
          <Badge variant="outline" className="text-lg px-4 py-2">
            Total: {formatCost(totalCost)}
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Project</p>
            <p className="text-lg font-bold text-blue-500 mt-1 truncate">
              {projects[0]?.projectName || 'N/A'}
            </p>
            <p className="text-2xl font-bold mt-1">{formatCost(projects[0]?.totalCost || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {((projects[0]?.totalCost || 0) / totalCost * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Sessions</p>
            <p className="text-2xl font-bold text-green-500 mt-1">{totalSessions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Across {projects.length} projects
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Cost/Project</p>
            <p className="text-2xl font-bold text-purple-500 mt-1">
              {formatCost(totalCost / projects.length)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Cost/Session</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">
              {formatCost(totalCost / totalSessions)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Project Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Distribution</CardTitle>
            <CardDescription>Spending across projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 flex">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
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
                {pieData.map((entry, i) => (
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

        {/* Project Timeline */}
        {selectedProject && (
          <Card>
            <CardHeader>
              <CardTitle>{selectedProject.projectName}</CardTitle>
              <CardDescription>Cost over time (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {detailLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={projectCosts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickFormatter={(v) => `$${v.toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [formatCost(value), 'Cost']}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="costUsd"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!selectedProject && (
          <Card className="flex items-center justify-center">
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Select a project to see details</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Project List */}
      <Card>
        <CardHeader>
          <CardTitle>All Projects</CardTitle>
          <CardDescription>Click a project to see detailed breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Branches</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project, i) => (
                  <TableRow
                    key={i}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      selectedProject?.projectPath === project.projectPath ? 'bg-blue-500/10' : ''
                    }`}
                    onClick={() => setSelectedProject(project)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <div>
                          <p className="font-semibold">{project.projectName}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-48">
                            {project.projectPath}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {project.gitBranches.slice(0, 3).map((branch, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">
                            {branch}
                          </Badge>
                        ))}
                        {project.gitBranches.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{project.gitBranches.length - 3}
                          </Badge>
                        )}
                        {project.gitBranches.length === 0 && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-500 font-semibold">
                      {formatCost(project.totalCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {((project.totalCost / totalCost) * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{project.totalSessions}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTokens(project.totalInputTokens + project.totalOutputTokens)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(project.lastSessionAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tool Breakdown for Selected Project */}
      {selectedProject && projectTools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tool Usage: {selectedProject.projectName}</CardTitle>
            <CardDescription>Cost breakdown by tool for this project</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">% of Project</TableHead>
                  <TableHead className="text-right">Invocations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectTools.slice(0, 10).map((tool, i) => (
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
                        {((tool.totalCost / selectedProject.totalCost) * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{tool.count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
