import { z } from "zod";
import type { AppDb, DbMemory, StoryFidelity } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";

const StorySchema = z.object({
  title: z.string().min(1).max(60),
  content: z.string().min(20).max(4000)
});

const QUOTE_PATTERN = /[“「"]([^”」"\n]{2,80})[”」"]/g;

function normalize(value: string) {
  return value.replace(/\s+/g, "");
}

function memoryCorpus(memory: DbMemory) {
  return [memory.title, memory.summary ?? "", memory.transcript].join("\n");
}

function bigrams(text: string) {
  const compact = normalize(text).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const out = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    out.add(compact.slice(index, index + 2));
  }
  return out;
}

function collectQuotes(content: string) {
  const quotes: { raw: string; text: string }[] = [];
  for (const match of content.matchAll(QUOTE_PATTERN)) {
    const text = (match[1] ?? "").trim();
    if (text.length >= 2) quotes.push({ raw: match[0], text });
  }
  return quotes;
}

function applyFidelity(input: {
  content: string;
  memories: DbMemory[];
  engine: "rules" | "rules+llm";
  model: string;
}): { content: string; fidelity: StoryFidelity } {
  let content = input.content;
  const verifiedQuotes: StoryFidelity["verifiedQuotes"] = [];
  const removedQuotes: string[] = [];

  for (const quote of collectQuotes(content)) {
    const needle = normalize(quote.text);
    const source = input.memories.find((memory) => normalize(memoryCorpus(memory)).includes(needle));
    if (source) {
      if (!verifiedQuotes.some((item) => item.text === quote.text)) {
        verifiedQuotes.push({
          text: quote.text,
          sourceMemoryId: source.id,
          sourceTitle: source.title
        });
      }
      continue;
    }
    removedQuotes.push(quote.text);
    content = content.split(quote.raw).join(quote.text);
  }

  const sourceGrams = bigrams(input.memories.map(memoryCorpus).join("\n"));
  const contentGrams = bigrams(content);
  let overlap = 0;
  for (const gram of contentGrams) {
    if (sourceGrams.has(gram)) overlap += 1;
  }
  const groundingPct = contentGrams.size
    ? Math.round((overlap / contentGrams.size) * 100)
    : 0;
  const level: StoryFidelity["level"] =
    groundingPct >= 55 ? "high" : groundingPct >= 35 ? "medium" : "low";

  const warnings: string[] = [];
  if (removedQuotes.length > 0) {
    warnings.push(
      `有 ${removedQuotes.length} 处引号内容未在口述原文中找到，已去掉引号，请家人核对。`
    );
  }
  if (level === "low") {
    warnings.push("整理稿与口述原文的用词重合度偏低，建议家人逐段核对后再分享。");
  }
  if (input.engine === "rules") {
    warnings.push("当前为规则整理稿，未使用模型润色。");
  } else if (verifiedQuotes.length === 0) {
    warnings.push("本篇未找到可逐字回查的引语，正文为整理叙述。");
  }

  return {
    content,
    fidelity: {
      engine: input.engine,
      model: input.model,
      groundingPct,
      level,
      verifiedQuotes,
      removedQuotes,
      sources: input.memories.map((memory) => ({ id: memory.id, title: memory.title })),
      warnings
    }
  };
}

export function createStoryService(db: AppDb, modelRouter: ModelRouter) {
  async function generate(input: { elderId: string; memoryIds: string[]; style?: string }) {
    const ids = Array.from(new Set(input.memoryIds));
    const memories = (await Promise.all(ids.map((id) => db.memories.getById(id))))
      .filter(
        (memory): memory is DbMemory =>
          Boolean(memory) && memory!.elderId === input.elderId && memory!.status === "active"
      );

    if (!memories.length) throw new Error("no_memories");

    const book = await db.storyBooks.ensureForElder(input.elderId);
    const fallbackTitle = memories[0]?.title ?? "我的一段回忆";
    const fallbackContent = memories
      .map((memory) => {
        const answers = memory.transcript
          .split(/\n+/)
          .filter((line) => line.startsWith("答："))
          .map((line) => line.replace(/^答：\s*/, "").trim())
          .filter(Boolean);
        const body = answers.length
          ? answers.join("")
          : memory.summary ?? memory.transcript;
        return `${memory.title}\n\n${body}`;
      })
      .join("\n\n");

    let title = fallbackTitle;
    let validated = applyFidelity({
      content: fallbackContent,
      memories,
      engine: "rules",
      model: modelRouter.mode
    });

    try {
      const result = await modelRouter.chatJSON({
        task: "story_chapter",
        messages: [
          {
            role: "system",
            content:
              "你是家庭传记编辑。只输出 JSON：{\"title\":\"章节标题\",\"content\":\"正文\"}。" +
              "只使用提供的事实，不编造时间、地点、人物或对话；" +
              "如需引用长辈原话，必须逐字照抄 transcript 中的句子并加中文引号；" +
              "300–600 字，语气温暖克制；末尾注明“根据长辈口述整理，家属可修改”。"
          },
          {
            role: "user",
            content: JSON.stringify({
              style: input.style ?? "温暖克制",
              memories: memories.map((memory) => ({
                id: memory.id,
                title: memory.title,
                timeRange: memory.timeRange,
                place: memory.place,
                transcript: memory.transcript,
                summary: memory.summary
              }))
            })
          }
        ],
        schema: StorySchema,
        temperature: 0.4,
        maxTokens: 1200,
        timeoutMs: 20_000
      });

      const candidate = applyFidelity({
        content: result.content,
        memories,
        engine: "rules+llm",
        model: modelRouter.mode
      });
      if (candidate.content.trim().length >= 20) {
        title = result.title.trim().slice(0, 60) || fallbackTitle;
        validated = candidate;
      }
    } catch {
      // Keep the deterministic draft when the model is unavailable.
    }

    const orderIndex = (await db.storyChapters.listByBook(book.id)).length + 1;
    const chapter = await db.storyChapters.create({
      bookId: book.id,
      title,
      memoryIds: ids,
      content: validated.content,
      orderIndex,
      fidelity: validated.fidelity
    });
    return { chapter, book };
  }

  async function get(id: string) {
    const chapter = await db.storyChapters.getById(id);
    if (!chapter) return null;
    const book = await db.storyBooks.getById(chapter.bookId);
    return book ? { chapter, book } : null;
  }

  async function listByElder(elderId: string) {
    const book = await db.storyBooks.getByElder(elderId);
    return {
      book,
      chapters: book ? await db.storyChapters.listByBook(book.id) : []
    };
  }

  return { generate, get, listByElder };
}

export type StoryService = ReturnType<typeof createStoryService>;
