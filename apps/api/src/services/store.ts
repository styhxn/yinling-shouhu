import path from "node:path";
import fs from "node:fs";
import { decryptJson, encryptJson, loadOrCreateMasterKey } from "./crypto.js";
import type { PrivacySettings, Profile, TrendMetric, UserAddress } from "@eha/shared";
import { DefaultPrivacySettings } from "@eha/shared";

export async function createStore(options: { dataDir?: string; masterKey?: Buffer } = {}) {
  const dataDir = options.dataDir ?? path.resolve(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const masterKey = options.masterKey ?? loadOrCreateMasterKey({ dataDir });
  const storePath = path.join(dataDir, "store.json");
  const tmpPath = path.join(dataDir, "store.json.tmp");

  type FileStore = {
    kv: Record<string, unknown>;
    secret_kv: Record<string, string>;
    metrics: { type: string; value: number; ts: number; source: string }[];
  };

  function readStoreFile(): FileStore {
    try {
      const raw = fs.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(raw) as FileStore;
      return {
        kv: parsed.kv ?? {},
        secret_kv: parsed.secret_kv ?? {},
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : []
      };
    } catch {
      return { kv: {}, secret_kv: {}, metrics: [] };
    }
  }

  function writeStoreFile(next: FileStore) {
    const json = JSON.stringify({ ...next, metrics: [] });
    fs.writeFileSync(tmpPath, json, "utf8");
    fs.renameSync(tmpPath, storePath);
  }

  let fileStore = readStoreFile();

  if (!fileStore.secret_kv["metrics.v1"] && fileStore.metrics.length > 0) {
    const legacy = fileStore.metrics;
    fileStore = { ...fileStore, metrics: [] };
    setSecretJson("metrics.v1", legacy);
  }

  function getJson<T>(key: string): T | null {
    const v = fileStore.kv[key];
    if (typeof v === "undefined") return null;
    return v as T;
  }

  function setJson(key: string, value: unknown) {
    fileStore = { ...fileStore, kv: { ...fileStore.kv, [key]: value } };
    writeStoreFile(fileStore);
  }

  function getSecretJson<T>(key: string): T | null {
    const blob = fileStore.secret_kv[key];
    if (!blob) return null;
    return decryptJson<T>(masterKey, blob);
  }

  function setSecretJson(key: string, value: unknown) {
    const blob = encryptJson(masterKey, value);
    fileStore = { ...fileStore, secret_kv: { ...fileStore.secret_kv, [key]: blob } };
    writeStoreFile(fileStore);
  }

  function deleteSecretKey(key: string) {
    if (!fileStore.secret_kv[key]) return;
    const next = { ...fileStore.secret_kv };
    delete next[key];
    fileStore = { ...fileStore, secret_kv: next };
    writeStoreFile(fileStore);
  }

  async function getPrivacySettings(): Promise<PrivacySettings> {
    const existing = getSecretJson<PrivacySettings>("privacy.settings") ?? getJson<PrivacySettings>("privacy.settings");
    return existing ? { ...DefaultPrivacySettings, ...existing } : DefaultPrivacySettings;
  }

  async function setPrivacySettings(settings: PrivacySettings) {
    setSecretJson("privacy.settings", settings);
  }

  async function getProfile(): Promise<Profile | null> {
    const personal = getSecretJson<Partial<Profile>>("user.profile.personal");
    const addr = getSecretJson<{ addresses?: UserAddress[]; defaultAddressId?: string }>("user.profile.addresses");
    if (personal || addr) {
      return {
        displayName: typeof personal?.displayName === "string" ? personal.displayName : "用户",
        gender: (personal?.gender as any) ?? "other",
        age: typeof personal?.age === "number" ? personal.age : 30,
        ageGroup: (personal?.ageGroup as any) ?? undefined,
        heightCm: typeof personal?.heightCm === "number" ? personal.heightCm : undefined,
        weightKg: typeof personal?.weightKg === "number" ? personal.weightKg : undefined,
        birthYear: typeof personal?.birthYear === "number" ? personal.birthYear : undefined,
        allergies: Array.isArray(personal?.allergies) ? (personal?.allergies as any) : undefined,
        conditions: Array.isArray(personal?.conditions) ? (personal?.conditions as any) : undefined,
        emergencyContacts: Array.isArray(personal?.emergencyContacts) ? (personal?.emergencyContacts as any) : undefined,
        avatarUrl: typeof personal?.avatarUrl === "string" ? personal.avatarUrl : undefined,
        addresses: Array.isArray(addr?.addresses) ? addr?.addresses : undefined,
        defaultAddressId: typeof addr?.defaultAddressId === "string" ? addr.defaultAddressId : undefined
      };
    }

    const legacy = getSecretJson<Profile>("user.profile");
    if (!legacy) return null;
    await setProfile(legacy);
    return legacy;
  }

  async function getProfileMeta(): Promise<{ savedAt: number | null }> {
    const meta = getSecretJson<{ savedAt?: unknown }>("user.profile.meta");
    const savedAt = typeof meta?.savedAt === "number" && Number.isFinite(meta.savedAt) ? Math.floor(meta.savedAt) : null;
    return { savedAt };
  }

  async function setProfile(profile: Profile) {
    const ageGroup = typeof profile.age === "number" ? (profile.age < 18 ? "child" : profile.age >= 65 ? "senior" : "adult") : undefined;
    const personal: Partial<Profile> = {
      displayName: profile.displayName,
      gender: profile.gender,
      age: profile.age,
      ageGroup,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      birthYear: profile.birthYear,
      allergies: profile.allergies,
      conditions: profile.conditions,
      emergencyContacts: profile.emergencyContacts,
      avatarUrl: profile.avatarUrl
    };
    const addresses = profile.addresses;
    const defaultAddressId = profile.defaultAddressId;

    setSecretJson("user.profile.personal", personal);
    setSecretJson("user.profile.addresses", { addresses, defaultAddressId });
    setSecretJson("user.profile", { ...profile, ageGroup });
    setSecretJson("user.profile.meta", { savedAt: Date.now() });
  }

  async function clearProfile() {
    deleteSecretKey("user.profile.personal");
    deleteSecretKey("user.profile.addresses");
    deleteSecretKey("user.profile");
    deleteSecretKey("user.profile.meta");
  }

  async function getSecret<T>(key: string): Promise<T | null> {
    return getSecretJson<T>(key);
  }

  async function setSecret<T>(key: string, value: T) {
    setSecretJson(key, value);
  }

  async function getRecentMetrics() {
    const metrics = getSecretJson<TrendMetric[]>("metrics.v1") ?? fileStore.metrics;
    return [...metrics].sort((a, b) => b.ts - a.ts).slice(0, 50);
  }

  async function addMetrics(input: TrendMetric[]) {
    const current = getSecretJson<TrendMetric[]>("metrics.v1") ?? fileStore.metrics;
    const merged = [...current, ...input].slice(-5000);
    setSecretJson("metrics.v1", merged);
  }

  type VitalityRecord = { ts: number; score: number; factors?: string[] };

  async function getVitalityHistory(): Promise<VitalityRecord[]> {
    const list = getSecretJson<VitalityRecord[]>("vitality.v1") ?? [];
    return [...list].sort((a, b) => a.ts - b.ts).slice(-365);
  }

  async function addVitalityRecord(entry: VitalityRecord) {
    const current = getSecretJson<VitalityRecord[]>("vitality.v1") ?? [];
    const merged = [...current, entry].slice(-365);
    setSecretJson("vitality.v1", merged);
  }

  function close() {
    return;
  }

  return {
    getPrivacySettings,
    setPrivacySettings,
    getProfile,
    getProfileMeta,
    setProfile,
    clearProfile,
    getSecret,
    setSecret,
    getRecentMetrics,
    addMetrics,
    getVitalityHistory,
    addVitalityRecord,
    close
  };
}
