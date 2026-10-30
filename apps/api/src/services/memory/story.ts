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

/** 去掉访谈提问，只保留长辈自己说过的内容，用于衡量正文保留了多少口述要点。 */
function answerCorpus(memory: DbMemory) {
  const answers = memory.transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("答："))
    .map((line) => line.replace(/^答：\s*/, "").trim())
    .filter(Boolean);
  return [memory.title, memory.summary ?? "", ...(answers.length ? answers : [memory.transcript])].join("\n");
}

function bigrams(text: string) {
  const compact = normalize(text).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const out = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    out.add(compact.slice(index, index + 2));
  }
  return out;
}

function firstAnswerQuote(memory: DbMemory): string | null {
  const answers = memory.transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("答："))
    .map((line) => line.replace(/^答：\s*/, "").replace(/[“”"]/g, "").trim())
    .filter(Boolean);
  for (const answer of answers) {
    const sentence = answer.split(/[。！？!?]/)[0]?.trim() ?? "";
    const candidate = sentence.length >= 4 ? sentence : answer;
    if (candidate.length >= 2) return candidate.slice(0, 80);
  }
  return null;
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

  // 口述要点保留率：原文中出现的 2-gram 有多少被正文沿用。
  // 长篇润色稿无法做到“正文每个词都来自原文”，但可以用这个比例确认核心事实没有丢。
  const sourceGrams = bigrams(input.memories.map(answerCorpus).join("\n"));
  const contentGrams = bigrams(content);
  let overlap = 0;
  for (const gram of sourceGrams) {
    if (contentGrams.has(gram)) overlap += 1;
  }
  const groundingPct = sourceGrams.size
    ? Math.round((overlap / sourceGrams.size) * 100)
    : 0;
  const level: StoryFidelity["level"] =
    groundingPct >= 75 ? "high" : groundingPct >= 45 ? "medium" : "low";

  const warnings: string[] = [];
  if (removedQuotes.length > 0) {
    warnings.push(
      `有 ${removedQuotes.length} 处引号内容未在口述原文中找到，已去掉引号，请家人核对。`
    );
  }
  if (level === "low") {
    warnings.push("整理稿保留的口述要点偏少，建议家人逐段核对后再分享。");
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
              "你是家庭传记编辑，为长辈整理一章口述故事。只输出 JSON：{\"title\":\"章节标题\",\"content\":\"正文\"}。" +
              "要求：1）只使用 memories 中的事实，不编造时间、地点、人物、数字或对话；" +
              "2）尽量沿用长辈的原词原句，只做必要的衔接和润色，正文 260–420 字；" +
              "3）至少逐字引用 1 句 transcript 中的原话，用中文引号“”标出，不得改写引语；" +
              "4）按时间或情感线索组织，开头点题，结尾回到现在，语气温暖克制；" +
              "5）末尾另起一段注明“根据长辈口述整理，家人可修改”。"
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
        temperature: 0.25,
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

    // 模型偶尔全篇转述、不直接引用原话：正文本身够贴原文时，补一段可逐字回查的“口述原话”。
    // 如果正文已经偏离口述，不再用一句真话去“装饰”它，保留低忠实度警告。
    if (
      validated.fidelity.verifiedQuotes.length === 0 &&
      validated.fidelity.groundingPct >= 45
    ) {
      const quote = firstAnswerQuote(memories[0]!);
      if (quote) {
        const withQuote = `${validated.content.trim()}\n\n口述原话：“${quote}”`;
        const revalidated = applyFidelity({
          content: withQuote,
          memories,
          engine: validated.fidelity.engine,
          model: validated.fidelity.model
        });
        if (revalidated.fidelity.verifiedQuotes.length > 0) validated = revalidated;
      }
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
