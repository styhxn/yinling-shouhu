# 银龄守护（原智伴银龄）

> 会倾听，也会守护的江苏长者 AI 陪伴系统。
> 当前处于从基础框架向 **Agent + RAG + 多模态 + 安全守护** 迁移的阶段。

本仓库为“本地优先 + 可选云端”的前后端分离工程：`frontend/`（React + Vite，可独立交接）、`apps/api`（Fastify + TypeScript）、npm workspaces monorepo。现有能力包括适老化界面、Agent 工具调用、反诈鉴定与演练、记忆故事、用药照护、家属协同、MCP 工具与生产部署。

## 当前进度

- 后端 W1–W4 已完成：Agent + 工具调用、反诈 RAG/图片鉴定/冷静期、记忆访谈与故事、电子围栏/越界告警/寻人海报、用药计划/拍照识药/服药日志、家属简报、反诈角色演练、WebSocket 鉴权与按老人过滤。
- 前端已重构为「水韵江苏」视觉：角色页、今日首页、故事、健康、守护、家属简报；聊天降为右上角「小助手」。
- W4 已补齐：反诈演练（六维报告）、故事书导出（可打印 HTML）、MCP Server、生产静态托管与 Docker 部署。
- 数字人静态资源来自 DH_live（MIT）；示例头像仅用于比赛演示，商业使用需遵循上游授权。
- 待办：真实模型 Key 与在线演示环境、比赛视频/PDF、团队信息补全。

## 文档

- [开发设计文档](docs/开发设计文档.md)：产品定位、模块规格、AI 方案、总体架构、28 天排期与比赛材料。
- [设计方向](docs/设计方向.md)：水韵江苏色板、字体、信息架构与反 AI 味规范。
- [接口契约](docs/接口契约.md)：前后端唯一接口基线（字段、SSE 事件、错误码、权限）。
- [前端开发文档](docs/前端开发文档.md)：页面、组件、状态、流式渲染、适老化。
- [后端开发文档](docs/后端开发文档.md)：数据层、Agent、RAG、安全、位置、用药、部署。
- [部署与在线演示](docs/部署.md)：生产构建、Docker Compose、Nginx、数据库初始化、数据备份。
- [数据库表结构](docs/schema.sql)：SQLite 建表 SQL（由迁移代码生成，可手动执行）。
- [MCP Server](apps/mcp-server/README.md)：把天气、用药、反诈、定位、围栏能力开放给外部 AI 助手。
- [提交信息规范](docs/提交规范.md)：Conventional Commits + 中文改动详情模板。
- [第三方开源声明](THIRD_PARTY_NOTICES.md)：DH_live / 数字人示例资源说明。

## 启动

```bash
npm i
npm run dev
```

前端默认连接本地后端：`http://localhost:3100`。

后端无可用模型 Key 时可用 Mock 模式：

```bash
LLM_MOCK=1 DEMO_MODE=1 npm run dev -w apps/api
```

演示登录：`POST /api/auth/demo-login`，body `{"role":"elder"}`。环境变量见 [apps/api/.env.example](apps/api/.env.example)。

### 前端独立交接

`frontend/` 已内置契约类型，不依赖仓库内其他 workspace，可单独复制或压缩后：

```bash
cd frontend
npm install
npm run dev
```

交接说明、路由表与环境变量见 [frontend/README.md](frontend/README.md)。

### 生产构建

```bash
npm ci
npm run build
NODE_ENV=production SESSION_SECRET=change-me DEMO_MODE=1 npm run start -w apps/api
```

后端会同时托管 `frontend/dist` 并提供 SPA 回退；也可使用 `docker compose up -d --build`。详见 [部署文档](docs/部署.md)。

### MCP Server

```bash
DEMO_MODE=1 LLM_MOCK=1 npm run dev -w apps/api   # 终端 1
npm run smoke -w apps/mcp-server                # 终端 2
```

## 校验

```bash
npm run verify
```

## 团队信息

- 队伍名称：待补充
- 成员：待补充
- 指导教师：待补充
- 学校：待补充

> 提交比赛前请补全团队信息，并确认 `.env`、`apps/api/data/`、`apps/api/public/uploads/` 未被提交。
