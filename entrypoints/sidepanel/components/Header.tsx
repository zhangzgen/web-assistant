import { Icon, type IconName } from './Icon';

interface HeaderProps {
  title: string;
  url: string;
  hasPageContext: boolean;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}

export function Header({
  title,
  url,
  hasPageContext,
  onNewChat,
  onOpenSettings,
  onOpenHistory,
}: HeaderProps) {
  let host = '';
  try {
    host = url ? new URL(url).hostname : '';
  } catch {
    host = '';
  }

  return (
    <header className="flex items-center gap-2.5 border-b border-border bg-panel/80 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-sm">
        <Icon name="sparkles" size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold leading-tight" title={title}>
          {title}
        </h1>
        {host ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted" title={url}>
            <Icon name="globe" size={12} className="shrink-0" />
            <span className="truncate">{host}</span>
            <ContextDot available={hasPageContext} />
          </p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            网页 AI 助手
            <ContextDot available={hasPageContext} />
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton title="新建对话" onClick={onNewChat} icon="plus" />
        <IconButton title="历史对话" onClick={onOpenHistory} icon="history" />
        <IconButton title="模型设置" onClick={onOpenSettings} icon="settings" />
      </div>
    </header>
  );
}

function ContextDot({ available }: { available: boolean }) {
  return (
    <span
      title={available ? '已获取网页上下文' : '未获取到网页上下文'}
      aria-label={available ? '已获取网页上下文' : '未获取到网页上下文'}
      className={`ml-0.5 h-2 w-2 shrink-0 rounded-full ${
        available ? 'bg-emerald-500' : 'bg-red-500'
      }`}
    />
  );
}

function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: IconName;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-text active:scale-95"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
