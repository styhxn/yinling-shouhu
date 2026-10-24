export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message || code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    if (requestId) this.requestId = requestId;
  }
}

export async function httpJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new ApiError(
      typeof json?.error === "string" ? json.error : `http_${res.status}`,
      typeof json?.message === "string" ? json.message : "",
      res.status,
      typeof json?.requestId === "string" ? json.requestId : undefined
    );
  }

  return json as T;
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1] ?? null;
}

export async function httpBlob(
  path: string,
  init: RequestInit = {}
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
  if (!res.ok) {
    let json: any = null;
    try {
      json = JSON.parse(await res.text());
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
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get("content-disposition"))
  };
}
