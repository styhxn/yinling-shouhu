import { describe, expect, it } from "vitest";
import { analyzeScam } from "./scam.js";

describe("scam rules", () => {
  it("flags impersonation + secrecy as high risk", () => {
    const result = analyzeScam({
      inputType: "text",
      text: "我是警察，你涉嫌洗钱，把钱转到安全账户，不要告诉家里人。"
    });
    expect(result.riskLevel).toBe("high");
    expect(result.scamType).toBe("impersonate_police");
    expect(result.redFlags.length).toBeGreaterThanOrEqual(2);
    expect(result.actions.join("")).toContain("96110");
  });

  it("flags investment withdrawal traps", () => {
    const result = analyzeScam({
      inputType: "text",
      text: "跟着老师做投资，稳赚不赔，提现前先充值 5 万保证金。"
    });
    expect(result.riskLevel).toBe("high");
    expect(result.scamType).toBe("investment");
  });

  it("flags suspicious URLs without fetching them", () => {
    const result = analyzeScam({
      inputType: "url",
      url: "http://192.168.1.10/login"
    });
    expect(result.riskLevel).toBe("medium");
    expect(result.redFlags.length).toBeGreaterThan(0);
  });

  it("returns unknown for a benign message", () => {
    const result = analyzeScam({
      inputType: "text",
      text: "今天下午我去公园散步。"
    });
    expect(result.riskLevel).toBe("unknown");
  });
});
