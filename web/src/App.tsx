import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ActivityStream } from '@/components/ActivityStream';
import { SessionList } from '@/components/SessionList';
import { SessionDetail } from '@/components/SessionDetail';
import { McpStats } from '@/components/McpStats';
import { CostTracker } from '@/components/CostTracker';
import { CostAnalyzer } from '@/components/CostAnalyzer';
import { AIOptimizer } from '@/components/AIOptimizer';

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
          <Route path="optimize" element={<AIOptimizer />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
