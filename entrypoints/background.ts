import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { sendRuntimeMessage } from '@/lib/messaging';

export default defineBackground(() => {
  // 点击工具栏图标即打开侧边栏
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[web-assistant] setPanelBehavior:', err));

  /** 已连接的侧边栏 port（每个窗口一个）；用来判断是否已打开并投递划词片段 */
  const panelPorts = new Set<chrome.runtime.Port>();
  /** 侧边栏尚未连接时缓存的划词片段，待其连接后补投 */
  let pendingSelections: string[] = [];

  /** 把缓存的划词片段投递给已连接的侧边栏 */
  function flushPending() {
    if (pendingSelections.length === 0 || panelPorts.size === 0) return;
    const texts = pendingSelections;
    pendingSelections = [];
    for (const text of texts) {
      for (const port of panelPorts) {
        try {
          port.postMessage({ type: 'ADD_SELECTION', text });
        } catch {
          /* port 可能刚断开 */
        }
      }
    }
  }

  // 侧边栏挂载时通过 port 连接；断开即从集合移除
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') return;
    panelPorts.add(port);
    flushPending();
    port.onDisconnect.addListener(() => panelPorts.delete(port));
  });

  // content -> background：用户点击「添加到对话」
  browser.runtime.onMessage.addListener((message: any, sender) => {
    if (message?.type !== 'ADD_SELECTION') return undefined;
    // 关键：必须在消息处理器中「同步」调用 open，才能沿用 content 点击带来的
    // 用户手势；一旦经过 await / Promise 便会丢失手势而被 Chrome 拒绝。
    if (panelPorts.size === 0) {
      const windowId = sender.tab?.windowId;
      if (typeof windowId === 'number') {
        chrome.sidePanel
          .open({ windowId })
          .catch((err) =>
            console.warn('[web-assistant] sidePanel.open:', err),
          );
      }
    }
    pendingSelections.push(message.text);
    flushPending(); // 侧边栏已开则立即送达
    return undefined;
  });

  async function broadcastTab(tabId: number) {
    try {
      const tab = await browser.tabs.get(tabId);
      // 非网页（chrome://、扩展页等）也广播，侧边栏据此展示空态
      sendRuntimeMessage({
        type: 'TAB_CHANGED',
        tabId,
        url: tab.url ?? '',
        title: tab.title ?? '',
      });
    } catch {
      /* tab 可能已关闭 */
    }
  }

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void broadcastTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      void broadcastTab(tabId);
    }
  });
});
