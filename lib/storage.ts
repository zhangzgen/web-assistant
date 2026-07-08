/** 设置与会话的持久化（基于 chrome.storage.local，经 @wxt-dev/storage 封装） */
import { storage } from '#imports';
import {
  DEFAULT_SETTINGS,
  type Conversation,
  type ConversationMeta,
  type Settings,
} from './types';

const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

const indexItem = storage.defineItem<ConversationMeta[]>('local:conv-index', {
  fallback: [],
});

/** 把任意 URL 归一化为稳定的会话 key：origin + pathname（忽略 query/hash） */
export function urlToKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '') || u.origin;
  } catch {
    return rawUrl;
  }
}

function convKey(urlKey: string): `local:${string}` {
  return `local:conv:${urlKey}`;
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  const s = await settingsItem.getValue();
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v }));
}

// ---------- Conversations ----------

export async function getConversation(
  urlKey: string,
): Promise<Conversation | null> {
  return storage.getItem<Conversation>(convKey(urlKey));
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await storage.setItem(convKey(conv.urlKey), conv);
  await upsertIndex(conv);
}

export async function deleteConversation(urlKey: string): Promise<void> {
  await storage.removeItem(convKey(urlKey));
  const index = await indexItem.getValue();
  await indexItem.setValue(index.filter((m) => m.urlKey !== urlKey));
}

export async function clearAllConversations(): Promise<void> {
  const index = await indexItem.getValue();
  await Promise.all(
    index.map((m) => storage.removeItem(convKey(m.urlKey))),
  );
  await indexItem.setValue([]);
}

export async function getConversationIndex(): Promise<ConversationMeta[]> {
  const index = await indexItem.getValue();
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function watchConversationIndex(
  cb: (list: ConversationMeta[]) => void,
): () => void {
  return indexItem.watch((v) =>
    cb([...(v ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)),
  );
}

async function upsertIndex(conv: Conversation): Promise<void> {
  const index = await indexItem.getValue();
  const last = conv.messages[conv.messages.length - 1];
  const meta: ConversationMeta = {
    urlKey: conv.urlKey,
    url: conv.url,
    title: conv.title || conv.url,
    updatedAt: conv.updatedAt,
    preview: (last?.content || last?.reasoning || '').slice(0, 80),
  };
  const rest = index.filter((m) => m.urlKey !== conv.urlKey);
  await indexItem.setValue([meta, ...rest]);
}
