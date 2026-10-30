# 银龄守护 MCP Server

把「银龄守护」的能力以 [Model Context Protocol](https://modelcontextprotocol.io) 工具的形式开放给外部 AI 助手（Claude Desktop、Qoder 等），演示 Agent 生态接入。

## 工具

| 工具 | 类型 | 说明 |
| --- | --- | --- |
| `get_weather` | 只读 | 查询城市今日天气与温度范围 |
| `get_medications` | 只读 | 读取用药计划、服药时间与今日完成情况 |
| `search_anti_fraud_kb` | 只读 | 在国家反诈中心知识库中检索相似骗局 |
| `check_scam` | 只读 | 对短信/聊天/链接做风险鉴定 |
| `get_location` | 只读 | 读取长辈最近一次定位（防走失） |
| `set_geofence` | 写入 | 创建圆形电子围栏，离开时通知家人 |

`set_geofence` 为写入操作，客户端调用前应先向用户确认。所有结果仅供参考，不替代医生诊断或警方判断。

## 运行

```bash
# 1. 启动后端（演示模式，无需真实模型密钥）
DEMO_MODE=1 LLM_MOCK=1 npm run dev -w apps/api

# 2. 启动 MCP Server（stdio）
npm run dev -w apps/mcp-server
```

MCP Server 通过 `POST /api/auth/demo-login` 以演示账号登录，并复用返回的会话 Cookie。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:3100` | 银龄守护后端地址 |
| `MCP_DEMO_ROLE` | `elder` | 演示登录角色：`elder` / `family` / `institution` / `admin` |
| `MCP_SESSION_COOKIE` | 空 | 已有会话 Cookie；设置后不再自动演示登录 |
| `MCP_TIMEOUT_MS` | `15000` | 单次接口超时 |

## 客户端配置示例

```json
{
  "mcpServers": {
    "yinling-shouhu": {
      "command": "npx",
      "args": ["tsx", "D:/传智杯AI web/work/apps/mcp-server/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://127.0.0.1:3100",
        "MCP_DEMO_ROLE": "elder"
      }
    }
  }
}
```

## 冒烟测试

需先启动后端：

```bash
npm run smoke -w apps/mcp-server
```

脚本会依次调用只读工具并打印结果，不会创建电子围栏。
