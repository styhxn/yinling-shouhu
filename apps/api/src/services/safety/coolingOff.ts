import type { AppDb, DbCoolingOff, DbFamilyConfirm } from "../../store/db.js";
import type { createEventBus } from "../eventBus.js";

export type CoolingOffDeps = {
  db: AppDb;
  eventBus: ReturnType<typeof createEventBus>;
};

export function createCoolingOffService(deps: CoolingOffDeps) {
  async function start(input: {
    elderId: string;
    userId: string;
    amount?: number;
    counterparty?: string;
    reason?: string;
  }): Promise<{ coolingOff: DbCoolingOff; familyConfirm: DbFamilyConfirm }> {
    const familyConfirm = await deps.db.familyConfirms.create({
      elderId: input.elderId,
      type: "transfer",
      payload: {
        amount: input.amount ?? null,
        counterparty: input.counterparty ?? null,
        reason: input.reason ?? null,
        requestedBy: input.userId
      }
    });

    const coolingOff = await deps.db.coolingOffs.create({
      elderId: input.elderId,
      riskLevel: "high",
      questions: [
        "对方是否要求你保密？",
        "你是否见过对方本人？",
        "对方是否让你共享屏幕或提供验证码？"
      ],
      ...(typeof input.reason === "string" ? { reason: input.reason } : {}),
      ...(typeof input.counterparty === "string" ? { counterparty: input.counterparty } : {}),
      ...(typeof input.amount === "number" ? { amount: input.amount } : {}),
      familyConfirmId: familyConfirm.id
    });

    const alert = await deps.db.safetyAlerts.create({
      elderId: input.elderId,
      type: "cooling_off",
      level: "critical",
      payload: {
        coolingOffId: coolingOff.id,
        familyConfirmId: familyConfirm.id,
        amount: input.amount ?? null,
        counterparty: input.counterparty ?? null
      }
    });
    deps.eventBus.publish({ type: "safety.alert", ts: Date.now(), payload: { alert } });
    deps.eventBus.publish({
      type: "family.confirm.requested",
      ts: Date.now(),
      payload: { confirm: familyConfirm }
    });

    return { coolingOff, familyConfirm };
  }

  async function respond(input: { id: string; elderId: string; action: "cancel" | "continue" }): Promise<DbCoolingOff> {
    const coolingOff = await deps.db.coolingOffs.get(input.id);
    if (!coolingOff || coolingOff.elderId !== input.elderId) {
      throw new Error("not_found");
    }
    if (coolingOff.status !== "pending") {
      throw new Error("already_responded");
    }
    if (input.action === "cancel") {
      await deps.db.coolingOffs.setStatus(input.id, "cancelled", "elder_cancelled");
    } else {
      await deps.db.coolingOffs.setStatus(input.id, "family_pending", "elder_requested_continue");
    }
    return (await deps.db.coolingOffs.get(input.id))!;
  }

  return { start, respond };
}

export type CoolingOffService = ReturnType<typeof createCoolingOffService>;
