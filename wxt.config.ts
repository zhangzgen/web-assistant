import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// WXT 配置：https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  // 输出到不带点的 dist 目录，避免 macOS 文件选择框隐藏 .output
  outDir: 'dist',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Web Assistant · 网页 AI 助手',
    description:
      '侧边栏 AI 助手：读取当前网页作为上下文、按网址维护会话、划词提问、流式思考与 Markdown 渲染。',
    // 侧边栏 + 存储 + 读取当前标签页信息
    permissions: ['sidePanel', 'storage', 'activeTab', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 Web Assistant',
    },
    // side_panel.default_path 由 WXT 依据 sidepanel 入口自动注入
  },
});
