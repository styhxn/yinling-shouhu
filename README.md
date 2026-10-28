# 银龄守护（原智伴银龄）

> 会倾听，也会守护的江苏长者 AI 陪伴系统。
> 以 Agent 为“主脑”：页面是入口，AI 负责理解、计划、调工具、解释与主动守护。

本仓库为“本地优先 + 可选云端”的前后端分离工程：`frontend/`（React + Vite，可独立交接）、`apps/api`（Fastify + TypeScript）、npm workspaces monorepo。现有能力包括适老化界面、Agent 工具调用、反诈鉴定与演练、记忆故事、用药照护、家属协同、MCP 工具与生产部署。存储支持双轨：SQLite 零配置本地/离线运行，MySQL 8 用于生产与答辩。

## 当前进度

- 后端 W1–W6 已完成：Agent + 工具调用、反诈 RAG/图片鉴定/冷静期、记忆访谈与故事、电子围栏/越界告警/寻人海报、用药计划/拍照识药/服药日志、家属简报、反诈角色演练、WebSocket 鉴权与按老人过滤。
- 前端已重构为「水韵江苏」视觉：角色页、今日首页、故事、健康、守护、家属简报；聊天降为右上角「小助手」。
- W4 已补齐：反诈演练（六维报告）、故事书导出（可打印 HTML）、MCP Server、生产静态托管与 Docker 部署。
- W5 深化：
  - 反诈从规则升级为「规则 + 模型证据链」，模型引文必须逐字出现在原文，失败自动回退规则引擎。
  - 反诈演练话术由模型动态生成，报告附原话证据、手法统计与个性化下一步；危险链接/手机号自动拦截。
  - Agent 新增记忆检索与 citations，回答过去经历前先检索长辈口述，不编造。
  - 记忆访谈支持老照片开场与动态追问，结束后自动提炼标题/摘要/人物/地点。
  - 故事生成增加逐字引语校验与「口述依据」元数据，导出纪念册附原话与用词重合度。
  - 新前端挂载实时 WebSocket：位置共享、越界告警、家属确认自动同步，断线指数退避重连。
  - 工程加固：CORS 白名单、分桶限流、Secure Cookie 配置、CSP、保留期清理、索引与无障碍细节。
- W6「AI 主脑」：
  - 新增统一 Agent Runtime：按任务规划只读工具、执行、生成结构化决策并落库，支持计划/工具/结果/决策全链路轨迹。
  - 首页改为 AI 今日简报：结合用药、天气、位置、记忆画像生成带优先级和依据的行动建议，按天缓存。
  - 安全告警触发守护 Agent 异步研判，自动回写可能原因、风险等级、升级建议与下一步，家属端实时可见。
  - 聊天、首页简报、守护告警统一展示「AI 决策轨迹」，可解释但只展示结构化依据，不暴露原始思维链。
  - 记忆画像从口述中提炼人物、地点、习惯、偏好与沟通注意点，进入聊天系统提示和简报。
  - 陪伴 / 守护 / 家属三类 Agent 使用不同提示词与工具子集；新增 Agent 轨迹评测（任务成功、工具覆盖、升级准确、轨迹完整）。
- W7「工程存储」：
  - 新增 `SqlClient` 驱动抽象，仓储层全部异步化，SQLite 与 MySQL 8 共用一份迁移和业务代码。
  - 生产/答辩使用 MySQL 8，`deploy.sh` 以 systemd 托管；反诈语义检索改为内存 embedding + 关键词融合，不再依赖数据库向量扩展。
  - 新增 MySQL 集成测试，覆盖共享迁移、演示种子、核心仓储与重复执行；`docs/schema.sql` 与 `docs/schema.mysql.sql` 均由迁移代码生成。
- 数字人静态资源来自 DH_live（MIT）；示例头像仅用于比赛演示，商业使用需遵循上游授权。
- 待办：真实模型 Key 与在线演示环境、比赛视频/PDF、团队信息补全。

