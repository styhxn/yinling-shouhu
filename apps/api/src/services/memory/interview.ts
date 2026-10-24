import type { AppDb, DbInterview, DbMemory } from "../../store/db.js";

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

export function createInterviewService(db: AppDb) {
  function get(id: string): DbInterview | null {
    return db.interviews.get(id);
  }

  function start(input: { elderId: string; topic?: string; photoId?: string }) {
    const topic = input.topic && TOPIC_QUESTIONS[input.topic] ? input.topic : "童年";
    const questions = TOPIC_QUESTIONS[topic] ?? TOPIC_QUESTIONS["童年"]!;
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
      question: interview.currentQuestion,
      turn: interview.turn,
      maxTurns: interview.maxTurns
    };
  }

  function answer(input: { interviewId: string; elderId: string; text: string }) {
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

    if (done) {
      const firstAnswer = transcript[0]?.answer ?? text;
      const memory: DbMemory = db.memories.create({
        elderId: input.elderId,
        title: `${interview.topic ?? "回忆"} · ${firstAnswer.slice(0, 12)}`,
        timeRange: null,
        place: null,
        people: [],
        tags: [interview.topic ?? "回忆"],
        photoIds: interview.photoId ? [interview.photoId] : [],
        transcript: transcript.map((qa) => `问：${qa.question}\n答：${qa.answer}`).join("\n\n"),
        summary: text.slice(0, 120),
        visibility: "family",
        consent: true
      });
      db.interviews.update(interview.id, {
        transcript,
        currentQuestion: null,
        status: "completed"
      });
      return { done: true as const, question: null, memory };
    }

    const questions = TOPIC_QUESTIONS[interview.topic ?? "童年"] ?? TOPIC_QUESTIONS["童年"]!;
    const nextQuestion = questions[interview.turn] ?? "还有什么想补充的吗？";
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
      maxTurns: interview.maxTurns
    };
  }

  return { start, answer, get };
}

export type InterviewService = ReturnType<typeof createInterviewService>;
