# 智能陪伴（DH_Live）集成说明

本项目已将 `DH_live-main` 的数字人前端资源与当前 Web/API 工程打通，实现“智能陪伴”入口按钮 → 独立对话界面 → 真实大模型回答的完整链路。

## 功能入口

- Web 首页新增“智能陪伴”卡片，点击进入：`/smart-companion?view=mini`
- 页面内嵌 DH_Live 前端：
  - `view=mini`：数字人 + 对话（`/dh-live/MiniLive_RealTime.html`）
  - 默认：纯对话（`/dh-live/dialog_RealTime.html`）

## 运行方式（开发环境）

1. 安装依赖后启动：
   - 在仓库根目录执行：`npm run dev`
2. 访问：
   - Web：`http://localhost:5173/`
   - API：`http://127.0.0.1:3100/`
3. 在 Web 首页点击“智能陪伴”即可使用。

## 接口与数据格式

DH_Live 的对话前端使用 **NDJSON 流**（每行一个 JSON）消费回答。

- 接口：`POST /dh-live-api/eb_stream`
- 请求体（当前仅启用文本模式）：
  - `{"input_mode":"text","prompt":"..."}`
- 响应体（流式，按行输出）：
  - `{"text":"返回的部分文本","audio":"","endpoint":false}`
  - 最后一行 `endpoint=true`

说明：
- 本集成实现了“真实问答”：每次请求都会调用已配置的大模型服务动态生成内容。
- `audio` 字段当前返回空字符串；前端会自动使用浏览器 SpeechSynthesis 进行语音播报（无需下载本地 ASR/TTS 模型）。如需进一步扩展为本地 TTS/口型驱动，可在此接口中补充音频生成并填充 `audio`。

## 大模型配置（必须）

`/dh-live-api/eb_stream` 会从 `apps/api/.env` 读取大模型配置，至少需要配置以下任意一组（与现有工程保持一致）：

- 豆包（Ark/OpenAI 兼容）：
  - `ARK_API_KEY` / `ARK_BASE_URL` / `ARK_MODEL`（或 `DOUBAO_*` 同名变量）
- DeepSeek（OpenAI 兼容）：
  - `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`）
- 通义千问（OpenAI 兼容）：
  - `QWEN_API_KEY`（可选 `QWEN_BASE_URL` / `QWEN_MODEL`）

如果未配置，将返回 `503 missing_config`。

## 静态资源挂载与部署要点

Web 通过 Vite 在运行/构建时自动挂载并拷贝 DH_Live 静态资源：

- 访问前缀：`/dh-live/*`
- 源目录：`DH_live-main/DH_live-main/web_demo/static`
- 构建产物目录：`apps/web/dist/dh-live`

生产环境建议：
- 将 `apps/web/dist` 作为静态站点根目录部署（包含 `dh-live` 子目录）。
- 将 `/dh-live-api/*` 反向代理到 API 服务（默认 `http://127.0.0.1:3100`）。
- DH_Live 使用 WebCodecs：生产环境必须使用 HTTPS（本地可用 localhost）。

## 自检（可选）

在根目录启动后可执行以下验证：

- 健康检查：`GET http://127.0.0.1:3100/dh-live-api/health`
- 静态页面：`GET http://localhost:5173/dh-live/dialog_RealTime.html`
