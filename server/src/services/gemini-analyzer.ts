import { Repository } from '../db/repository.js';

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

export interface ExpensiveQueryAnalysis {
  query: string;
  cost: string;
  issue: string;
  recommendation: string;
}

export interface TaskModelRecommendation {
  taskType: string;
  description: string;
  recommendedModel: 'opus' | 'sonnet' | 'haiku';
  reasoning: string;
  claudeCodeCommand: string;
}

export interface PromptRewriteRecommendation {
  category: string;
  inefficientExample: string;
  efficientExample: string;
  explanation: string;
  estimatedSavings: string;
}

export interface SpecificPromptAnalysis {
  originalPrompt: string;
  cost: string;
  tokensUsed: string;
  model: string;
  whatWasExpensive: string;
  betterApproach: string;
  rewrittenPrompt: string;
  estimatedNewCost: string;
  keySavingsTips: string[];
}

export interface AnalysisResult {
  summary: string;
  recommendations: {
    title: string;
    description: string;
    potentialSavings: string;
    priority: 'high' | 'medium' | 'low';
    claudeCodeTip: string;
  }[];
  expensiveQueryAnalysis: ExpensiveQueryAnalysis[];
  specificPromptAnalysis: SpecificPromptAnalysis[];
  insights: string[];
  modelRecommendation: string;
  taskModelRecommendations: TaskModelRecommendation[];
  promptRewriteRecommendations: PromptRewriteRecommendation[];
  claudeCodeSettings: {
    setting: string;
    value: string;
    explanation: string;
  }[];
  estimatedMonthlySavings: string;
}

export class GeminiAnalyzer {
  private repo: Repository;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  async analyze(apiKey: string): Promise<AnalysisResult> {
    // Gather all cost data
    const stats = this.repo.getStats();
    const byTool = this.repo.analyzeCostsByTool();
    const byModel = this.repo.analyzeCostsByModel();
    const byEntryType = this.repo.analyzeCostsByEntryType();
    const textPatterns = this.repo.analyzeTextResponsePatterns();
    const contentLength = this.repo.analyzeContentLengthCost();
    const expensiveEvents = this.repo.getExpensiveEvents(10);
    const expensiveEventsDetailed = this.repo.getExpensiveEventsDetailed(10);
    const expensivePrompts = this.repo.getExpensivePromptsForAnalysis(5);
    const todayCosts = this.repo.getTodayCostsByMinute();

    // Calculate some additional metrics
    const totalCost = stats.totalCost;
    const avgCostPerRequest = totalCost / stats.totalEvents;
    const opusUsage = byModel.find(m => m.model.includes('opus'));
    const sonnetUsage = byModel.find(m => m.model.includes('sonnet'));
    const haikuUsage = byModel.find(m => m.model.includes('haiku'));

    // Build the prompt
    const prompt = `You are a cost optimization expert for AI API usage. Analyze the following Claude Code usage data and provide specific, actionable recommendations to reduce costs.

## Usage Summary
- Total Cost: $${totalCost.toFixed(2)}
- Total Requests: ${stats.totalEvents}
- Average Cost per Request: $${avgCostPerRequest.toFixed(4)}
- Total Tokens: ${stats.totalTokens.toLocaleString()}

## Cost by Model
${byModel.map(m => `- ${m.model}: $${m.totalCost.toFixed(2)} (${m.count} requests, avg $${m.avgCost.toFixed(4)}/req)`).join('\n')}

## Cost by Tool
${byTool.slice(0, 10).map(t => `- ${t.toolName}: $${t.totalCost.toFixed(2)} (${t.count} invocations, ${((t.totalCost / totalCost) * 100).toFixed(1)}% of total)`).join('\n')}

## Text Response Patterns (Non-tool responses)
${textPatterns.map(p => `- ${p.category}: $${p.totalCost.toFixed(2)} (${p.count} responses, avg ${p.avgTokens.toFixed(0)} tokens/response)`).join('\n')}

## Cost by Response Length
${contentLength.map(c => `- ${c.lengthBucket}: $${c.totalCost.toFixed(2)} (${c.count} responses)`).join('\n')}

## Most Expensive Individual Requests (Top 10)
${expensiveEvents.map(e => `- $${e.cost.toFixed(4)}: ${e.toolName || 'Text'} - "${(e.content || '').slice(0, 50)}..."`).join('\n')}

## Detailed Analysis of Top Expensive Queries
${expensiveEventsDetailed.map((e, i) => `
### Expensive Query #${i + 1} - Cost: $${e.cost.toFixed(4)}
- **Tool**: ${e.toolName || 'No Tool (Text Response)'}
- **Model**: ${e.model || 'Unknown'}
- **Input Tokens**: ${e.tokensInput.toLocaleString()} | **Output Tokens**: ${e.tokensOutput.toLocaleString()}
- **Timestamp**: ${e.timestamp}
- **Content Preview**:
\`\`\`
${(e.content || 'No content').slice(0, 500)}${(e.content?.length || 0) > 500 ? '...' : ''}
\`\`\`
`).join('\n')}

