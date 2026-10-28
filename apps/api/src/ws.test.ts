import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppEvent } from "@eha/shared";
import { createServer } from "./server.js";
import type { SessionUser } from "./services/auth/types.js";
import { canReceiveEvent } from "./routes/ws.js";
import { cookieFrom, testConfig } from "./testUtils.js";

const elder: SessionUser = { userId: "u_elder", role: "elder", elderId: "e_li", exp: Date.now() + 1000 };
const family: SessionUser = { userId: "u_family", role: "family", exp: Date.now() + 1000 };
const admin: SessionUser = { userId: "u_admin", role: "admin", exp: Date.now() + 1000 };

function alert(elderId: string): AppEvent {
  return {
    type: "safety.alert",
    ts: Date.now(),
    payload: {
      alert: {
        id: "a1",
        elderId,
        type: "geofence.exit",
        level: "critical",
        payload: {},
        status: "open",
        createdAt: Date.now()
      }
    }
  };
}

function alertUpdated(elderId: string): AppEvent {
  return {
    type: "safety.alert.updated",
    ts: Date.now(),
    payload: {
      alert: {
        id: "a1",
        elderId,
        type: "geofence.exit",
        level: "critical",
        payload: {},
        status: "ack",
        createdAt: Date.now()
      }
    }
  };
}

function locationUpdated(elderId: string): AppEvent {
  return {
    type: "location.updated",
    ts: Date.now(),
    payload: {
      elderId,
      point: { elderId, lat: 32.04, lng: 118.78, accuracy: 20, source: "browser", ts: Date.now() }
    }
  };
}

function generic(): AppEvent {
  return {
    type: "qa.answered",
    ts: Date.now(),
    payload: { question: "你好", answer: "你好" }
  };
}

describe("websocket event filtering", () => {
  it("lets an elder receive own alerts but not another elder's", () => {
    expect(canReceiveEvent(elder, alert("e_li"), [])).toBe(true);
    expect(canReceiveEvent(elder, alert("e_other"), [])).toBe(false);
  });

  it("lets family receive only linked elders' alerts", () => {
    expect(canReceiveEvent(family, alert("e_li"), ["e_li"])).toBe(true);
    expect(canReceiveEvent(family, alert("e_other"), ["e_li"])).toBe(false);
  });

  it("lets admin receive everything and blocks unauthenticated users", () => {
    expect(canReceiveEvent(admin, alert("e_other"), [])).toBe(true);
    expect(canReceiveEvent(null, generic(), [])).toBe(false);
  });

  it("lets authenticated users receive generic events without elderId", () => {
    expect(canReceiveEvent(elder, generic(), [])).toBe(true);
    expect(canReceiveEvent(family, generic(), ["e_li"])).toBe(true);
  });

  it("scopes location updates and alert updates to the linked elder", () => {
    expect(canReceiveEvent(elder, locationUpdated("e_li"), [])).toBe(true);
    expect(canReceiveEvent(elder, locationUpdated("e_other"), [])).toBe(false);
    expect(canReceiveEvent(family, locationUpdated("e_li"), ["e_li"])).toBe(true);
    expect(canReceiveEvent(family, locationUpdated("e_other"), ["e_li"])).toBe(false);
    expect(canReceiveEvent(family, alertUpdated("e_li"), ["e_li"])).toBe(true);
  });
});

describe("websocket delivery", () => {
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

  it("streams location and alert events to the elder's socket", async () => {
    const socket = await server.injectWS("/ws", { headers: { cookie } });
    const messages: string[] = [];
    socket.on("message", (data: { toString(): string }) => {
      messages.push(data.toString());
    });

    const posted = await server.inject({
      method: "POST",
      url: "/api/safety/location",
      headers: { cookie },
      payload: { lat: 32.12, lng: 118.88, accuracy: 20, source: "browser" }
    });
    expect(posted.statusCode).toBe(200);

    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (
        messages.some((message) => message.includes("location.updated")) &&
        messages.some((message) => message.includes("safety.alert"))
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(messages.some((message) => message.includes("location.updated"))).toBe(true);
    expect(messages.some((message) => message.includes("safety.alert"))).toBe(true);
    socket.close();
  });
});
