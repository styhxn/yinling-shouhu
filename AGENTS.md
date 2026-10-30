# AGENTS.md — 协同开发与 AI 开发约定

> 本文件面向所有参与仓库的人和 AI 助手。开始任何开发前先读完本文件；AI 助手应把这里视为项目级硬约束。
>
> 人类协作流程见第 3 节；AI 必须遵守的规则见第 6 节。

## 1. 项目是什么

银龄守护：面向江苏长辈的 AI 陪伴与守护系统。前端 React，后端 Fastify，AI 主路径包括 Agent 工具调用、反诈研判、记忆访谈、故事生成、主动简报与家人协同。

- `frontend/`：React 18 + Vite 6 + TypeScript，可独立交接
- `apps/api/`：Fastify 5 + TypeScript + zod，API、SSE、WebSocket、静态托管
- `apps/mcp-server/`：MCP Server，把天气、用药、反诈、定位、围栏开放给外部助手
- `packages/shared/`：zod schema 与共享类型，接口契约的唯一来源
- `packages/adapters/`：硬件/云能力接口与 Mock
- `scripts/`：评测、schema 导出、前端契约同步
- `docs/`：设计、接口契约、前后端开发、部署、评测报告

运行形态：

- 本地开发默认 SQLite，零配置，不需要安装数据库。
- 生产使用 MySQL 8，systemd 托管，由根目录 `deploy.sh` 部署。
- **不要重新引入 PostgreSQL / pgvector**：项目已迁移到 MySQL，反诈语义检索在进程内完成。

## 2. 快速开始

要求 Node 22.5+（推荐 24）。在仓库根目录执行：

```bash
npm ci
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3100
- 本地数据库：`apps/api/data/app.db`（SQLite，自动创建）
- 本地环境变量：`apps/api/.env`，从 `apps/api/.env.example` 复制；**不要提交**

没有模型 Key 时会自动使用 Mock，页面和主流程仍可运行。不要在代码里硬编码任何 Key。

## 3. 两人协同流程

### 3.1 基本约定

- `main` 始终保持可部署；不要直接向 `main` 提交功能改动。
- 每人每个任务开一个分支，提交后推送分支，开 PR，由另一人 review 后合并。
- 仓库协作者在 GitHub → Settings → Collaborators 添加，权限 `Write`。
- 分支命名：`feat/<模块>-<简述>`、`fix/<模块>-<简述>`、`docs/<简述>`。
- 提交信息遵循 [docs/提交规范.md](docs/提交规范.md)，使用 Conventional Commits + 中文背景/改动/验证。
- 合并方式建议 **Squash and merge**，合并后删除远端分支。

### 3.2 每次开发

```bash
# 1. 同步 main
git switch main
git pull --ff-only origin main

# 2. 开任务分支
git switch -c feat/web-medication-card

# 3. 修改后检查
git status
git diff

# 4. 只添加自己改的文件，不要 git add .
git add frontend/src/...
git commit -m "feat(web): 调整长辈首页用药卡片"

# 5. 推分支并开 PR
git push -u origin feat/web-medication-card
```

PR 目标分支选 `main`，写清：改了什么、为什么改、怎么验证、影响范围；前端改动附截图。

### 3.3 合并后同步

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/web-medication-card
```

### 3.4 冲突处理

```bash
git fetch origin
git merge origin/main
# 编辑冲突文件，处理 <<<<<<< / ======= / >>>>>>>
git add 冲突文件
git commit
git push
```

不要用 `git push --force` 覆盖 `main`；不要为了消除冲突随意删除对方代码。

## 4. 目录与修改边界

| 改动内容 | 应该改哪里 |
| --- | --- |
| 页面、组件、适老化样式、前端状态 | `frontend/src/` |
| API 路由、权限、SSE/WS、业务服务 | `apps/api/src/routes/`、`apps/api/src/services/` |
| 数据仓储与 SQL | `apps/api/src/store/` |
| 表结构 | `apps/api/src/store/migrations.ts` |
| 接口字段/请求响应 schema | `packages/shared/`，同步更新 `docs/接口契约.md` |
| 前端使用的契约副本 | 修改 shared 后运行 `npm run sync:frontend-shared` |
| 评测用例与指标 | `apps/api/src/services/eval.ts`、`scripts/eval.ts` |
| 部署 | 根目录 `deploy.sh`、`docs/部署.md` |
| 生成的 schema | 改迁移后运行 `npm run db:schema`，不要手改生成物 |

不要跨模块“顺手重构”；一个 PR 只解决一个逻辑问题。

## 5. 数据层铁律

- 业务代码只依赖 `SqlClient` 抽象（`apps/api/src/store/sql.ts`），不要绕过它直接连数据库。
- SQLite 与 MySQL 必须同时可用；不要写只有一种数据库能跑的 SQL。
- MySQL 使用 `mysql2`，SQLite 使用 `node:sqlite`；生产环境不要新增数据库依赖。
- 表结构只改 `migrations.ts`，然后运行 `npm run db:schema` 生成：
  - `docs/schema.sql`（SQLite）
  - `docs/schema.mysql.sql`（MySQL 8）
- MySQL 方言约定：索引列 `VARCHAR(64)`、JSON 用 `LONGTEXT`、时间戳 `BIGINT` 毫秒、布尔 `TINYINT`、索引写在建表语句内、`InnoDB` + `utf8mb4`。
- MySQL 保留字冲突用改名解决（例如 `agent_traces.trigger_type`），不要加反引号散落业务 SQL。
- 新增/修改表后，至少跑 `npm run test -w apps/api`；有 MySQL 环境时再跑 MySQL 集成测试。
- **MySQL 集成测试会清空 `MYSQL_TEST_URL` 指向的库**，只能指向一次性测试库，绝不能指向生产库。

