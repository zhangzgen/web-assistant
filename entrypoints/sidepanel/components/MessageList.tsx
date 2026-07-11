import { useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  ReasoningStage,
  WebSearchToolCall,
} from '@/lib/types';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search';
import { Markdown } from './Markdown';
import { Icon } from './Icon';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
}

export function MessageList({ messages, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // 新内容自动滚到底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="sparkles" size={30} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-text">已读取当前网页作为上下文</p>
          <p className="text-xs leading-relaxed text-muted">
            直接提问，或在网页中划词后
            <br />
            点击「添加到对话」再发送。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} streaming={streaming} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageItem({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end wa-anim-fade">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-accent-fg shadow-sm">
          {message.snippets?.length ? (
            <div className="mb-1.5 space-y-1">
              {message.snippets.map((s) => (
                <div
                  key={s.id}
                  className="border-l-2 border-accent-fg/40 pl-2 text-xs text-accent-fg/80"
                >
                  {s.text.length > 140 ? s.text.slice(0, 140) + '…' : s.text}
                </div>
              ))}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !message.content && !message.reasoning && !message.error;
  // 思考中：正在流式输出且尚无回答正文；一旦回答开始即视为思考结束
  const reasoningLive = streaming && !message.content;

  return (
    <div className="group flex flex-col gap-1.5 wa-anim-fade">
      {message.reasoningStages?.length ? (
        <ReasoningTimeline
          stages={message.reasoningStages}
          answerStarted={Boolean(message.content)}
        />
      ) : message.reasoning ? (
        <Reasoning
          text={message.reasoning}
          live={reasoningLive}
          durationMs={message.reasoningMs}
        />
      ) : null}

      {message.toolCalls?.length ? (
        <ToolCalls calls={message.toolCalls} />
      ) : null}

      {message.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
          <span>{message.error}</span>
        </div>
      ) : (
        <div className="text-text">
          {isEmpty && streaming ? (
            <TypingDots />
          ) : (
            <Markdown text={message.content} />
          )}
        </div>
      )}

      {message.content && !message.error ? (
        <CopyButton text={message.content} />
      ) : null}
    </div>
  );
}

function ReasoningTimeline({
  stages,
  answerStarted,
}: {
  stages: ReasoningStage[];
  answerStarted: boolean;
}) {
  const [open, setOpen] = useState(!answerStarted);
  const live = stages.some((stage) => stage.status === 'running');
  const previousAnswerStarted = useRef(answerStarted);

  // 最终正文开始流式输出时，自动折叠思考过程。
  useEffect(() => {
    if (!previousAnswerStarted.current && answerStarted) setOpen(false);
    previousAnswerStarted.current = answerStarted;
  }, [answerStarted]);

  const durationMs = stages.reduce(
    (total, stage) => total + (stage.durationMs ?? 0),
    0,
  );
  const duration = durationMs
    ? `${Math.max(1, Math.round(durationMs / 1000))} 秒`
    : '不足 1 秒';

  return (
    <div className="mb-1 flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-2 py-0.5 text-left text-xs font-medium text-muted transition-colors hover:text-text"
      >
        {live ? (
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          </span>
        ) : (
          <Icon name="sparkles" size={14} className="shrink-0 text-accent" />
        )}
        <span className={live ? 'text-accent' : 'text-text'}>
          {live ? '正在思考…' : `已思考（用时 ${duration}）`}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>

      {open && (
        <div className="mt-2 ml-1.5 pl-0.5">
          <div className="relative space-y-3">
            {stages.length > 1 && (
              <span className="absolute bottom-2 left-[3px] top-2 w-px bg-border" />
            )}
            {stages.map((stage) => {
              const stageDuration =
                stage.durationMs != null
                  ? `${Math.max(0.1, stage.durationMs / 1000).toFixed(1)} 秒`
                  : null;
              return (
                <div key={stage.id} className="relative flex gap-2.5">
                  <span
                    className={`relative z-10 mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ring-2 ring-bg ${
                      stage.status === 'running'
                        ? 'animate-pulse bg-accent'
                        : 'bg-accent/75'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-text">
                        {stage.title}
                      </span>
                      {stageDuration && (
                        <span className="text-[10px] text-muted/70">
                          {stageDuration}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                      {stage.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCalls({ calls }: { calls: WebSearchToolCall[] }) {
  return (
    <div className="mb-1 flex flex-col gap-2">
      {calls.map((call) => (
        <ToolCallCard key={call.id} call={call} />
      ))}
    </div>
  );
}

function ToolCallCard({ call }: { call: WebSearchToolCall }) {
  const live = call.status === 'running';
  const [open, setOpen] = useState(live);
  const previousStatus = useRef(call.status);

  useEffect(() => {
    if (previousStatus.current === 'running' && call.status === 'completed') {
      setOpen(false);
    }
    if (call.status === 'error') setOpen(true);
    previousStatus.current = call.status;
  }, [call.status]);

  const provider = WEB_SEARCH_PROVIDERS[call.provider].name;
  const duration =
    call.durationMs != null
      ? `${Math.max(0.1, call.durationMs / 1000).toFixed(1)} 秒`
      : '';
  const label = live
    ? `正在调用 ${provider}`
    : call.status === 'error'
      ? `${provider} 搜索失败`
      : `${provider} · ${call.sources?.length ?? 0} 个来源${
          duration ? ` · ${duration}` : ''
        }`;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-panel shadow-sm ${
        call.status === 'error'
          ? 'border-red-500/35'
          : live
            ? 'border-accent/40'
            : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-panel-2"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            call.status === 'error'
              ? 'bg-red-500/10 text-red-500'
              : 'bg-accent-soft text-accent'
          }`}
        >
          {live ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          ) : (
            <Icon name={call.status === 'error' ? 'warning' : 'search'} size={15} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">
          {label}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 text-muted transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5">
          <div className="mb-2 flex items-start gap-1.5 text-[11px] text-muted">
            <Icon name="quote" size={12} className="mt-0.5 shrink-0" />
            <span className="break-words">搜索词：{call.query}</span>
          </div>

          {live ? (
            <p className="text-[11px] text-muted">正在检索并整理可引用来源…</p>
          ) : call.status === 'error' ? (
            <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-300">
              {call.error || '搜索服务返回未知错误。'}
            </p>
          ) : call.sources?.length ? (
            <ol className="space-y-2">
              {call.sources.map((source, index) => (
                <li key={`${source.url}-${index}`} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-panel-2 text-[10px] text-muted">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      <span className="truncate">{source.title}</span>
                      <Icon name="external-link" size={11} className="shrink-0" />
                    </a>
                    <span className="block truncate text-[10px] text-muted/80">
                      {sourceHost(source.url)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[11px] text-muted">没有找到可用来源。</p>
          )}
        </div>
      )}
    </div>
  );
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Reasoning({
  text,
  live,
  durationMs,
}: {
  text: string;
  live: boolean;
  durationMs?: number;
}) {
  // 思考中默认展开，便于观察；思考结束后自动收起
  const [open, setOpen] = useState(live);
  const prevLive = useRef(live);
  useEffect(() => {
    if (prevLive.current && !live) setOpen(false);
    prevLive.current = live;
  }, [live]);

  const seconds =
    durationMs != null ? Math.max(1, Math.round(durationMs / 1000)) : null;
  const label = live
    ? '正在思考…'
    : seconds != null
      ? `已思考（用时 ${seconds} 秒）`
      : '思考过程';

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-2 py-0.5 text-xs font-medium text-muted transition-colors hover:text-text"
      >
        {live ? (
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-accent [animation:wa-blink_1s_ease-in-out_infinite]" />
          </span>
        ) : (
          <Icon name="sparkles" size={14} className="shrink-0 text-accent" />
        )}
        <span className={live ? 'text-accent' : 'text-text'}>{label}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div className="mt-1.5 ml-1.5 whitespace-pre-wrap border-l-2 border-border pl-3.5 text-xs leading-relaxed text-muted">
          {text}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      onClick={copy}
      title="复制"
      aria-label="复制回答"
      className="flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted opacity-0 transition-opacity hover:bg-panel-2 hover:text-text focus:opacity-100 group-hover:opacity-100"
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted"
          style={{ animation: `wa-blink 1.2s ease-in-out ${i * 0.16}s infinite` }}
        />
      ))}
    </span>
  );
}
