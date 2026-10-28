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

export type StoryFidelity = {
  engine: "rules" | "rules+llm";
  model: string;
  groundingPct: number;
  level: "high" | "medium" | "low";
  verifiedQuotes: { text: string; sourceMemoryId: string; sourceTitle: string }[];
  removedQuotes: string[];
  sources: { id: string; title: string }[];
  warnings: string[];
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
  fidelity: StoryFidelity | null;
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
  explanation?: string;
  engine?: "rules" | "rules+llm" | "vision";
  model?: string;
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

export type Citation = {
  title: string;
  url?: string;
  type?: string;
  id?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents: ToolEvent[];
  citations?: Citation[];
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

export type MemoryInsight = {
  title: string;
  summary: string;
  timeRange: string | null;
  place: string | null;
  people: string[];
  tags: string[];
  engine: "rules" | "rules+llm";
};

export type InterviewStart = {
  ok: boolean;
  interviewId: string;
  topic?: string;
  photoPrompt?: boolean;
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
  adaptive?: boolean;
  focus?: string;
  memory?: MemoryItem;
  insight?: MemoryInsight;
};

export type LocationPoint = {
  elderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  source: string;
  ts: number;
};

export type Geofence = {
  id: string;
  elderId: string;
  name: string;
  shape: { type: "circle"; center: [number, number]; radius: number };
  schedule: unknown;
  notifyOn: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SafetyAlert = {
  id: string;
  elderId: string;
  type: string;
  level: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: number;
};

export type FamilySummary = {
  elder: { id: string; displayName: string; birthYear: number | null };
  location: LocationPoint | null;
  medications: {
    items: number;
    dueToday: number;
    taken: number;
    logged: number;
    adherencePct: number | null;
  };
  alerts: { open: number; items: SafetyAlert[] };
  pendingConfirms: number;
  memoryCount: number;
};

export type WeeklyReport = {
  period: { from: number; to: number };
  elder: { id: string; displayName: string };
  adherencePct: number | null;
  summary: string;
  sections: { title: string; content: string }[];
  suggestions: string[];
  disclaimer: string;
};

export type Medication = {
  id: string;
  elderId: string;
  name: string;
  genericName: string | null;
  spec: string | null;
  dosage: string | null;
  schedule: { time: string }[];
  notes: string | null;
};

export type MedicationLog = {
  id: string;
  medicationId: string;
  elderId: string;
  status: "taken" | "skipped" | "late";
  scheduledTime: string | null;
  ts: number;
};

export type MedicationScanResult = {
  name: string;
  genericName: string | null;
  spec: string | null;
  dosage: string | null;
  confidence: number;
  warnings: string[];
  contraindications: string[];
  sources: { title: string; url: string }[];
  disclaimer: string;
};

export type MissingPosterResult = {
  id: string;
  shareUrl: string;
  expiresAt: number;
};

export type RoleplayScenario = {
  id: string;
  title: string;
  subtitle: string;
  opener: string;
  maxTurns: number;
};

export type RoleplayMessage = {
  role: "scammer" | "elder";
  text: string;
  ts: number;
  tactic?: string;
};

export type RoleplayReport = {
  scenario: { id: string; title: string };
  total: number;
  level: string;
  summary: string;
  tacticSummary: string;
  dimensions: { name: string; score: number; comment: string; evidence: string }[];
  redFlags: string[];
  advice: string[];
  nextSteps: string[];
  transcript: RoleplayMessage[];
  disclaimer: string;
};