## Actual Expensive Prompts for Detailed Analysis
${expensivePrompts.map((p, i) => `
### Prompt #${i + 1} - Cost: $${p.cost.toFixed(4)}
- **Model**: ${p.model || 'Unknown'}
- **Entry Type**: ${p.entryType || 'Unknown'}
- **Input Tokens**: ${p.tokensInput.toLocaleString()} | **Output Tokens**: ${p.tokensOutput.toLocaleString()}
- **Total Tokens**: ${(p.tokensInput + p.tokensOutput).toLocaleString()}
- **Timestamp**: ${p.timestamp}
- **Full Content**:
\`\`\`
${p.content || 'No content'}
\`\`\`
`).join('\n')}

## Model Pricing Context
- Claude Opus 4.5: $15/M input, $75/M output (most capable, most expensive)
- Claude Sonnet 4: $3/M input, $15/M output (balanced)
- Claude Haiku 4: $1/M input, $5/M output (fastest, cheapest)

## Claude Code Context
Claude Code is a CLI tool that uses Claude AI models. Users can:
- Switch models using: claude --model sonnet OR claude --model haiku OR claude --model opus
- Use /compact command to reduce context size
- Use /clear to start fresh and reduce accumulated context
- Configure default model in settings.json with "model": "claude-sonnet-4-20250514"
- Use --max-turns flag to limit conversation length
- Be more specific in prompts to reduce back-and-forth
- Use headless mode for batch operations: claude -p "prompt" --headless

Based on this data, provide:
1. A brief summary of spending patterns (2-3 sentences)
2. 3-5 specific recommendations to reduce costs, each with:
   - A clear title
   - Description of what to change
   - Estimated potential savings (percentage or dollar amount)
   - Priority (high/medium/low)
   - A specific Claude Code tip showing HOW to implement this (command, setting, or technique)
3. For the TOP 5 most expensive queries, analyze each one and provide:
   - A shortened version of the query/content
   - The cost
   - What made it expensive (why did it cost so much?)
   - A specific recommendation to avoid similar expensive queries
4. **SPECIFIC PROMPT ANALYSIS** - For EACH of the actual expensive prompts shown above in the "Actual Expensive Prompts" section, provide a detailed analysis:
   - originalPrompt: The actual prompt text (first 200 chars)
   - cost: The actual cost as shown
   - tokensUsed: Total tokens in the format "X input + Y output = Z total"
   - model: The model used
   - whatWasExpensive: Explain specifically what made THIS prompt expensive (e.g., "asking for entire file read", "vague request requiring clarification", "using Opus for simple task")
   - betterApproach: Describe a better way to achieve the same goal
   - rewrittenPrompt: Show EXACTLY how this specific prompt should have been written to be more cost-effective
   - estimatedNewCost: Estimate what the cost would have been with the better approach
   - keySavingsTips: 2-3 actionable tips for this type of prompt
   This is CRITICAL - analyze EACH actual prompt individually with specific rewrites.
5. 3-4 key insights about the usage patterns
6. A specific recommendation about which model to use for different tasks
7. 5-8 specific task-based model recommendations showing WHICH model to use for WHAT type of task:
   - taskType: short name like "Simple file edits", "Code review", "Architecture planning", etc.
   - description: what kind of tasks fall into this category
   - recommendedModel: "opus", "sonnet", or "haiku"
   - reasoning: why this model is best for this task type
   - claudeCodeCommand: the exact command to run, e.g., "claude --model haiku" or "claude --model sonnet"
