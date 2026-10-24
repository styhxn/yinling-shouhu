import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

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
    for (let i = 0; i < started.maxTurns; i += 1) {
      const answer = await server.inject({
        method: "POST",
        url: `/api/memory/interview/${started.interviewId}/answer`,
        headers: { cookie: elderCookie },
        payload: { text: `第 ${i + 1} 段回忆，小时候在河边和邻居一起玩。` }
      });
      expect(answer.statusCode).toBe(200);
      const body = answer.json() as any;
      if (body.done) memory = body.memory;
    }

    expect(memory).toBeTruthy();
    expect(memory.transcript).toContain("问：");
    expect(memory.transcript).toContain("答：");

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

    const detail = await server.inject({
      method: "GET",
      url: `/api/memory/story/${storyBody.chapter.id}`,
      headers: { cookie: elderCookie }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().book.elderId).toBe("e_li");
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
