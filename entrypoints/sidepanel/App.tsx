import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  onRuntimeMessage,
  sendToTab,
  type PageContentResponse,
} from '@/lib/messaging';
import {
  getConversation,
  getSettings,
  saveConversation,
  urlToKey,
  watchSettings,
} from '@/lib/storage';
import { streamChat, type LlmMessage } from '@/lib/llm';
import {
  formatSearchObservations,
  runReAct,
} from '@/lib/react-agent';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search';
import {
  DEFAULT_SETTINGS,
  type ChatMessage,
  type Conversation,
  type ReasoningStage,
  type Settings,
  type Snippet,
} from '@/lib/types';
import { watchTheme } from '@/lib/theme';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { SelectedSnippets } from './components/SelectedSnippets';
import { SettingsDialog } from './components/SettingsDialog';
import { HistoryDrawer } from './components/HistoryDrawer';

interface TabInfo {
  tabId: number;
  url: string;
  title: string;
}

const uid = () => crypto.randomUUID();

function emptyConversation(tab: TabInfo): Conversation {
  const now = Date.now();
  return {
    urlKey: urlToKey(tab.url),
    url: tab.url,
    title: tab.title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasPageContext, setHasPageContext] = useState(false);

  const convRef = useRef<Conversation | null>(null);
  convRef.current = conversation;
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载指定 tab 对应的会话
  const loadConversationFor = useCallback(async (t: TabInfo) => {
    const key = urlToKey(t.url);
    const existing = await getConversation(key);
    setConversation(existing ?? emptyConversation(t));
  }, []);

  // 打开某条历史会话对应的网页：已有同页标签则聚焦，否则新开一个
  const openConversationTab = useCallback(async (url: string) => {
    if (!url) return;
    const key = urlToKey(url);
    try {
      const tabs = await browser.tabs.query({});
      const match = tabs.find((t) => t.url && urlToKey(t.url) === key);
      if (match?.id != null) {
        await browser.tabs.update(match.id, { active: true });
        if (match.windowId != null) {
          await browser.windows.update(match.windowId, { focused: true });
        }
      } else {
        await browser.tabs.create({ url });
      }
    } catch (err) {
      console.warn('[web-assistant] openConversationTab:', err);
    }
  }, []);

  // 初始化：设置、port、当前标签、消息监听
  useEffect(() => {
    getSettings().then(setSettings);
    const unwatchSettings = watchSettings(setSettings);

    // 与 background 建立连接，标记「侧边栏已打开」；并经此 port 接收划词片段
    const port = browser.runtime.connect({ name: 'sidepanel' });
    port.onMessage.addListener((msg: { type?: string; text?: string }) => {
      if (msg?.type === 'ADD_SELECTION' && typeof msg.text === 'string') {
        setSnippets((prev) => [...prev, { id: uid(), text: msg.text! }]);
        inputRef.current?.focus();
      }
    });

    // 读取当前活动标签
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([t]) => {
        if (t?.id != null) {
          const info = { tabId: t.id, url: t.url ?? '', title: t.title ?? '' };
          setTab(info);
          void loadConversationFor(info);
        }
      });

    const off = onRuntimeMessage((msg) => {
      if (msg.type === 'TAB_CHANGED') {
        const info = { tabId: msg.tabId, url: msg.url, title: msg.title };
        setTab(info);
        void loadConversationFor(info);
      }
    });

    return () => {
      unwatchSettings();
      off();
      port.disconnect();
    };
  }, [loadConversationFor]);

  // 应用主题：切换主题或（system 下）系统偏好变化时自动更新 <html data-theme>
  useEffect(() => watchTheme(settings.theme), [settings.theme]);

  // 标签页变化后主动探测正文状态，供 Header 的上下文状态圆点展示。
  useEffect(() => {
    let active = true;
    setHasPageContext(false);
    if (!tab) return () => {
      active = false;
    };

    void sendToTab<PageContentResponse>(tab.tabId, {
      type: 'GET_PAGE_CONTENT',
    }).then((page) => {
      if (active) setHasPageContext(Boolean(page?.content?.trim()));
    });

    return () => {
      active = false;
    };
  }, [tab?.tabId, tab?.url]);

  const persist = useCallback(async (conv: Conversation) => {
    conv.updatedAt = Date.now();
    setConversation({ ...conv });
    await saveConversation(conv);
  }, []);

  const removeSnippet = (id: string) =>
    setSnippets((prev) => prev.filter((s) => s.id !== id));

  const newChat = useCallback(() => {
    if (!tab) return;
    setConversation(emptyConversation(tab));
    setSnippets([]);
    setInput('');
  }, [tab]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && snippets.length === 0) || streaming || !tab) return;

    const base = convRef.current ?? emptyConversation(tab);
    const conv: Conversation = {
      ...base,
      url: tab.url,
      title: tab.title || base.title,
      messages: [...base.messages],
    };

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      snippets: snippets.length ? snippets : undefined,
      createdAt: Date.now(),
    };
    conv.messages.push(userMsg);

    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: Date.now(),
    };
    conv.messages.push(assistantMsg);

    // 立即上屏并清空输入/片段
    const sentSnippets = snippets;
    setInput('');
    setSnippets([]);
    setStreaming(true);
    await persist(conv);

    // 动态读取当前页面上下文
    let pageContext = '';
    const page = (await sendToTab<PageContentResponse>(tab.tabId, {
      type: 'GET_PAGE_CONTENT',
    })) as PageContentResponse | undefined;
    if (page?.content) {
      pageContext = page.content.slice(0, settings.maxContextChars);
    }
    setHasPageContext(Boolean(pageContext.trim()));

    // 组装发送给 LLM 的消息
    const llmMessages: LlmMessage[] = [];
    let system = settings.systemPrompt;
    if (pageContext) {
      system += `\n\n# 当前网页\n标题：${page?.title || tab.title}\nURL：${
        page?.url || tab.url
      }\n\n# 网页正文（可能被截断）\n${pageContext}`;
    }
    llmMessages.push({ role: 'system', content: system });

    // 历史（不含刚插入的两条）
    for (const m of base.messages) {
      llmMessages.push({ role: m.role, content: m.content });
    }
    // 当前用户输入 + 划词片段
    let userContent = text;
    if (sentSnippets.length) {
      const quoted = sentSnippets
        .map((s, i) => `【引用${i + 1}】\n${s.text}`)
        .join('\n\n');
      userContent = `${quoted}${text ? `\n\n${text}` : ''}`;
    }
    llmMessages.push({ role: 'user', content: userContent });

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      const cur = convRef.current;
      if (!cur) return;
      const idx = cur.messages.findIndex((m) => m.id === assistantMsg.id);
      if (idx === -1) return;
      cur.messages[idx] = { ...cur.messages[idx], ...patch };
      setConversation({ ...cur });
    };

    const upsertReasoningStage = (stage: ReasoningStage) => {
      const current = convRef.current?.messages.find(
        (m) => m.id === assistantMsg.id,
      );
      const stages = [...(current?.reasoningStages ?? [])];
      const index = stages.findIndex((item) => item.id === stage.id);
      if (index === -1) stages.push(stage);
      else stages[index] = stage;
      updateAssistant({ reasoningStages: stages });
    };

    // 记录思考耗时：首个 reasoning 增量→首个回答增量
    let reasoningStart: number | null = null;
    let reasoningMs: number | undefined;
    const answerReasoningStageId = `answer-${assistantMsg.id}`;

    try {
      const observations = await runReAct(
        settings,
        {
          pageTitle: page?.title || tab.title,
          pageUrl: page?.url || tab.url,
          pageContent: pageContext,
          history: llmMessages.slice(1, -1),
          userQuestion: userContent,
        },
        {
          onReasoningStage: upsertReasoningStage,
          onToolStart: (call) => {
            const current = convRef.current?.messages.find(
              (m) => m.id === assistantMsg.id,
            );
            updateAssistant({
              toolCalls: [...(current?.toolCalls ?? []), call],
            });
          },
          onToolFinish: (call) => {
            const current = convRef.current?.messages.find(
              (m) => m.id === assistantMsg.id,
            );
            // 搜索正文仅用于本轮推理；历史记录保留链接和短摘要，避免快速
            // 撑满 chrome.storage.local 配额。
            const displayCall = {
              ...call,
              sources: call.sources?.map((source) => ({
                ...source,
                content: source.content.slice(0, 280),
              })),
            };
            updateAssistant({
              toolCalls: (current?.toolCalls ?? []).map((item) =>
                item.id === call.id ? displayCall : item,
              ),
            });
          },
        },
        controller.signal,
      );

      const searchContext = formatSearchObservations(observations);
      if (searchContext) {
        llmMessages[0].content += `\n\n# Web Search 工具观察\n${searchContext}\n\n请综合当前网页和搜索观察回答。凡是来自搜索的事实，都应使用对应来源 URL 生成可点击的 Markdown 链接；不要编造来源，也不要声称已读取观察中没有提供的内容。`;
      }

      await streamChat(
        settings,
        llmMessages,
        {
          onReasoning: (d) => {
            if (reasoningStart === null) reasoningStart = Date.now();
            const current = convRef.current?.messages.find(
              (m) => m.id === assistantMsg.id,
            );
            const existingStage = current?.reasoningStages?.find(
              (stage) => stage.id === answerReasoningStageId,
            );
            upsertReasoningStage({
              id: answerReasoningStageId,
              phase: 'answer',
              title: '组织最终回答',
              content: (existingStage?.content ?? '') + d,
              status: 'running',
            });
            updateAssistant({
              reasoning: (current?.reasoning ?? '') + d,
            });
          },
          onContent: (d) => {
            if (reasoningStart !== null && reasoningMs === undefined) {
              reasoningMs = Date.now() - reasoningStart;
              const current = convRef.current?.messages.find(
                (m) => m.id === assistantMsg.id,
              );
              const stage = current?.reasoningStages?.find(
                (item) => item.id === answerReasoningStageId,
              );
              if (stage) {
                upsertReasoningStage({
                  ...stage,
                  status: 'completed',
                  durationMs: reasoningMs,
                });
              }
            }
            updateAssistant({
              content:
                (convRef.current?.messages.find((m) => m.id === assistantMsg.id)
                  ?.content ?? '') + d,
              ...(reasoningMs !== undefined ? { reasoningMs } : {}),
            });
          },
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        updateAssistant({ error: err?.message || String(err) });
      }
    } finally {
      if (reasoningStart !== null && reasoningMs === undefined) {
        reasoningMs = Date.now() - reasoningStart;
        const current = convRef.current?.messages.find(
          (m) => m.id === assistantMsg.id,
        );
        const stage = current?.reasoningStages?.find(
          (item) => item.id === answerReasoningStageId,
        );
        if (stage) {
          upsertReasoningStage({
            ...stage,
            status: 'completed',
            durationMs: reasoningMs,
          });
        }
      }
      abortRef.current = null;
      setStreaming(false);
      const final = convRef.current;
      if (final) await persist(final);
    }
  }, [input, snippets, streaming, tab, settings, persist]);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <Header
        title={tab?.title || '未打开网页'}
        url={tab?.url || ''}
        hasPageContext={hasPageContext}
        onNewChat={newChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <MessageList
        messages={conversation?.messages ?? []}
        streaming={streaming}
      />

      <div className="border-t border-border bg-panel">
        <SelectedSnippets
          snippets={snippets}
          onRemove={removeSnippet}
          onClear={() => setSnippets([])}
        />
        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          canSend={Boolean(input.trim() || snippets.length)}
          configured={Boolean(settings.apiKey)}
          reactEnabled={settings.reactEnabled}
          reactConfigured={Boolean(settings.webSearchApiKey)}
          providerName={WEB_SEARCH_PROVIDERS[settings.webSearchProvider].name}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
      />
      <HistoryDrawer
        open={historyOpen}
        currentUrlKey={conversation?.urlKey}
        onClose={() => setHistoryOpen(false)}
        onSelect={async (meta) => {
          setHistoryOpen(false);
          // 打开该历史会话对应的网页（切换标签也会触发会话同步）
          await openConversationTab(meta.url);
          const conv = await getConversation(meta.urlKey);
          if (conv) setConversation(conv);
        }}
      />
    </div>
  );
}
