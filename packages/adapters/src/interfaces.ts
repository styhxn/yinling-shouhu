import type { Profile, ReminderKind } from "@eha/shared";

export type QaAskInput = {
  question: string;
  profile: Profile | null;
};

export interface IQaEngine {
  ask(input: QaAskInput): Promise<string>;
}

export interface IWakeWordEngine {
  start(input: { wakeWord: string; onWake: () => void }): Promise<void>;
  stop(): Promise<void>;
}

export interface IASREngine {
  recognizeOnce(input?: { lang?: string }): Promise<{ text: string; confidence?: number }>;
}

export interface ITTSEngine {
  speak(input: { text: string; lang?: string; rate?: number }): Promise<void>;
  stop(): Promise<void>;
}

export interface IFallDetector {
  start(input: { onFall: (event: { confidence: number }) => void }): Promise<void>;
  stop(): Promise<void>;
}

export interface ISedentaryDetector {
  start(input: { minutesThreshold: number; onSedentary: (event: { minutes: number }) => void }): Promise<void>;
  stop(): Promise<void>;
}

export interface IGestureOrMotionDetector {
  start(input: { onGesture: (event: { name: string; confidence: number }) => void }): Promise<void>;
  stop(): Promise<void>;
}

export interface IWearableConnector {
  import(input: { vendor: "huawei" | "xiaomi" | "generic"; payload: unknown }): Promise<Record<string, unknown>>;
  sync?(input: { vendor: "huawei" | "xiaomi" }): Promise<Record<string, unknown>>;
}

export interface ICloudSyncAdapter {
  upload(input: { data: unknown }): Promise<{ ok: boolean }>;
  download(): Promise<{ ok: boolean; data: unknown | null }>;
}

export interface IRobotActuator {
  setExpression(name: string): Promise<void>;
  playGesture(name: string): Promise<void>;
  setLight(mode: "normal" | "alert" | "sleep"): Promise<void>;
}

export interface IAdviceEngine {
  generateAdvice(input: {
    profile: Profile | null;
    wearableMetrics: Record<string, unknown>;
    symptomsText?: string;
  }): Promise<{ riskLevel: "low" | "medium" | "high"; advice: string[] }>;
}

export interface IReminderScheduler {
  schedule(input: { kind: ReminderKind; title: string; atTs: number }): Promise<void>;
}

export interface IEmergencyNotifier {
  trigger(input: { reason: string; profile: Profile | null }): Promise<{ ok: boolean }>;
}
