import crypto from "node:crypto";
import type { SessionUser } from "./types.js";

type TokenPayload = {
  uid: string;
  role: SessionUser["role"];
  eid?: string;
  exp: number;
};

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSessionToken(
  user: Omit<SessionUser, "exp">,
  secret: string,
  ttlMs: number
): string {
  const payload: TokenPayload = {
    uid: user.userId,
    role: user.role,
    ...(user.elderId ? { eid: user.elderId } : {}),
    exp: Date.now() + ttlMs
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token: string, secret: string): SessionUser | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload?.uid || !payload?.role || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return {
      userId: payload.uid,
      role: payload.role,
      ...(payload.eid ? { elderId: payload.eid } : {}),
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function buildSessionCookie(input: {
  name: string;
  token: string;
  ttlMs: number;
  secure: boolean;
}): string {
  const maxAge = Math.max(1, Math.floor(input.ttlMs / 1000));
  return [
    `${input.name}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(input.secure ? ["Secure"] : [])
  ].join("; ");
}

export function clearSessionCookie(name: string, secure: boolean): string {
  return [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}
