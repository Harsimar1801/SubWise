export interface RequestOptions { method?: "GET" | "POST" | "PATCH"; body?: unknown; signal?: AbortSignal }
export interface ApiTransport { request<T>(path: string, options?: RequestOptions): Promise<T>; download(path: string, signal?: AbortSignal): Promise<Blob> }
export class ApiClientError extends Error {
 constructor(message: string, public readonly status: number, public readonly code: "HTTP" | "NETWORK" | "TIMEOUT" | "CANCELLED" | "PROTOCOL" | "INTEGRATION_DISABLED", public readonly issues: unknown[] = [], public readonly retryAfter: string | null = null) { super(message); this.name = "ApiClientError"; }
}
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
// Inactive by default. No module-level client, automatic activation, environment
// switch, retries, secret headers, or network activity on import/construction.
export function createApiTransport(options: { integrationApproved?: boolean; fetcher?: typeof fetch; timeoutMs?: number } = {}): ApiTransport {
 async function perform(path: string, request: RequestOptions, binary: boolean): Promise<unknown> {
  if (options.integrationApproved !== true) throw new ApiClientError("Real API integration is disabled. Active screens use mock adapters.", 0, "INTEGRATION_DISABLED");
  if (!path.startsWith("/api/") || path.includes("\\") || !new URL(path, "https://subwise.invalid").pathname.startsWith("/api/")) throw new ApiClientError("Only same-origin API paths are permitted.", 0, "PROTOCOL");
  const controller = new AbortController(); let timedOut = false;
  const cancel = () => controller.abort();
  if (request.signal?.aborted) throw new ApiClientError("Request cancelled.", 0, "CANCELLED");
  request.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 15000);
  try {
   const response = await (options.fetcher ?? fetch)(path, { method: request.method ?? "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal, headers: { Accept: binary ? "application/pdf" : "application/json", ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}) });
   if (binary && response.ok) { if (!response.headers.get("content-type")?.includes("application/pdf")) throw new ApiClientError("Expected an invoice PDF.", response.status, "PROTOCOL"); return await response.blob(); }
   let payload: unknown = null;
   if (response.status !== 204) { try { payload = await response.json(); } catch (error) { if (controller.signal.aborted) throw error; throw new ApiClientError(response.ok ? "The API returned invalid JSON." : `Request failed (${response.status}).`, response.status, response.ok ? "PROTOCOL" : "HTTP"); } }
   if (!response.ok) { const error = record(payload); const message = typeof error?.error === "string" ? error.error : typeof error?.message === "string" ? error.message : `Request failed (${response.status}).`; throw new ApiClientError(message, response.status, "HTTP", Array.isArray(error?.issues) ? error.issues : [], response.headers.get("retry-after")); }
   return payload;
  } catch (error) {
   if (error instanceof ApiClientError) throw error;
   if (controller.signal.aborted) throw new ApiClientError(timedOut ? "Request timed out. Check the operation's state before retrying." : "Request cancelled.", 0, timedOut ? "TIMEOUT" : "CANCELLED");
   throw new ApiClientError("Unable to reach SubWise. Check your connection before retrying.", 0, "NETWORK");
  } finally { clearTimeout(timer); request.signal?.removeEventListener("abort", cancel); }
 }
 return { async request<T>(path: string, request: RequestOptions = {}) { return await perform(path, request, false) as T; }, async download(path: string, signal?: AbortSignal) { return await perform(path, { signal }, true) as Blob; } };
}
export function apiId(id: string) { if (!id || id === "." || id === "..") throw new Error("A valid record ID is required."); return encodeURIComponent(id); }
export function queryString(query?: object): string { const params = new URLSearchParams(); if (query) for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) params.set(key, String(value)); const encoded = params.toString(); return encoded ? `?${encoded}` : ""; }