## 文档

- [开发设计文档](docs/开发设计文档.md)：产品定位、模块规格、AI 方案、总体架构、28 天排期与比赛材料。
- [设计方向](docs/设计方向.md)：水韵江苏色板、字体、信息架构与反 AI 味规范。
- [接口契约](docs/接口契约.md)：前后端唯一接口基线（字段、SSE 事件、错误码、权限）。
- [前端开发文档](docs/前端开发文档.md)：页面、组件、状态、流式渲染、适老化。
- [后端开发文档](docs/后端开发文档.md)：数据层、Agent、RAG、安全、位置、用药、部署。
- [部署与在线演示](docs/部署.md)：systemd + MySQL 一键部署、本地预演、Nginx、数据库初始化、数据备份。
- [AI 评测报告](docs/评测报告.md)：反诈、故事生成与 Agent 轨迹的用例、指标定义和复现方式。
- [SQLite 表结构](docs/schema.sql)：SQLite 建表 SQL（32 张表 + 20 个索引，由迁移代码生成，可手动执行）。
- [MySQL 表结构](docs/schema.mysql.sql)：MySQL 8 建表 SQL（33 张表含 `schema_migrations` + 20 个索引）。
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

本地默认 SQLite，无需安装数据库。使用 MySQL 8 有两种方式：本机已安装 MySQL 时设置 `DB_DRIVER=mysql`、`DATABASE_URL=mysql://user:password@127.0.0.1:3306/yinling`；或直接启动 Compose（MySQL 8 + 应用）：

```bash
# 根目录 .env 至少设置 SESSION_SECRET 与 MYSQL_PASSWORD
docker compose up -d --build
```

### 服务器一键部署

服务器（Alibaba Cloud Linux 3 / RHEL 8+ / Debian 12+，root）在仓库根目录执行：

```bash
bash deploy.sh
```

脚本会自动安装 Node 24 与 MySQL 8，生成配置与安全密钥、按需备份、构建并启动 `yinling.service`，轮询 `/ready` 成功后输出访问地址。`bash deploy.sh --help` 可查看 `status`、`logs`、`backup`、`restart`、`stop` 等命令；详细说明见 [部署文档](docs/部署.md)。

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

后端会同时托管 `frontend/dist` 并提供 SPA 回退。以上命令默认 SQLite；生产/答辩建议在服务器执行 `bash deploy.sh`（systemd + MySQL 8），详见 [部署文档](docs/部署.md)。

### MCP Server

```bash
DEMO_MODE=1 LLM_MOCK=1 npm run dev -w apps/api   # 终端 1
npm run smoke -w apps/mcp-server                # 终端 2
```

### AI 评测

```bash
npm run eval                         # 反诈 + 故事 + Agent 轨迹全部用例
npm run eval -- --module=scam        # 只跑反诈
npm run eval -- --module=agent       # 只跑 Agent 轨迹
npm run eval -- --json               # 输出 JSON 报告（配 --silent 可去掉 npm 横幅）
```

评测使用 `eval_cases` / `eval_runs` 表保存用例与历史结果；当前 Mock 基线 15/15，真实模型结果可对比
`docs/评测报告.md` 中的指标。默认通过率低于 80% 时进程返回非 0，可用 `EVAL_MIN_PASS` 调整阈值。

## 校验

```bash
npm run verify
```

> 安全相关默认值：CORS 白名单、分桶限流、`COOKIE_SECURE`、CSP 与数据保留期均已开启。
> 本地 HTTP 演示可设 `COOKIE_SECURE=0`；压测可设 `RATE_LIMIT_ENABLED=0`；生产 HTTPS 请保持默认安全值。

## 团队信息

- 队伍名称：待补充
- 成员：待补充
- 指导教师：待补充
- 学校：待补充

> 提交比赛前请补全团队信息，并确认 `.env`、`apps/api/data/`、`apps/api/public/uploads/` 未被提交。