## 6. AI 开发铁律

AI 助手在本仓库工作时必须遵守：

1. **先读上下文**：`AGENTS.md`、[docs/接口契约.md](docs/接口契约.md)、[docs/开发设计文档.md](docs/开发设计文档.md)、相关前后端开发文档；不要凭猜测改接口。
2. **最小改动**：只改与任务直接相关的文件；不重命名公共 API、不批量格式化、不删除看似无用的代码来“清理”。
3. **保持契约同步**：改 API 字段/错误码/SSE 事件时，同时更新 `packages/shared`、`docs/接口契约.md` 与前端契约副本（`npm run sync:frontend-shared`）。
4. **模型调用统一走 `ModelRouter`**：不要在路由或服务里直接 new 某个厂商 SDK；没有 Key 时必须能回退 Mock。
5. **AI 结果必须可解释、可降级**：反诈引用必须逐字命中原文；故事引语必须校验；医疗不做诊断；高风险动作走确认门。
6. **数据与隐私**：敏感字段用现有加密服务；不把访谈原文、坐标、电话、密钥写进日志；不提交 `.env`、`master.key`、`data/`、`uploads/`。
7. **权限**：新接口必须检查登录态与长辈归属；遵守 elder/family/institution/admin 的 RBAC 边界。
8. **前端适老化**：保持大字号、大按钮、足够对比度与中文文案；不要为了“好看”缩小触控区域或引入低对比配色。
9. **数据库兼容**：任何 SQL 都要同时考虑 SQLite 与 MySQL；不要引入 PostgreSQL/pgvector。
10. **不跑破坏性命令**：不执行 `git reset --hard`、`git clean -fd`、`git push --force`、生产库 DDL、服务器服务停止等操作；确需执行先向负责人确认。
11. **不动生产服务器上的其他项目**：服务器上还有 `risk-api`（127.0.0.1:3100）、`survey-manager`、`1panel`、Nginx 等，均不属于本项目；禁止停止、重启或修改它们。
12. **部署改动要自检**：修改 `deploy.sh` 后至少运行 `bash -n deploy.sh`；不要在脚本或文档中写入真实密码、Token、服务器登录信息。
13. **完成前跑检查**：按改动范围运行 typecheck/build/test；涉及 AI 提示词或工具时再跑 `npm run eval`；在回复中说明实际执行了哪些命令、结果如何。
14. **不确定先问**：涉及接口契约、数据库迁移、权限模型、部署结构或删除文件时，先说明方案和影响，不要直接动手。

## 7. 完成标准（Definition of Done）

一个任务完成至少要满足：

- [ ] 功能按需求可用，主路径和失败路径都考虑过
- [ ] `npm run typecheck` 或对应 workspace 的 typecheck 通过
- [ ] 对应构建/测试通过（前端至少 `npm run build -w frontend`）
- [ ] 改了 API/数据层：`npm run test -w apps/api` 通过；改了契约已同步
- [ ] 改了 AI 主路径：`npm run eval` 通过或说明指标变化
- [ ] 没有提交 `.env`、密钥、`node_modules`、`dist`、`data/`、`uploads/`、日志
- [ ] 没有无关文件改动，没有调试残留
- [ ] 文档/注释只在必要处更新，提交信息符合规范
- [ ] PR 描述写清验证方式和影响范围；UI 改动附截图

## 8. 常用命令

| 目的 | 命令 |
| --- | --- |
| 启动前后端 | `npm run dev` |
| 只启动后端 | `npm run dev -w apps/api` |
| 只启动前端 | `npm run dev -w frontend` |
| 类型检查（全部） | `npm run typecheck` |
| 构建（全部） | `npm run build` |
| 全部测试 | `npm run test` |
| 构建 + 类型检查 + 全部测试 | `npm run verify` |
| AI 评测 | `npm run eval` |
| 重新生成 schema 文档 | `npm run db:schema` |
| 同步前端契约副本 | `npm run sync:frontend-shared` |
| 生产部署（服务器 root） | `bash deploy.sh` |

## 9. 生产部署约束

- 只有 `main` 可以部署；合并前必须验证。
- 生产使用 systemd + MySQL 8，服务名 `yinling`，端口 **3200**；数据在 `/var/lib/yinling`，配置在 `/etc/yinling/yinling.env`。
- 生产服务器是共享环境：`risk-api` 占用 `127.0.0.1:3100`，另有 `survey-manager`、`1panel`、Nginx；不要操作这些服务，也不要占用 3100。
- 部署只通过根目录 `deploy.sh`；不要在服务器上直接改代码或手工改构建产物。
- 数据库 root 密码只在部署建库时交互输入，不写入仓库、不写入配置文件。
- 部署后检查 `curl --noproxy '*' http://127.0.0.1:3200/ready`，并确认 `dbDriver=mysql`。

## 10. 文档索引

- [接口契约](docs/接口契约.md)：前后端唯一接口基线
- [开发设计文档](docs/开发设计文档.md)：产品、架构、AI 方案、排期
- [后端开发文档](docs/后端开发文档.md)：数据层、Agent、RAG、安全、部署
- [前端开发文档](docs/前端开发文档.md)：页面、组件、状态、适老化
- [部署文档](docs/部署.md)：systemd + MySQL、备份、Nginx
- [提交规范](docs/提交规范.md)：type/scope/示例
- [评测报告](docs/评测报告.md)：指标定义与基线

---

**给 AI 助手的最后一句话**：先理解现有实现和契约，再做最小、可验证、可回退的改动；不要为了“看起来更完整”而扩大范围。完成后明确告诉负责人：改了什么、验证了什么、还有什么风险。
