import { z } from "zod";
import type { AppDb, DbInterview, DbMemory, InterviewQA } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";

const TOPIC_QUESTIONS: Record<string, string[]> = {
  童年: [
    "您小时候住在哪里？",
    "小时候最喜欢玩什么？",
    "家里谁最疼您？",
    "记忆最深的一顿饭是什么？",
    "小时候最好的朋友是谁？"
  ],
  家乡: [
    "您的家乡是什么样子？",
    "家乡的河、桥或老街还记得吗？",
    "家乡有什么好吃的？",
    "离开家乡时最舍不得什么？",
    "家乡话里最常说的一句是什么？"
  ],
  工作: [
    "您第一份工作是什么？",
    "工作中最自豪的一件事是什么？",
    "同事里谁印象最深？",
    "退休那天您在做什么？",
    "如果重来一次，还想做这份工作吗？"
  ],
  家庭: [
    "您和老伴是怎么认识的？",
    "孩子出生那天您记得什么？",
    "家里最热闹的一次聚会是什么样？",
    "您最想对孙辈说什么？",
    "家里有什么一直保留的老物件？"
  ],
  江苏记忆: [
    "您年轻时在江苏哪里生活？",
    "家乡的河、桥或老街还记得吗？",
    "您最喜欢江苏的哪个季节？",
    "有没有一道家乡菜一直忘不了？",
    "您听过昆曲或评弹吗？"
  ]
};

const PHOTO_QUESTION = "这张照片是在哪里拍的？照片里都有谁？";

const FollowUpSchema = z.object({
  question: z.string().min(4).max(80),
  focus: z.enum(["place", "people", "detail", "feeling", "object"]).optional()
});

const DistillSchema = z.object({
  title: z.string().min(2).max(40),
  summary: z.string().min(5).max(200),
  timeRange: z.string().max(40).nullable().optional(),
  place: z.string().max(60).nullable().optional(),
  people: z.array(z.string().min(1).max(20)).max(8).optional(),
  tags: z.array(z.string().min(1).max(12)).max(8).optional()
});

type Distilled = {
  title: string;
  summary: string;
  timeRange: string | null;
  place: string | null;
  people: string[];
  tags: string[];
  engine: "rules" | "rules+llm";
};

function normalize(value: string) {
  return value.replace(/\s+/g, "");
}

function buildQuestions(topic: string, hasPhoto: boolean) {
  const base = TOPIC_QUESTIONS[topic] ?? TOPIC_QUESTIONS["童年"]!;
  return hasPhoto ? [PHOTO_QUESTION, ...base] : [...base];
}

function cleanQuestion(question: string, asked: string[]): string | null {
  let value = question.replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "");
  if (value.length < 4) return null;
  if (/https?:\/\//i.test(value) || /\b1[3-9]\d{9}\b/.test(value)) return null;
  if (!/[？?]$/.test(value)) value += "？";
  if (value.length > 80) return `${value.slice(0, 79)}？`;
  const key = normalize(value);
  if (asked.some((item) => normalize(item) === key)) return null;
  return value;
}

function fallbackDistill(topic: string, transcript: InterviewQA[]): Distilled {
  const answers = transcript.map((item) => item.answer.trim()).filter(Boolean);
  const text = answers.join(" ").replace(/第\s*\d+\s*段回忆[：:，,]?/g, "");
  const placeMatch = text.match(
    /(?:住在|在|去了)([\u4e00-\u9fa5]{2,8}(?:河边|村|镇|街|路|桥|厂|学校))/
  );
  const peopleMatches = text.match(
    /母亲|父亲|妈妈|爸爸|老伴|女儿|儿子|邻居|同事|老师|朋友|孙子|孙女/g
  );
  const people = Array.from(new Set(peopleMatches ?? []));
  const timeRange = text.match(/小时候|年轻时|上学时|退休前|那几年|那年/)?.[0] ?? null;
  const place = placeMatch?.[1]?.slice(0, 30) ?? null;
  const title = place ? `${place.slice(0, 16)}的回忆` : `${topic}的回忆`;
  const first = answers[0];
  const last = answers.at(-1);
  const summary = (
    first && last && first !== last ? `${first} ${last}` : first ?? last ?? `${topic}的一段回忆`
  ).slice(0, 160);
  return {
    title: title.slice(0, 40),
    summary,
    timeRange,
    place,
    people: people.slice(0, 6),
    tags: Array.from(new Set([topic, ...people.slice(0, 2)])).slice(0, 6),
    engine: "rules"
  };
}

