import { useState } from 'react';
import type { Snippet } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  snippets: Snippet[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function SelectedSnippets({ snippets, onRemove, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (snippets.length === 0) return null;

  return (
    <div className="px-3 pt-3">
      <div className="rounded-xl border border-border bg-panel-2 px-2.5 py-1.5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <Icon name="quote" size={14} className="text-accent" />
            <span>{snippets.length} 个已选片段</span>
            <Icon
              name={expanded ? 'chevron-down' : 'chevron-right'}
              size={13}
            />
          </button>
          <button
            onClick={onClear}
            className="rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-panel hover:text-text"
          >
            清空
          </button>
        </div>

        {expanded && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {snippets.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-2 rounded-lg border border-border bg-panel px-2 py-1.5"
              >
                <p className="flex-1 text-xs leading-relaxed text-muted">
                  {s.text.length > 200 ? s.text.slice(0, 200) + '…' : s.text}
                </p>
                <button
                  onClick={() => onRemove(s.id)}
                  className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-panel-2 hover:text-text"
                  title="移除"
                  aria-label="移除片段"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
