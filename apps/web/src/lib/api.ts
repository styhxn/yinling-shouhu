import { httpJson } from "./http.js";
import type {
  AgentTool,
  AntiFraudHit,
  CoolingOff,
  FamilyConfirm,
  InterviewAnswer,
  InterviewStart,
  MeResponse,
  MemoryItem,
  Role,
  ScamResult,
  StoryBook,
  StoryChapter,
  UploadResult
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
    demoLogin(role: Role) {
      return httpJson<MeResponse>("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ role })
      });
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
    }
  },

  memory: {
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
