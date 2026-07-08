import { useEffect, useState } from 'react';
import {
  clearAllConversations,
  deleteConversation,
  getConversationIndex,
  watchConversationIndex,
} from '@/lib/storage';
import type { ConversationMeta } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  currentUrlKey?: string;
  onClose: () => void;
  onSelect: (meta: ConversationMeta) => void;
}

export function HistoryDrawer({
  open,
  currentUrlKey,
  onClose,
  onSelect,
}: Props) {
  const [list, setList] = useState<ConversationMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    getConversationIndex().then(setList);
    return watchConversationIndex(setList);
  }, [open]);

  if (!open) return null;

  const remove = async (e: React.MouseEvent, urlKey: string) => {
    e.stopPropagation();
    await deleteConversation(urlKey);
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="wa-anim-sheet ml-auto flex h-full w-[86%] max-w-96 flex-col border-l border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="history" size={16} className="text-muted" />
            历史对话
          </h2>
          <div className="flex items-center gap-1">
            {list.length > 0 && (
              <button
                onClick={() => clearAllConversations()}
                className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                清空全部
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-text"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {list.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted">
              <Icon name="message" size={28} className="opacity-50" />
              <p className="text-sm">暂无历史对话</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((m) => {
                const active = m.urlKey === currentUrlKey;
                return (
                  <li key={m.urlKey}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(m)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelect(m)}
                      className={`group flex w-full cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-accent/40 bg-accent-soft'
                          : 'border-transparent hover:bg-panel-2'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text">
                          {m.title || m.url}
                        </div>
                        {m.preview && (
                          <div className="mt-0.5 truncate text-xs text-muted">
                            {m.preview}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted/70">
                          <Icon name="globe" size={11} className="shrink-0" />
                          <span className="truncate">{hostOf(m.url)}</span>
                          <span className="opacity-60">·</span>
                          <span className="shrink-0">{formatTime(m.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => remove(e, m.urlKey)}
                        className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                        title="删除该对话"
                        aria-label="删除该对话"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
