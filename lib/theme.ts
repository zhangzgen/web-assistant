/** 主题定义与运行时应用逻辑 */

/** 主题模式：system 跟随系统，其余为具名主题 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'nord' | 'sepia';

export interface ThemeInfo {
  id: ThemeMode;
  /** 展示名 */
  label: string;
  /** 图标名（见 Icon 组件） */
  icon: 'monitor' | 'sun' | 'moon' | 'palette';
  /** 预览色卡：[背景, 面板, 主色] */
  swatch: [string, string, string];
}

/** 供设置面板展示的主题列表 */
export const THEMES: ThemeInfo[] = [
  {
    id: 'system',
    label: '跟随系统',
    icon: 'monitor',
    swatch: ['#f7f8fa', '#0e0f13', '#7c83ff'],
  },
  {
    id: 'light',
    label: '浅色',
    icon: 'sun',
    swatch: ['#f7f8fa', '#ffffff', '#4f46e5'],
  },
  {
    id: 'dark',
    label: '深色',
    icon: 'moon',
    swatch: ['#0e0f13', '#212329', '#7c83ff'],
  },
  {
    id: 'nord',
    label: 'Nord',
    icon: 'palette',
    swatch: ['#2e3440', '#3b4252', '#88c0d0'],
  },
  {
    id: 'sepia',
    label: '暖阳',
    icon: 'palette',
    swatch: ['#f4ecd8', '#fbf5e6', '#b06a2c'],
  },
];

/** 将 system 解析为实际的 light / dark */
function resolveSystem(): 'light' | 'dark' {
  return typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** 把主题应用到 <html data-theme>；system 依据系统偏好解析 */
export function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? resolveSystem() : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * 监听主题：立即应用，并在 mode 为 system 时随系统偏好变化自动更新。
 * 返回取消函数。
 */
export function watchTheme(mode: ThemeMode): () => void {
  applyTheme(mode);
  if (mode !== 'system' || typeof matchMedia === 'undefined') return () => {};

  const mql = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => applyTheme('system');
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
