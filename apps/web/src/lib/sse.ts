import { API_BASE, ApiError } from "./http.js";

export type SseHandler = (event: string, data: any) => void;

export async function streamAgent(
  body: unknown,
  onEvent: SseHandler,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/agent/chat`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream"
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  });

  if (!res.ok) {
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    throw new ApiError(
      typeof json?.error === "string" ? json.error : `http_${res.status}`,
      typeof json?.message === "string" ? json.message : "",
      res.status,
      typeof json?.requestId === "string" ? json.requestId : undefined
    );
  }

  if (!res.body) throw new ApiError("empty_stream", "回答流为空", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim() || block.startsWith(":")) continue;
        const lines = block.split("\n");
        const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
        if (!event || !data) continue;
        try {
          onEvent(event, JSON.parse(data));
        } catch {
          onEvent(event, data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
