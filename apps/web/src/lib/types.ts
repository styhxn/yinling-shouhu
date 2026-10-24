export type Role = "elder" | "family" | "institution" | "admin";

export type MeResponse = {
  user: {
    id: string;
    role: Role;
    displayName: string;
    elderId: string | null;
  };
  elder: {
    id: string;
    displayName: string;
    birthYear: number | null;
    gender: string | null;
  } | null;
  familyLinks: { elderId: string; relation: string | null }[];
};

export type MemoryItem = {
  id: string;
  elderId: string;
  title: string;
  timeRange: string | null;
  place: string | null;
  people: string[];
  tags: string[];
  photoIds: string[];
  transcript: string;
  summary: string | null;
  visibility: "private" | "family" | "public" | string;
  consent: boolean;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export type StoryChapter = {
  id: string;
  bookId: string;
  title: string;
  memoryIds: string[];
  content: string;
  audioUrl: string | null;
  orderIndex: number;
  status: string;
  familyNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StoryBook = {
  id: string;
  elderId: string;
  title: string;
  coverUploadId: string | null;
  shareToken: string | null;
  createdAt: number;
};

export type ScamResult = {
  riskLevel: "high" | "medium" | "low" | "unknown";
  scamType: string;
  confidence: number;
  redFlags: { quote: string; reason: string }[];
  actions: string[];
  questionsToAsk: string[];
  sources: { title: string; url: string }[];
  disclaimer: string;
  extractedText?: string;
};

export type AntiFraudHit = {
  id: string;
  title: string;
  summary: string;
  actions: string[];
  source: { title: string; url: string };
  score: number;
};

export type FamilyConfirm = {
  id: string;
  elderId: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: number;
};

export type CoolingOff = {
  id: string;
  elderId: string;
  status: string;
  riskLevel: string;
  questions: string[];
  familyConfirmId: string | null;
  startedAt: number;
  expiresAt: number;
};

export type UploadResult = {
  upload: {
    id: string;
    url: string;
    mime: string;
    width: number | null;
    height: number | null;
    size: number;
  };
};

export type AgentTool = {
  name: string;
  description: string;
  risk: "read" | "write" | "high";
  requiresConfirmation: boolean;
};

export type ToolEvent = {
  id: string;
  name: string;
  args?: unknown;
  risk?: "read" | "write" | "high";
  ok?: boolean;
  summary?: string;
  latencyMs?: number;
  status: "running" | "done" | "error";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents: ToolEvent[];
  riskLevel?: "low" | "medium" | "high";
  time: string;
  error?: boolean;
};

export type PendingConfirmation = {
  id: string;
  tool: string;
  summary: string;
  risk: "high";
  expiresAt: number;
};

export type InterviewStart = {
  ok: boolean;
  interviewId: string;
  question: string;
  turn: number;
  maxTurns: number;
};

export type InterviewAnswer = {
  ok: boolean;
  done: boolean;
  question: string | null;
  turn?: number;
  maxTurns?: number;
  memory?: MemoryItem;
};
