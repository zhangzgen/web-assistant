import { forwardRef } from 'react';
import { Icon } from './Icon';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  canSend: boolean;
  configured: boolean;
  onOpenSettings: () => void;
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  {
    value,
    onChange,
    onSend,
    onStop,
    streaming,
    canSend,
    configured,
    onOpenSettings,
  },
  ref,
) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-3">
      {!configured && (
        <button
          onClick={onOpenSettings}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
        >
          <Icon name="warning" size={14} />
          尚未配置模型，点击填写 API Key
        </button>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-panel-2 px-3 py-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="询问关于当前网页的任何问题…"
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
          }}
        />
        {streaming ? (
          <button
            onClick={onStop}
            title="停止生成"
            aria-label="停止生成"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-panel text-text transition-colors hover:bg-border active:scale-95"
          >
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            title="发送"
            aria-label="发送"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <Icon name="send" size={17} />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-center text-[11px] text-muted/70">
        Enter 发送 · Shift + Enter 换行
      </p>
    </div>
  );
});
