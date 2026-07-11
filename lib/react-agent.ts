import { completeChat, type LlmMessage } from './llm';
import type {
  ReasoningStage,
  SearchSource,
  Settings,
  WebSearchToolCall,
} from './types';
import { webSearch } from './web-search';

const MAX_SEARCH_STEPS = 2;

export interface ReActContext {
  pageTitle: string;
  pageUrl: string;
  pageContent: string;
  history: LlmMessage[];
  userQuestion: string;
}

export interface ReActCallbacks {
  onReasoningStage?: (stage: ReasoningStage) => void;
  onToolStart?: (call: WebSearchToolCall) => void;
  onToolFinish?: (call: WebSearchToolCall) => void;
}

export interface SearchObservation {
  query: string;
  sources: SearchSource[];
}

interface ReActDecision {
  action: 'web_search' | 'final';
  query?: string;
  summary?: string;
}

/**
 * 受控 ReAct 循环：Reason（模型决策）→ Act（统一搜索工具）→
 * Observation（归一化来源）→ 再决策。限制步数以控制延迟与免费额度。
 */
export async function runReAct(
  settings: Settings,
  context: ReActContext,
  callbacks: ReActCallbacks,
  signal?: AbortSignal,
): Promise<SearchObservation[]> {
  if (!settings.reactEnabled || !settings.webSearchApiKey.trim()) return [];

  const observations: SearchObservation[] = [];
  for (let step = 0; step < MAX_SEARCH_STEPS; step += 1) {
    const stage: ReasoningStage = {
      id: crypto.randomUUID(),
      phase: step === 0 ? 'plan' : 'observe',
      title: step === 0 ? '分析问题与网页上下文' : '评估搜索结果',
      content:
        step === 0
          ? '正在结合当前网页、对话和本轮问题判断是否需要外部搜索…'
          : '正在检查已有搜索结果是否足以支持回答…',
      status: 'running',
    };
    callbacks.onReasoningStage?.(stage);
    const stageStartedAt = Date.now();
    let streamedReasoning = '';
    let decision: ReActDecision;
    try {
      decision = await decideNextAction(
        settings,
        context,
        observations,
        step,
        (delta) => {
          streamedReasoning += delta;
          callbacks.onReasoningStage?.({
            ...stage,
            content: streamedReasoning,
            status: 'running',
          });
        },
        signal,
      );
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        callbacks.onReasoningStage?.({
          ...stage,
          content: '思考过程已停止。',
          status: 'completed',
          durationMs: Date.now() - stageStartedAt,
        });
      }
      throw error;
    }
    callbacks.onReasoningStage?.({
      ...stage,
      content:
        streamedReasoning.trim() ||
        decision.summary ||
        defaultDecisionSummary(decision, observations.length),
      status: 'completed',
      durationMs: Date.now() - stageStartedAt,
    });
    if (decision.action === 'final' || !decision.query?.trim()) break;

    const call: WebSearchToolCall = {
      id: crypto.randomUUID(),
      name: 'web_search',
      provider: settings.webSearchProvider,
      query: decision.query.trim(),
      status: 'running',
    };
    callbacks.onToolStart?.(call);
    const startedAt = Date.now();

    try {
      const sources = await webSearch({
        provider: settings.webSearchProvider,
        apiKey: settings.webSearchApiKey,
        query: call.query,
        signal,
      });
      const completed: WebSearchToolCall = {
        ...call,
        status: 'completed',
        sources,
        durationMs: Date.now() - startedAt,
      };
      observations.push({ query: call.query, sources });
      callbacks.onToolFinish?.(completed);
      if (sources.length === 0) break;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        callbacks.onToolFinish?.({
          ...call,
          status: 'error',
          durationMs: Date.now() - startedAt,
          error: '工具调用已停止。',
        });
        throw error;
      }
      callbacks.onToolFinish?.({
        ...call,
        status: 'error',
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      break;
    }
  }
  return observations;
}

