/** 共享类型定义 */
import type { ThemeMode } from './theme';

export type Role = 'user' | 'assistant';

export interface Snippet {
  id: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  /** 最终回答内容（Markdown） */
  content: string;
  /** 模型思考过程（reasoning，可选） */
  reasoning?: string;
  /** 思考耗时（毫秒，可选）——从首个 reasoning 增量到首个回答增量的时长 */
  reasoningMs?: number;
  /** 该条 user 消息附带的划词片段（用于展示） */
  snippets?: Snippet[];
  /** 出错信息（可选） */
  error?: string;
  /** ReAct 过程中发生的工具调用，用于持久化与界面展示 */
  toolCalls?: WebSearchToolCall[];
  /** ReAct 决策、观察评估与最终回答的统一思考时间线 */
  reasoningStages?: ReasoningStage[];
  createdAt: number;
}

export interface ReasoningStage {
  id: string;
  phase: 'plan' | 'observe' | 'answer';
  title: string;
  content: string;
  status: 'running' | 'completed';
  durationMs?: number;
}

export type WebSearchProvider = 'tavily' | 'brave' | 'firecrawl';

export interface SearchSource {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface WebSearchToolCall {
  id: string;
  name: 'web_search';
  provider: WebSearchProvider;
  query: string;
  status: 'running' | 'completed' | 'error';
  sources?: SearchSource[];
  durationMs?: number;
  error?: string;
}

/** 单个会话，与某个网页 URL 关联 */
export interface Conversation {
  urlKey: string;
  url: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 历史列表索引项 */
export interface ConversationMeta {
  urlKey: string;
  url: string;
  title: string;
  updatedAt: number;
  preview: string;
}

/** LLM 配置（OpenAI 兼容协议） */
export interface Settings {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  /** 注入到上下文的网页正文最大字符数 */
  maxContextChars: number;
  /** 界面主题（默认跟随系统） */
  theme: ThemeMode;
  /** 是否启用 Reason → Act → Observation 循环 */
  reactEnabled: boolean;
  /** 当前启用的唯一 Web Search 提供商 */
  webSearchProvider: WebSearchProvider;
  /** 当前 Web Search 提供商的 API Key */
  webSearchApiKey: string;
}

/** 当前网页上下文 */
export interface PageContext {
  url: string;
  title: string;
  content: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  systemPrompt:
    '你是一个嵌入浏览器侧边栏的智能助手。你可以看到用户当前所在网页的内容，请结合网页上下文，用简洁、准确的中文回答用户的问题。当引用网页内容时保持忠实，不要编造。',
  maxContextChars: 12000,
  theme: 'system',
  reactEnabled: false,
  webSearchProvider: 'tavily',
  webSearchApiKey: '',
};
