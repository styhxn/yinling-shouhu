import type {
  IAdviceEngine,
  IASREngine,
  ICloudSyncAdapter,
  IEmergencyNotifier,
  IFallDetector,
  IGestureOrMotionDetector,
  IQaEngine,
  IReminderScheduler,
  IRobotActuator,
  ISedentaryDetector,
  ITTSEngine,
  IWearableConnector,
  IWakeWordEngine
} from "./interfaces.js";

const safePhrases = [
  "我可以给出一般性建议，但不能替代医生诊断。",
  "如果你有基础病、过敏史或症状加重，请及时就医。"
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function createMockQaEngine(): IQaEngine {
  return {
    async ask(input) {
      const q = input.question.toLowerCase();
      if (q.includes("油") || q.includes("炸") || q.includes("烧烤")) {
        return `这类食物通常油脂和热量较高，建议少量、搭配蔬菜与足量饮水。${pick(safePhrases)}`;
      }
      if (q.includes("糖") || q.includes("甜") || q.includes("奶茶")) {
        return `含糖饮品容易带来额外糖分摄入，建议控制频率与份量，优先选择无糖或低糖。${pick(safePhrases)}`;
      }
      if (q.includes("盐") || q.includes("咸")) {
        return `高盐饮食可能增加血压负担，建议逐步减盐并选择天然食材。${pick(safePhrases)}`;
      }
      return `我已记录你的问题：${input.question}。一般建议是均衡饮食、规律作息、适量运动，并结合你的病史与过敏史再做更细建议。${pick(safePhrases)}`;
    }
  };
}

export function createMockWakeWordEngine(): IWakeWordEngine {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    async start(input) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (Math.random() < 0.005) input.onWake();
      }, 500);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

export function createMockAsrEngine(): IASREngine {
  return {
    async recognizeOnce() {
      return { text: "这份炸鸡健康吗？", confidence: 0.6 };
    }
  };
}

export function createMockTtsEngine(): ITTSEngine {
  return {
    async speak() {
      return;
    },
    async stop() {
      return;
    }
  };
}

export function createMockFallDetector(): IFallDetector {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    async start(input) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (Math.random() < 0.002) input.onFall({ confidence: 0.85 });
      }, 700);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

export function createMockSedentaryDetector(): ISedentaryDetector {
  let timer: ReturnType<typeof setInterval> | null = null;
  let minutes = 0;
  return {
    async start(input) {
      minutes = 0;
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        minutes += 1;
        if (minutes >= input.minutesThreshold) {
          input.onSedentary({ minutes });
          minutes = 0;
        }
      }, 1500);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

export function createMockGestureOrMotionDetector(): IGestureOrMotionDetector {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    async start(input) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (Math.random() < 0.002) input.onGesture({ name: "wave", confidence: 0.75 });
      }, 800);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

export function createMockWearableConnector(): IWearableConnector {
  return {
    async import(input) {
      return {
        vendor: input.vendor,
        steps: 5234,
        heartRate: 72,
        sleepScore: 86
      };
    }
  };
}

export function createMockCloudSyncAdapter(): ICloudSyncAdapter {
  return {
    async upload() {
      return { ok: true };
    },
    async download() {
      return { ok: true, data: null };
    }
  };
}

export function createMockRobotActuator(): IRobotActuator {
  return {
    async setExpression() {
      return;
    },
    async playGesture() {
      return;
    },
    async setLight() {
      return;
    }
  };
}

export function createMockAdviceEngine(): IAdviceEngine {
  return {
    async generateAdvice(input) {
      const name = input.profile?.displayName ?? "你";
      return {
        riskLevel: "low",
        advice: [
          `${name}，建议今天保持规律作息与适量运动。`,
          "饮食以清淡为主，减少高盐高糖。",
          "如出现胸闷、气促、持续疼痛等情况，请及时就医。"
        ]
      };
    }
  };
}

export function createMockReminderScheduler(): IReminderScheduler {
  return {
    async schedule() {
      return;
    }
  };
}

export function createMockEmergencyNotifier(): IEmergencyNotifier {
  return {
    async trigger() {
      return { ok: true };
    }
  };
}
