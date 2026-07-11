/** OpenAI 兼容协议的流式聊天客户端。
 *  直接使用 fetch + ReadableStream 解析 SSE，以便同时消费
 *  `delta.content`（回答）与 `delta.reasoning_content` / `delta.reasoning`（思考过程）。 */
import type { Settings } from './types';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onReasoning?: (chunkDelta: string) => void;
  onContent?: (chunkDelta: string) => void;
}

/** 非流式补全，供 ReAct 控制器生成结构化的下一步动作。 */
export async function completeChat(
  settings: Settings,
  messages: LlmMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('未配置 API Key，请先在设置中填写。');
  }

  const res = await fetch(joinUrl(settings.baseURL, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `ReAct 决策请求失败 (${res.status} ${res.statusText})${
        detail ? `：${detail.slice(0, 300)}` : ''
      }`,
    );
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('模型未返回可解析的 ReAct 决策。');
  }
  return content;
}

function joinUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * 发起流式聊天补全。
 * @returns 完整的 { reasoning, content }
 * @throws Error 当请求失败或被中断（AbortError 会原样抛出）
 */
export async function streamChat(
  settings: Settings,
  messages: LlmMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{ reasoning: string; content: string }> {
  if (!settings.apiKey) {
    throw new Error('未配置 API Key，请先在设置中填写。');
  }

  const res = await fetch(joinUrl(settings.baseURL, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `请求失败 (${res.status} ${res.statusText})${detail ? `：${detail.slice(0, 300)}` : ''}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reasoning = '';
  let content = '';

  const handleData = (data: string) => {
    if (data === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return; // 忽略无法解析的片段
    }
    const delta = json?.choices?.[0]?.delta;
    if (!delta) return;

    // 思考过程：不同厂商字段名兼容（DeepSeek: reasoning_content；部分网关: reasoning）
    const r: string | undefined = delta.reasoning_content ?? delta.reasoning;
    if (r) {
      reasoning += r;
      callbacks.onReasoning?.(r);
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      callbacks.onContent?.(delta.content);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按 SSE 事件（空行分隔）切分；保留最后一段不完整的缓冲
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          handleData(trimmed.slice(5).trim());
        }
      }
    }
  }
  // 处理结束时残留缓冲
  const tail = buffer.trim();
  if (tail.startsWith('data:')) handleData(tail.slice(5).trim());

  return { reasoning, content };
}
