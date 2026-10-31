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
  familyLinks: { elderId: string; elderName: string; relation: string | null }[];
};

export type AuthMeta = {
  demoMode: boolean;
  demoFamilyCode: string | null;
};

export type FamilyInvite = {
  code: string;
  expiresAt: number;
};

export type CreateElderResponse = {
  ok: true;
  elder: {
    id: string;
    displayName: string;
    birthYear: number | null;
    gender: string | null;
  };
  invite: FamilyInvite;
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

export type FamilyMessage = {
  id: string;
  elderId: string;
  elderName: string;
  fromRole: Role;
  content: string;
  kind: string;
  read: boolean;
  createdAt: number;
};

export type ElderMessage = {
  id: string;
  elderId: string;
  familyName: string;
  fromRole: Role;
  content: string;
  kind: string;
  read: boolean;
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
  traceId?: string;
  time: string;
  error?: boolean;
};

export type AgentAction = {
  label: string;
  kind: "link" | "call" | "confirm" | "tool";
  href?: string;
  tool?: string;
};

export type AgentBriefItem = {
  title: string;
  detail: string;
  priority: "now" | "today" | "later";
  actionLabel?: string;
  href?: string;
};

export type AgentBrief = {
  date: string;
  greeting: string;
  summary: string;
  items: AgentBriefItem[];
  encouragement: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  engine: "rules" | "rules+llm";
  model: string;
  traceId: string | null;
  generatedAt: number;
};

export type AgentBriefResponse = {
  ok: boolean;
  brief: AgentBrief;
  cached: boolean;
};

export type AgentTraceStep = {
  index: number;
  type: "plan" | "tool_call" | "tool_result" | "decision" | "error";
  label: string;
  detail?: string;
  tool?: string;
  args?: unknown;
  ok?: boolean;
  latencyMs?: number;
};

export type AgentDecision = {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  needsConfirmation: boolean;
  escalation: "none" | "family" | "emergency";
  facts: string[];
  actions: AgentAction[];
  briefItems?: AgentBriefItem[];
  explanation: string;
  citations: Citation[];
  engine: "rules" | "rules+llm";
  model: string;
};

export type AgentTrace = {
  id: string;
  elderId: string;
  userId: string;
  agent: "companion" | "guardian" | "family" | string;
  trigger: "user" | "schedule" | "event" | "family" | "system" | string;
  goal: string;
  status: "ok" | "needs_confirmation" | "error";
  decision: AgentDecision | null;
  steps: AgentTraceStep[];
  citations: Citation[];
  model: string;
  latencyMs: number;
  createdAt: number;
};

export type AgentTraceResponse = {
  ok: boolean;
  trace: AgentTrace;
};

export type MemoryProfile = {
  summary: string;
  people: { name: string; relation?: string; note?: string }[];
  places: { name: string; note?: string }[];
  routines: string[];
  preferences: string[];
  sensitivities: string[];
  engine: "rules" | "rules+llm";
  model: string;
  updatedAt: number;
};

export type MemoryProfileResponse = {
  ok: boolean;
  profile: MemoryProfile;
  sourceCount: number;
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
  address?: string | null;
  live?: boolean;
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

export type AlertAssessment = {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  needsConfirmation: boolean;
  escalation: "none" | "family" | "emergency";
  likelyCause: string;
  actions: AgentAction[];
  traceId: string;
  engine: "rules" | "rules+llm";
  model: string;
  generatedAt: number;
};

export type SafetyAlert = {
  id: string;
  elderId: string;
  type: string;
  level: string;
  payload: Record<string, unknown> & { assessment?: AlertAssessment };
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

export type HealthProfile = {
  elderId: string;
  conditions: string[];
  allergies: string[];
  dietNotes: string | null;
  homeAddress: string | null;
  updatedAt: number;
};

export type DietSource = { title: string; url?: string };

export type DietMeal = {
  meal: "早餐" | "午餐" | "晚餐";
  dishes: string[];
  reason: string;
};

export type DietPlan = {
  headline: string;
  encouragement: string;
  meals: DietMeal[];
  avoid: { food: string; reason: string }[];
  medicationCautions: { medication: string; food: string; advice: string }[];
  hydration: string;
  questions: string[];
  sources: DietSource[];
  personalNote?: string;
  engine: "rules" | "rules+llm";
  model: string;
};

export type DietCheckResult = {
  verdict: "avoid" | "limit" | "ok" | "unknown";
  hits: {
    id: string;
    verdict: "avoid" | "limit" | "ok";
    food: string;
    title: string;
    reason: string;
    advice: string;
    source: DietSource;
  }[];
  headline: string;
  advice: string;
  alternatives: string[];
  questions: string[];
  sources: DietSource[];
  engine: "rules" | "rules+llm";
  model: string;
};

export type MedicationSafety = {
  warnings: {
    id: string;
    level: "avoid" | "caution" | "info";
    title: string;
    detail: string;
    drugs: string[];
    foods?: string[];
    source: { title: string; url?: string };
  }[];
  foodCautions: {
    medication: string;
    food: string;
    level: "avoid" | "caution" | "info";
    advice: string;
    source: { title: string; url?: string };
  }[];
  missedDose: string[];
  disclaimer: string;
};

export type HelpHomeCard = {
  homeName: string;
  homeAddress: string | null;
  currentAddress: string | null;
  distanceMeters: number | null;
  direction: string | null;
  walkMinutes: number | null;
  steps: string[];
  familyPhone: string | null;
  familyRelation: string | null;
  lastLocation: { lat: number; lng: number; accuracy: number | null; ts: number } | null;
  locationSource: string | null;
  locationLive: boolean;
  spoken: string;
  disclaimer: string;
};
