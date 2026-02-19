import { useState, useEffect } from 'react';
import { getAIAnalysis, type AIAnalysisResult } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STORAGE_KEY = 'ccmonitor_gemini_api_key';

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const variants: Record<string, 'destructive' | 'default' | 'secondary'> = {
    high: 'destructive',
    medium: 'default',
    low: 'secondary',
  };
  return (
    <Badge variant={variants[priority]} className="capitalize">
      {priority}
    </Badge>
  );
}

function ModelBadge({ model }: { model: 'opus' | 'sonnet' | 'haiku' }) {
  const styles: Record<string, { bg: string; text: string; icon: string }> = {
    opus: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '⚡' },
    sonnet: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '🎯' },
    haiku: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '💨' },
  };
  const style = styles[model];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${style.bg} ${style.text}`}>
      <span>{style.icon}</span>
      {model.charAt(0).toUpperCase() + model.slice(1)}
    </span>
  );
}

export function AIOptimizer() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved API key on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSavedKey(saved);
      setApiKey(saved);
    }
  }, []);

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem(STORAGE_KEY, apiKey.trim());
      setSavedKey(apiKey.trim());
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedKey('');
    setApiKey('');
    setAnalysis(null);
  };

  const runAnalysis = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getAIAnalysis(apiKey.trim());
      setAnalysis(result);
      // Save key on successful use
      if (!savedKey) {
        saveApiKey();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Cost Optimizer</h2>
          <p className="text-muted-foreground">
            Get AI-powered recommendations to reduce your Claude Code spending
          </p>
        </div>
        <Badge variant="outline" className="text-sm gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Powered by Gemini
        </Badge>
      </div>

      {/* API Key Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gemini API Configuration</CardTitle>
          <CardDescription>
            Enter your Google Gemini API key to enable AI-powered analysis.{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get an API key
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder="Enter your Gemini API key..."
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                className="pr-20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {savedKey ? (
              <Button variant="outline" onClick={clearApiKey}>
                Clear Saved Key
              </Button>
            ) : (
              <Button variant="outline" onClick={saveApiKey} disabled={!apiKey.trim()}>
                Save Key
              </Button>
            )}
            <Button onClick={runAnalysis} disabled={loading || !apiKey.trim()}>
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                'Analyze & Optimize'
              )}
            </Button>
          </div>
          {savedKey && (
            <p className="text-xs text-muted-foreground mt-2">
              API key saved locally in browser storage
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-1/2 mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !loading && (
        <div className="space-y-6">
          {/* Summary */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Analysis Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{analysis.summary}</p>
              <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-sm font-medium text-green-500">Estimated Monthly Savings</p>
                <p className="text-2xl font-bold text-green-400">{analysis.estimatedMonthlySavings}</p>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>Actionable steps to reduce your spending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysis.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-semibold">{rec.title}</span>
                          <PriorityBadge priority={rec.priority} />
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.description}</p>
                        {rec.claudeCodeTip && (
                          <div className="mt-3 p-2 rounded bg-primary/10 border border-primary/20">
                            <p className="text-xs text-muted-foreground mb-1">How to do this in Claude Code:</p>
                            <code className="text-sm text-primary font-mono">{rec.claudeCodeTip}</code>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Potential Savings</p>
                        <p className="text-lg font-bold text-green-500">{rec.potentialSavings}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Expensive Query Analysis */}
          {analysis.expensiveQueryAnalysis && analysis.expensiveQueryAnalysis.length > 0 && (
            <Card className="border-orange-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  Expensive Query Analysis
                </CardTitle>
                <CardDescription>
                  Detailed breakdown of your most expensive requests and how to avoid them
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.expensiveQueryAnalysis.map((query, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </span>
                          <span className="font-medium">{query.query}</span>
                        </div>
                        <Badge variant="destructive" className="text-sm font-mono">
                          {query.cost}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase mb-1">Why It Was Expensive</p>
                          <p className="text-muted-foreground">{query.issue}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase mb-1">How To Avoid</p>
                          <p className="text-green-400">{query.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Specific Prompt Analysis */}
          {analysis.specificPromptAnalysis && analysis.specificPromptAnalysis.length > 0 && (
            <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Your Expensive Prompts - Analyzed & Rewritten
                </CardTitle>
                <CardDescription>
                  See your actual expensive prompts and learn how to rewrite them for better cost-efficiency
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {analysis.specificPromptAnalysis.map((prompt, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-lg border border-pink-500/20 bg-pink-500/5 space-y-4"
                    >
                      {/* Header with cost info */}
                      <div className="flex items-start justify-between gap-4 pb-4 border-b border-pink-500/10">
                        <div className="flex items-center gap-3">
                          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-pink-500/20 text-pink-500 flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {prompt.model}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{prompt.tokensUsed}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Cost</p>
                          <p className="text-lg font-bold text-pink-400">{prompt.cost}</p>
                        </div>
                      </div>

                      {/* Original Prompt */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-sm font-semibold text-red-400">Your Original Prompt</span>
                        </div>
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <p className="text-sm font-mono text-muted-foreground leading-relaxed">
                            {prompt.originalPrompt}
                          </p>
                        </div>
                      </div>

                      {/* What Was Expensive */}
                      <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <p className="text-xs font-semibold text-orange-400 uppercase mb-1">Why This Was Expensive</p>
                        <p className="text-sm text-muted-foreground">{prompt.whatWasExpensive}</p>
                      </div>

                      {/* Better Approach */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-semibold text-emerald-400">Better Approach</span>
                        </div>
                        <p className="text-sm text-muted-foreground pl-6">{prompt.betterApproach}</p>
                      </div>

                      {/* Rewritten Prompt */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span className="text-sm font-semibold text-green-400">Rewritten Prompt</span>
                        </div>
                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <p className="text-sm font-mono text-green-200 leading-relaxed">
                            {prompt.rewrittenPrompt}
                          </p>
                        </div>
                      </div>

                      {/* Estimated Savings */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <span className="text-sm font-medium text-green-400">Estimated New Cost:</span>
                        <span className="text-lg font-bold text-green-400">{prompt.estimatedNewCost}</span>
                      </div>

                      {/* Key Savings Tips */}
                      {prompt.keySavingsTips && prompt.keySavingsTips.length > 0 && (
                        <div className="pt-3 border-t border-pink-500/10">
                          <p className="text-xs font-semibold text-pink-400 uppercase mb-2">Key Savings Tips</p>
                          <ul className="space-y-1.5">
                            {prompt.keySavingsTips.map((tip, tipIdx) => (
                              <li key={tipIdx} className="flex gap-2 text-sm text-muted-foreground">
                                <span className="text-pink-400">•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Prompt Rewrite Recommendations */}
          {analysis.promptRewriteRecommendations && analysis.promptRewriteRecommendations.length > 0 && (
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  How to Write Better Prompts
                </CardTitle>
                <CardDescription>
                  Learn how to rewrite your prompts to be more effective and cost-efficient
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.promptRewriteRecommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-emerald-400">{rec.category}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {rec.estimatedSavings}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 mt-4">
                        {/* Inefficient Example */}
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-xs font-semibold text-red-400 uppercase">Inefficient</span>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground pl-6">
                            {rec.inefficientExample}
                          </p>
                        </div>

                        {/* Efficient Example */}
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-xs font-semibold text-emerald-400 uppercase">Efficient</span>
                          </div>
                          <p className="text-sm font-mono text-emerald-200 pl-6">
                            {rec.efficientExample}
                          </p>
                        </div>

                        {/* Explanation */}
                        <div className="pt-2 border-t border-emerald-500/10">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-emerald-400">Why this works:</span> {rec.explanation}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Model Recommendation */}
          <Card className="border-blue-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                Model Selection Strategy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{analysis.modelRecommendation}</p>
            </CardContent>
          </Card>

          {/* Task-Based Model Recommendations */}
          {analysis.taskModelRecommendations && analysis.taskModelRecommendations.length > 0 && (
            <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Model by Task Type
                </CardTitle>
                <CardDescription>
                  Use the right model for each type of task to optimize cost and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {/* Legend */}
                  <div className="flex gap-4 mb-2 pb-3 border-b">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ModelBadge model="haiku" />
                      <span>Cheapest, fastest</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ModelBadge model="sonnet" />
                      <span>Balanced</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ModelBadge model="opus" />
                      <span>Most capable</span>
                    </div>
                  </div>

                  {/* Task rows */}
                  {analysis.taskModelRecommendations.map((task, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold">{task.taskType}</span>
                            <ModelBadge model={task.recommendedModel} />
                          </div>
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground mb-1">Why this model:</p>
                          <p className="text-sm text-cyan-400">{task.reasoning}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <button
                            onClick={() => navigator.clipboard.writeText(task.claudeCodeCommand)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted hover:bg-muted/80 transition-colors text-sm font-mono"
                          >
                            <code>{task.claudeCodeCommand}</code>
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Claude Code Settings */}
          {analysis.claudeCodeSettings && analysis.claudeCodeSettings.length > 0 && (
            <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Claude Code Settings & Commands
                </CardTitle>
                <CardDescription>
                  Copy these settings or run these commands to optimize your Claude Code usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.claudeCodeSettings.map((setting, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <span className="font-medium text-purple-400">{setting.setting}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(setting.value)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="p-2 rounded bg-muted text-sm font-mono overflow-x-auto mb-2">
                        {setting.value}
                      </pre>
                      <p className="text-sm text-muted-foreground">{setting.explanation}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
              <CardDescription>Important patterns in your usage</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {analysis.insights.map((insight, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!analysis && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">Ready to Optimize</h3>
            <p className="text-muted-foreground max-w-md mt-2">
              Enter your Gemini API key and click "Analyze & Optimize" to get personalized
              recommendations for reducing your Claude Code spending.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
