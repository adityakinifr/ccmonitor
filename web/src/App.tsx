import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ActivityStream } from '@/components/ActivityStream';
import { SessionList } from '@/components/SessionList';
import { SessionDetail } from '@/components/SessionDetail';
import { McpStats } from '@/components/McpStats';
import { CostTracker } from '@/components/CostTracker';
import { CostAnalyzer } from '@/components/CostAnalyzer';
import { ProjectAnalysis } from '@/components/ProjectAnalysis';
import { AIOptimizer } from '@/components/AIOptimizer';
import { ContextHealth } from '@/components/ContextHealth';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ActivityStream />} />
          <Route path="sessions" element={<SessionList />} />
          <Route path="sessions/:id" element={<SessionDetail />} />
          <Route path="mcp" element={<McpStats />} />
          <Route path="costs" element={<CostTracker />} />
          <Route path="analyze" element={<CostAnalyzer />} />
          <Route path="projects" element={<ProjectAnalysis />} />
          <Route path="context" element={<ContextHealth />} />
          <Route path="optimize" element={<AIOptimizer />} />
          {/* Unknown paths (incl. the removed /adaptive) fall back to the activity stream */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
