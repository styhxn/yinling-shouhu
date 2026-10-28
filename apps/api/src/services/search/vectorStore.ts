import { randomUUID } from "node:crypto";
import type { SqlClient } from "../../store/sql.js";
import type { ModelRouter } from "../llm/types.js";

export type VectorOwnerType = "anti_fraud_kb" | "memory";

export type VectorDoc = {
  ownerType: VectorOwnerType;
  ownerId: string;
  elderId?: string | null;
  content: string;
  metadata?: unknown;
};

export type VectorHit = {
  ownerId: string;
  score: number;
};

export type VectorStore = {
  readonly enabled: boolean;
  readonly model: string;
  indexDocs(ownerType: VectorOwnerType, docs: Array<Omit<VectorDoc, "ownerType">>): Promise<boolean>;
  search(
    ownerType: VectorOwnerType,
    query: string,
    topK: number,
    elderId?: string | null
  ): Promise<VectorHit[] | null>;
  status(): Promise<{ enabled: boolean; docs: number; model: string; dims: number[] }>;
};

function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number.isFinite(value) ? value : 0).join(",")}]`;
}

export function createVectorStore(input: {
  sql: SqlClient;
  modelRouter: ModelRouter;
}): VectorStore {
  const enabled = input.sql.supportsVector;
  const model = input.modelRouter.mode;
  const indexed = new Map<string, Promise<boolean>>();

  async function doIndex(
    ownerType: VectorOwnerType,
    docs: Array<Omit<VectorDoc, "ownerType">>
  ): Promise<boolean> {
    if (!enabled || docs.length === 0) return false;
    try {
      const vectors = await input.modelRouter.embed(
        docs.map((doc) => doc.content.slice(0, 4_000))
      );
      let written = 0;
      for (let index = 0; index < docs.length; index += 1) {
        const doc = docs[index];
        const vector = vectors[index];
        if (!doc || !vector || vector.length === 0) continue;
        await input.sql
          .prepare(
            `INSERT INTO embeddings
              (id, owner_type, owner_id, elder_id, model, dim, content, metadata_json,
               embedding_json, embedding, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::vector, ?)
             ON CONFLICT(owner_type, owner_id, model) DO UPDATE SET
               elder_id = excluded.elder_id,
               dim = excluded.dim,
               content = excluded.content,
               metadata_json = excluded.metadata_json,
               embedding_json = excluded.embedding_json,
               embedding = excluded.embedding,
               updated_at = excluded.updated_at`
          )
          .run(
            `emb_${randomUUID()}`,
            ownerType,
            doc.ownerId,
            doc.elderId ?? null,
            model,
            vector.length,
            doc.content.slice(0, 4_000),
            doc.metadata ? JSON.stringify(doc.metadata) : null,
            JSON.stringify(vector),
            vectorLiteral(vector),
            Date.now()
          );
        written += 1;
      }
      return written > 0;
    } catch {
      return false;
    }
  }

  async function indexDocs(
    ownerType: VectorOwnerType,
    docs: Array<Omit<VectorDoc, "ownerType">>
  ): Promise<boolean> {
    if (!enabled || docs.length === 0) return false;
    const key = `${ownerType}:${model}`;
    const existing = indexed.get(key);
    if (existing) return existing;
    const task = doIndex(ownerType, docs);
    indexed.set(key, task);
    const ok = await task;
    if (!ok) indexed.delete(key);
    return ok;
  }

  async function search(
    ownerType: VectorOwnerType,
    query: string,
    topK: number,
    elderId?: string | null
  ): Promise<VectorHit[] | null> {
    if (!enabled) return null;
    try {
      const [vector] = await input.modelRouter.embed([query]);
      if (!vector || vector.length === 0) return null;
      const literal = vectorLiteral(vector);
      const rows =
        ownerType === "memory" && elderId
          ? await input.sql
              .prepare(
                `SELECT owner_id, 1 - (embedding <=> ?::vector) AS score
                 FROM embeddings
                 WHERE owner_type = ? AND elder_id = ? AND model = ? AND dim = ?
                   AND embedding IS NOT NULL
                 ORDER BY embedding <=> ?::vector
                 LIMIT ?`
              )
              .all<{ owner_id: string; score: number }>(
                literal,
                ownerType,
                elderId,
                model,
                vector.length,
                literal,
                topK
              )
          : await input.sql
              .prepare(
                `SELECT owner_id, 1 - (embedding <=> ?::vector) AS score
                 FROM embeddings
                 WHERE owner_type = ? AND elder_id IS NULL AND model = ? AND dim = ?
                   AND embedding IS NOT NULL
                 ORDER BY embedding <=> ?::vector
                 LIMIT ?`
              )
              .all<{ owner_id: string; score: number }>(
                literal,
                ownerType,
                model,
                vector.length,
                literal,
                topK
              );
      return rows
        .map((row) => ({
          ownerId: String(row.owner_id),
          score: Math.max(0, Math.min(1, Number(row.score)))
        }))
        .filter((row) => row.score > 0);
    } catch {
      return null;
    }
  }

  async function status() {
    if (!enabled) return { enabled, docs: 0, model, dims: [] };
    try {
      const rows = await input.sql
        .prepare(
          "SELECT dim, COUNT(*) AS n FROM embeddings WHERE model = ? GROUP BY dim ORDER BY dim"
        )
        .all<{ dim: number; n: number }>(model);
      return {
        enabled,
        docs: rows.reduce((sum, row) => sum + Number(row.n), 0),
        model,
        dims: rows.map((row) => Number(row.dim))
      };
    } catch {
      return { enabled, docs: 0, model, dims: [] };
    }
  }

  return { enabled, model, indexDocs, search, status };
}
