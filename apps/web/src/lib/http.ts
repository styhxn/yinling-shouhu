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
