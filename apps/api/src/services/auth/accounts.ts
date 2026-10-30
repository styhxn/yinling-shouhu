import crypto, { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { AppConfig } from "../../config.js";
import type { AppDb, DbElder, DbUser } from "../../store/db.js";
import { buildSessionCookie, createSessionToken } from "./session.js";

export const DEMO_FAMILY_CODE = "123456";
export const FAMILY_CODE_TTL_MS = 5 * 60 * 1000;
export const ELDER_INVITE_TTL_MS = 15 * 60 * 1000;

export type FamilyLinkView = {
  elderId: string;
  elderName: string;
  relation: string | null;
};

export type MeView = {
  user: {
    id: string;
    role: DbUser["role"];
    displayName: string;
    elderId: string | null;
  };
  elder: DbElder | null;
  familyLinks: FamilyLinkView[];
};

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function hashCode(code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

export function codeMatches(code: string, expectedHash: string, secret: string): boolean {
  const actual = Buffer.from(hashCode(code, secret));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function generateSixDigitCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function cleanDisplayName(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  return value ? value.slice(0, 20) : fallback;
}

export async function listFamilyLinkViews(db: AppDb, userId: string): Promise<FamilyLinkView[]> {
  const links = await db.users.listFamilyLinks(userId);
  return Promise.all(
    links.map(async (link) => {
      const elder = await db.elders.getById(link.elderId);
      return {
        elderId: link.elderId,
        elderName: elder?.displayName ?? "长辈",
        relation: link.relation
      };
    })
  );
}

export async function buildMe(
  db: AppDb,
  user: DbUser,
  activeElderId?: string | null
): Promise<MeView> {
  const familyLinks = user.role === "family" ? await listFamilyLinkViews(db, user.id) : [];
  const elderId =
    user.role === "elder"
      ? user.elderId
      : user.role === "family"
        ? activeElderId ?? familyLinks[0]?.elderId ?? null
        : user.elderId;
  const elder = elderId ? await db.elders.getById(elderId) : null;
  return {
    user: {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      elderId: elder?.id ?? elderId
    },
    elder,
    familyLinks
  };
}

export function setSession(
  reply: FastifyReply,
  config: AppConfig,
  user: DbUser,
  elderId?: string | null
): void {
  const token = createSessionToken(
    {
      userId: user.id,
      role: user.role,
      ...(elderId ? { elderId } : {})
    },
    config.sessionSecret,
    config.sessionTtlMs
  );
  reply.header(
    "set-cookie",
    buildSessionCookie({
      name: config.cookieName,
      token,
      ttlMs: config.sessionTtlMs,
      secure: config.cookieSecure
    })
  );
}

export async function findOrCreateFamilyUser(
  db: AppDb,
  phone: string,
  displayName?: string
): Promise<DbUser> {
  const existing = await db.users.getByPhone(phone);
  if (existing) {
    if (existing.role !== "family") throw new Error("phone_in_use");
    return existing;
  }
  try {
    return await db.users.create({
      id: `u_${randomUUID()}`,
      role: "family",
      displayName: cleanDisplayName(displayName, `家人${phone.slice(-4)}`),
      elderId: null,
      phone,
      createdAt: Date.now()
    });
  } catch {
    const raced = await db.users.getByPhone(phone);
    if (raced) return raced;
    throw new Error("create_family_failed");
  }
}

export async function findOrCreateElderUser(db: AppDb, elder: DbElder): Promise<DbUser> {
  const existing = await db.users.getElderUser(elder.id);
  if (existing) return existing;
  try {
    return await db.users.create({
      id: `u_${randomUUID()}`,
      role: "elder",
      displayName: elder.displayName,
      elderId: elder.id,
      phone: null,
      createdAt: Date.now()
    });
  } catch {
    const raced = await db.users.getElderUser(elder.id);
    if (raced) return raced;
    throw new Error("create_elder_user_failed");
  }
}

export async function createElderInvite(
  db: AppDb,
  config: AppConfig,
  elderId: string,
  createdBy: string
): Promise<{ code: string; expiresAt: number }> {
  const now = Date.now();
  await db.elderInvites.invalidateForElder(elderId, now);
  const code = generateSixDigitCode();
  const expiresAt = now + ELDER_INVITE_TTL_MS;
  await db.elderInvites.create({
    id: `inv_${randomUUID()}`,
    elderId,
    createdBy,
    codeHash: hashCode(code, config.sessionSecret),
    expiresAt,
    createdAt: now
  });
  return { code, expiresAt };
}
