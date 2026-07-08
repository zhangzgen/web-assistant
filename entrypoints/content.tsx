import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { Readability } from '@mozilla/readability';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { RuntimeMessage } from '@/lib/messaging';

/** 抽取当前网页正文（Readability，失败回退 innerText） */
function extractPageContent(maxChars = 20000) {
  let content = '';
  try {
    const doc = document.cloneNode(true) as Document;
    const article = new Readability(doc).parse();
    content = article?.textContent?.trim() || '';
  } catch {
    /* ignore */
  }
  if (!content) {
    content = (document.body?.innerText || '').trim();
  }
  // 归一化空白并截断
  content = content.replace(/\n{3,}/g, '\n\n').slice(0, maxChars);
  return {
    url: location.href,
    title: document.title,
    content,
  };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    // ---- 消息处理 ----
    browser.runtime.onMessage.addListener(
      (message: RuntimeMessage, _sender, sendResponse) => {
        if (message.type === 'GET_PAGE_CONTENT') {
          sendResponse(extractPageContent());
          return true; // 保持通道以异步返回
        }
        return undefined;
      },
    );

    // ---- 划词浮层（Shadow DOM 隔离，内联样式，避免被页面样式污染）----
    const host = document.createElement('web-assistant-toolbar');
    host.style.cssText =
      'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    let root: Root | null = null;
    let setToolbar: ((s: ToolbarState) => void) | null = null;

    function ensureMounted() {
      if (root) return;
      document.documentElement.appendChild(host);
      root = createRoot(mountPoint);
      root.render(
        <Toolbar
          bind={(setter) => (setToolbar = setter)}
          onAdd={(text) => {
            // 同步发送——由 background 沿用本次点击的用户手势打开侧边栏
            browser.runtime
              .sendMessage({ type: 'ADD_SELECTION', text })
              .catch(() => {});
            clearNativeSelection();
            hideToolbar();
          }}
        />,
      );
    }

    function showToolbar(text: string, x: number, y: number) {
      ensureMounted();
      setToolbar?.({ visible: true, x, y, text });
    }
    function hideToolbar() {
      setToolbar?.({ visible: false, x: 0, y: 0, text: '' });
    }

    function clearNativeSelection() {
      const sel = window.getSelection();
      sel?.removeAllRanges();
    }

    function handleSelection() {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!text || !sel || sel.rangeCount === 0) {
        hideToolbar();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideToolbar();
        return;
      }
      // 定位到选区上方居中
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, 120),
        window.innerWidth - 120,
      );
      const y = rect.top;
      showToolbar(text, x, y);
    }

    // mouseup 后再读取选区（此时选区已稳定）
    ctx.addEventListener(document, 'mouseup', () =>
      setTimeout(handleSelection, 0),
    );
    ctx.addEventListener(document, 'selectionchange', () => {
      const sel = window.getSelection();
      if (!sel || sel.toString().trim() === '') hideToolbar();
    });
    ctx.addEventListener(window, 'scroll', () => hideToolbar(), true);

    ctx.onInvalidated(() => {
      root?.unmount();
      host.remove();
    });
  },
});

interface ToolbarState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

function Toolbar({
  bind,
  onAdd,
}: {
  bind: (setter: (s: ToolbarState) => void) => void;
  onAdd: (text: string) => void;
}) {
  const [state, setState] = useState<ToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
  });
  useEffect(() => bind(setState), [bind]);

  if (!state.visible) return null;

  // 跟随系统深浅色，使浮层与页面协调
  const dark =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-color-scheme: dark)').matches;
  const panel = dark ? '#1c1d22' : '#ffffff';
  const borderCol = dark ? '#33353d' : '#e4e6eb';
  const textCol = dark ? '#e8eaed' : '#1c1d21';
  const accent = dark ? '#7c83ff' : '#4f46e5';

  const wrap: React.CSSProperties = {
    position: 'fixed',
    left: state.x,
    top: state.y,
    transform: 'translate(-50%, calc(-100% - 8px))',
    display: 'flex',
    gap: 4,
    padding: 4,
    background: panel,
    border: `1px solid ${borderCol}`,
    borderRadius: 12,
    boxShadow: dark
      ? '0 8px 28px rgba(0,0,0,0.55)'
      : '0 8px 28px rgba(15,23,42,0.18)',
    fontFamily:
      "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    animation: 'wa-fade 130ms ease-out',
  };
  const btn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    color: textCol,
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  };

  const stop = (e: React.MouseEvent) => e.preventDefault(); // 保住选区

  return (
    <div style={wrap} onMouseDown={stop}>
      <style>{`
        @keyframes wa-fade { from { opacity: 0; transform: translate(-50%, calc(-100% - 2px)); } to { opacity: 1; } }
        web-assistant-toolbar button:hover { background: ${
          dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
        } !important; }
      `}</style>
      <button style={btn} onClick={() => onAdd(state.text)}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        添加到对话
      </button>
    </div>
  );
}
