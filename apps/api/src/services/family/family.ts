import type { AppDb } from "../../store/db.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createFamilyService(db: AppDb) {
  function summary(elderId: string) {
    const elder = db.elders.getById(elderId);
    if (!elder) throw new Error("not_found");

    const location = db.locations.latest(elderId);
    const medications = db.medications.listByElder(elderId);
    const logs = db.medicationLogs.listByElder(elderId, startOfToday(), Date.now());
    const dueToday = medications.reduce((count, med) => count + med.schedule.length, 0);
    const taken = logs.filter((log) => log.status === "taken").length;
    const logged = logs.length;
    const adherencePct =
      dueToday > 0 && logged > 0 ? Math.round((taken / dueToday) * 100) : null;
    const alerts = db.safetyAlerts.listByElder(elderId, "open");
    const pending = db.familyConfirms.listPending(elderId);
    const memoryCount = db.memories.countByElder(elderId);

    return {
      elder: {
        id: elder.id,
        displayName: elder.displayName,
        birthYear: elder.birthYear
      },
      location: location
        ? {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            source: location.source,
            ts: location.ts
          }
        : null,
      medications: {
        items: medications.length,
        dueToday,
        taken,
        logged,
        adherencePct
      },
      alerts: {
        open: alerts.length,
        items: alerts.slice(0, 3)
      },
      pendingConfirms: pending.length,
      memoryCount
    };
  }

  function weeklyReport(elderId: string) {
    const elder = db.elders.getById(elderId);
    if (!elder) throw new Error("not_found");

    const to = Date.now();
    const from = to - 7 * 24 * 60 * 60 * 1000;
    const medications = db.medications.listByElder(elderId);
    const logs = db.medicationLogs.listByElder(elderId, from, to);
    const alerts = db.safetyAlerts
      .listByElder(elderId)
      .filter((alert) => alert.createdAt >= from);
    const memoryCount = db.memories.countByElderSince(elderId, from);
    const pending = db.familyConfirms.listPending(elderId);

    const scheduled = medications.reduce((count, med) => count + med.schedule.length, 0) * 7;
    const taken = logs.filter((log) => log.status === "taken").length;
    const skipped = logs.filter((log) => log.status === "skipped").length;
    const late = logs.filter((log) => log.status === "late").length;
    const logged = logs.length;
    const adherencePct =
      scheduled > 0 && logged > 0 ? Math.round((taken / scheduled) * 100) : null;

    const sections = [
      {
        title: "用药",
        content:
          logged === 0
            ? "本周暂无用药记录。"
            : `本周计划 ${scheduled} 次，已记录服用 ${taken} 次，跳过 ${skipped} 次，延迟 ${late} 次。` +
              `按记录计算的依从率约 ${adherencePct}%。`
      },
      {
        title: "安全",
        content:
          alerts.length > 0
            ? `本周有 ${alerts.length} 条安全提醒，最近一条是「${alerts[0]?.type ?? "提醒"}」。`
            : "本周没有新的越界或反诈告警。"
      },
      {
        title: "陪伴",
        content:
          memoryCount > 0
            ? `本周新增 ${memoryCount} 段回忆，可以挑一段整理成故事。`
            : "本周还没有新回忆，可以找个时间陪老人聊 10 分钟。"
      },
      {
        title: "待确认",
        content: pending.length > 0 ? `目前有 ${pending.length} 条待确认事项。` : "目前没有待确认事项。"
      }
    ];

    const suggestions: string[] = [];
    if (adherencePct !== null && adherencePct < 80) {
      suggestions.push("用药依从率偏低，建议设一个固定提醒，或让家属在饭后电话确认。");
    }
    if (logged === 0) suggestions.push("本周还没有用药记录，可以从今天开始打卡。");
    if (alerts.length > 0) suggestions.push("本周出现过安全提醒，建议和老人一起回顾一次出行路线。");
    if (memoryCount === 0) suggestions.push("本周没有新增回忆，可以问一个童年问题，录 3 分钟就够。");
    if (pending.length > 0) suggestions.push("有待确认事项，请先处理转账/用药相关的高风险请求。");
    if (suggestions.length === 0) suggestions.push("本周整体平稳，保持规律作息和每天一次简短通话即可。");

    return {
      period: { from, to },
      elder: { id: elder.id, displayName: elder.displayName },
      adherencePct,
      summary:
        `${adherencePct === null ? "本周暂无用药记录" : `本周用药依从率约 ${adherencePct}%`}，` +
        `安全提醒 ${alerts.length} 条，新增回忆 ${memoryCount} 段。`,
      sections,
      suggestions,
      disclaimer: "本简报由系统根据记录生成，仅供参考，不构成医疗建议。"
    };
  }

  return { summary, weeklyReport };
}

export type FamilyService = ReturnType<typeof createFamilyService>;
