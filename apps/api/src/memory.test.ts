import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { createStoryService } from "./services/memory/story.js";
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

describe("memory", () => {
  it("runs a full interview, creates a memory and a story chapter", async () => {
    const start = await server.inject({
      method: "POST",
      url: "/api/memory/interview/start",
      headers: { cookie: elderCookie },
      payload: { topic: "童年" }
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as {
      interviewId: string;
      question: string;
      turn: number;
      maxTurns: number;
    };
    expect(started.question.length).toBeGreaterThan(0);
    expect(started.maxTurns).toBe(5);

    let memory: any = null;
    let adaptiveQuestions = 0;
    for (let i = 0; i < started.maxTurns; i += 1) {
      const answer = await server.inject({
        method: "POST",
        url: `/api/memory/interview/${started.interviewId}/answer`,
        headers: { cookie: elderCookie },
        payload: { text: `第 ${i + 1} 段回忆，小时候在河边和邻居一起玩。` }
      });
      expect(answer.statusCode).toBe(200);
      const body = answer.json() as any;
      if (body.adaptive) adaptiveQuestions += 1;
      if (body.done) memory = body.memory;
    }

    expect(adaptiveQuestions).toBeGreaterThan(0);
    expect(memory).toBeTruthy();
    expect(memory.transcript).toContain("问：");
    expect(memory.transcript).toContain("答：");
    expect(memory.title).toContain("回忆");
    expect(memory.summary.length).toBeGreaterThan(5);

    const list = await server.inject({
      method: "GET",
      url: "/api/memory/items",
      headers: { cookie: elderCookie }
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as any).items.length).toBeGreaterThanOrEqual(1);

    const story = await server.inject({
      method: "POST",
      url: "/api/memory/story/generate",
      headers: { cookie: elderCookie },
      payload: { memoryIds: [memory.id] }
    });
    expect(story.statusCode).toBe(200);
    const storyBody = story.json() as any;
    expect(storyBody.chapter.content.length).toBeGreaterThan(10);
    expect(storyBody.chapter.fidelity.engine).toBe("rules+llm");
    expect(storyBody.chapter.fidelity.groundingPct).toBeGreaterThan(0);
    expect(storyBody.chapter.fidelity.verifiedQuotes.length).toBeGreaterThan(0);
    expect(storyBody.chapter.fidelity.sources.length).toBeGreaterThan(0);

    const detail = await server.inject({
      method: "GET",
      url: `/api/memory/story/${storyBody.chapter.id}`,
      headers: { cookie: elderCookie }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().book.elderId).toBe("e_li");

    const exported = await server.inject({
      method: "GET",
      url: "/api/memory/story/export",
      headers: { cookie: elderCookie }
    });
    expect(exported.statusCode).toBe(200);
    expect(String(exported.headers["content-type"])).toContain("text/html");
    expect(String(exported.headers["content-disposition"])).toContain("attachment");
    expect(exported.body).toContain("家庭记忆册");
    expect(exported.body).toContain("根据长辈口述整理");
    expect(exported.body).toContain("口述原话");
    expect(exported.body).toContain("口述要点保留");

    const anonymous = await server.inject({
      method: "GET",
      url: "/api/memory/story/export"
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("dequotes story lines the elder never said", async () => {
    const memory = await server.db.memories.create({
      elderId: "e_li",
      title: "苏州河边的夏天",
      summary: "小时候住在苏州河边，夏天和邻居下河捉鱼。",
      transcript: "问：小时候住在哪里？\n答：我小时候住在苏州河边，夏天和邻居下河捉鱼。",
      tags: ["童年"],
      consent: true
    });
    const service = createStoryService(
      server.db,
      new StubModelRouter({
        title: "苏州河边的夏天",
        content:
          "我小时候住在苏州河边。\n\n“我小时候住在苏州河边”\n\n“这是模型编出来的一句话”\n\n根据长辈口述整理，家属可修改。"
      })
    );

    const { chapter } = await service.generate({
      elderId: "e_li",
      memoryIds: [memory.id]
    });

    expect(chapter.fidelity?.engine).toBe("rules+llm");
    expect(
      chapter.fidelity?.verifiedQuotes.some((quote) => quote.text.includes("苏州河边"))
    ).toBe(true);
    expect(chapter.fidelity?.removedQuotes).toContain("这是模型编出来的一句话");
    expect(chapter.content).not.toContain("“这是模型编出来的一句话”");
    expect(chapter.fidelity?.groundingPct).toBeGreaterThan(0);
    expect(chapter.fidelity?.warnings.some((warning) => warning.includes("未在口述原文"))).toBe(
      true
    );
  });

  it("keeps most dictated details in an expanded story and flags a loose rewrite", async () => {
    const memory = await server.db.memories.create({
      elderId: "e_li",
      title: "苏州河边的夏天",
      summary: "小时候住在苏州河边，夏天常和邻居下河捉鱼。",
      transcript:
        "问：小时候住在哪里？\n答：我小时候住在苏州河边，夏天常和邻居下河捉鱼。\n\n问：最难忘的是什么？\n答：母亲总在岸上喊我回家吃饭，我假装没听见。",
      tags: ["童年"],
      consent: true
    });
    const faithful = createStoryService(
      server.db,
      new StubModelRouter({
        title: "苏州河边的夏天",
        content:
          "我小时候住在苏州河边，夏天常和邻居下河捉鱼。母亲总在岸上喊我回家吃饭，我假装没听见。后来我才明白，那是她最朴素的牵挂。\n\n根据长辈口述整理，家属可修改。"
      })
    );
    const { chapter } = await faithful.generate({ elderId: "e_li", memoryIds: [memory.id] });
    expect(chapter.fidelity?.groundingPct).toBeGreaterThanOrEqual(80);

    const loose = createStoryService(
      server.db,
      new StubModelRouter({
        title: "在北京的日子",
        content:
          "我小时候住在北京，冬天常去北海公园滑冰，父亲给我买了一双新冰鞋。那段日子过得很快乐。\n\n根据长辈口述整理，家属可修改。"
      })
    );
    const { chapter: looseChapter } = await loose.generate({
      elderId: "e_li",
      memoryIds: [memory.id]
    });
    expect(looseChapter.fidelity?.groundingPct).toBeLessThan(45);
    expect(looseChapter.fidelity?.level).toBe("low");
  });

  it("starts from a photo prompt when a picture is provided", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/memory/interview/start",
      headers: { cookie: elderCookie },
      payload: { topic: "家庭", photoId: "up_demo_photo" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.photoPrompt).toBe(true);
    expect(body.question).toContain("照片");
    expect(body.topic).toBe("家庭");
  });

  it("lets family read the linked elder's memories but not another elder", async () => {
    const allowed = await server.inject({
      method: "GET",
      url: "/api/memory/items?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(allowed.statusCode).toBe(200);

    const denied = await server.inject({
      method: "GET",
      url: "/api/memory/items?elderId=e_other",
      headers: { cookie: familyCookie }
    });
    expect(denied.statusCode).toBe(403);
  });
});