async function decideNextAction(
  settings: Settings,
  context: ReActContext,
  observations: SearchObservation[],
  step: number,
  onReasoningDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<ReActDecision> {
  const observationText = observations.length
    ? observations
        .map(
          (observation, index) =>
            `搜索 ${index + 1}：${observation.query}\n${observation.sources
              .map(
                (source, sourceIndex) =>
                  `[${sourceIndex + 1}] ${source.title}\n${source.url}\n${source.content.slice(0, 1000)}`,
              )
              .join('\n\n')}`,
        )
        .join('\n\n')
    : '暂无搜索观察。';

  const recentHistory = context.history
    .slice(-6)
    .map((message) => `${message.role}: ${message.content.slice(0, 1200)}`)
    .join('\n');

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: `你是网页助手的 ReAct 控制器。你只有一个工具：web_search。根据当前网页、对话和已有搜索观察，决定下一步。

需要搜索的典型情况：最新或时效性信息、当前网页未包含的项目/官网/GitHub 链接、外部事实核验、跨来源比较。
不需要搜索的典型情况：总结、翻译、解释当前网页已经给出的内容。
如果已有观察足以回答，或继续搜索价值不大，选择 final。不要重复已经执行过的搜索词。

summary 是面向用户的简短决策摘要，只说明判断依据和下一步，不要输出隐含推理链，限制在 80 个汉字以内。

只输出一个 JSON 对象，不要 Markdown，不要额外解释：
{"action":"web_search","query":"具体且可独立理解的搜索词","summary":"当前网页缺少某项外部信息，需要搜索补充"}
或
{"action":"final","summary":"现有网页与搜索资料已经足以回答"}`,
    },
    {
      role: 'user',
      content: `当前日期：${new Date().toISOString().slice(0, 10)}
ReAct 步骤：${step + 1}/${MAX_SEARCH_STEPS}

网页标题：${context.pageTitle}
网页 URL：${context.pageUrl}
网页正文：
${context.pageContent.slice(0, 7000)}

最近对话：
${recentHistory || '无'}

用户本轮问题：
${context.userQuestion}

已有搜索观察：
${observationText}`,
    },
  ];

  try {
    return parseDecision(
      await completeChat(
        settings,
        messages,
        { onReasoning: onReasoningDelta },
        signal,
      ),
    );
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    // 部分兼容网关可能返回带说明的非标准结构；首步用保守规则降级，
    // 后续无法解析时停止继续消耗搜索额度。
    return step === 0
      ? fallbackDecision(context.userQuestion, context.pageTitle)
      : { action: 'final' };
  }
}

function parseDecision(text: string): ReActDecision {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(candidate.trim());
  if (parsed?.action === 'web_search' && typeof parsed?.query === 'string') {
    return {
      action: 'web_search',
      query: parsed.query,
      summary:
        typeof parsed?.summary === 'string'
          ? parsed.summary.slice(0, 240)
          : undefined,
    };
  }
  return {
    action: 'final',
    summary:
      typeof parsed?.summary === 'string'
        ? parsed.summary.slice(0, 240)
        : undefined,
  };
}

function fallbackDecision(question: string, pageTitle: string): ReActDecision {
  const requiresFreshInfo =
    /最新|最近|现在|目前|今天|实时|搜索|查找|官网|链接|地址|github|开源|发布|版本|价格|新闻|对比|竞品|类似框架|recent|latest|current|search|link/i.test(
      question,
    );
  return requiresFreshInfo
    ? {
        action: 'web_search',
        query: `${pageTitle} ${question}`.trim(),
        summary: '问题涉及网页外的最新信息或链接，需要调用网页搜索补充资料。',
      }
    : {
        action: 'final',
        summary: '当前网页上下文已经足以回答，本轮无需调用网页搜索。',
      };
}

function defaultDecisionSummary(
  decision: ReActDecision,
  observationCount: number,
): string {
  if (decision.action === 'web_search') {
    return `当前资料仍不足，需要搜索“${decision.query}”补充外部信息。`;
  }
  return observationCount
    ? '已有网页上下文和搜索结果足以支持回答，准备整理结论。'
    : '当前网页上下文已经足以回答，本轮无需调用网页搜索。';
}

/** 将观察压缩为可追溯的最终回答上下文。 */
export function formatSearchObservations(
  observations: SearchObservation[],
): string {
  if (!observations.length) return '';
  let sourceNumber = 0;
  return observations
    .map((observation, index) => {
      const sources = observation.sources
        .map((source) => {
          sourceNumber += 1;
          return `【来源 ${sourceNumber}】${source.title}\nURL：${source.url}\n内容：${source.content}`;
        })
        .join('\n\n');
      return `## Web Search ${index + 1}\n查询：${observation.query}\n\n${sources}`;
    })
    .join('\n\n');
}
