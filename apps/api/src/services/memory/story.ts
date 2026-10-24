import { z } from "zod";
import type { AppDb, DbMemory } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";

const StorySchema = z.object({
  title: z.string().min(1).max(60),
  content: z.string().min(20).max(3000)
});

export function createStoryService(db: AppDb, modelRouter: ModelRouter) {
  async function generate(input: { elderId: string; memoryIds: string[]; style?: string }) {
    const ids = Array.from(new Set(input.memoryIds));
    const memories = ids
      .map((id) => db.memories.getById(id))
      .filter(
        (memory): memory is DbMemory =>
          Boolean(memory) && memory!.elderId === input.elderId && memory!.status === "active"
      );

    if (!memories.length) throw new Error("no_memories");

    const book = db.storyBooks.ensureForElder(input.elderId);
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
    let content = fallbackContent;

    try {
      const result = await modelRouter.chatJSON({
        messages: [
          {
            role: "system",
            content:
              "你是传记编辑。只输出 JSON：{\"title\":\"章节标题\",\"content\":\"正文\"}。" +
              "只用提供的事实，不编造；保留 1–2 句原话用引号标出；300–600 字；" +
              "语气温暖克制；末尾注明“根据长辈口述整理，家属可修改”。"
          },
          {
            role: "user",
            content: JSON.stringify({
              style: input.style ?? "温暖克制",
              memories: memories.map((memory) => ({
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
        maxTokens: 1200
      });
      title = result.title;
      content = result.content;
    } catch {
      // Fall back to a deterministic chapter when the model is unavailable.
    }

    const orderIndex = db.storyChapters.listByBook(book.id).length + 1;
    const chapter = db.storyChapters.create({
      bookId: book.id,
      title,
      memoryIds: ids,
      content,
      orderIndex
    });
    return { chapter, book };
  }

  function get(id: string) {
    const chapter = db.storyChapters.getById(id);
    if (!chapter) return null;
    const book = db.storyBooks.getById(chapter.bookId);
    return book ? { chapter, book } : null;
  }

  function listByElder(elderId: string) {
    const book = db.storyBooks.getByElder(elderId);
    return {
      book,
      chapters: book ? db.storyChapters.listByBook(book.id) : []
    };
  }

  return { generate, get, listByElder };
}

export type StoryService = ReturnType<typeof createStoryService>;
