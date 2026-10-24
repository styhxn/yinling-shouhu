import { z } from "zod";
import type { ModelRouter } from "../llm/types.js";

const MedicationVisionSchema = z.object({
  name: z.string().max(80).default(""),
  genericName: z.string().max(80).optional(),
  spec: z.string().max(40).optional(),
  dosage: z.string().max(120).optional(),
  confidence: z.number().min(0).max(1).default(0.3),
  warnings: z.array(z.string().max(120)).max(8).default([]),
  contraindications: z.array(z.string().max(120)).max(8).default([])
});

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

function mockResult(): MedicationScanResult {
  return {
    name: "氨氯地平",
    genericName: "苯磺酸氨氯地平",
    spec: "5mg",
    dosage: "每日一次，每次 1 片（演示识别）",
    confidence: 0.86,
    warnings: ["避免与葡萄柚同服", "如出现脚踝水肿、头晕，请咨询医生"],
    contraindications: ["严重低血压"],
    sources: [{ title: "药品说明书（演示）", url: "" }],
    disclaimer: "请遵医嘱；本结果仅供参考，不确定时请咨询医生或药师。"
  };
}

export async function analyzeMedicationImage(input: {
  buffer: Buffer;
  mime: string;
  modelRouter: ModelRouter;
}): Promise<MedicationScanResult> {
  if (input.modelRouter.mode === "mock") return mockResult();

  try {
    const out = await input.modelRouter.visionJSON({
      image: { data: input.buffer, mime: input.mime },
      prompt:
        "识别药盒上的药品名称、通用名、规格、用法用量，并给出注意事项。只输出 JSON：\n" +
        '{"name":"药名","genericName":"通用名","spec":"规格","dosage":"用法用量","confidence":0.0,"warnings":["注意事项"],"contraindications":["禁忌"]}\n' +
        "看不清就降低 confidence，不要猜。不要给出处方或剂量调整建议。",
      schema: MedicationVisionSchema,
      timeoutMs: 20_000
    });

    return {
      name: out.name?.trim() || "未识别",
      genericName: out.genericName?.trim() || null,
      spec: out.spec?.trim() || null,
      dosage: out.dosage?.trim() || null,
      confidence: out.confidence ?? 0.3,
      warnings: out.warnings ?? [],
      contraindications: out.contraindications ?? [],
      sources: [{ title: "药品说明书", url: "" }],
      disclaimer: "请遵医嘱；本结果仅供参考，不确定时请咨询医生或药师。"
    };
  } catch {
    return {
      name: "未识别",
      genericName: null,
      spec: null,
      dosage: null,
      confidence: 0.1,
      warnings: [],
      contraindications: [],
      sources: [],
      disclaimer: "图片没看清。请重拍药盒正面，或让家属/药师帮忙确认。"
    };
  }
}
