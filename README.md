# Web Assistant · 网页 AI 助手（Chrome 侧边栏插件）

一个以 **侧边栏 (Side Panel)** 形式运行的浏览器 AI 助手：自动读取当前网页内容作为上下文，按网址维护独立会话并本地持久化，支持在网页上划词「添加到对话」，思考过程与回答均流式输出并自动渲染 Markdown。LLM 走 **OpenAI 兼容协议**，可自由配置。

## 特性

- 🧭 **侧边栏形态** — Chrome Side Panel API，点击工具栏图标即在右侧打开。
- ⚙ **可配置 LLM** — OpenAI 兼容协议（Base URL / API Key / Model / 温度 / System Prompt），兼容 OpenAI、DeepSeek、各类网关、本地服务等。
- 📄 **自动网页上下文** — 用 Readability 抽取正文作为上下文；**切换网页自动切换会话并更新上下文**（上下文在发送时动态读取，保证最新）。
- 💾 **会话持久化** — 会话与网页地址关联，保存在本地 `chrome.storage.local`；支持查看/切换/删除单条历史与清空全部；**切换历史会话时自动打开其对应网页**（已有该页标签则聚焦，否则新开）。
- ✂️ **划词添加到对话** — 只要扩展启用（无需先打开侧边栏），在网页上选中文本即浮出「💬 添加到对话」；点击后**自动打开侧边栏**并把片段加入输入框，**发送后自动清空已选片段**。
- 🧠 **流式思考 + 回答** — 同时解析 `reasoning_content`（思考过程，可折叠）与 `content`（回答），均实时流式；回答自动 Markdown 渲染（GFM 表格、任务列表、代码高亮）。
- 🎨 **多主题自由切换** — 内置「跟随系统 / 浅色 / 深色 / Nord / 暖阳」五套主题，默认跟随系统深浅色；基于 CSS 变量（`data-theme`）实时切换并本地持久化。界面统一采用线性 SVG 图标（Lucide 风格）。

## 技术栈

- [WXT](https://wxt.dev/) — 下一代 Web 扩展框架（基于 Vite，MV3）
- React 19 + TypeScript + Tailwind CSS v4
- `@mozilla/readability`（正文抽取）
- `react-markdown` + `remark-gfm` + `rehype-highlight`（Markdown 渲染）
- 原生 `fetch` + SSE 解析（流式聊天）

## 开发与构建

```bash
# 安装依赖（会自动执行 wxt prepare 生成 .wxt/ 类型）
npm install

# 开发模式（自动打开带 HMR 的 Chrome）
npm run dev

# 生产构建 → 产物在 dist/chrome-mv3
npm run build

# 打包 zip
npm run zip
```

### 手动加载到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`，右上角开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择 `dist/chrome-mv3` 目录。
4. 点击工具栏中的插件图标 → 右侧打开侧边栏。
5. 改动代码后：`npm run build` → 在 `chrome://extensions` 点该扩展的「🔄 重新加载」→ **刷新目标网页**（内容脚本不会热替换已打开的页面）。

## 使用

1. 首次使用点击右上角 ⚙ 进入设置，填写 **Base URL / API Key / 模型名**（例如 `https://api.openai.com/v1` + `gpt-4o-mini`）。
2. 打开任意网页，插件会自动以该网页正文为上下文。
3. 直接提问；或在网页上划词，点浮层「添加到对话」，再补充问题后发送。
4. 切换标签页 → 侧边栏自动切换到该网址对应的会话。
5. 右上角 🕘 查看历史对话，可切换 / 删除 / 清空。

## 关键结构

```
entrypoints/
  background.ts        # 划词时打开侧边栏、经 port 投递片段、标签切换广播
  content.tsx          # Readability 抽取 + Shadow DOM 划词浮层
  sidepanel/           # React 侧边栏 UI（Header / MessageList / Composer / 设置 / 历史）
lib/
  llm.ts               # OpenAI 兼容 SSE 流式客户端（思考 + 回答）
  storage.ts           # 设置与会话的持久化（按 URL key 分片）
  messaging.ts         # 跨上下文消息协议
  types.ts             # 共享类型与默认配置
```

## 说明

- 会话 key 采用 `origin + pathname`（忽略 query/hash），使同一页面在参数变化时仍归为同一会话。
- 未提供自定义图标，构建时 WXT 使用默认占位图标；如需自定义，在 `public/icon/` 放入 `16/32/48/128` PNG 并在 `wxt.config.ts` 的 `manifest.icons` 中声明。
- `chrome://`、扩展页等特殊页面无法注入内容脚本，此时不读取上下文、也不显示划词浮层。