export function createInterviewService(db: AppDb, modelRouter: ModelRouter) {
  function get(id: string): DbInterview | null {
    return db.interviews.get(id);
  }

  function start(input: { elderId: string; topic?: string; photoId?: string }) {
    const topic = input.topic && TOPIC_QUESTIONS[input.topic] ? input.topic : "童年";
    const hasPhoto = Boolean(input.photoId);
    const questions = buildQuestions(topic, hasPhoto);
    const maxTurns = Math.min(5, questions.length);
    const interview = db.interviews.create({
      elderId: input.elderId,
      topic,
      photoId: input.photoId ?? null,
      maxTurns,
      questions
    });
    return {
      interviewId: interview.id,
      topic,
      photoPrompt: hasPhoto,
      question: interview.currentQuestion,
      turn: interview.turn,
      maxTurns: interview.maxTurns
    };
  }

  async function followUp(input: {
    topic: string;
    transcript: InterviewQA[];
    fallback: string;
  }): Promise<{ question: string; focus?: string } | null> {
    try {
      const result = await modelRouter.chatJSON({
        task: "interview_followup",
        schema: FollowUpSchema,
        temperature: 0.6,
        maxTokens: 160,
        timeoutMs: 8_000,
        messages: [
          {
            role: "system",
            content:
              "你在陪一位长者做口述史访谈。根据话题和已有回答，只问一个自然、具体、口语化的问题。" +
              "要求：20-40 字；结合上一句提到的地点、人物、物品或感受；" +
              "不要重复已经问过的问题；不评判、不追问创伤细节；只输出 JSON。"
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: input.topic,
              transcript: input.transcript.slice(-5),
              scriptedQuestion: input.fallback
            })
          }
        ]
      });
      const question = cleanQuestion(
        result.question,
        input.transcript.map((item) => item.question)
      );
      return question
        ? { question, ...(result.focus ? { focus: result.focus } : {}) }
        : null;
    } catch {
      return null;
    }
  }

  async function distill(topic: string, transcript: InterviewQA[]): Promise<Distilled> {
    const fallback = fallbackDistill(topic, transcript);
    try {
      const result = await modelRouter.chatJSON({
        task: "memory_distill",
        schema: DistillSchema,
        temperature: 0.2,
        maxTokens: 500,
        timeoutMs: 10_000,
        messages: [
          {
            role: "system",
            content:
              "你是家庭记忆整理助手。根据访谈记录整理一条可保存的记忆，只使用记录中的事实，不编造。" +
              "输出 JSON：title（8-18 字、具体、可读，不要用日期或“第几段回忆”）、" +
              "summary（40-100 字，概括这段回忆）、timeRange（如“小时候”“1990 年代”，没有就 null）、" +
              "place（地点，没有就 null）、people（提到的人物数组）、tags（2-5 个短标签）。"
          },
          {
            role: "user",
            content: JSON.stringify({ topic, transcript })
          }
        ]
      });
      return {
        title: result.title.trim().slice(0, 40) || fallback.title,
        summary: result.summary.trim().slice(0, 200) || fallback.summary,
        timeRange: result.timeRange?.trim().slice(0, 40) || fallback.timeRange,
        place: result.place?.trim().slice(0, 60) || fallback.place,
        people: Array.from(
          new Set([...(result.people ?? []), ...fallback.people].map((item) => item.trim()))
        )
          .filter(Boolean)
          .slice(0, 8),
        tags: Array.from(
          new Set([...(result.tags ?? []), ...fallback.tags].map((item) => item.trim()))
        )
          .filter(Boolean)
          .slice(0, 8),
        engine: "rules+llm"
      };
    } catch {
      return fallback;
    }
  }

  async function answer(input: { interviewId: string; elderId: string; text: string }) {
    const interview = db.interviews.get(input.interviewId);
    if (!interview || interview.elderId !== input.elderId) throw new Error("not_found");
    if (interview.status !== "asking") throw new Error("interview_closed");

    const text = input.text.trim();
    if (!text) throw new Error("empty_answer");

    const transcript = [
      ...interview.transcript,
      { question: interview.currentQuestion ?? "", answer: text }
    ];
    const done = interview.turn >= interview.maxTurns;
    const topic = interview.topic ?? "童年";

    if (done) {
      const distilled = await distill(topic, transcript);
      const memory: DbMemory = db.memories.create({
        elderId: input.elderId,
        title: distilled.title,
        timeRange: distilled.timeRange,
        place: distilled.place,
        people: distilled.people,
        tags: distilled.tags,
        photoIds: interview.photoId ? [interview.photoId] : [],
        transcript: transcript.map((qa) => `问：${qa.question}\n答：${qa.answer}`).join("\n\n"),
        summary: distilled.summary,
        visibility: "family",
        consent: true
      });
      db.interviews.update(interview.id, {
        transcript,
        currentQuestion: null,
        status: "completed"
      });
      return {
        done: true as const,
        question: null,
        memory,
        insight: {
          title: distilled.title,
          summary: distilled.summary,
          timeRange: distilled.timeRange,
          place: distilled.place,
          people: distilled.people,
          tags: distilled.tags,
          engine: distilled.engine
        }
      };
    }

    const questions = buildQuestions(topic, Boolean(interview.photoId));
    const fallbackQuestion = questions[interview.turn] ?? "还有什么想补充的吗？";
    const adaptive = await followUp({ topic, transcript, fallback: fallbackQuestion });
    const nextQuestion = adaptive?.question ?? fallbackQuestion;
    db.interviews.update(interview.id, {
      turn: interview.turn + 1,
      transcript,
      currentQuestion: nextQuestion,
      status: "asking"
    });

    return {
      done: false as const,
      question: nextQuestion,
      turn: interview.turn + 1,
      maxTurns: interview.maxTurns,
      adaptive: Boolean(adaptive),
      ...(adaptive?.focus ? { focus: adaptive.focus } : {})
    };
  }

  return { start, answer, get };
}

export type InterviewService = ReturnType<typeof createInterviewService>;
