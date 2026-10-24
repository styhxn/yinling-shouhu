import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";
const serverEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  env: { ...process.env, API_BASE_URL: apiBaseUrl },
  stderr: "inherit"
});

const client = new Client({ name: "yinling-smoke", version: "0.1.0" });

try {
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  console.log(`[smoke] tools: ${names.join(", ")}`);

  const calls = [
    { name: "get_medications", arguments: {} },
    { name: "search_anti_fraud_kb", arguments: { query: "让我把钱转到安全账户接受审查" } },
    { name: "check_scam", arguments: { text: "我是公安局的，你涉嫌洗钱，需要把资金转到安全账户" } },
    { name: "get_location", arguments: {} },
    { name: "get_weather", arguments: { location: "南京" } }
  ];

  for (const call of calls) {
    const result = await client.callTool(call);
    const text = result.content?.find((item) => item.type === "text")?.text ?? "(no text)";
    if (result.isError) throw new Error(`${call.name} failed: ${text}`);
    console.log(`\n[smoke] ${call.name}\n${text}`);
  }

  console.log("\n[smoke] all read tools ok");
} finally {
  await client.close();
}
