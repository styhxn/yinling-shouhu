import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { MockModelProvider } from "./services/llm/mock.js";
import { analyzeScamHybrid } from "./services/safety/scamAI.js";
import { analyzeScamImage } from "./services/safety/scamImage.js";
import { cookieFrom, StubModelRouter, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let elderCookie: string;
let familyCookie: string;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const elder = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  elderCookie = cookieFrom(elder.headers);
  const family = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "family" }
  });
  familyCookie = cookieFrom(family.headers);
});

afterAll(async () => {
  await server.close();
});

describe("safety", () => {
  it("flags a high-risk text and returns related anti-fraud cases", async () => {
    const input = "我是警察，你涉嫌洗钱，把钱转到安全账户，不要告诉家里人。";
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/scam/check",
      headers: { cookie: elderCookie },
      payload: { inputType: "text", text: input }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.result.riskLevel).toBe("high");
    expect(body.result.redFlags.length).toBeGreaterThan(0);
    expect(body.result.engine).toBe("rules+llm");
    expect(body.result.model).toBe("mock");
    expect(String(body.result.explanation).length).toBeGreaterThan(5);
    expect(body.related.length).toBeGreaterThan(0);

    const source = input.replace(/\s+/g, "");
    for (const flag of body.result.redFlags as Array<{ quote: string }>) {
      expect(source.includes(flag.quote.replace(/\s+/g, ""))).toBe(true);
    }
  });

  it("creates a cooling-off and lets the family deny it", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/safety/cooling-off",
      headers: { cookie: elderCookie },
      payload: { amount: 50000, counterparty: "某投资平台", reason: "提现要先充值" }
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as any;
    expect(body.coolingOff.riskLevel).toBe("high");
    expect(body.familyConfirm.status).toBe("pending");

    const pending = await server.inject({
      method: "GET",
      url: "/api/safety/confirm/pending?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(pending.statusCode).toBe(200);
    expect(
      (pending.json() as any).items.some((item: any) => item.id === body.familyConfirm.id)
    ).toBe(true);

    const respond = await server.inject({
      method: "POST",
      url: `/api/safety/confirm/${body.familyConfirm.id}/respond`,
      headers: { cookie: familyCookie },
      payload: { decision: "denied", note: "这是诈骗，别转" }
    });
    expect(respond.statusCode).toBe(200);
    expect((respond.json() as any).confirm.status).toBe("denied");

    const after = await server.inject({
      method: "GET",
      url: "/api/safety/confirm/pending?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(
      (after.json() as any).items.some((item: any) => item.id === body.familyConfirm.id)
    ).toBe(false);
  });

  it("searches the anti-fraud knowledge base", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/anti-fraud/search",
      headers: { cookie: elderCookie },
      payload: { query: "安全账户 转账 不要告诉家人" }
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as any).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title.length).toBeGreaterThan(0);
  });

  it("does not let an elder respond to family confirmations", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/confirm/fc_missing/respond",
      headers: { cookie: elderCookie },
      payload: { decision: "approved" }
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("hybrid scam analysis", () => {
  const input = "我是不是遇到骗子了？他说要我把钱转到安全账户，还让我不要告诉家人。";

  it("drops model quotes that are not literally present in the input", async () => {
    const result = await analyzeScamHybrid({
      inputType: "text",
      text: input,
      modelRouter: new StubModelRouter({
        riskLevel: "high",
        scamType: "impersonate_police",
        confidence: 0.95,
        summary: "对方以安全账户为由要求转账，并试图切断你和家人的联系。",
        redFlags: [
          { quote: "把钱转到安全账户", reason: "符合安全账户话术" },
          { quote: "这是模型自己编造的一句话", reason: "不应进入结果" }
        ],
        actions: ["立即停止转账", "联系家人核实"],
        questionsToAsk: ["对方是否让你保密？"]
      })
    });

    const quotes = result.redFlags.map((flag) => flag.quote);
    expect(quotes).toContain("把钱转到安全账户");
    expect(quotes.some((quote) => quote.includes("编造"))).toBe(false);
    expect(result.engine).toBe("rules+llm");
    expect(result.model).toBe("mock");
    expect(result.explanation).toContain("安全账户");
    expect(result.riskLevel).toBe("high");
  });

  it("falls back to the rules engine when the model fails", async () => {
    const result = await analyzeScamHybrid({
      inputType: "text",
      text: input,
      modelRouter: new StubModelRouter(new Error("timeout"))
    });

    expect(result.engine).toBe("rules");
    expect(result.riskLevel).toBe("high");
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.explanation).toContain("规则引擎");
  });

  it("merges knowledge-base sources into the evidence chain", async () => {
    const result = await analyzeScamHybrid({
      inputType: "text",
      text: input,
      modelRouter: new StubModelRouter(new Error("timeout")),
      knowledge: [
        {
          id: "af_police",
          title: "冒充公检法",
          summary: "自称警察并要求转入安全账户。",
          actions: ["挂断并拨打 96110"],
          source: { title: "国家反诈中心", url: "https://www.mps.gov.cn" },
          score: 2
        }
      ]
    });

    expect(result.sources.some((source) => source.title === "国家反诈中心")).toBe(true);
  });
});

describe("scam image analysis", () => {
  it("returns a high-risk fixture in mock mode", async () => {
    const result = await analyzeScamImage({
      buffer: Buffer.from("not-a-real-image"),
      mime: "image/webp",
      modelRouter: new MockModelProvider()
    });
    expect(result.riskLevel).toBe("high");
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.extractedText?.length).toBeGreaterThan(0);
  });
});
