import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { MockModelProvider } from "./services/llm/mock.js";
import { analyzeMedicationImage } from "./services/medication/scan.js";
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

describe("geofence and location", () => {
  it("lists the seeded geofence", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/safety/geofence",
      headers: { cookie: elderCookie }
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as any).items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].shape.type).toBe("circle");
  });

  it("creates a geofence exit alert when the demo point is outside", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/location",
      headers: { cookie: elderCookie },
      payload: { lat: 40.0, lng: 116.0, source: "demo" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.inside).toBe(false);
    expect(body.alerts.length).toBeGreaterThanOrEqual(1);

    const familyAlerts = await server.inject({
      method: "GET",
      url: "/api/safety/alerts?elderId=e_li&status=open",
      headers: { cookie: familyCookie }
    });
    expect(familyAlerts.statusCode).toBe(200);
    expect(
      (familyAlerts.json() as any).items.some((item: any) => item.type === "geofence.exit")
    ).toBe(true);
  });

  it("returns latest location and history", async () => {
    const latest = await server.inject({
      method: "GET",
      url: "/api/safety/location/latest",
      headers: { cookie: elderCookie }
    });
    expect(latest.statusCode).toBe(200);
    expect((latest.json() as any).point.lat).toBeCloseTo(40.0);

    const history = await server.inject({
      method: "GET",
      url: "/api/safety/location/history?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(history.statusCode).toBe(200);
    expect((history.json() as any).points.length).toBeGreaterThanOrEqual(1);
  });
});

describe("missing poster", () => {
  it("creates a share link and serves a desensitized poster", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/safety/missing-poster",
      headers: { cookie: familyCookie },
      payload: {
        lastSeenText: "南京市鼓楼区某小区北门",
        clothing: "蓝色外套、深色裤子",
        contact: "138****8888"
      }
    });
    expect(created.statusCode).toBe(200);
    const shareUrl = (created.json() as any).poster.shareUrl as string;
    expect(shareUrl.startsWith("/api/safety/share/")).toBe(true);

    const page = await server.inject({ method: "GET", url: shareUrl });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("寻人");
    expect(page.body).toContain("李奶奶");
    expect(page.body).toContain("拨打 110");
  });
});

describe("medications", () => {
  it("logs a dose and creates/updates/deletes a medication", async () => {
    const list = await server.inject({
      method: "GET",
      url: "/api/medications",
      headers: { cookie: elderCookie }
    });
    expect(list.statusCode).toBe(200);
    const items = (list.json() as any).items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    const log = await server.inject({
      method: "POST",
      url: "/api/medications/log",
      headers: { cookie: elderCookie },
      payload: { medicationId: "med_1", status: "taken" }
    });
    expect(log.statusCode).toBe(200);

    const after = await server.inject({
      method: "GET",
      url: "/api/medications",
      headers: { cookie: elderCookie }
    });
    const afterBody = after.json() as any;
    expect(afterBody.takenToday).toBeGreaterThanOrEqual(1);
    expect(typeof afterBody.adherencePct).toBe("number");

    const created = await server.inject({
      method: "POST",
      url: "/api/medications",
      headers: { cookie: elderCookie },
      payload: {
        name: "阿司匹林",
        spec: "100mg",
        dosage: "每日一次",
        schedule: [{ time: "09:00" }]
      }
    });
    expect(created.statusCode).toBe(200);
    const medicationId = (created.json() as any).medication.id as string;

    const patched = await server.inject({
      method: "PATCH",
      url: `/api/medications/${medicationId}`,
      headers: { cookie: elderCookie },
      payload: { dosage: "每日一次，每次 1 片" }
    });
    expect(patched.statusCode).toBe(200);

    const removed = await server.inject({
      method: "DELETE",
      url: `/api/medications/${medicationId}`,
      headers: { cookie: elderCookie }
    });
    expect(removed.statusCode).toBe(200);
  });

  it("returns a mock scan result without a vision model", async () => {
    const result = await analyzeMedicationImage({
      buffer: Buffer.from("not-a-real-image"),
      mime: "image/webp",
      modelRouter: new MockModelProvider()
    });
    expect(result.name).toBe("氨氯地平");
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe("family summary", () => {
  it("returns a data-backed summary and weekly report", async () => {
    const summary = await server.inject({
      method: "GET",
      url: "/api/family/summary?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json() as any;
    expect(body.summary.elder.displayName).toBe("李奶奶");
    expect(body.summary.location).toBeTruthy();
    expect(body.summary.medications.taken).toBeGreaterThanOrEqual(1);
    expect(typeof body.summary.medications.adherencePct).toBe("number");

    const report = await server.inject({
      method: "GET",
      url: "/api/family/report/weekly?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(report.statusCode).toBe(200);
    const reportBody = report.json() as any;
    expect(reportBody.report.sections.length).toBe(4);
    expect(reportBody.report.suggestions.length).toBeGreaterThan(0);
    expect(reportBody.report.summary.length).toBeGreaterThan(0);
  });
});
