/** 跨上下文（background / content / sidepanel）消息协议与封装 */
import { browser } from 'wxt/browser';
import type { PageContext } from './types';

export type RuntimeMessage =
  // sidepanel -> content：请求当前页面正文
  | { type: 'GET_PAGE_CONTENT' }
  // content -> background：用户在网页划词后点击「添加到对话」
  // background 会（若未开）同步打开侧边栏，并把片段经 port 投递给侧边栏
  | { type: 'ADD_SELECTION'; text: string }
  // background -> sidepanel：活动标签或其 URL 发生变化
  | { type: 'TAB_CHANGED'; tabId: number; url: string; title: string };

/** content 响应 GET_PAGE_CONTENT 的返回体 */
export type PageContentResponse = PageContext;

/** 发送到指定标签页的 content script */
export async function sendToTab<T = unknown>(
  tabId: number,
  message: RuntimeMessage,
): Promise<T | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  } catch {
    // content script 未注入（如 chrome:// 页面）时静默失败
    return undefined;
  }
}

/** 广播到扩展内其它上下文（sidepanel/background） */
export function sendRuntimeMessage(message: RuntimeMessage): void {
  browser.runtime.sendMessage(message).catch(() => {
    /* 没有接收方时忽略 */
  });
}

export function onRuntimeMessage(
  handler: (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => void | boolean,
): () => void {
  const listener = (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => handler(message, sender, sendResponse);
  browser.runtime.onMessage.addListener(listener as any);
  return () => browser.runtime.onMessage.removeListener(listener as any);
}
