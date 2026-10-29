export type Mode = "elder" | "adult" | "child";

export type LocationSnapshot = {
  elderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  source: string;
  ts: number;
};

export type SafetyAlertSnapshot = {
  id: string;
  elderId: string;
  type: string;
  level: string;
  payload: unknown;
  status: string;
  createdAt: number;
};

export type AppEvent =
  | { type: "privacy.updated"; ts: number; payload: { settings: PrivacySettings } }
  | { type: "profile.updated"; ts: number; payload: { profile: Profile } }
  | { type: "fall.detected"; ts: number; payload: { confidence: number } }
  | { type: "sedentary.detected"; ts: number; payload: { minutes: number } }
  | { type: "reminder.due"; ts: number; payload: { kind: ReminderKind; title: string } }
  | { type: "emergency.triggered"; ts: number; payload: { reason: string } }
  | { type: "qa.answered"; ts: number; payload: { question: string; answer: string } }
  | { type: "vitality.alert"; ts: number; payload: { scores: number[] } }
  | { type: "companion.command"; ts: number; payload: { kind: "voice_message" | "reminder"; content: string; for: "elder" | "child" } }
  | { type: "safety.alert"; ts: number; payload: { alert: SafetyAlertSnapshot } }
  | { type: "safety.alert.updated"; ts: number; payload: { alert: SafetyAlertSnapshot } }
  | { type: "location.updated"; ts: number; payload: { elderId: string; point: LocationSnapshot } }
  | { type: "family.confirm.requested"; ts: number; payload: { confirm: unknown } }
  | { type: "family.confirm.responded"; ts: number; payload: { confirm: unknown } }
  | { type: "family.message"; ts: number; payload: { elderId: string; familyUserId: string; messageId: string } }
  | { type: "elder.message"; ts: number; payload: { elderId: string; familyUserId: string; messageId: string } };

export type PrivacySettings = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  autoSleepSeconds: number;
  cloudSyncEnabled: boolean;
  allowDataExport: boolean;
  autoSpeakEnabled: boolean;
  autoSpeakWeather: boolean;
};

export type Contact = {
  name: string;
  phone?: string | undefined;
  wechat?: string | undefined;
};

export type UserAddress = {
  id: string;
  label?: string | undefined;
  province: string;
  city: string;
  district: string;
  detail?: string | undefined;
  fullText?: string | undefined;
};

export type Profile = {
  displayName: string;
  gender: "male" | "female" | "other";
  age: number;
  ageGroup?: "child" | "adult" | "senior" | undefined;
  heightCm?: number | undefined;
  weightKg?: number | undefined;
  birthYear?: number | undefined;
  allergies?: string[] | undefined;
  conditions?: string[] | undefined;
  emergencyContacts?: Contact[] | undefined;
  addresses?: UserAddress[] | undefined;
  defaultAddressId?: string | undefined;
  avatarUrl?: string | undefined;
};

export type UserInfo = Profile & {
  id: string;
  createdAt: number;
  updatedAt: number;
};

export type ReminderKind = "medicine" | "exercise" | "selfcheck" | "water";

export type TrendMetric = {
  type: string;
  value: number;
  ts: number;
  source: string;
};

export type WearableVendor = "huawei" | "xiaomi" | "generic";

export type WearablesStatus = {
  connected: Record<WearableVendor, boolean>;
  lastImport?: { vendor: WearableVendor; ts: number };
  lastMetrics?: Record<string, unknown>;
};

export type WeatherToday = {
  city: string;
  summary: string;
  tempC: number | null;
  hiC: number | null;
  loC: number | null;
  updatedAt: number;
};

export type WeatherRealtime = {
  location: { province: string; city: string; district: string; detail?: string | undefined };
  summary: string;
  tempC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  observedAt: number;
};

export type WeatherHourly = {
  ts: number;
  tempC: number | null;
  precipPct: number | null;
  summary: string;
};

export type WeatherForecast24h = {
  location: { province: string; city: string; district: string; detail?: string | undefined };
  hours: WeatherHourly[];
  updatedAt: number;
};
