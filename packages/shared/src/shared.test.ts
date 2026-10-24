import { describe, expect, it } from "vitest";
import { PrivacySettingsSchema } from "./schemas.js";

describe("schemas", () => {
  it("validates privacy settings", () => {
    const parsed = PrivacySettingsSchema.safeParse({
      cameraEnabled: true,
      microphoneEnabled: true,
      autoSleepSeconds: 120,
      cloudSyncEnabled: false,
      allowDataExport: true,
      autoSpeakEnabled: true,
      autoSpeakWeather: true
    });
    expect(parsed.success).toBe(true);
  });
});

