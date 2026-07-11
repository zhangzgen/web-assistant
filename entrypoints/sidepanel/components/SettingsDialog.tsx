import { useEffect, useState } from 'react';
import { saveSettings } from '@/lib/storage';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types';
import { THEMES, type ThemeMode } from '@/lib/theme';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search';
import type { WebSearchProvider } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
}

export function SettingsDialog({ open, settings, onClose }: Props) {
  const [form, setForm] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(settings);
      setSaved(false);
    }
  }, [open, settings]);

  if (!open) return null;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setSearchProvider = (provider: WebSearchProvider) =>
    setForm((current) => ({
      ...current,
      webSearchProvider: provider,
      // 一次只配置一个服务商，切换时避免误用上一家的 Key。
      webSearchApiKey: '',
    }));

  // 主题即时应用并持久化（不依赖底部「保存」）
  const setTheme = (theme: ThemeMode) => {
    set('theme', theme);
    void saveSettings({ theme });
  };

  const submit = async () => {
    await saveSettings(form);
    setSaved(true);
    setTimeout(onClose, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="wa-anim-sheet mt-auto flex max-h-[92%] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="settings" size={16} className="text-muted" />
            设置
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-text"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {/* 外观 */}
          <section className="space-y-2">
            <SectionTitle icon="palette" text="外观主题" />
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const active = form.theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all ${
                      active
                        ? 'border-accent ring-2 ring-accent/25'
                        : 'border-border hover:border-muted/50'
                    }`}
                  >
                    <span
                      className="flex h-9 w-full items-center justify-center gap-1 overflow-hidden rounded-lg border border-border"
                      style={{ background: t.swatch[0] }}
                    >
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{
                          background: t.swatch[1],
                          borderColor: 'rgba(128,128,128,0.3)',
                        }}
                      />
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ background: t.swatch[2] }}
                      />
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-medium">
                      {active && <Icon name="check" size={12} className="text-accent" />}
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 模型 */}
          <section className="space-y-3">
            <SectionTitle icon="settings" text="模型（OpenAI 兼容）" />

            <Field label="Base URL" hint="如 https://api.openai.com/v1、DeepSeek、本地网关等">
              <input
                className={inputCls}
                value={form.baseURL}
                placeholder={DEFAULT_SETTINGS.baseURL}
                onChange={(e) => set('baseURL', e.target.value)}
              />
            </Field>

            <Field label="API Key">
              <input
                type="password"
                className={inputCls}
                value={form.apiKey}
                placeholder="sk-..."
                onChange={(e) => set('apiKey', e.target.value)}
              />
            </Field>

            <Field label="模型 Model">
              <input
                className={inputCls}
                value={form.model}
                placeholder={DEFAULT_SETTINGS.model}
                onChange={(e) => set('model', e.target.value)}
              />
            </Field>

            <Field label={`温度 Temperature · ${form.temperature.toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => set('temperature', Number(e.target.value))}
                className="w-full accent-accent"
              />
            </Field>

            <Field label="上下文最大字符数" hint="注入网页正文的截断长度">
              <input
                type="number"
                min={1000}
                step={1000}
                className={inputCls}
                value={form.maxContextChars}
                onChange={(e) => set('maxContextChars', Number(e.target.value))}
              />
            </Field>

            <Field label="System Prompt">
              <textarea
                className={`${inputCls} min-h-24 resize-y`}
                value={form.systemPrompt}
                onChange={(e) => set('systemPrompt', e.target.value)}
              />
            </Field>
          </section>

          {/* ReAct 与 Web Search */}
          <section className="space-y-3 rounded-2xl border border-border bg-panel-2/45 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Icon name="globe" size={13} />
                  ReAct · Web Search
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  模型按需搜索网页、观察结果，再基于可追溯来源回答。
                </p>
              </div>
              <Toggle
                checked={form.reactEnabled}
                onChange={(checked) => set('reactEnabled', checked)}
                label="启用 ReAct"
              />
            </div>

            <div
              className={`space-y-3 border-t border-border pt-3 transition-opacity ${
                form.reactEnabled ? 'opacity-100' : 'pointer-events-none opacity-45'
              }`}
            >
              <Field label="Web Search 服务商" hint="一次只启用一个服务，后端自动适配请求和响应。">
                <div className="relative">
                  <select
                    className={`${inputCls} appearance-none pr-9`}
                    value={form.webSearchProvider}
                    disabled={!form.reactEnabled}
                    onChange={(e) =>
                      setSearchProvider(e.target.value as WebSearchProvider)
                    }
                  >
                    {Object.entries(WEB_SEARCH_PROVIDERS).map(([id, provider]) => (
                      <option key={id} value={id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron-down"
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
              </Field>

              <Field label={`${WEB_SEARCH_PROVIDERS[form.webSearchProvider].name} API Key`}>
                <input
                  type="password"
                  className={inputCls}
                  value={form.webSearchApiKey}
                  disabled={!form.reactEnabled}
                  placeholder={WEB_SEARCH_PROVIDERS[form.webSearchProvider].keyPlaceholder}
                  onChange={(e) => set('webSearchApiKey', e.target.value)}
                  autoComplete="off"
                />
              </Field>

              <a
                href={WEB_SEARCH_PROVIDERS[form.webSearchProvider].website}
                target="_blank"
                rel="noreferrer"
                tabIndex={form.reactEnabled ? 0 : -1}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 text-xs font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft"
              >
                前往 {WEB_SEARCH_PROVIDERS[form.webSearchProvider].name} 官网获取 API Key
                <Icon name="external-link" size={13} />
              </a>

              {form.reactEnabled && !form.webSearchApiKey.trim() && (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">
                  <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
                  ReAct 已开启；保存前请填写当前服务商的 API Key。
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-text"
          >
            取消
          </button>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
          >
            {saved ? (
              <>
                <Icon name="check" size={15} /> 已保存
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20';

function SectionTitle({ icon, text }: { icon: 'palette' | 'settings'; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
      <Icon name={icon} size={13} />
      {text}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-text">{label}</div>
      {hint && <div className="mb-1.5 text-[11px] text-muted">{hint}</div>}
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked
          ? 'border-accent bg-accent'
          : 'border-border bg-panel'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
