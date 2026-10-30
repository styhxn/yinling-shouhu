import { httpBlob, httpJson } from "./http.js";
import type {
  AgentBriefResponse,
  AgentTool,
  AgentTraceResponse,
  AntiFraudHit,
  AuthMeta,
  CoolingOff,
  CreateElderResponse,
  DietCheckResult,
  DietPlan,
  FamilyConfirm,
  FamilyMessage,
  FamilySummary,
  ElderMessage,
  Geofence,
  HealthProfile,
  HelpHomeCard,
  InterviewAnswer,
  InterviewStart,
  LocationPoint,
  Medication,
  MedicationLog,
  MedicationSafety,
  MedicationScanResult,
  MeResponse,
  MemoryItem,
  MemoryProfileResponse,
  MissingPosterResult,
  Role,
  RoleplayReport,
  RoleplayScenario,
  SafetyAlert,
  ScamResult,
  StoryBook,
  StoryChapter,
  UploadResult,
  WeeklyReport
} from "./types.js";

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  auth: {
    meta() {
      return httpJson<AuthMeta>("/auth/meta");
    },
    demoLogin(role: Role) {
      return httpJson<MeResponse>("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ role })
      });
    },
    requestFamilyCode(phone: string) {
      return httpJson<{ ok: true; expiresAt: number; demoCode?: string }>("/auth/family/request-code", {
        method: "POST",
        body: JSON.stringify({ phone })
      });
    },
    familyLogin(phone: string, code: string, displayName?: string) {
      return httpJson<MeResponse>("/auth/family/login", {
        method: "POST",
        body: JSON.stringify({ phone, code, displayName })
      });
    },
    bindElder(code: string) {
      return httpJson<MeResponse>("/auth/elder/bind", {
        method: "POST",
        body: JSON.stringify({ code })
      });
    },
    switchElder(elderId: string) {
      return httpJson<MeResponse>("/auth/switch-elder", {
        method: "POST",
        body: JSON.stringify({ elderId })
      });
    },
    createElder(input: {
      displayName: string;
      relation?: string;
      birthYear?: number;
      gender?: "female" | "male" | "other";
    }) {
      return httpJson<CreateElderResponse>("/auth/family/elders", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    regenerateInvite(elderId: string) {
      return httpJson<{ ok: true; invite: { code: string; expiresAt: number } }>(
        `/auth/family/elders/${encodeURIComponent(elderId)}/invite`,
        { method: "POST", body: JSON.stringify({}) }
      );
    },
    me() {
      return httpJson<MeResponse>("/me");
    },
    logout() {
      return httpJson<{ ok: true }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
    }
  },

  agent: {
    tools() {
      return httpJson<{ tools: AgentTool[] }>("/agent/tools");
    },
    brief(params: { elderId?: string; refresh?: boolean } = {}) {
      return httpJson<AgentBriefResponse>(
        `/agent/brief${query({
          elderId: params.elderId,
          refresh: params.refresh ? "1" : undefined
        })}`
      );
    },
    trace(id: string) {
      return httpJson<AgentTraceResponse>(`/agent/traces/${id}`);
    },
    traces(params: { elderId?: string; limit?: number } = {}) {
      return httpJson<{ ok: boolean; items: AgentTraceResponse["trace"][] }>(
        `/agent/traces${query({
          elderId: params.elderId,
          limit: params.limit ? String(params.limit) : undefined
        })}`
      );
    }
  },

  memory: {
    profile(params: { elderId?: string; refresh?: boolean } = {}) {
      return httpJson<MemoryProfileResponse>(
        `/memory/profile${query({
          elderId: params.elderId,
          refresh: params.refresh ? "1" : undefined
        })}`
      );
    },
    list(params: { elderId?: string; q?: string } = {}) {
      return httpJson<{ items: MemoryItem[]; nextCursor: null }>(
        `/memory/items${query(params)}`
      );
    },
    create(input: Record<string, unknown>) {
      return httpJson<{ item: MemoryItem }>("/memory/items", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    startInterview(input: { topic?: string; photoId?: string } = {}) {
      return httpJson<InterviewStart>("/memory/interview/start", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    answer(interviewId: string, text: string) {
      return httpJson<InterviewAnswer>(`/memory/interview/${interviewId}/answer`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
    },
    generateStory(input: { memoryIds: string[]; style?: string; elderId?: string }) {
      return httpJson<{ ok: boolean; chapter: StoryChapter; book: StoryBook }>(
        "/memory/story/generate",
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    getStory(id: string) {
      return httpJson<{ ok: boolean; chapter: StoryChapter; book: StoryBook }>(
        `/memory/story/${id}`
      );
    },
    listStories(elderId?: string) {
      return httpJson<{ ok: boolean; book: StoryBook | null; chapters: StoryChapter[] }>(
        `/memory/story${query({ elderId })}`
      );
    },
    exportStory(elderId?: string) {
      return httpBlob(`/memory/story/export${query({ elderId })}`);
    }
  },

  safety: {
    checkScam(input: {
      inputType: "text" | "url" | "image";
      text?: string;
      url?: string;
      imageId?: string;
    }) {
      return httpJson<{ ok: boolean; result: ScamResult; related: AntiFraudHit[] }>(
        "/safety/scam/check",
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    antiFraudSearch(queryText: string) {
      return httpJson<{ ok: boolean; items: AntiFraudHit[] }>("/safety/anti-fraud/search", {
        method: "POST",
        body: JSON.stringify({ query: queryText })
      });
    },
    startCoolingOff(input: {
      amount?: number;
      counterparty?: string;
      reason?: string;
    } = {}) {
      return httpJson<{ ok: boolean; coolingOff: CoolingOff; familyConfirm: FamilyConfirm }>(
        "/safety/cooling-off",
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    respondCoolingOff(id: string, action: "cancel" | "continue") {
      return httpJson<{ ok: boolean; coolingOff: CoolingOff }>(
        `/safety/cooling-off/${id}/respond`,
        {
          method: "POST",
          body: JSON.stringify({ action })
        }
      );
    },
    pendingConfirms(elderId?: string) {
      return httpJson<{ items: FamilyConfirm[] }>(
        `/safety/confirm/pending${query({ elderId })}`
      );
    },
    respondConfirm(id: string, decision: "approved" | "denied", note?: string) {
      return httpJson<{ ok: boolean; confirm: FamilyConfirm }>(
        `/safety/confirm/${id}/respond`,
        {
          method: "POST",
          body: JSON.stringify({ decision, ...(note ? { note } : {}) })
        }
      );
    },
    geofences(elderId?: string) {
      return httpJson<{ items: Geofence[] }>(`/safety/geofence${query({ elderId })}`);
    },
    createGeofence(input: {
      elderId?: string;
      name: string;
      shape: { type: "circle"; center: [number, number]; radius: number };
      notifyOn?: ("exit" | "enter")[];
    }) {
      return httpJson<{ ok: boolean; geofence: Geofence }>("/safety/geofence", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    updateGeofence(id: string, input: Record<string, unknown>) {
      return httpJson<{ ok: boolean; geofence: Geofence }>(`/safety/geofence/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
    },
    deleteGeofence(id: string) {
      return httpJson<{ ok: boolean }>(`/safety/geofence/${id}`, { method: "DELETE" });
    },
    reportLocation(input: {
      elderId?: string;
      lat: number;
      lng: number;
      accuracy?: number;
      source?: "browser" | "demo" | "wearable";
    }) {
      return httpJson<{
        ok: boolean;
        point: LocationPoint;
        inside: boolean;
        alerts: SafetyAlert[];
      }>("/safety/location", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    latestLocation(elderId?: string) {
      return httpJson<{ point: LocationPoint | null }>(
        `/safety/location/latest${query({ elderId })}`
      );
    },
    helpHome(input: { elderId?: string; lat?: number; lng?: number } = {}) {
      return httpJson<{ ok: boolean; card: HelpHomeCard; alertId: string }>(
        "/safety/help-home",
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    locationHistory(elderId?: string, from?: number, to?: number) {
      const search = new URLSearchParams();
      if (elderId) search.set("elderId", elderId);
      if (from) search.set("from", String(from));
      if (to) search.set("to", String(to));
      const text = search.toString();
      return httpJson<{ points: LocationPoint[] }>(
        `/safety/location/history${text ? `?${text}` : ""}`
      );
    },
    alerts(elderId?: string, status?: string) {
      const search = new URLSearchParams();
      if (elderId) search.set("elderId", elderId);
      if (status) search.set("status", status);
      const text = search.toString();
      return httpJson<{ items: SafetyAlert[] }>(`/safety/alerts${text ? `?${text}` : ""}`);
    },
    ackAlert(id: string, status: "ack" | "resolved" = "ack") {
      return httpJson<{ ok: boolean }>(`/safety/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
    },
    createMissingPoster(input: {
      elderId?: string;
      lastSeenText: string;
      lastSeenTs?: number;
      clothing?: string;
      contact: string;
    }) {
      return httpJson<{ ok: boolean; poster: MissingPosterResult }>(
        "/safety/missing-poster",
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    roleplayScenarios() {
      return httpJson<{ items: RoleplayScenario[] }>("/safety/roleplay/scenarios");
    },
    startRoleplay(scenarioId: string) {
      return httpJson<{
        ok: boolean;
        sessionId: string;
        message: string;
        turn: number;
        maxTurns: number;
        scenario: { id: string; title: string; subtitle: string; maxTurns: number };
      }>("/safety/roleplay/start", {
        method: "POST",
        body: JSON.stringify({ scenarioId })
      });
    },
    roleplayTurn(id: string, text: string) {
      return httpJson<{
        ok: boolean;
        done: boolean;
        reply: string;
        tactic?: string;
        turn?: number;
        maxTurns?: number;
        report?: RoleplayReport;
      }>(`/safety/roleplay/${id}/turn`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
    },
    endRoleplay(id: string) {
      return httpJson<{ ok: boolean; report: RoleplayReport }>(
        `/safety/roleplay/${id}/end`,
        {
          method: "POST",
          body: JSON.stringify({})
        }
      );
    }
  },

  family: {
    summary(elderId?: string) {
      return httpJson<{ ok: boolean; summary: FamilySummary }>(
        `/family/summary${query({ elderId })}`
      );
    },
    weeklyReport(elderId?: string) {
      return httpJson<{ ok: boolean; report: WeeklyReport }>(
        `/family/report/weekly${query({ elderId })}`
      );
    },
    members() {
      return httpJson<{
        ok: boolean;
        members: { familyUserId: string; displayName: string; relation: string | null; phone: string | null }[];
      }>(`/family/members`);
    },
    sendMessage(input: { familyUserId: string; content: string; kind?: string }) {
      return httpJson<{ ok: boolean; messageId: string }>(`/family/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
    },
    messages() {
      return httpJson<{ ok: boolean; items: FamilyMessage[] }>(`/family/messages`);
    },
    sendToElder(input: { elderId: string; content: string; kind?: string }) {
      return httpJson<{ ok: boolean; messageId: string }>(`/family/elder/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
    }
  },

  elderMessages: {
    list() {
      return httpJson<{ ok: boolean; items: ElderMessage[] }>(`/family/elder/messages`);
    }
  },

  medications: {
    list(elderId?: string) {
      return httpJson<{
        items: Medication[];
        logs: MedicationLog[];
        dueToday: number;
        takenToday: number;
        logged: number;
        adherencePct: number | null;
        safety: MedicationSafety;
      }>(`/medications${query({ elderId })}`);
    },
    create(input: {
      elderId?: string;
      name: string;
      genericName?: string;
      spec?: string;
      dosage?: string;
      schedule: { time: string }[];
      notes?: string;
    }) {
      return httpJson<{ ok: boolean; medication: Medication }>("/medications", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    update(id: string, input: Record<string, unknown>) {
      return httpJson<{ ok: boolean; medication: Medication }>(`/medications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
    },
    remove(id: string) {
      return httpJson<{ ok: boolean }>(`/medications/${id}`, { method: "DELETE" });
    },
    scan(imageId: string) {
      return httpJson<{ ok: boolean; result: MedicationScanResult }>("/medications/scan", {
        method: "POST",
        body: JSON.stringify({ imageId })
      });
    },
    log(medicationId: string, status: "taken" | "skipped" | "late", time?: string) {
      return httpJson<{ ok: boolean; log: MedicationLog }>("/medications/log", {
        method: "POST",
        body: JSON.stringify({ medicationId, status, ...(time ? { time } : {}) })
      });
    },
    logs(elderId?: string, from?: number, to?: number) {
      const search = new URLSearchParams();
      if (elderId) search.set("elderId", elderId);
      if (from) search.set("from", String(from));
      if (to) search.set("to", String(to));
      const text = search.toString();
      return httpJson<{ items: MedicationLog[] }>(
        `/medications/logs${text ? `?${text}` : ""}`
      );
    }
  },

  healthProfile: {
    get(elderId?: string) {
      return httpJson<{ ok: boolean; profile: HealthProfile }>(
        `/health/profile${query({ elderId })}`
      );
    },
    update(input: {
      elderId?: string;
      conditions: string[];
      allergies: string[];
      dietNotes?: string | null;
      homeAddress?: string | null;
    }) {
      return httpJson<{ ok: boolean; profile: HealthProfile }>(
        `/health/profile${query({ elderId: input.elderId })}`,
        {
          method: "PUT",
          body: JSON.stringify(input)
        }
      );
    }
  },

  diet: {
    plan(elderId?: string, refresh = false) {
      return httpJson<{ ok: boolean; plan: DietPlan }>(
        `/diet/plan${query({ elderId, refresh: refresh ? "1" : undefined })}`
      );
    },
    check(food: string, elderId?: string) {
      return httpJson<{ ok: boolean; result: DietCheckResult }>("/diet/check", {
        method: "POST",
        body: JSON.stringify({ food, ...(elderId ? { elderId } : {}) })
      });
    }
  },

  uploads: {
    image(file: File, kind = "scam") {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      return httpJson<UploadResult>("/uploads", {
        method: "POST",
        body: form
      });
    }
  }
};
