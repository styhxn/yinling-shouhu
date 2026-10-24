import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type EncryptedBlob = {
  alg: "aes-256-gcm";
  iv_b64: string;
  tag_b64: string;
  data_b64: string;
};

export function loadOrCreateMasterKey(options: { dataDir?: string; b64?: string } = {}) {
  const fromEnv = options.b64 ?? process.env.APP_MASTER_KEY_B64;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("invalid_master_key");
    return key;
  }

  const dataDir = options.dataDir ?? path.resolve(process.cwd(), "data");
  const keyPath = path.join(dataDir, "master.key");

  try {
    const buf = fs.readFileSync(keyPath);
    if (buf.length === 32) return buf;
  } catch {
    undefined;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

export function encryptJson(masterKey: Buffer, value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const blob: EncryptedBlob = {
    alg: "aes-256-gcm",
    iv_b64: iv.toString("base64"),
    tag_b64: tag.toString("base64"),
    data_b64: ciphertext.toString("base64")
  };

  return JSON.stringify(blob);
}

export function decryptJson<T>(masterKey: Buffer, blobString: string): T {
  const blob = JSON.parse(blobString) as EncryptedBlob;
  if (blob.alg !== "aes-256-gcm") throw new Error("unsupported_encryption");

  const iv = Buffer.from(blob.iv_b64, "base64");
  const tag = Buffer.from(blob.tag_b64, "base64");
  const data = Buffer.from(blob.data_b64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

