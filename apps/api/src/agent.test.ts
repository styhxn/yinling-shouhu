import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, parseSse, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let cookie: string;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const login = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  cookie = cookieFrom(login.headers);
});

afterAll(async () => {
  await server.close();
});

describe("agent", () => {
  it("streams a tool call and an answer for weather", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/agent/chat",
      headers: { cookie, accept: "text/event-stream" },
      payload: { message: "今天天气怎么样" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("event: meta");
    expect(res.body).toContain("event: tool_call");
    expect(res.body).toContain("get_weather");
    expect(res.body).toContain("event: tool_result");
    expect(res.body).toContain("event: done");
    expect(parseSse(res.body, "done").length).toBe(1);
  });

  it("pauses for confirmation on a transfer intent, then resumes", async () => {
    const first = await server.inject({
      method: "POST",
      url: "/api/agent/chat",
      headers: { cookie, accept: "text/event-stream" },
      payload: { message: "我要给投资平台转账 50000，对方让我不要告诉家人" }
    });

    expect(first.statusCode).toBe(200);
    const meta = parseSse(first.body, "meta")[0] as { sessionId: string };
    const confirmations = parseSse(first.body, "confirmation_required") as Array<{
      id: string;
      tool: string;
    }>;
    expect(meta.sessionId).toBeTruthy();
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]?.tool).toBe("start_cooling_off");

    const pending = server.db.familyConfirms.listPending("e_li");
    expect(pending).toHaveLength(1);

    const second = await server.inject({
      method: "POST",
      url: "/api/agent/chat",
      headers: { cookie, accept: "text/event-stream" },
      payload: {
        sessionId: meta.sessionId,
        confirmationId: confirmations[0]!.id,
        confirmationDecision: "approve"
      }
    });

    expect(second.statusCode).toBe(200);
    expect(second.body).toContain("event: tool_call");
    expect(second.body).toContain("start_cooling_off");
    expect(second.body).toContain("event: tool_result");
    expect(second.body).toContain("event: done");
  });


  it("cites the elder's own memories when answering about the past", async () => {
    const memory = server.db.memories.create({
      elderId: "e_li",
      title: "河边捉鱼的夏天",
      summary: "小时候在苏州河边和邻居小伙伴捉鱼，回家晚了被母亲念叨。",
      transcript: "问：小时候住在哪里？答：住在苏州河边，夏天常去捉鱼。",
      place: "苏州",
      tags: ["童年", "苏州"],
      consent: true
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/agent/chat",
      headers: { cookie, accept: "text/event-stream" },
      payload: { message: "你还记得我小时候在苏州河边捉鱼的事吗？" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("search_memories");
    expect(res.body).toContain("河边捉鱼的夏天");
    const done = parseSse(res.body, "done")[0] as {
      citations: Array<{ title: string; type?: string; id?: string }>;
    };
    expect(
      done.citations.some((citation) => citation.id === memory.id && citation.type === "memory")
    ).toBe(true);
  });

  it("serves the legacy /qa/ask endpoint through the router", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/qa/ask",
      headers: { cookie },
      payload: { question: "你好" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { answer: string; provider: string };
    expect(body.answer.length).toBeGreaterThan(0);
    expect(body.provider).toBe("mock");
  });

  it("streams NDJSON for the digital human endpoint", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/dh-live-api/eb_stream",
      headers: { cookie, "content-type": "application/json" },
      payload: { input_mode: "text", prompt: "你好" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"endpoint":true');
  });

  it("lists only tools available to the role", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/agent/tools",
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as any).tools.map((tool: any) => tool.name);
    expect(names).toContain("get_weather");
    expect(names).toContain("start_cooling_off");
  });
});
