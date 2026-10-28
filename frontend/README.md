# 银龄守护 · 前端

面向江苏长者的 AI 陪伴与安全守护 Web 端，视觉主题为「水韵江苏」。本目录是**可独立运行、独立交接**的前端工程，不依赖仓库内其他 workspace。

## 技术栈

- React 18 + TypeScript（strict）+ Vite 6
- react-router-dom 6
- 原生 CSS 设计令牌（`src/ui/token.css`、`src/ui/jiangsu.css`）
- SSE 流式对话、Web Speech ASR/TTS
- 无 UI 组件库；图标统一走 `src/ui/components/Icon.tsx`

## 快速开始

```bash
npm install
npm run dev
```

默认打开 <http://localhost:5173>，开发代理指向本机后端 `http://127.0.0.1:3100`。

后端未启动时页面会提示未登录。启动后端（在仓库根目录）：

```bash
DEMO_MODE=1 LLM_MOCK=1 npm run dev -w apps/api
```

或在当前目录直接指定后端地址：

```bash
VITE_PROXY_TARGET=http://127.0.0.1:3100 npm run dev
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（5173） |
| `npm run build` | 类型检查并构建到 `dist/` |
| `npm run typecheck` | 仅类型检查 |
| `npm run test` | Vitest |

## 环境变量

复制 `.env.example` 为 `.env.local` 后按需修改。

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 生产环境 API 前缀，例如 `https://api.example.com/api`；默认走同源 `/api` |
| `VITE_PROXY_TARGET` | 开发代理的后端地址，默认自动读取后端 `apps/api/.env` 的 `PORT`，读不到时用 `http://127.0.0.1:3100` |
| `VITE_WS_URL` | 生产 WebSocket 地址，例如 `wss://api.example.com/ws`；留空走同源 `/ws` |
| `DH_LIVE_STATIC_DIR` | 可选，DH_live 数字人静态资源目录；不存在时自动跳过 |

## 页面与路由

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `RoleSelectPage` | 长者 / 家属角色选择与演示登录 |
| `/elder` | `ElderHomePage` | 今日：用药、位置、待确认、故事入口 |
| `/elder/chat` | `AgentChatPage` | 小助手（SSE 流式、语音输入） |
| `/elder/story` | `MemoryListPage` | 记忆时间轴与故事列表 |
| `/elder/story/new` | `MemoryInterviewPage` | 5 轮记忆访谈 |
| `/elder/story/:id` | `StoryChapterPage` | 故事阅读、朗读、导出故事书 |
| `/elder/meds` | `MedicationsPage` | 用药计划、服药记录、拍照识药 |
| `/elder/safety` | `SafetyHomePage` | 实时位置共享、围栏、告警知悉、寻人海报 |
| `/elder/safety/scam` | `ScamCheckPage` | 文字/链接/截图反诈鉴定 |
| `/elder/safety/roleplay` | `RoleplayPage` | 反诈演练与六维复盘 |
| `/family` | `FamilyDashboardPage` | 家属照护概览、本周简报、待确认 |

> `src/ui/pages/` 中还保留了一些早期页面（如 HomePage、SettingsPage、QaPage），当前未挂载路由，可逐步清理，不影响构建。

## 目录结构

```text
frontend/
├── shared/                 # 独立运行所需的契约类型（从 packages/shared 同步）
├── src/
│   ├── lib/                # http、SSE、接口封装、API 类型
│   ├── ui/
│   │   ├── components/     # Icon、Button 等基础组件
│   │   ├── layouts/        # 长者端 / 家属端布局
│   │   ├── pages/          # 路由页面
│   │   ├── state/          # 登录态、Toast、旧版状态
│   │   ├── voice/          # ASR / TTS
│   │   ├── assets/         # 主视觉等资源
│   │   ├── token.css       # 设计令牌
│   │   └── jiangsu.css     # 水韵江苏页面样式
│   ├── App.tsx             # 路由表
│   └── main.tsx
├── docs/                   # 交接用文档快照
└── vite.config.ts          # 代理、共享类型别名、DH_live 静态资源
```

## 接口与鉴权

- 所有请求通过 `src/lib/http.ts`，默认 `credentials: "include"`。
- 后端使用 HttpOnly Cookie 会话；演示登录接口为 `POST /api/auth/demo-login`，body `{ "role": "elder" | "family" }`。
- SSE 对话：`POST /api/agent/chat`，事件解析在 `src/lib/sse.ts`。
- WebSocket：`/ws`，用于位置更新、安全告警与家属确认推送，需携带会话 Cookie；连接层内置指数退避重连、30 秒心跳与“实时连接/连接中/已断开”状态。
- 接口字段与错误码见 [docs/接口契约.md](docs/接口契约.md)，页面与组件约定见 [docs/前端开发文档.md](docs/前端开发文档.md)。

## 设计规范

- 色板：纸白 `#F2F4EF`、墨色 `#1C2724`、青瓷 `#5E7F71`、印章红 `#8C3B2E`。
- 标题使用宋体，正文使用系统无衬线；圆角不超过 2px。
- 禁止紫色渐变、玻璃拟态、密集卡片堆叠；优先使用细线、留白和真实影像。
- 长者端字号与触控尺寸遵循 `jiangsu.css` 中的适老化覆盖；支持 `prefers-reduced-motion`。
- 新增页面优先复用 `.yl-*` / `.ys-*` 类与设计令牌，不要引入新的色板。

## 共享类型

`shared/` 是仓库根目录 `packages/shared/src` 的副本，仅包含前端用到的类型与默认值。契约变更后，在仓库根目录执行：

```bash
npm run sync:frontend-shared
```

## 部署

```bash
npm run build
```

将 `dist/` 交给 Nginx/CDN 托管；反向代理 `/api`、`/public`、`/ws` 到后端。SPA 路由需要回退到 `index.html`。若由后端统一托管，将 `WEB_DIST_DIR` 指向本目录的 `dist/` 即可（仓库默认已配置）。
