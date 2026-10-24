import { describe, expect, it } from "vitest";
import type { AppEvent } from "@eha/shared";
import type { SessionUser } from "./services/auth/types.js";
import { canReceiveEvent } from "./routes/ws.js";

const elder: SessionUser = { userId: "u_elder", role: "elder", elderId: "e_li", exp: Date.now() + 1000 };
const family: SessionUser = { userId: "u_family", role: "family", exp: Date.now() + 1000 };
const admin: SessionUser = { userId: "u_admin", role: "admin", exp: Date.now() + 1000 };

function alert(elderId: string): AppEvent {
  return {
    type: "safety.alert",
    ts: Date.now(),
    payload: { alert: { id: "a1", elderId } }
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
});
