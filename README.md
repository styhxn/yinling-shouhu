# 银龄守护（原智伴银龄）

> 会倾听，也会守护的江苏长者 AI 陪伴系统。
> 当前处于从基础框架向 **Agent + RAG + 多模态 + 安全守护** 迁移的阶段。

本仓库为“本地优先 + 可选云端”的前后端分离工程：React + Vite 前端、Fastify + TypeScript 后端、npm workspaces monorepo。现有能力包括适老化三模式、语音问答、健康记录、提醒、紧急呼叫、数字人陪伴，以及正在建设的 Agent 工具调用、反诈鉴定、记忆故事、用药与家属协同。

## 文档

- [开发设计文档](docs/开发设计文档.md)：产品定位、模块规格、AI 方案、总体架构、28 天排期与比赛材料。
- [接口契约](docs/接口契约.md)：前后端唯一接口基线（字段、SSE 事件、错误码、权限）。
- [前端开发文档](docs/前端开发文档.md)：页面、组件、状态、流式渲染、适老化。
- [后端开发文档](docs/后端开发文档.md)：数据层、Agent、RAG、安全、位置、用药、部署。
- [第三方开源声明](THIRD_PARTY_NOTICES.md)：DH_live / 数字人示例资源说明。

## 当前进度

- 后端 W1 地基已完成：SQLite（`node:sqlite`）、演示登录与 RBAC、`ModelRouter`（Mock + OpenAI 兼容 Provider）、Agent 工具循环与 SSE、反诈规则、天气/位置工具、`/qa` 与数字人接口迁移。
- 前端仍使用旧页面与旧接口；W2 起逐步接入新 Agent/记忆/反诈/家属端。
- 数字人静态资源来自 DH_live（MIT）；示例头像仅用于比赛演示，商业使用需遵循上游授权。

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