8. 5-8 prompt rewriting recommendations showing how to write more effective prompts that reduce cost:
   - category: The type of improvement (e.g., "Be Specific", "Break Down Tasks", "Avoid Redundancy", "Use Context Efficiently")
   - inefficientExample: An example of a poorly written prompt that wastes tokens/requests
   - efficientExample: The same request rewritten to be more cost-effective
   - explanation: Why the efficient version is better
   - estimatedSavings: Rough estimate of potential savings (e.g., "50% fewer tokens", "2-3 fewer round trips")
   Focus on practical patterns like: being specific vs vague, breaking complex tasks into steps, providing sufficient context upfront, using headless mode for simple tasks, avoiding unnecessary elaboration requests, and choosing the right model for the task.
9. 2-4 specific Claude Code settings or commands that would help reduce costs, with explanations
10. An estimated monthly savings if recommendations are followed

Respond in JSON format:
{
  "summary": "...",
  "recommendations": [
    {"title": "...", "description": "...", "potentialSavings": "...", "priority": "high|medium|low", "claudeCodeTip": "specific command or setting, e.g., 'Run: claude --model haiku' or 'Add to settings.json: {\"model\": \"sonnet\"}'"}
  ],
  "expensiveQueryAnalysis": [
    {"query": "short description of what was asked/done", "cost": "$X.XX", "issue": "why it was expensive", "recommendation": "how to avoid"}
  ],
  "specificPromptAnalysis": [
    {
      "originalPrompt": "first 200 chars of the actual prompt",
      "cost": "$X.XXXX",
      "tokensUsed": "X input + Y output = Z total",
      "model": "model name",
      "whatWasExpensive": "specific explanation of why THIS prompt was expensive",
      "betterApproach": "how to achieve the same goal more efficiently",
      "rewrittenPrompt": "the exact rewritten version of this specific prompt",
      "estimatedNewCost": "$X.XXXX (XX% savings)",
      "keySavingsTips": ["tip 1", "tip 2", "tip 3"]
    }
  ],
  "insights": ["...", "..."],
  "modelRecommendation": "...",
  "taskModelRecommendations": [
    {"taskType": "Simple file edits", "description": "Small fixes, typos, variable renames", "recommendedModel": "haiku", "reasoning": "Fast and cheap for straightforward changes", "claudeCodeCommand": "claude --model haiku"},
    {"taskType": "Code review", "description": "Reviewing PRs, finding bugs", "recommendedModel": "sonnet", "reasoning": "Good balance of intelligence and cost", "claudeCodeCommand": "claude --model sonnet"}
  ],
  "promptRewriteRecommendations": [
    {"category": "Be Specific", "inefficientExample": "Fix the bug", "efficientExample": "Fix the TypeError in src/auth.ts:45 where user.name is undefined", "explanation": "Specific prompts reduce back-and-forth clarification requests", "estimatedSavings": "2-3 fewer messages (60-70% cost reduction)"},
    {"category": "Break Down Tasks", "inefficientExample": "Build a complete authentication system", "efficientExample": "Step 1: Create user model with email/password fields", "explanation": "Breaking tasks into steps prevents overwhelming context and allows using cheaper models per step", "estimatedSavings": "40-50% token reduction per interaction"}
  ],
  "claudeCodeSettings": [
    {"setting": "setting name or command", "value": "the value or full command", "explanation": "what this does and why it saves money"}
  ],
  "estimatedMonthlySavings": "..."
}`;

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini API');
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
    }

    try {
      const result = JSON.parse(jsonText) as AnalysisResult;
      return result;
    } catch {
      // If JSON parsing fails, create a structured response from the text
      return {
        summary: text.slice(0, 500),
        recommendations: [
          {
            title: 'Review AI Response',
            description: text,
            potentialSavings: 'Unknown',
            priority: 'medium',
            claudeCodeTip: 'Try running the analysis again',
          },
        ],
        expensiveQueryAnalysis: [],
        specificPromptAnalysis: [],
        insights: ['Unable to parse structured response'],
        modelRecommendation: 'Please try again',
        taskModelRecommendations: [],
        promptRewriteRecommendations: [],
        claudeCodeSettings: [],
        estimatedMonthlySavings: 'Unknown',
      };
    }
  }
}
