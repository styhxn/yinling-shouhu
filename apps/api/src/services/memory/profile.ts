import { z } from "zod";
import type { AppDb, DbMemory, MemoryProfile } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";

const MemoryProfileSchema = z.object({
  summary: z.string().min(1).max(300),
  people: z
    .array(
      z.object({
        name: z.string().min(1).max(20),
        relation: z.string().max(20).optional(),
        note: z.string().max(80).optional()
      })
    )
    .max(10),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        note: z.string().max(80).optional()
      })
    )
    .max(10),
  routines: z.array(z.string().min(1).max(80)).max(8),
  preferences: z.array(z.string().min(1).max(80)).max(8),
  sensitivities: z.array(z.string().min(1).max(80)).max(6)
});

type ProfilePayload = z.infer<typeof MemoryProfileSchema>;

const SYSTEM_PROMPT = `你在为一位长辈整理“记忆画像”，帮助陪伴 Agent 更懂他/她。只输出 JSON：
{"summary":"两三句总体印象","people":[{"name":"称呼","relation":"关系，可选","note":"一句说明，可选"}],
"places":[{"name":"地点","note":"一句说明，可选"}],"routines":["长期习惯"],"preferences":["明确偏好"],
"sensitivities":["沟通时需要避开或先共情的话题"]}
规则：
1. 只使用提供的口述内容，不推测未出现的人物、疾病、宗教或家庭矛盾。
2. people/places 用长辈自己的称呼；没有明确关系就不写 relation。
3. routines/preferences 只记录口述中明确表达或反复出现的；宁缺毋滥。
4. sensitivities 只记录明显不愿多谈或被提及会难过的话题，并写成沟通建议。
5. 不输出身份证、电话、门牌号等敏感信息。`;

function collect(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = (match[1] ?? "").trim().replace(/[，。！？、；]$/, "");
    if (value && value.length >= 2) out.push(value);
  }
  return Array.from(new Set(out));
}

function rulesProfile(memories: DbMemory[], model: string): MemoryProfile {
  const corpus = memories
    .map((memory) =>
      [memory.title, memory.summary ?? "", memory.transcript, memory.people.join(" "), memory.tags.join(" "), memory.place ?? ""].join("\n")
    )
    .join("\n");
  const people = Array.from(
    new Set(
      memories
        .flatMap((memory) => memory.people)
        .concat(
          corpus.match(/母亲|父亲|妈妈|爸爸|老伴|女儿|儿子|邻居|同事|老师|朋友|孙子|孙女|师傅/g) ?? []
        )
    )
  )
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({ name }));
  const places = Array.from(
    new Set(
      memories
        .map((memory) => memory.place)
        .filter((place): place is string => Boolean(place))
        .concat(collect(corpus, /(?:住在|在)([\u4e00-\u9fa5]{2,10}(?:河边|村|镇|街|路|桥|厂|学校|公园))/g))
    )
  )
    .slice(0, 8)
    .map((name) => ({ name }));
  const routines = collect(corpus, /(?:每天|常常|总是|经常)([^。！？\n]{2,24})/g).slice(0, 5);
  const preferences = collect(corpus, /(?:喜欢|爱|最爱)([^。！？\n]{2,24})/g).slice(0, 5);
  const sensitivities = /去世|走了|不在了|过世/.test(corpus)
    ? ["提到已故亲人时，先共情，不追问细节"]
    : [];

  const summaryParts: string[] = [];
  if (people.length) summaryParts.push(`常提到${people.map((item) => item.name).slice(0, 4).join("、")}`);
  if (places.length) summaryParts.push(`对${places.map((item) => item.name).slice(0, 3).join("、")}有清晰的记忆`);
  if (routines.length) summaryParts.push(`习惯${routines.slice(0, 2).join("、")}`);
  if (preferences.length) summaryParts.push(`喜欢${preferences.slice(0, 2).join("、")}`);

  return {
    summary: summaryParts.length ? summaryParts.join("；") + "。" : "还没有足够的记忆形成画像。",
    people,
    places,
    routines,
    preferences,
    sensitivities,
    engine: "rules",
    model,
    updatedAt: Date.now()
  };
}

export function createMemoryProfileService(db: AppDb, modelRouter: ModelRouter) {
  async function refresh(elderId: string): Promise<MemoryProfile> {
    const memories = await db.memories.listByElder(elderId);
    if (!memories.length) {
      const empty = rulesProfile([], modelRouter.mode);
      await db.memoryProfiles.upsert({ elderId, profile: empty, sourceCount: 0 });
      return empty;
    }

    let profile = rulesProfile(memories, modelRouter.mode);
    try {
      const result = await modelRouter.chatJSON({
        task: "memory_profile",
        schema: MemoryProfileSchema,
        temperature: 0.2,
        maxTokens: 900,
        timeoutMs: 15_000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              memories: memories.map((memory) => ({
                title: memory.title,
                timeRange: memory.timeRange,
                place: memory.place,
                people: memory.people,
                tags: memory.tags,
                summary: memory.summary,
                transcript: memory.transcript
              }))
            })
          }
        ]
      });
      const parsed = MemoryProfileSchema.parse(result);
      profile = {
        ...parsed,
        engine: "rules+llm",
        model: modelRouter.mode,
        updatedAt: Date.now()
      };
    } catch {
      // Keep the deterministic profile when the model is unavailable.
    }

    await db.memoryProfiles.upsert({ elderId, profile, sourceCount: memories.length });
    return profile;
  }

  async function get(elderId: string, options: { refresh?: boolean } = {}): Promise<MemoryProfile> {
    const sourceCount = await db.memories.countByElder(elderId);
    const existing = await db.memoryProfiles.getByElder(elderId);
    if (!options.refresh && existing && existing.sourceCount === sourceCount) {
      return existing.profile;
    }
    return refresh(elderId);
  }

  async function getCached(elderId: string): Promise<MemoryProfile | null> {
    return (await db.memoryProfiles.getByElder(elderId))?.profile ?? null;
  }

  return { refresh, get, getCached };
}

export type MemoryProfileService = ReturnType<typeof createMemoryProfileService>;
