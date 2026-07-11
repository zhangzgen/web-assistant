import type {
  SearchSource,
  WebSearchProvider,
} from './types';

export const WEB_SEARCH_PROVIDERS: Record<
  WebSearchProvider,
  { name: string; website: string; keyPlaceholder: string }
> = {
  tavily: {
    name: 'Tavily',
    website: 'https://app.tavily.com/',
    keyPlaceholder: 'tvly-...',
  },
  brave: {
    name: 'Brave Search',
    website: 'https://api-dashboard.search.brave.com/',
    keyPlaceholder: 'BSA...',
  },
  firecrawl: {
    name: 'Firecrawl',
    website: 'https://www.firecrawl.dev/app/api-keys',
    keyPlaceholder: 'fc-...',
  },
};

const MAX_RESULTS = 5;
const MAX_CONTENT_CHARS = 3500;

interface SearchOptions {
  provider: WebSearchProvider;
  apiKey: string;
  query: string;
  signal?: AbortSignal;
}

/** 调用当前选中的搜索提供商，并归一化为统一的来源结构。 */
export async function webSearch({
  provider,
  apiKey,
  query,
  signal,
}: SearchOptions): Promise<SearchSource[]> {
  if (!apiKey.trim()) throw new Error('未配置 Web Search API Key。');
  if (!query.trim()) throw new Error('搜索词不能为空。');

  switch (provider) {
    case 'tavily':
      return searchTavily(apiKey, query, signal);
    case 'brave':
      return searchBrave(apiKey, query, signal);
    case 'firecrawl':
      return searchFirecrawl(apiKey, query, signal);
  }
}

async function searchTavily(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchSource[]> {
  const data = await requestJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    signal,
  });

  return asArray(data?.results).map((item: any) => ({
    title: cleanText(item?.title) || item?.url || '未命名来源',
    url: item?.url || '',
    content: truncate(cleanText(item?.content)),
    ...(typeof item?.score === 'number' ? { score: item.score } : {}),
  })).filter(validSource);
}

async function searchBrave(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchSource[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(MAX_RESULTS),
    extra_snippets: 'true',
    safesearch: 'moderate',
  });
  const data = await requestJson(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal,
    },
  );

  return asArray(data?.web?.results).map((item: any) => {
    const snippets = [item?.description, ...asArray(item?.extra_snippets)]
      .map(cleanText)
      .filter(Boolean)
      .join('\n');
    return {
      title: cleanText(item?.title) || item?.url || '未命名来源',
      url: item?.url || '',
      content: truncate(snippets),
    };
  }).filter(validSource);
}

async function searchFirecrawl(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchSource[]> {
  const data = await requestJson('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: MAX_RESULTS,
      sources: [{ type: 'web' }],
      scrapeOptions: {
        formats: [{ type: 'markdown' }],
        onlyMainContent: true,
      },
    }),
    signal,
  });

  return asArray(data?.data?.web).map((item: any) => ({
    title: cleanText(item?.title || item?.metadata?.title) || item?.url || '未命名来源',
    url: item?.url || item?.metadata?.sourceURL || '',
    content: truncate(
      cleanText(item?.markdown || item?.description || item?.metadata?.description),
    ),
  })).filter(validSource);
}

async function requestJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail =
      data?.detail?.error || data?.error || data?.message || text.slice(0, 240);
    throw new Error(
      `搜索请求失败 (${response.status} ${response.statusText})${
        detail ? `：${cleanText(String(detail))}` : ''
      }`,
    );
  }
  return data;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string): string {
  return value.length > MAX_CONTENT_CHARS
    ? `${value.slice(0, MAX_CONTENT_CHARS)}…`
    : value;
}

function validSource(source: SearchSource): boolean {
  try {
    const url = new URL(source.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
