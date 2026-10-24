import { z } from "zod";
import type { PrivacySettings } from "./types.js";

export const PrivacySettingsSchema = z.object({
  cameraEnabled: z.boolean(),
  microphoneEnabled: z.boolean(),
  autoSleepSeconds: z.number().int().min(10).max(60 * 60 * 6),
  cloudSyncEnabled: z.boolean(),
  allowDataExport: z.boolean(),
  autoSpeakEnabled: z.boolean(),
  autoSpeakWeather: z.boolean()
});

export const DefaultPrivacySettings = {
  cameraEnabled: true,
  microphoneEnabled: true,
  autoSleepSeconds: 120,
  cloudSyncEnabled: false,
  allowDataExport: true,
  autoSpeakEnabled: true,
  autoSpeakWeather: true
} satisfies PrivacySettings;

export const ProfileSchema = z.object({
  displayName: z.string().min(1).max(32),
  gender: z.enum(["male", "female", "other"]),
  age: z.number().int().min(1).max(119),
  ageGroup: z.enum(["child", "adult", "senior"]).optional(),
  heightCm: z.number().int().min(10).max(300).optional(),
  weightKg: z.number().min(2).max(300).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  allergies: z.array(z.string().min(1).max(50)).max(50).optional(),
  conditions: z.array(z.string().min(1).max(50)).max(50).optional(),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().min(1).max(32),
        phone: z.string().min(3).max(32).optional(),
        wechat: z.string().min(3).max(64).optional()
      })
    )
    .max(10)
    .optional(),
  addresses: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(32).optional(),
        province: z.string().min(1).max(32),
        city: z.string().min(1).max(32),
        district: z.string().min(1).max(32),
        detail: z.string().min(1).max(80).optional(),
        fullText: z.string().min(1).max(200).optional()
      })
    )
    .max(20)
    .optional(),
  defaultAddressId: z.string().min(1).max(64).optional(),
  avatarUrl: z.string().max(512).optional()
});

export const UserInfoSchema = ProfileSchema.extend({
  id: z.string().min(1).max(64),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0)
});

export const AskRequestSchema = z.object({
  question: z.string().min(1).max(200)
});

export const WearablesStatusSchema = z.object({
  connected: z.object({
    huawei: z.boolean(),
    xiaomi: z.boolean(),
    generic: z.boolean()
  }),
  lastImport: z
    .object({
      vendor: z.enum(["huawei", "xiaomi", "generic"]),
      ts: z.number().int().min(0)
    })
    .optional(),
  lastMetrics: z.record(z.unknown()).optional()
});

export const MockEmitRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fall.detected"),
    payload: z.object({ confidence: z.number().min(0).max(1) })
  }),
  z.object({
    type: z.literal("sedentary.detected"),
    payload: z.object({ minutes: z.number().int().min(1).max(24 * 60) })
  }),
  z.object({
    type: z.literal("reminder.due"),
    payload: z.object({
      kind: z.enum(["medicine", "exercise", "selfcheck", "water"]),
      title: z.string().min(1).max(80)
    })
  }),
  z.object({
    type: z.literal("emergency.triggered"),
    payload: z.object({ reason: z.string().min(1).max(200) })
  }),
  z.object({
    type: z.literal("qa.answered"),
    payload: z.object({
      question: z.string().min(1).max(200),
      answer: z.string().min(1).max(2000)
    })
  }),
  z.object({
    type: z.literal("vitality.alert"),
    payload: z.object({
      scores: z.array(z.number().min(0).max(100)).min(1).max(10)
    })
  }),
  z.object({
    type: z.literal("companion.command"),
    payload: z.object({
      kind: z.enum(["voice_message", "reminder"]),
      content: z.string().min(1).max(500),
      for: z.enum(["elder", "child"])
    })
  })
]);
